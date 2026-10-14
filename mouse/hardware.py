"""HID++ access via Solaar, with raw-sector preservation and verified writes."""
import contextlib
import fcntl
import json
import logging
import os
from pathlib import Path
import struct
import tempfile
from datetime import datetime, timezone

class _UnusedRulesNotice(logging.Filter):
    def filter(self, record):
        # Solaar imports its rules module during device construction. We use only
        # onboard HID output, so its Wayland injection notice does not apply.
        return not record.getMessage().startswith("rules cannot access modifier keys in Wayland")


logging.getLogger("logitech_receiver.diversion").addFilter(_UnusedRulesNotice())

from logitech_receiver import base, receiver, device, common
from logitech_receiver.hidpp20 import OnboardProfiles
from logitech_receiver.hidpp20_constants import SupportedFeature as F
from bindings import BUTTONS, label

STATE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "g502x-mouse"


def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=".mouse-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def check_sector(raw):
    if len(raw) < 208 or common.crc16(raw[:-2]) != int.from_bytes(raw[-2:], "big"):
        raise RuntimeError("Mouse profile has an invalid size or checksum; no write performed")


def patch_sector(raw, changes, button_count, gbutton_count):
    check_sector(raw)
    result = bytearray(raw)
    for layer, index, binding in changes:
        limit = button_count if layer == "normal" else gbutton_count if layer == "gshift" else 0
        if type(index) is not int or not 0 <= index < min(limit, 16) or len(binding) != 4:
            raise ValueError("Invalid button or G-Shift layer")
        offset = (32 if layer == "normal" else 96) + index * 4
        result[offset:offset+4] = bytes(binding)
    result[-2:] = common.crc16(result[:-2]).to_bytes(2, "big")
    return bytes(result)


@contextlib.contextmanager
def connected(serial=None):
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / "device.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another Mouse operation is in progress") from None
        owners = []
        found = []
        denied = False
        try:
            for info in base.receivers_and_devices():
                if str(info.product_id).lower() not in ("c547", "c098", "0xc547", "0xc098"):
                    continue
                try:
                    owner = device.create_device(base, info) if info.isDevice else receiver.create_receiver(base, info)
                except PermissionError:
                    denied = True
                    continue
                if owner is None:
                    continue
                owners.append(owner)
                candidates = [owner] if info.isDevice else list(owner)
                for dev in candidates:
                    dev.ping()
                    if dev.online and "G502 X" in dev.name.upper() and (serial is None or dev.serial == serial):
                        found.append(dev)
            if len(found) != 1:
                if denied:
                    raise RuntimeError("Receiver access denied. Use Set up device access, then reconnect the receiver.")
                raise RuntimeError("Wake the G502 X and connect its LIGHTSPEED receiver or USB cable. Connect only one G502 X when reading.")
            yield found[0]
        finally:
            for owner in owners:
                owner.close()


def request(dev, function, *args):
    result = dev.feature_request(F.ONBOARD_PROFILES, function, *args)
    if result is None:
        raise RuntimeError("Mouse did not respond. Wake it and try again.")
    return result


def read_snapshot(dev):
    info = request(dev, 0)
    memory, layout, macro = info[:3]
    if memory != 1 or layout not in (1, 2, 3, 4, 5):
        raise RuntimeError(f"Unsupported onboard layout {layout}; no write performed")
    count, _, buttons, sectors, size, shift = struct.unpack("!BBBBHB", info[3:10])
    if buttons > 16 or not 208 <= size <= 4096 or not 1 <= count <= 16:
        raise RuntimeError("Unexpected mouse memory layout; no write performed")
    gbuttons = buttons if shift & 3 == 2 else 0
    profiles = []
    for i, (sector, enabled) in enumerate(OnboardProfiles.get_profile_headers(dev), 1):
        if i > count:
            raise RuntimeError("Unexpected profile directory")
        raw = OnboardProfiles.read_sector(dev, sector, size)
        check_sector(raw)
        name = raw[160:208].decode("utf-16le", errors="replace").rstrip("\0\uffff")
        profiles.append({"id": i, "sector": sector, "enabled": bool(enabled), "name": name,
                         "raw": raw.hex(), "normal": [raw[32+j*4:36+j*4].hex() for j in range(buttons)],
                         "gshift": [raw[96+j*4:100+j*4].hex() for j in range(gbuttons)]})
    active = int.from_bytes(request(dev, 0x40)[:2], "big")
    return {"version": 1, "name": dev.name, "serial": dev.serial, "layout": layout,
            "size": size, "sectors": sectors, "buttons": buttons, "gbuttons": gbuttons,
            "active_sector": active, "mode": request(dev, 0x20)[0], "profiles": profiles}


def read():
    with connected() as dev:
        return read_snapshot(dev)


def apply(snapshot, profile_id, changes):
    """Patch only the chosen raw sector. Never serialize unrelated DPI/lighting fields."""
    with connected(snapshot["serial"]) as dev:
        current = read_snapshot(dev)
        if any(current[k] != snapshot[k] for k in ("layout", "size", "buttons", "gbuttons", "sectors")):
            raise RuntimeError("Mouse layout changed. Read from mouse again.")
        old = next(p for p in snapshot["profiles"] if p["id"] == profile_id)
        now = next(p for p in current["profiles"] if p["id"] == profile_id)
        if now["raw"] != old["raw"] or now["sector"] != old["sector"]:
            raise RuntimeError("Bindings changed outside this window. Read from mouse again before applying.")
        if not 0 < now["sector"] < current["sectors"]:
            raise RuntimeError("This profile is in read-only factory memory")
        raw = bytes.fromhex(now["raw"])
        updated = patch_sector(raw, changes, current["buttons"], current["gbuttons"])
        backup = STATE / "backups" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ") + ".json")
        save_json(backup, current)
        if updated != raw:
            # Backup survives partial writes and disconnects. No automatic retries to flash.
            try:
                OnboardProfiles.write_sector(dev, now["sector"], updated)
                if OnboardProfiles.read_sector(dev, now["sector"], current["size"]) != updated:
                    raise RuntimeError("Readback differs from the requested bindings")
            except Exception as e:
                raise RuntimeError(f"Write could not be verified: {e}. Original backup: {backup}. Reconnect and read before retrying.") from e
        request(dev, 0x10, 1)  # onboard mode emits standard HID input on Linux/Wayland
        if request(dev, 0x20)[0] != 1:
            raise RuntimeError("Bindings saved but onboard mode could not be enabled")
        return read_snapshot(dev), str(backup)


def activate(snapshot, profile_id):
    with connected(snapshot["serial"]) as dev:
        fresh = read_snapshot(dev)
        p = next(p for p in fresh["profiles"] if p["id"] == profile_id)
        if not p["enabled"]:
            raise ValueError("This onboard profile is disabled. Choose an enabled profile.")
        request(dev, 0x10, 1)
        request(dev, 0x30, p["sector"].to_bytes(2, "big"))
        result = read_snapshot(dev)
        if result["active_sector"] != p["sector"] or result["mode"] != 1:
            raise RuntimeError("Profile activation could not be verified")
        return result
