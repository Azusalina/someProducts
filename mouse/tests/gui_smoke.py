"""Run with xvfb-run; exercise actual editor/draft/multiple-profile save workflows."""
import copy
import json
from pathlib import Path
import sys
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import Window, Gtk, Gdk, GLib

w = Window(demo=True)
assert len(w.bindings()) == 11
w.select(3)
w.kind.set_active(1)
w.value.get_child().set_text("C")
for bit, cb in w.mods:
    cb.set_active(bit == 1)
w.set_binding()
assert w.bindings()[3] == "80020106"
assert w.dirty
w.layer.set_active_id("gshift")
assert w.bindings()[3] == "ffffffff"
w.kind.set_active(1)
w.value.get_child().set_text("TAB")
for bit, cb in w.mods:
    cb.set_active(bit == 8)
w.set_binding()
assert w.bindings()[3] == "8002082b"
w.profile.set_active_id("2")
w.layer.set_active_id("normal")
w.select(5)
w.kind.set_active(4)
w.set_binding()
assert len(w.changed_profiles()) == 2
draft = {"version": 1, "serial": "DEMO", "bindings": copy.deepcopy(w.drafts)}
w.stage_file(draft)
assert w.dirty
called = []
def fake_apply(snapshot, pid, changes):
    called.append((pid, changes))
    result = copy.deepcopy(snapshot)
    for layer, index, raw in changes:
        result["profiles"][pid-1][layer][index] = raw.hex()
    return result, "/tmp/example-backup.json"
def synchronous_work(title, op, done):
    done(op())
w.demo = False
w.work = synchronous_work
with patch("app.hardware.apply", side_effect=fake_apply):
    w.apply()
assert [pid for pid, _ in called] == [1, 2]
assert len(called[0][1]) == 2
assert len(called[1][1]) == 1
assert not w.dirty
def capture():
    pix = Gdk.pixbuf_get_from_window(w.get_window(), 0, 0, w.get_allocated_width(), w.get_allocated_height())
    pix.savev("/tmp/g502x-gui.png", "png", [], [])
    w.destroy()
    Gtk.main_quit()
    return False
GLib.timeout_add(400, capture)
Gtk.main()
print("GUI workflows passed; screenshot /tmp/g502x-gui.png")
