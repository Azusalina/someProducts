# Architecture and decisions

## Product structure

```text
monitor/
  core/
    backend/monitor_service.py
    plasmoid/
      metadata.json
      contents/config/main.xml
      contents/ui/                 # composable dashboard modules
    Preview.qml                   # same dashboard, standalone Wayland window
    scripts/                      # preview, install, remove, verify, package
    tests/                        # backend and native QML interaction checks
    monitor.plasmoid               # packaged widget
  docs/
    README.md
    ARCHITECTURE.md
    VALIDATION.md
    WORKLOG.md
    *.log, *.png
```

## Why a Plasma widget

KDE's native widget host provides desktop placement, native resizing, per-instance configuration, and Wayland compatibility. Plasma 6 requires a `PlasmoidItem` root and metadata declaring Plasma 6 support. The widget requests `NoBackground`. A shared `Dashboard.qml` provides the same interface in the standalone preview.

Primary references checked during development:

- [KDE Plasma 6 widget setup](https://develop.kde.org/docs/plasma/widget/setup/)
- [KDE widget background properties](https://develop.kde.org/docs/plasma/widget/properties/)
- [KDE widget testing](https://develop.kde.org/docs/plasma/widget/testing/)
- [Qt QML XMLHttpRequest](https://doc.qt.io/qt-6.8/qml-qtqml-xmlhttprequest.html)
- [MPRIS Player interface and PlayPause](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html)
- [Linux DRM client usage counters](https://www.kernel.org/doc/html/v6.12/gpu/drm-usage-stats.html)

## Data flow

A Python standard-library bridge samples CPU and RAM from `/proc`, GPU data from sysfs/NVIDIA/DRM fdinfo, and media properties over the user's D-Bus session using `busctl`. QML polls its local HTTP endpoint every two seconds. Ping runs in a small bounded thread pool and is cached, so a slow or blocked target does not stall all dashboard modules. Targets are only rechecked when requested by an active widget. The bridge samples system/media data while it is running, even if no widget is visible.

CPU calculations use counter deltas and exclude duplicated guest accounting. Intel client counters are deduplicated by PCI address and client ID; only same-user processes that permit fdinfo reads are included. Newly observed engines wait for a second observation, counter resets never produce negative load, and missing data remains unknown.

QML holds a short graph history in memory. Plasma configuration stores layout choices, targets and note text separately for each widget. The note module saves only changed text, including on removal, so rearranging modules does not discard a pending edit. Disabling a module preserves its settings.

The background service is a single per-user process shared by all widget instances. Multiple instances can query different targets; the cache is bounded to 32 targets and each request is limited to eight. No shell is used to execute URL input. Browser-origin requests and unexpected Host names are rejected, while media commands are restricted to currently available MPRIS destinations and capability flags.

## Intentional boundaries

This first version shows media metadata and controls, as confirmed by the user. It does not capture video frames. Modular composition means showing, hiding, reordering, and splitting modules across native widget instances; it does not automatically copy or merge notes between instances. Ping icons are user-selected symbols or KDE theme icons, not downloaded favicons.

Installation is provided as a local script. Monitor is now registered in the user widget catalog and its background service is enabled, following the desktop-pinning request. Development previews do not add a widget to the desktop; placement is left to Plasma Edit Mode.

## Subscription and news collectors

`backend/usage.py` independently reads Codex account quotas every minute and receives a sanitized local Claude status-line cache. `backend/reset_news.py` fetches public RSS reports every five minutes, with an optional official X API adapter. Both collectors run outside the two-second system sampler, so account/network delays do not stall CPU, RAM, GPU or media updates. Per-instance QML usage cards expose only normalized display fields. Reset announcements do not overwrite account-reported timestamps. See `USAGE.md` for source trust and freshness boundaries.

## Connectivity collector and settings

`backend/connectivity.py` reads NetworkManager and BlueZ separately from the system sampler every five seconds. The Proton card combines active named profiles with the GUI's configured Kill Switch mode, without invoking the incompatible official CLI. `/settings/open` launches only fixed Proton, Network Connections or Bluetooth applications; it neither changes networking nor executes user-provided commands. See `CONNECTIVITY.md` for the selected GUI workflow and limits of these indicators.

## Native configuration and appearance — 1.3

`contents/config/config.qml` registers Modules, Appearance and Ping pages. Each exposes staged `cfg_` properties for Plasma's native Apply/OK/Cancel handling, following [KDE configuration documentation](https://develop.kde.org/docs/plasma/widget/configuration/). Layout manipulation lives in a shared JavaScript helper; the display has no module-editing UI or drag destinations. Notes and playback remain interactive.

Appearance is stored per instance as validated six-digit hex strings, integer border width and background opacity. Empty text color falls back to the previous `darkInk` preference for migration. The background defaults to alpha zero and the border to width zero. `NoBackground` prevents Plasma from adding its own surface; a simple dashboard Rectangle draws the optional custom background and border. The standalone preview uses the same pages in a separate staged settings window.
