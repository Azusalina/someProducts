"""Four-byte G502 X onboard bindings. Unknown bindings are kept byte for byte."""
from logitech_receiver.special_keys import USB_HID_KEYCODES, HID_CONSUMERCODES

BUTTONS = ["Left click", "Right click", "Wheel click", "Side back", "DPI shift",
           "Side forward", "Wheel tilt left", "Wheel tilt right", "Profile button",
           "DPI up", "DPI down"]
MOUSE = {"Left click": 1, "Right click": 2, "Middle click": 4, "Back": 8,
         "Forward": 16, **{f"Mouse button {i}": 1 << (i-1) for i in range(6, 17)}}
FUNCTIONS = {"No action": 0, "Tilt left": 1, "Tilt right": 2, "Next DPI": 3,
             "Previous DPI": 4, "Cycle DPI": 5, "Default DPI": 6, "DPI shift": 7,
             "Next profile": 8, "Previous profile": 9, "Cycle profile": 10,
             "G-Shift": 11, "Battery status": 12}
MODIFIERS = [(1, "Ctrl"), (2, "Shift"), (4, "Alt"), (8, "Super"),
             (16, "Right Ctrl"), (32, "Right Shift"), (64, "Right Alt"), (128, "Right Super")]
KEYS = {str(k): int(k) for k in USB_HID_KEYCODES if 0 < int(k) < 256}
MEDIA = {str(k): int(k) for k in HID_CONSUMERCODES if 0 < int(k) <= 65535}


def decode(raw):
    raw = bytes(raw)
    if len(raw) != 4:
        raise ValueError("A binding must contain exactly four bytes")
    a, b, c, d = raw
    if a == 0x80:
        if b == 0:
            return {"kind": "Disabled", "value": "", "modifiers": 0}
        if b == 1 and (c << 8 | d) in MOUSE.values():
            return {"kind": "Mouse button", "value": next(k for k, v in MOUSE.items() if v == c << 8 | d), "modifiers": 0}
        if b == 2 and d in KEYS.values():
            return {"kind": "Keyboard shortcut", "value": str(USB_HID_KEYCODES[d]), "modifiers": c}
        if b == 3 and (c << 8 | d) in MEDIA.values():
            return {"kind": "Media key", "value": str(HID_CONSUMERCODES[c << 8 | d]), "modifiers": 0}
    if a == 0x90 and b in FUNCTIONS.values() and d == 0:
        return {"kind": "Mouse function", "value": next(k for k, v in FUNCTIONS.items() if v == b), "modifiers": 0}
    return {"kind": "Keep original", "value": raw.hex(), "modifiers": 0}


def encode(kind, value="", modifiers=0, original=None):
    if kind == "Keep original":
        if original is None or len(original) != 4:
            raise ValueError("Original binding is missing")
        return bytes(original)
    if kind == "Disabled":
        return bytes.fromhex("8000ffff")
    if kind == "Keyboard shortcut":
        if type(modifiers) is not int or not 0 <= modifiers <= 255:
            raise ValueError("Invalid modifier mask")
        if value not in KEYS:
            raise ValueError("Choose a keyboard key from the list")
        return bytes([0x80, 2, modifiers, KEYS[value]])
    mapping = {"Mouse button": (1, MOUSE), "Media key": (3, MEDIA)}
    if kind in mapping:
        t, values = mapping[kind]
        if value not in values:
            raise ValueError("Choose an action from the list")
        return bytes([0x80, t]) + values[value].to_bytes(2, "big")
    if kind == "Mouse function" and value in FUNCTIONS:
        return bytes([0x90, FUNCTIONS[value], 0xff, 0])
    raise ValueError("Invalid binding action")


def label(raw):
    action = decode(raw)
    if action["kind"] == "Keep original":
        return "Original / macro · " + bytes(raw).hex(" ")
    prefix = "+".join(name for bit, name in MODIFIERS if action["modifiers"] & bit)
    return (prefix + "+" if prefix else "") + (action["value"] or "Disabled")
