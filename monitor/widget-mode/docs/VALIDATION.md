# Validation — updated 2026-10-03

Environment: Arch Linux; KDE Plasma 6.7.5; Qt 6.11.2; Wayland; Python 3.14.7; Intel i915.

## Current version 1.7

Current results and limits are recorded in [description.md](description.md#faster-sampling-independent-colors-and-radio-pairing--17-2026-10-05): 32 backend tests, 28 QML checks, live half-second sampling, independent curve colors, per-target Ping overrides, Wi-Fi/Bluetooth pairing, configuration transactions, strict transparency checks and installed desktop verification. The sections below preserve validation history for earlier versions; quota/news tests and inline customization no longer describe the current product.

## Passed

- Python backend: 10 tests for CPU delta accounting, URL parsing and command-option rejection, unavailable Ping readings, sub-millisecond replies, D-Bus variant metadata, responsive snapshot requests, browser/foreign-host rejection, allowed media destinations and control capabilities.
- QML: eight behavior tests plus test setup/cleanup, all passing. Covered live system telemetry, custom Ping targets, reordering and splitting modules, narrow layout, direct keyboard entry and saved note remounting, actual drag-and-drop reordering, native MPRIS Pause/Play via an isolated fixture, and preview export.
- Qt 6 QML lint: no diagnostics.
- Exported dashboard images are RGBA. Empty background pixels have alpha 0. Layouts were visually inspected, including the compact 360 × 480 form.
- Native Plasma package loading with `plasmoidviewer`: no widget loading errors. The tool prints its own QML-debugging notice.
- Local package installation: `local.monitor.dashboard` is registered under the user's Plasma widget directory. The user systemd service is enabled and running. Its live endpoint returns CPU, RAM and Intel GPU telemetry.
- Shell scripts pass `bash -n`; Python source compiles; the `.plasmoid` archive contains metadata, configuration and all QML modules.

## Limits

- NVIDIA and AMD branches are implemented but were not tested on active NVIDIA/AMD hardware. The installed NVIDIA CLI cannot communicate with a driver on this machine.
- Intel utilization covers current-user readable engine counters, not all users or a hardware-wide total. Shared system RAM is not presented as dedicated Intel VRAM.
- Media control was verified over the real session bus with an isolated test player. No real browser/video playback was altered. Browser-specific media exposure depends on integration settings.
- Desktop placement and restart/login persistence were not exercised by automatically editing the user's desktop. Plasma stores per-instance settings; the user adds and arranges the widget through Edit Mode.
- Other user-installed and system widgets were left in place. Cleanup belongs to the user, as requested. No Git commands were executed.

Evidence: `backend-tests.log`, `qml-tests.log`, `qmllint.log`, `native-plasma.log`, `preview-transparent.png`, and `preview-customize.png`.

## Version 1.1 addition

- Backend suite expanded to 21 passing tests, including quota math, stale/passed windows, multi-bucket parsing, sensitive-field filtering, private status-cache writes, settings-preserving Claude connection/disconnection, and uncertain announcement timing.
- QML tests cover enabling/reordering the new modules, unavailable/stale/expired displays, and compact usage rendering.
- Live installed service returned two Codex and two Claude quota windows. Public reset news fetched six reports; direct X profile requests were blocked. No X token is configured.
- `preview-usage.png` shows actual local allowance observations, not fixed demo quota values. The optional direct X adapter is not live-verified.

## Version 1.2 addition

- Final backend suite: **30 passing tests**. Added escaped NetworkManager labels, Proton/IPv6 distinction, configured Kill Switch modes, BlueZ connected-device filtering, fixed native launch destinations, invalid settings requests and unavailable-app errors. Direct X schema/field selection is now fixture-tested.
- Final QML suite: **12 behavior tests plus setup/cleanup (14 passes)**. Includes native settings signal destinations and disabled/busy states, compact connectivity rendering, and the usage additions. Media integration explicitly selects only the isolated fixture.
- Qt lint produced no diagnostics. All four exported previews have an RGBA alpha channel and fully transparent empty corner pixels. Connectivity and usage previews were visually inspected.
- Actual read-only state: Proton connected; configured Kill Switch Off; Wi-Fi enabled and connected; one powered Bluetooth adapter. Native KDE settings modules and the graphical user-service environment are available.
- Installed 1.2 service and package were checked. VPN connection, Kill Switch, wireless radio and Bluetooth settings were not changed. Native launch commands were mocked in tests; resulting native window presentation was not visually exercised.
- `preview-connectivity.png` is a 360 × 330 composition of just the three new modules, using local state. Existing instance choices remain preserved; new modules can be selected in Customize. No Git operations were performed.

## Version 1.3 addition

- Backend suite remains **30 passing tests**. Final QML suite has **18 behavior tests plus four setup/cleanup checks (22 passes)** across display and configuration pages.
- Configuration tests cover real checkbox and hex-field typing, drag/arrow ordering, draft module selection, invalid hex rejection, text-default restoration, background opacity controls and Ping editing. Display tests confirm inline customization controls are absent, preferences drive layout, and note/media interactions remain operational.
- Separate preview integration test loads the actual Preview window with isolated settings. Cancel discards drafts; Apply commits all staged pages and keeps the window open; OK commits and closes. No QML runtime warnings occurred.
- Qt lint includes all configuration pages and the native config model and reports no diagnostics. Default exports retain alpha-zero empty pixels. A colored-board export preserves the exact `(16, 32, 48, 255)` background pixel for `#102030` at 100% opacity.
- Configuration and colored dashboard previews were visually inspected. Native package load is checked with the updated Plasma applet. Existing desktop placement and user-selected instance preferences are preserved; the live desktop's native Apply button was not operated automatically.
- Current evidence: `preview-config-modules.png`, `preview-config-appearance.png`, `preview-colored.png`, `preview-configuration-test.log`, `qml-tests.log`, `qmllint.log`. `preview-customize.png` is historical evidence of the removed 1.2 inline UI.
