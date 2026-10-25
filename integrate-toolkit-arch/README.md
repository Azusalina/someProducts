# What is it?

A shared FileX + Toolkit integration for Arch Linux, KDE Plasma 6 and Wayland.
It adds a native circular glass tool menu for desktop files and a vertical,
keyboard-friendly menu from FileX. Tools reuse the adjacent Toolkit installation.
Architecture, validation and current limits are in [description.md](description.md).

# How to use

Requires Python 3, PySide6, Node.js 22+, Toolkit's npm dependencies, Qt 6,
KDE Frameworks 6, and KWin development files matching the running compositor.
On Arch, build dependencies include `base-devel cmake extra-cmake-modules
qt6-declarative kglobalaccel kwindowsystem kwin vulkan-headers python-pyside6
python-gobject at-spi2-core`. Individual tools use Toolkit's existing optional
dependencies: Chromium, FFmpeg, MarkItDown, Poppler/Pillow/NumPy, and XeLaTeX.

```bash
cd /home/a/Documents/someProducts/integrate-toolkit-arch
cmake -S native -B build
cmake --build build
python3 install.py install
```

Use **Toolkit…** on a local file's Dolphin context menu, or press
**Meta+Alt+T** to choose files in a native picker. Move over a tool and click it,
choose its method/settings, then **Choose result path & save…** to pick both
the destination directory and filename. Existing filenames are refused;
choose a new name. Esc cancels a conversion. Multi-select photos in the picker
or Dolphin to combine them; use Move earlier/later to set page order.

In FileX, highlight a file and press **T**. Use ↑/↓ and Enter in the vertical
menu, choose the method, then choose the result path and filename. Set
`[keys] toolkit = "T"` in FileX's config to change this key.
`FILEX_TOOLKIT_DESKTOP` can point to a relocated launcher.

The direct desktop gesture is **hold Super+Alt, then left-click a file**.
Its package is installed but remains inactive until file-manager accessibility
is available and **Toolkit file gesture** is enabled in KDE Desktop Effects.
This machine currently has accessibility disabled; installation does not change it.
Direct click is not yet verified here. Ordinary local Dolphin views are the
initial target; remote/search views and desktop widgets may require the context action.

Edit `~/.config/toolkit-desktop/gesture.conf` to customize the gesture:

```ini
[Gesture]
Enabled=true
Modifiers=Meta+Alt
Button=Left

[Keyboard]
Shortcut=Meta+Alt+T
```

Supported modifiers are `Meta`/`Super`, `Alt`, `Ctrl`, and `Shift`, joined by `+`.
Buttons are `Left`, `Middle`, or `Right`. Changes reload automatically.
Set `Enabled=false` to disable the mouse gesture, or an empty `Shortcut=` to
disable the optional picker shortcut.

TeX files also appear in this menu. For **live TeX preview**, open the Toolkit
web app at **http://127.0.0.1:4177**, enter a `.tex` path in
**Markdown / TeX to PDF**, and edit/save it in your editor. **Save PDF** keeps
the finished PDF; preview and compiler artifacts are temporary.

```bash
python3 install.py status
systemctl --user restart toolkit-desktop.service
python3 install.py remove
```

Removal deletes only unchanged files owned by this installer. It preserves
edited files, gesture preferences and all source/result documents. Rebuild and
reinstall after a KWin upgrade or moving this checkout. The original Toolkit
web service is independent of this integration.
