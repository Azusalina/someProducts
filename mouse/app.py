#!/usr/bin/env python3
"""Native GTK G502 X profile editor. Hardware operations run off the UI thread."""
import argparse
import copy
import json
from pathlib import Path
import subprocess
import threading

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib, Gdk

import hardware
from bindings import BUTTONS, MOUSE, FUNCTIONS, KEYS, MEDIA, MODIFIERS, decode, encode, label

ROOT = Path(__file__).resolve().parent
KINDS = ["Mouse button", "Keyboard shortcut", "Media key", "Mouse function", "Disabled", "Keep original"]


class MouseDiagram(Gtk.DrawingArea):
    positions = [(52, 38), (148, 38), (100, 76), (28, 142), (20, 185),
                 (34, 105), (72, 82), (128, 82), (100, 136), (55, 72), (45, 95)]

    def __init__(self, select):
        super().__init__()
        self.selected = 0
        self.select = select
        self.set_size_request(206, 270)
        self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
        self.connect("draw", self.draw_mouse)
        self.connect("button-press-event", self.click)

    def click(self, _, event):
        sx = (self.get_allocated_width()-206)/2
        for i, (x, y) in enumerate(self.positions):
            if (event.x-x-sx)**2 + (event.y-y)**2 <= 13**2:
                self.select(i)
                return True
        return False

    def draw_mouse(self, _, cr):
        cr.translate((self.get_allocated_width()-206)/2, 0)
        cr.set_source_rgb(.15, .17, .20)
        cr.move_to(74, 12)
        cr.curve_to(166, -2, 181, 48, 183, 116)
        cr.curve_to(199, 218, 157, 260, 96, 256)
        cr.curve_to(37, 254, 29, 227, 29, 203)
        cr.line_to(10, 192)
        cr.line_to(30, 136)
        cr.curve_to(39, 102, 32, 27, 74, 12)
        cr.close_path()
        cr.fill()
        cr.set_source_rgb(.4, .43, .48)
        cr.set_line_width(1)
        cr.move_to(104, 13)
        cr.line_to(104, 113)
        cr.move_to(41, 115)
        cr.line_to(178, 115)
        cr.stroke()
        for i, (x, y) in enumerate(self.positions):
            cr.set_source_rgb(*((.28, .65, .95) if i == self.selected else (.31, .34, .39)))
            cr.arc(x, y, 11, 0, 6.284)
            cr.fill()
            cr.set_source_rgb(1, 1, 1)
            cr.select_font_face("Sans", 0, 1)
            cr.set_font_size(10)
            cr.move_to(x-(6 if i >= 9 else 3), y+4)
            cr.show_text(str(i+1))
        return False


class Window(Gtk.Window):
    def __init__(self, demo=False):
        super().__init__(title="Mouse · G502 X")
        self.set_default_size(1080, 760)
        self.set_position(Gtk.WindowPosition.CENTER)
        self.connect("delete-event", self.close_window)
        self.snapshot = None
        self.drafts = {}
        self.selected = 0
        self.dirty = False
        self.busy = False
        self.loading = False
        self.demo = demo
        header = Gtk.HeaderBar(title="Mouse", subtitle="G502 X LIGHTSPEED")
        header.set_show_close_button(True)
        self.set_titlebar(header)
        self.read_button = Gtk.Button(label="Read from mouse")
        self.read_button.connect("clicked", lambda _: self.reload())
        header.pack_start(self.read_button)
        self.apply_button = Gtk.Button(label="Save to mouse")
        self.apply_button.get_style_context().add_class("suggested-action")
        self.apply_button.connect("clicked", self.apply)
        header.pack_end(self.apply_button)
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14)
        outer.set_border_width(20)
        self.add(outer)
        top = Gtk.Box(spacing=12)
        outer.pack_start(top, False, False, 0)
        top.pack_start(Gtk.Label(label="Onboard profile"), False, False, 0)
        self.profile = Gtk.ComboBoxText()
        self.profile.connect("changed", self.profile_changed)
        top.pack_start(self.profile, True, True, 0)
        self.activate_button = Gtk.Button(label="Use this profile")
        self.activate_button.connect("clicked", self.activate)
        top.pack_start(self.activate_button, False, False, 0)
        self.layer = Gtk.ComboBoxText()
        self.layer.append("normal", "Normal layer")
        self.layer.append("gshift", "G-Shift layer")
        self.layer.set_active(0)
        self.layer.connect("changed", lambda _: self.render_rows())
        top.pack_start(self.layer, False, False, 0)
        self.content = Gtk.Box(spacing=24)
        outer.pack_start(self.content, True, True, 0)
        left = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        self.content.pack_start(left, False, False, 0)
        self.diagram = MouseDiagram(self.select)
        left.pack_start(self.diagram, False, False, 0)
        hint = Gtk.Label(label="Click a button number to edit.\n\nBindings live in your mouse.\nThey work on Linux, including\nWayland, without a daemon.")
        hint.set_xalign(0)
        hint.set_line_wrap(True)
        left.pack_start(hint, False, False, 0)
        for title, callback in [("Save draft…", self.export), ("Open draft…", self.load_draft),
                                ("Restore bindings…", self.restore), ("Set up device access", self.setup)]:
            button = Gtk.Button(label=title)
            button.connect("clicked", callback)
            left.pack_start(button, False, False, 0)
        self.rows = Gtk.ListBox()
        self.rows.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.rows.connect("row-selected", self.row_selected)
        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        scroll.set_min_content_width(340)
        scroll.add(self.rows)
        self.content.pack_start(scroll, True, True, 0)
        editor = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12)
        editor.set_size_request(265, -1)
        self.content.pack_start(editor, False, False, 0)
        self.title = Gtk.Label(xalign=0)
        self.title.set_markup("<b>Select a button</b>")
        editor.pack_start(self.title, False, False, 0)
        self.current = Gtk.Label(xalign=0)
        self.current.set_line_wrap(True)
        editor.pack_start(self.current, False, False, 0)
        self.kind = Gtk.ComboBoxText()
        for kind in KINDS:
            self.kind.append_text(kind)
        self.kind.connect("changed", self.kind_changed)
        editor.pack_start(self.kind, False, False, 0)
        self.value = Gtk.ComboBoxText.new_with_entry()
        editor.pack_start(self.value, False, False, 0)
        self.mod_box = Gtk.FlowBox()
        self.mod_box.set_selection_mode(Gtk.SelectionMode.NONE)
        self.mod_box.set_max_children_per_line(2)
        self.mods = []
        for bit, name in MODIFIERS:
            cb = Gtk.CheckButton(label=name)
            self.mods.append((bit, cb))
            self.mod_box.add(cb)
        editor.pack_start(self.mod_box, False, False, 0)
        update = Gtk.Button(label="Set binding")
        update.connect("clicked", self.set_binding)
        editor.pack_start(update, False, False, 0)
        note = Gtk.Label(label="Keyboard shortcuts contain one key plus modifiers. Super is the Windows key.\n\nG-Shift needs a button assigned to the G-Shift mouse function.")
        note.set_line_wrap(True)
        note.set_xalign(0)
        editor.pack_start(note, False, False, 0)
        test = Gtk.Entry()
        test.set_placeholder_text("Click here to test mouse shortcuts")
        test.connect("key-press-event", self.test_key)
        test.connect("button-press-event", self.test_mouse)
        editor.pack_end(test, False, False, 0)
        self.test_result = Gtk.Label(label="Test output appears here", xalign=0)
        self.test_result.set_line_wrap(True)
        editor.pack_end(self.test_result, False, False, 0)
        self.status = Gtk.Label(label="Reading mouse…", xalign=0)
        self.status.set_line_wrap(True)
        outer.pack_end(self.status, False, False, 0)
        self.show_all()
        if demo:
            self.accept_snapshot(json.loads((ROOT / "tests" / "fixture.json").read_text()))
            self.status.set_text("Demo · sample bindings only · hardware writes disabled")
        else:
            GLib.idle_add(self.reload)

    def error(self, message):
        dialog = Gtk.MessageDialog(transient_for=self, modal=True, message_type=Gtk.MessageType.ERROR,
                                   buttons=Gtk.ButtonsType.CLOSE, text="Mouse operation failed")
        dialog.format_secondary_text(str(message))
        dialog.run()
        dialog.destroy()

    def confirm_discard(self):
        if not self.dirty:
            return True
        d = Gtk.MessageDialog(transient_for=self, modal=True, message_type=Gtk.MessageType.QUESTION,
                              buttons=Gtk.ButtonsType.YES_NO, text="Discard unsaved button changes?")
        result = d.run() == Gtk.ResponseType.YES
        d.destroy()
        return result

    def close_window(self, *_):
        if self.busy:
            self.status.set_text("Wait for the mouse operation to finish before closing.")
            return True
        if not self.confirm_discard():
            return True
        Gtk.main_quit()
        return False

    def work(self, title, operation, done):
        if self.busy:
            return
        self.busy = True
        self.content.set_sensitive(False)
        for item in (self.read_button, self.apply_button, self.activate_button, self.profile, self.layer):
            item.set_sensitive(False)
        self.status.set_text(title)
        def worker():
            try:
                result, error = operation(), None
            except Exception as exc:
                result, error = None, str(exc)
            GLib.idle_add(finish, result, error)
        def finish(result, error):
            self.busy = False
            self.content.set_sensitive(True)
            for item in (self.read_button, self.profile, self.layer):
                item.set_sensitive(True)
            self.apply_button.set_sensitive(self.snapshot is not None and not self.demo)
            self.activate_button.set_sensitive(self.snapshot is not None and not self.demo)
            if error:
                self.status.set_text(error)
                self.error(error)
            else:
                done(result)
            return False
        threading.Thread(target=worker, daemon=True).start()

    def reload(self):
        if not self.confirm_discard():
            return False
        if self.demo:
            return False
        self.work("Reading onboard bindings…", hardware.read, self.accept_snapshot)
        return False

    def accept_snapshot(self, snapshot):
        selected = self.profile.get_active_id()
        self.snapshot = snapshot
        self.drafts = {str(p["id"]): {layer: list(p[layer]) for layer in ("normal", "gshift")} for p in snapshot["profiles"]}
        self.dirty = False
        self.loading = True
        self.profile.remove_all()
        active = None
        for p in snapshot["profiles"]:
            text = f'{p["id"]} · {p["name"] or "Unnamed"}'
            if p["sector"] == snapshot["active_sector"]:
                text += " · Active"
                active = str(p["id"])
            if not p["enabled"]:
                text += " · Disabled"
            self.profile.append(str(p["id"]), text)
        self.profile.set_active_id(selected if selected in self.drafts else active or next(iter(self.drafts)))
        self.loading = False
        self.apply_button.set_sensitive(not self.demo)
        self.activate_button.set_sensitive(not self.demo)
        self.layer.set_sensitive(snapshot["gbuttons"] > 0)
        if not snapshot["gbuttons"]:
            self.layer.set_active_id("normal")
        self.render_rows()
        self.status.set_text("Bindings read from mouse · Onboard mode" if snapshot["mode"] == 1 else "Bindings read · Host mode: Save to mouse enables onboard input")

    def profile_changed(self, *_):
        if not self.loading:
            self.render_rows()

    def bindings(self):
        if not self.snapshot or not self.profile.get_active_id():
            return []
        return self.drafts[self.profile.get_active_id()][self.layer.get_active_id()]

    def render_rows(self):
        self.loading = True
        for child in self.rows.get_children():
            self.rows.remove(child)
        for i, raw in enumerate(self.bindings()):
            row = Gtk.ListBoxRow()
            box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
            box.set_border_width(9)
            title = Gtk.Label(label=f"{i+1:02}   {BUTTONS[i] if i < len(BUTTONS) else 'Button '+str(i+1)}", xalign=0)
            subtitle = Gtk.Label(label=label(bytes.fromhex(raw)), xalign=0)
            subtitle.get_style_context().add_class("dim-label")
            box.pack_start(title, False, False, 0)
            box.pack_start(subtitle, False, False, 0)
            row.add(box)
            self.rows.add(row)
        self.rows.show_all()
        self.loading = False
        self.select(min(self.selected, max(0, len(self.bindings())-1)))

    def select(self, index):
        row = self.rows.get_row_at_index(index)
        if row:
            self.rows.select_row(row)
            self.selected = index
            self.show_editor()

    def row_selected(self, _, row):
        if row is not None and not self.loading:
            self.selected = row.get_index()
            self.show_editor()

    def show_editor(self):
        if not self.bindings():
            return
        self.diagram.selected = self.selected
        self.diagram.queue_draw()
        name = BUTTONS[self.selected] if self.selected < len(BUTTONS) else f"Button {self.selected+1}"
        self.title.set_text(f"{self.selected+1:02} · {name}")
        raw = bytes.fromhex(self.bindings()[self.selected])
        action = decode(raw)
        self.current.set_text("Assigned: " + label(raw))
        self.kind.set_active(KINDS.index(action["kind"]))
        self.kind_changed()
        self.value.get_child().set_text(action["value"])
        for bit, cb in self.mods:
            cb.set_active(bool(action["modifiers"] & bit))

    def kind_changed(self, *_):
        kind = self.kind.get_active_text()
        values = {"Mouse button": MOUSE, "Keyboard shortcut": KEYS, "Media key": MEDIA,
                  "Mouse function": FUNCTIONS}.get(kind, {})
        self.value.remove_all()
        for name in values:
            self.value.append_text(name)
        if values:
            self.value.set_active(0)
        self.value.set_sensitive(bool(values))
        self.mod_box.set_sensitive(kind == "Keyboard shortcut")

    def set_binding(self, *_):
        if not self.bindings():
            return
        try:
            original = bytes.fromhex(self.bindings()[self.selected])
            raw = encode(self.kind.get_active_text(), self.value.get_child().get_text(),
                         sum(bit for bit, cb in self.mods if cb.get_active()), original)
            # Retain an exact existing encoding when the chosen action is semantically identical.
            if decode(raw) == decode(original):
                raw = original
            self.bindings()[self.selected] = raw.hex()
            self.dirty = any(self.drafts[str(p["id"])][layer] != p[layer]
                             for p in self.snapshot["profiles"] for layer in ("normal", "gshift"))
            self.render_rows()
            self.status.set_text("Changes staged · Save to mouse to apply" if self.dirty else "Bindings unchanged")
        except Exception as e:
            self.error(e)

    def changed_profiles(self):
        return [p for p in self.snapshot["profiles"] if any(self.drafts[str(p["id"])][l] != p[l] for l in ("normal", "gshift"))]

    def apply(self, *_):
        if not self.snapshot or self.demo:
            return
        snapshot = copy.deepcopy(self.snapshot)
        drafts = copy.deepcopy(self.drafts)
        changed = self.changed_profiles()
        selected = int(self.profile.get_active_id())
        # Save all staged profiles, each with its own verified transaction and backup.
        def operation():
            result = snapshot
            backups = []
            for p in changed or [next(p for p in snapshot["profiles"] if p["id"] == selected)]:
                changes = [(l, i, bytes.fromhex(raw)) for l in ("normal", "gshift")
                           for i, raw in enumerate(drafts[str(p["id"])][l]) if raw != p[l][i]]
                result, backup = hardware.apply(snapshot, p["id"], changes)
                backups.append(backup)
            return result, backups
        def done(result):
            self.accept_snapshot(result[0])
            self.status.set_text("Saved to mouse and verified · Survives login and power cycling · Backup: " + result[1][-1])
        self.work("Saving bindings and verifying readback…", operation, done)

    def activate(self, *_):
        if not self.snapshot or self.demo:
            return
        if self.dirty:
            self.error("Save your staged bindings before switching the active profile.")
            return
        self.work("Activating onboard profile…", lambda: hardware.activate(self.snapshot, int(self.profile.get_active_id())), self.accept_snapshot)

    def choose(self, title, save=False, folder=None):
        d = Gtk.FileChooserDialog(title=title, transient_for=self,
                                  action=Gtk.FileChooserAction.SAVE if save else Gtk.FileChooserAction.OPEN)
        d.add_buttons("Cancel", Gtk.ResponseType.CANCEL, "Save" if save else "Open", Gtk.ResponseType.OK)
        if save:
            d.set_do_overwrite_confirmation(True)
            d.set_current_name("g502x-bindings.json")
        if folder and Path(folder).exists():
            d.set_current_folder(str(folder))
        result = d.get_filename() if d.run() == Gtk.ResponseType.OK else None
        d.destroy()
        return result

    def export(self, *_):
        if not self.snapshot:
            return
        path = self.choose("Save editable bindings draft", True)
        if path:
            hardware.save_json(path, {"version": 1, "serial": self.snapshot["serial"], "bindings": self.drafts})
            self.status.set_text("Draft saved locally · Save to mouse applies the bindings")

    def stage_file(self, data, backup=False):
        if data.get("version") != 1 or data.get("serial") != self.snapshot["serial"]:
            raise ValueError("This file is not a bindings file for the connected mouse")
        if backup:
            for p in data["profiles"]:
                hardware.check_sector(bytes.fromhex(p["raw"]))
            mappings = {str(p["id"]): {l: [bytes.fromhex(p["raw"])[(32 if l == "normal" else 96)+i*4:(36 if l == "normal" else 100)+i*4].hex()
                                           for i in range(len(p[l]))] for l in ("normal", "gshift")} for p in data["profiles"]}
        else:
            mappings = data["bindings"]
        if set(mappings) != set(self.drafts):
            raise ValueError("Profile count differs from the connected mouse")
        for pid, layers in self.drafts.items():
            for layer, current in layers.items():
                values = mappings[pid][layer]
                if len(values) != len(current) or any(len(bytes.fromhex(v)) != 4 for v in values):
                    raise ValueError("Invalid button data")
        self.drafts = copy.deepcopy(mappings)
        self.dirty = bool(self.changed_profiles())
        self.render_rows()
        self.status.set_text("Bindings loaded as draft · Review, then Save to mouse")

    def load_draft(self, *_):
        if not self.snapshot or not self.confirm_discard():
            return
        path = self.choose("Open bindings draft")
        if path:
            try:
                self.stage_file(json.loads(Path(path).read_text()))
            except Exception as e:
                self.error(e)

    def restore(self, *_):
        if not self.snapshot or not self.confirm_discard():
            return
        path = self.choose("Restore button bindings from backup", folder=hardware.STATE / "backups")
        if path:
            try:
                self.stage_file(json.loads(Path(path).read_text()), backup=True)
            except Exception as e:
                self.error(e)

    def setup(self, *_):
        def operation():
            result = subprocess.run(["pkexec", "/bin/bash", str(ROOT / "setup-device-access.sh")], capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or "Device access setup was cancelled")
            return result.stdout
        self.work("Setting up device access…", operation,
                  lambda _: self.status.set_text("Device access configured · Read from mouse; reconnect the receiver if access is still denied"))

    def test_key(self, _, event):
        mods = []
        for mask, name in ((Gdk.ModifierType.CONTROL_MASK, "Ctrl"), (Gdk.ModifierType.SHIFT_MASK, "Shift"),
                           (Gdk.ModifierType.MOD1_MASK, "Alt"), (Gdk.ModifierType.SUPER_MASK, "Super")):
            if event.state & mask:
                mods.append(name)
        self.test_result.set_text("Received: " + "+".join(mods + [Gdk.keyval_name(event.keyval) or str(event.keyval)]))
        return False

    def test_mouse(self, _, event):
        self.test_result.set_text(f"Received: mouse button {event.button}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Native G502 X onboard button configurator")
    parser.add_argument("--read", action="store_true", help="Print live onboard bindings as JSON")
    parser.add_argument("--demo", action="store_true", help="Open sample UI with hardware writes disabled")
    args = parser.parse_args()
    if args.read:
        print(json.dumps(hardware.read(), indent=2))
        return
    Window(args.demo)
    Gtk.main()


if __name__ == "__main__":
    main()
