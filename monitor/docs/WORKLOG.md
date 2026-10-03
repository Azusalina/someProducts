# Work log

## 2026-10-02

- Created a new `monitor` folder with `core` for the product and `docs` for descriptions and logs. Did not run any Git commands.
- Confirmed user choices: English interface; media metadata with Play/Pause; Ping targets left for customization, with adjacent labels and icons.
- Inspected the local environment: Arch Linux, KDE Plasma 6.7.5, Qt 6.11.2, Wayland, Python 3.14.7, active Intel i915 GPU. NVIDIA's CLI was present but could not communicate with its driver.
- Implemented an unprivileged local telemetry bridge, a Plasma 6 widget, and a shared transparent Wayland preview.
- Implemented module selection, one-to-three-column composition, narrow single-column layout, drag/arrow reordering, separate widget instances, and local note persistence.
- Verified backend behavior and native QML interactions, including PlayPause over an isolated MPRIS test player. Fixed pending-note save handling during module removal and deferred drag reorder until after the drop event.
- Found that generic Qt tool launchers were unsuitable here. Preview and verification use the actual Qt 6 tools under `/usr/lib/qt6/bin`.
- Exported transparent RGBA previews, inspected the layouts, and prepared manual installation/removal scripts and a `.plasmoid` package.
- Following the request for a smaller widget and desktop pinning, reduced the default size to 360 × 480 and installed Monitor locally with its per-user background service. No desktop placement, system-package installation, cleanup of other widgets, or Git operation was performed.
- Provided the user-installed and system widget storage folders; the user will perform catalog cleanup manually.

## Coding subscription tracking — 1.1

- Confirmed scope: Codex and Claude Code subscription allowances; Tibo refers to `@thsottiaux` and reset announcements on X.
- Checked current official Codex, Claude Code and X documentation. Verified actual Codex account quota reads with the local CLI; only sanitized display fields reach the dashboard.
- Connected Claude's supported status-line feed while preserving unrelated global settings and keeping a private pre-connection backup. Both Claude subscription windows arrived without starting an inference call.
- Added separate Codex, Claude Code and reset-news modules, stale/expired handling, banked-reset count and expiry, and local reset countdowns.
- Verified public RSS access and fetched six Tibo-linked reports. Direct X profile access is blocked; reports are labeled community relays, with an optional official X API adapter for user-provided access.
- Updated the installed local widget and restarted its user service. Existing widget module choices are preserved; new modules are available in Customize.
- No Git operations were performed.

## 2026-10-03 — Connectivity 1.2

- Checked installed official Proton CLI/GUI behavior, NetworkManager, BlueZ and KDE settings modules. The user chose to retain Proton GUI with status and an app/settings entry point.
- Added composable Proton, Wi-Fi and Bluetooth modules, read-only native state collection and a fixed-destination native settings endpoint. No network configuration or desktop placement was changed.
- Distinguish configured Kill Switch mode from IPv6 leak-protection interfaces and actual firewall enforcement. Proton's installed GUI exposes no supported settings-subsection launch action.
- Added backend coverage for native destination validation, malformed requests, escaped connection labels, private-field exclusion and connected-device parsing. QML checks cover module settings signals and transparent compact rendering.
- Corrected media integration test isolation: reset window height and explicitly select only the test MPRIS player.
- Updated the local installed widget and user service, and rebuilt its distributable package. No Git operations were performed.

## Catalog registration and naming

- Refreshed KDE service cache and verified the Plasma WidgetExplorer model recognizes the installed widget as supported. Opened Edit Mode and the Add Widgets explorer at the user's request.
- Renamed the visible widget to `someProducts-monitor` in metadata, dashboard, preview and installation instructions. Preserved package ID `local.monitor.dashboard` and per-instance configuration. Updated the installed package and distributable; no Git commands were used.

## Configure pages and hex appearance — 1.3

- Moved module selection, drag/arrow ordering, columns, text theme and Ping targets out of the dashboard into native Plasma configuration pages. Removed the inline Customize controls.
- Added #rrggbb text/dashboard, border and background colors, optional 0–4 px border and 0–100% background opacity. Fully transparent defaults and previous dark-text choices are preserved.
- Added a separate preview settings window sharing the same pages, with staged drafts and real Apply/OK/Cancel wiring.
- Verified configuration editing and drag reorder, invalid hex protection, optional background RGB/alpha, unchanged note/media behavior and preview transaction handling. Updated docs, local package and distributable. No Git operations were performed.
