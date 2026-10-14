# Mouse

## What is it?

A native desktop button configurator for the Logitech G502 X LIGHTSPEED on Arch Linux. Read existing onboard bindings, edit mouse buttons and keyboard shortcuts, save them into the mouse, and restore bindings from backups. Works with KDE Wayland and X11.

See [description.md](description.md) for supported actions, implementation, sources, limitations, and validation.

## How to use

Prerequisites: Python, GTK 3, `python-gobject`, and Solaar's Python library. On Arch:

```sh
sudo pacman -S --needed python gtk3 python-gobject solaar
```

If using the project-local environment instead of the system Solaar package:

```sh
python -m venv --system-site-packages .venv
.venv/bin/pip install -r requirements.txt
```

Open `./mouse` from this folder, or install the application-menu launcher with `python install.py` and open **Mouse · G502 X**. For a read-only terminal dump, use `./mouse --read`.

Connect the LIGHTSPEED receiver or the mouse's USB cable and wake the mouse. If access is denied, click **Set up device access** and authenticate once. Reconnect the receiver if needed. The application itself runs as your normal user.

1. Click **Read from mouse**. Choose an onboard profile and its normal or G-Shift layer.
2. Select a numbered button in the drawing or list. Choose its action, key, and optional modifiers; click **Set binding**.
3. Click **Save to mouse** to save all staged changes, enable onboard mode, and verify readback. **Use this profile** activates an enabled profile; saving does not switch the active profile.
4. Test shortcuts in the test field or their target application. Super is the Windows key. Assign a button to the G-Shift function to use its alternate layer.

Bindings are stored inside the mouse and remain active after login or power cycling automatically. No autostart process is needed. **Save draft / Open draft** handles local JSON files; **Restore bindings** opens automatic backups and stages their button mappings for review before saving. Backups are under `${XDG_CONFIG_HOME:-~/.config}/g502x-mouse/backups/`.

Remove the menu/command launcher with `python install.py --remove`. Optionally remove `/etc/udev/rules.d/70-g502x-mouse.rules` as administrator and reload udev rules. Uninstalling does not reset mouse bindings or delete backups.
