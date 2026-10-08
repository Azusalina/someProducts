# someProducts-monitor core — Description

A transparent modular KDE Plasma 6 desktop widget. Usage is in [../docs/README.md](../docs/README.md); architecture and verification notes are in [../docs/description.md](../docs/description.md).


### Version 1.8 — battery and timers

Battery displays percentage, charge/discharge watts and remaining-time estimates through UPower, selects Powersave/Regular/Performance via power-profiles-daemon, and owns an expiring PowerDevil sleep/screen-off inhibition. Timers contains an independent left countdown and right stopwatch. Configure → Timers saves time, hex color and Minimal/Digital/Ring style per side; Start/Pause/Reset remain on the dashboard. Both modules can be hidden or reordered independently. Runtime adds pinned `dbus-next` for the persistent inhibition helper; install.sh copies power.py, awake_helper.py and timers.py alongside existing collectors.

Validation: 40 backend tests, 35 QML checks, preview configuration transactions, real CAVA playback and strict alpha assertions passed. The installed 1.8.0 desktop instance preserves its previous ID, placement, dimensions, note and settings; the new modules are enabled at the end of its existing order. Detailed behavior, sources, lifecycle limits and evidence are in [../docs/description.md](../docs/description.md).
