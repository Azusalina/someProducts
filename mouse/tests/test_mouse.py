import contextlib
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bindings import decode, encode, label, MOUSE, FUNCTIONS
import hardware
from logitech_receiver import common


def fixture():
    raw = bytearray(b"\xff" * 255)
    raw[0:3] = bytes([1, 0, 0])
    raw[3:13] = bytes.fromhex("2003b00440066009800c")
    normal = ["80010001", "80010002", "80010004", "80010008", "90070000",
              "80010010", "90010000", "90020000", "900a0000", "90030000", "90040000"]
    for i, v in enumerate(normal):
        raw[32+i*4:36+i*4] = bytes.fromhex(v)
    raw[160:208] = "Default".ljust(24, "\0").encode("utf-16le")
    raw[-2:] = common.crc16(raw[:-2]).to_bytes(2, "big")
    return {"version": 1, "name": "G502 X LIGHTSPEED", "serial": "DEMO", "layout": 3,
            "size": 255, "sectors": 16, "buttons": 11, "gbuttons": 11,
            "active_sector": 1, "mode": 1, "profiles": [
                {"id": i, "sector": i, "enabled": i < 3, "name": "Default" if i == 1 else "",
                 "raw": raw.hex(), "normal": normal[:], "gshift": ["ffffffff"]*11} for i in range(1, 6)]}


class BindingTests(unittest.TestCase):
    def test_mouse_bitmask(self):
        for name, value in MOUSE.items():
            raw = encode("Mouse button", name)
            self.assertEqual(int.from_bytes(raw[2:], "big"), value)
            self.assertEqual(decode(raw)["value"], name)

    def test_ctrl_c_and_all_modifiers(self):
        self.assertEqual(encode("Keyboard shortcut", "C", 1).hex(), "80020106")
        self.assertEqual(label(bytes.fromhex("80020306")), "Ctrl+Shift+C")
        for mask in (0, 1, 3, 8, 16, 128, 255):
            self.assertEqual(decode(encode("Keyboard shortcut", "TAB", mask))["modifiers"], mask)

    def test_unknown_macro_kept(self):
        for raw in (bytes.fromhex("00120304"), bytes.fromhex("ffffffff"), bytes.fromhex("807a1234")):
            self.assertEqual(decode(raw)["kind"], "Keep original")
            self.assertEqual(encode("Keep original", original=raw), raw)

    def test_function_zero_and_ff_reserved(self):
        self.assertEqual(decode(bytes.fromhex("90070000")), decode(bytes.fromhex("9007ff00")))
        for name in FUNCTIONS:
            self.assertEqual(decode(encode("Mouse function", name))["value"], name)

    def test_invalid_actions_rejected(self):
        for args in [("Keyboard shortcut", "shell command"), ("Mouse button", "bad"),
                     ("Keyboard shortcut", "A", 256), ("Keep original",), ("invalid",)]:
            with self.assertRaises(ValueError):
                encode(*args)

    def test_disabled(self):
        self.assertEqual(label(encode("Disabled")), "Disabled")


class SectorTests(unittest.TestCase):
    def setUp(self):
        self.raw = bytes.fromhex(fixture()["profiles"][0]["raw"])

    def test_patch_preserves_every_unrelated_byte(self):
        result = hardware.patch_sector(self.raw, [("normal", 3, bytes.fromhex("80020106")),
                                                 ("gshift", 10, bytes.fromhex("8002082b"))], 11, 11)
        allowed = set(range(44, 48)) | set(range(136, 140)) | {253, 254}
        for i in range(255):
            if i not in allowed:
                self.assertEqual(result[i], self.raw[i], f"unrelated byte {i} changed")
        hardware.check_sector(result)

    def test_no_changes_exact_identity(self):
        self.assertEqual(hardware.patch_sector(self.raw, [], 11, 11), self.raw)

    def test_invalid_checksum_rejected(self):
        bad = bytearray(self.raw)
        bad[16] ^= 1
        with self.assertRaises(RuntimeError):
            hardware.patch_sector(bad, [], 11, 11)

    def test_invalid_offsets_and_lengths_rejected(self):
        for layer, index, binding in [("normal", -1, b"aaaa"), ("normal", 11, b"aaaa"),
                                      ("other", 0, b"aaaa"), ("gshift", 0, b"aaa")]:
            with self.assertRaises(ValueError):
                hardware.patch_sector(self.raw, [(layer, index, binding)], 11, 11)
        with self.assertRaises(ValueError):
            hardware.patch_sector(self.raw, [("gshift", 0, b"aaaa")], 11, 0)


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.original = fixture()
        self.current = copy.deepcopy(self.original)
        self.tmp = tempfile.TemporaryDirectory()
        self.state = patch.object(hardware, "STATE", Path(self.tmp.name))
        self.state.start()
        self.dev = object()
        self.connect = patch.object(hardware, "connected", lambda serial: contextlib.nullcontext(self.dev))
        self.connect.start()
        self.read = patch.object(hardware, "read_snapshot", lambda dev: copy.deepcopy(self.current))
        self.read.start()
        self.req = patch.object(hardware, "request", return_value=bytes([1]))
        self.req.start()

    def tearDown(self):
        self.req.stop()
        self.read.stop()
        self.connect.stop()
        self.state.stop()
        self.tmp.cleanup()

    def test_noop_skips_flash_and_creates_backup(self):
        with patch.object(hardware.OnboardProfiles, "write_sector") as write:
            _, backup = hardware.apply(self.original, 1, [])
        write.assert_not_called()
        self.assertEqual(json.loads(Path(backup).read_text()), self.original)

    def test_external_changes_block_before_write(self):
        self.current["profiles"][0]["raw"] = "00"
        with patch.object(hardware.OnboardProfiles, "write_sector") as write:
            with self.assertRaisesRegex(RuntimeError, "changed outside"):
                hardware.apply(self.original, 1, [])
        write.assert_not_called()

    def test_layout_change_blocked(self):
        self.current["layout"] = 5
        with self.assertRaisesRegex(RuntimeError, "layout changed"):
            hardware.apply(self.original, 1, [])

    def test_readonly_sector_blocked(self):
        self.original["profiles"][0]["sector"] = 256
        self.current = copy.deepcopy(self.original)
        with self.assertRaisesRegex(RuntimeError, "read-only"):
            hardware.apply(self.original, 1, [])

    def test_verified_write_and_backup_precedes_flash(self):
        expected = hardware.patch_sector(bytes.fromhex(self.original["profiles"][0]["raw"]),
                                         [("normal", 3, bytes.fromhex("80020106"))], 11, 11)
        def write(dev, sector, raw):
            self.assertTrue(list((Path(self.tmp.name)/"backups").glob("*.json")))
            self.assertEqual(raw, expected)
            self.current["profiles"][0]["raw"] = raw.hex()
        with patch.object(hardware.OnboardProfiles, "write_sector", side_effect=write) as writer, \
             patch.object(hardware.OnboardProfiles, "read_sector", return_value=expected):
            result, _ = hardware.apply(self.original, 1, [("normal", 3, bytes.fromhex("80020106"))])
        writer.assert_called_once()
        self.assertEqual(result["profiles"][0]["raw"], expected.hex())

    def test_readback_failure_retains_original_backup(self):
        with patch.object(hardware.OnboardProfiles, "write_sector"), \
             patch.object(hardware.OnboardProfiles, "read_sector", return_value=b"bad"):
            with self.assertRaisesRegex(RuntimeError, "Write could not be verified"):
                hardware.apply(self.original, 1, [("normal", 3, bytes.fromhex("80020106"))])
        paths = list((Path(self.tmp.name)/"backups").glob("*.json"))
        self.assertEqual(len(paths), 1)
        self.assertEqual(json.loads(paths[0].read_text()), self.original)

    def test_backup_failure_prevents_write(self):
        with patch.object(hardware, "save_json", side_effect=OSError("disk full")), \
             patch.object(hardware.OnboardProfiles, "write_sector") as writer:
            with self.assertRaises(OSError):
                hardware.apply(self.original, 1, [("normal", 3, bytes.fromhex("80020106"))])
        writer.assert_not_called()

    def test_disabled_profile_activation_rejected(self):
        with self.assertRaisesRegex(ValueError, "disabled"):
            hardware.activate(self.original, 3)


if __name__ == "__main__":
    unittest.main()
