# FileX + Toolkit on Arch / KDE / Wayland

## Baseline releases

Before integration changes, both products were released from commit
`e8752080c28bfdfa0fa31cb3614b8836859ddd45`:

- [FileX v1.0](https://github.com/Azusalina/someProducts/releases/tag/filex-v1.0): source archive and freshly built Linux x86_64 package; all 49 baseline Rust tests passed. Internal Cargo metadata remains 1.5.0.
- [Toolkit v1.0, local web](https://github.com/Azusalina/someProducts/releases/tag/toolkit-v1.0): source archive; all 22 baseline Node tests passed. Internal npm metadata remains 0.1.0.

The release labels deliberately preserve the requested pre-integration state.
They do not include this integration or subsequent TeX rendering.

## Architecture

`app.py` supplies PySide6 native widgets, a circular desktop menu, a vertical
FileX menu, method controls, native result dialogs and cancellation.
`native/glass.cpp` asks KWindowEffects for blur behind translucent rounded/circular
surfaces. Tint remains usable without compositor blur. Actual glass appearance
depends on the user's compositor and background.

`native/hotkeys.cpp` registers the optional picker shortcut with KGlobalAccel
and receives clicked-window events from the effect. `native/gesture.cpp` uses
KWin's native pointer-shortcut API, so the configured modifiers must be held at
the click. It sends only the pointer position and target-window identity through
the local session bus; it does not log general keyboard or pointer activity.

The gesture is packaged as a per-user declarative KWin effect with a relative
native QML module. No system plugin directory or compositor restart is needed.
The module checks its compiled KWin version against the running version; rebuild
after upgrades. `clicked_file.py` resolves the hit item's own accessibility name
and parent directory rather than assuming that the previously selected file was
clicked. It rejects ambiguous, remote or unsupported views. It currently relies
on Dolphin's accessible view description and is not proven across all locales,
split/expanded views, fractional scaling, or Plasma desktop widgets.

The worker at `../toolkit/src/desktop/worker.mjs` accepts one bounded JSON request
over stdin. It reuses Toolkit's renderer, PDF page functions, photo layout,
MarkItDown worker, media converter and OMR preparation worker. No extra HTTP
service is started. URL audio is not a local-file action; it remains in Toolkit's
web workspace. The original toolkit web interface remains available.

Results first go to a private temporary directory on the chosen destination
filesystem. The client creates the final name with an atomic, exclusive hard
link after successful processing, then removes staging. Existing filenames and
symlinks are refused. Conversion errors and cancellation remove staging and do
not publish a partial result. Originals are never replaced. OMR candidate PDFs
embed the original source hash and profile; keep using Toolkit's comparison and
report-download workflow when a full scan-preparation audit is needed.

`install.py` owns a hash manifest for generated launchers, a Dolphin service menu,
a user systemd service and the effect package. It refuses unmanaged/edited files
before installing and removes only unchanged owned files. The persistent gesture
configuration is retained on removal. Accessibility is never enabled by the installer.

## Validation and remaining boundary

2026-10-25: native Qt/KDE components built against Qt 6.12 and KWin 6.8. The
per-user effect was recognized, loaded successfully, confirmed loaded, then
unloaded. The shortcut service is enabled and running. Isolated installation,
hash status and removal passed. Three native offscreen tests cover file menus,
method pages, exact-directory parsing and atomic no-clobber publication. Circular
and method-page screenshots were rendered and visually inspected.

FileX's Rust suite and release build pass with the cached Rust toolchain. The
existing unrelated search changes are retained in the checkout.

The session's `org.a11y.Status.IsEnabled` is false. Automatic approval review
rejected enabling it because session-wide accessibility exposes UI metadata to
applications. The setting remains unchanged; the direct held-modifier click is
not activated or claimed end-to-end. It requires the user's explicit approval
before enabling accessibility, followed by a real Dolphin click test. Hardware
pointer behavior, multi-monitor coordinates, focus placement and glass blur still
need desktop validation. Native computer-control surfaces were unavailable in
this session.

## Development

```bash
python3 -m unittest discover -s tests -v
python3 install.py install --prefix /tmp/toolkit-desktop-install-check
python3 install.py remove --prefix /tmp/toolkit-desktop-install-check
cd ../toolkit
npm test
node tests/tex-browser.js
```

Arch build helpers missing from the host were downloaded from the official Arch
package mirror and extracted into ignored `build/deps`, without installing host
packages. A clean host with the listed build dependencies needs no extra CMake
flags. The ignored build directory is not part of the source deliverable.

## Primary references

- [KGlobalAccel](https://api.kde.org/kglobalaccel.html)
- [KDE Dolphin service menus](https://develop.kde.org/docs/apps/dolphin/service-menus/)
- [KWin declarative effects](https://develop.kde.org/docs/plasma/kwineffect/)
- [Dolphin accessibility view implementation](https://github.com/KDE/dolphin/blob/master/src/kitemviews/accessibility/kitemlistviewaccessible.cpp)
- [Dolphin accessibility item implementation](https://github.com/KDE/dolphin/blob/master/src/kitemviews/accessibility/kitemlistdelegateaccessible.cpp)
