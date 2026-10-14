# someProducts-monitor core — Description

A transparent modular KDE Plasma 6 desktop widget. Usage is in [../docs/README.md](../docs/README.md); architecture and verification notes are in [../docs/description.md](../docs/description.md).


### Version 1.8 — battery and timers

Battery displays percentage, charge/discharge watts and remaining-time estimates through UPower, selects Powersave/Regular/Performance via power-profiles-daemon, and owns an expiring PowerDevil sleep/screen-off inhibition. Timers contains an independent left countdown and right stopwatch. Configure → Timers saves time, hex color and Minimal/Digital/Ring style per side; Start/Pause/Reset remain on the dashboard. Both modules can be hidden or reordered independently. Runtime adds pinned `dbus-next` for the persistent inhibition helper; install.sh copies power.py, awake_helper.py and timers.py alongside existing collectors.

Validation: 40 backend tests, 35 QML checks, preview configuration transactions, real CAVA playback and strict alpha assertions passed. The installed 1.8.0 desktop instance preserves its previous ID, placement, dimensions, note and settings; the new modules are enabled at the end of its existing order. Detailed behavior, sources, lifecycle limits and evidence are in [../docs/description.md](../docs/description.md).


### Version 1.9 — direct time editing and layout

Time displays accept click-to-edit HH:MM:SS with Enter confirmation and Escape/focus-loss cancellation. Battery forms a vertical left column next to a right-hand stopwatch/countdown stack when both modules are enabled. Radio Settings buttons are removed. New embedded Bash shells use the real user's Arch-style [user@host directory] prompt. See [../docs/description.md](../docs/description.md) for behavior and verification.

1.9 checks: 41 backend tests, 36 QML checks, zero lint diagnostics, native Arch prompt checks and transparent rendering passed. Installed 1.9.0 preserves instance 160 and its existing geometry/settings. Detailed evidence: [../docs/interaction-layout-validation.json](../docs/interaction-layout-validation.json).

Countdown completion (1.9.2): only the countdown area blinks at zero. Scoped Enter/keypad Enter acknowledges completion and queues a paused reset to its saved duration, preserving editor confirmation and unrelated input. See [../docs/description.md](../docs/description.md) for validation.

Editable profiles (1.10.0): native SettingsFile syncs validated settings with the bridge's atomic JSON store. Default and named profiles survive widget removal and remain independent when selected for split components. Profile selection stays in each instance's KConfig. The schema derives from main.xml, also installed as widget-config.xml; settingsProfile is intentionally excluded from exported settings. Details and validation are in [../docs/description.md](../docs/description.md).

Note controls (1.11.0): NoteCard has a bounded bottom-edge resize handle, a scrolling editor and Save-dialog export. noteHeight and noteExportUrl are profile settings; the header Save action writes the current plain text through POST /notes/save. See [../docs/description.md](../docs/description.md) for validation and limits.

Two-column to-dos (1.12.0): NoteBoard composes the existing NoteCard and appended TodoCard. TodoColumn displays tasks with reversible done buttons; TodoTools validates and reconciles stable task IDs. Native and preview ConfigTodos pages stage content/appearance settings. Task text/completion and appearance persist in JSON profiles. Detailed validation is in [../docs/description.md](../docs/description.md).

1.13.0 adds inline to-do creation/edit/delete and bounded rectangular border resizing. ResizeTools, BorderGrip and SplitGrip preserve grid/column constraints and profile-backed internal dimensions; native outer sizing uses Plasma's existing layout container. See [../docs/description.md](../docs/description.md) for verification.
