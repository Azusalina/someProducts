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


### Version 1.14 — countdown Focus Mode

The countdown header opens a dedicated fullscreen Qt Quick window. TimerOwner lazily owns CountdownFocus and shares its existing backend session with the desktop clock; opening, closing, Escape and native window close do not configure/reset the timer. The fullscreen ClockFace retains configured color/style, optional-colon time editing, pause/reset and completion blinking with Enter acknowledgement. Its dark background is local to the focus window; the desktop remains transparent. Closing the module or destroying its owner releases the window. Focus Mode does not change the power profile or acquire sleep inhibition; use the existing Battery control if needed.

`tests/focus_mode.py` uses an isolated timer session and actual Qt window/key events to verify fullscreen visibility, shared progress, pause, edit, Escape/native close, completion Enter and module cleanup. It runs offscreen and does not establish physical Wayland compositor behavior. Evidence and deployment results are recorded in [../docs/focus-mode-validation.md](../docs/focus-mode-validation.md).


1.14.1: Fullscreen Focus Mode accepts Space to start/pause, without auto-repeat. The shortcut consumes Space outside the time editor and checks session/busy/finished state before controlling the countdown; time editing retains normal key handling. Focus status text uses 28px semibold at full opacity; desktop status remains compact. The focus integration test covers Space pause/resume, editor isolation, completion protection and status presentation.


### Version 1.15 — stopwatch Focus Mode and milliseconds

Both clocks now have a fullscreen header action. The existing CountdownFocus component selects TimerOwner.focusKind, including its title, controls, configured color/style and large status. A single lazily owned window uses the existing timer session; Space operates only the selected clock and is disabled during time editing.

Desktop and fullscreen displays use HH:MM:SS.mmm. A local 16ms display timer interpolates between existing 250ms bridge samples; pause freezes at the backend fractional value, and countdown clamps at zero. Interpolation is capped at one second and stops on bridge errors. The backend remains the authoritative monotonic timer, including completion; the three digits describe display precision, not a guarantee of one-millisecond refresh/accuracy. Input and persisted presets remain whole seconds. Small ring typography is adjusted to fit the additional digits.

Validation: expanded real-window offscreen integration tests cover stopwatch Space start/pause, independent countdown state, frozen fractional time, reopening, editing and reset, alongside the countdown completion/keyboard regressions. Nine power/timer QML checks passed. See [../docs/focus-mode-validation.md](../docs/focus-mode-validation.md) for deployment and limits.
