# filex widget — description

## Architecture

- Separate optional Plasma 6 applet (`local.filex.navigator`) in `plasmoid/`; the main GUI's rendering, colours, spacing and fonts are unchanged.
- `native/Directory` is a small `QAbstractListModel` using `QDir` and `QFileSystemWatcher`. Each open column watches its own directory. ListView virtualizes rows. There is no web server, periodic timer, terminal emulator or hidden FileX process in the widget.
- Mouse navigation uses horizontal directory columns. This is a lightweight native navigation view, rather than embedding a complete winit window or PTY. GUI and TUI buttons explicitly launch those full applications. The shared FileX TUI's filters, Git badges, transfer modes and keyboard configuration are not implemented by this independent widget model.
- Files open via `QDesktopServices`; terminals launch with `QProcess` argument lists and a working directory, without interpolating filenames into shell commands.
- The applet uses Plasma's `NoBackground` hint. Standard Plasma controls retain their normal hover states. Keyboard `x` acts only on a currently hovered folder with widget focus; hovering does not bypass Wayland's compositor focus policy.
- `rootPath` persists per applet instance. Default root is the user's home. Descendant expansion is session-local. Dotfiles are omitted.

## Development and validation

```bash
cmake -S native -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 2
ctest --test-dir build --output-on-failure
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software QML_DISABLE_DISK_CACHE=1 \
  /usr/lib/qt6/bin/qmltestrunner -input tests
/usr/lib/qt6/bin/qmllint plasmoid/contents/ui/main.qml
```

`native/probe.cpp` checks model ordering, literal filenames, parent navigation, refresh and missing folders using a temporary directory. The QML test loads the native plugin and compiles the complete applet. `widget-host-probe` (enable with `-DFILEX_WIDGET_HOST_TESTS=ON`, requiring Plasma development headers) loads a real Plasma applet representation in an isolated window; it accepts the absolute `plasmoid/` path. Generated native libraries and build directories are ignored; rebuild them before packaging or installing.

Desktop focus, transparency against a real wallpaper, the physical hover/x gesture, and detached terminal placement require a live Plasma session check. No per-widget RSS claim is made: the applet shares the plasmashell process.

## Sources

- [Qt QML modules](https://doc.qt.io/qt-6/qt-add-qml-module.html)
- [Qt QFileSystemWatcher](https://doc.qt.io/qt-6/qfilesystemwatcher.html)
- [Plasma applets](https://develop.kde.org/docs/plasma/widget/)

Validation on 2026-10-26: native directory-model CTest passed; Qt 6 QML tests passed (4 checks including setup/cleanup); Qt 6 qmllint reported no issues. An offscreen host with a real Plasma containment successfully loaded the full 720×420 representation. The host used temporary XDG config/cache/data locations and did not add a widget to the user's desktop. Use `QT_QPA_PLATFORMTHEME=generic` for this isolated host to avoid a desktop platform-theme dependency.
