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


### Version 1.16 — focus media and responsive playback background

TimerOwner forwards Dashboard's existing media snapshot and toggle signal to the shared Focus Mode window. Mouse movement reveals a bottom-right MediaCard; a three-second inactivity timer hides it, while hover keeps it visible. The passive pointer handler filters unchanged coordinates so timer redraws do not keep waking the panel. Revealing media never takes keyboard focus. Space remains a timer control. No active player shows a neutral message.

FocusAmbient reads the existing authenticated /audio endpoint at 100ms while visible/enabled. It draws smoothly animated frequency columns with a vertical fade and energy-based opacity for an audio-driven breathing background. Polls are serialized, time out after two seconds, and abort on disable/destruction. Existing cavaEnabled, cavaOpacity, cavaFlowColor and mediaService preferences apply; no schema/backend changes.

AudioTools.enhance is shared with desktop MediaCard: a 0.0015 noise floor, 2.2 * (amplitude - floor)^0.55 gain curve capped at one, exact zero during silence. The desktop now adds filled columns behind a thicker flow line and polls system playback independently of MPRIS Playing status. Previously, MPRIS gating could hide valid system audio and a raw low-amplitude line at partial opacity was difficult to see. Capture remains playback-monitor-only.

Validation and render evidence: [../docs/focus-mode-validation.md](../docs/focus-mode-validation.md).


### Version 1.17 — smoother flows, global focus shortcuts and native splitting

System sampling and independent ping deadlines are 200ms. Dashboard polls at 200ms. Sparkline now animates history samples as well as audio spectra, interpolating from the currently displayed values so updates remain continuous if a transition is interrupted. Missing measurements stay unknown. Ping concurrency/timeout limits are unchanged; slow hosts cannot deliver 5 Hz. Faster collection increases CPU/network work, especially for GPU process-engine counters.

`native/` builds the local Monitor.Native QML plugin using Qt6, KF6GlobalAccel and libplasma. DesktopBridge registers two QAction global shortcuts with unique applet IDs and refuses conflicts/invalid unmodified keys. Only main widgets register shortcuts. ConfigTimers stages portable key strings; Preview stages the settings but does not register global actions. Defaults are Meta+Ctrl+Alt+C and Meta+Ctrl+Alt+S.

DesktopBridge creates real same-containment Plasma applets with createApplet geometry hints. It copies General configuration and the profile selection, marking detachedModule/detachedParent in instance-local KConfig (excluded from shared JSON profiles). The parent scans live children to hide detached modules; deletion or merging restores them. DragGrip grabs pointer movement and displays a desktop-scene ghost; release outside the main root creates a child, release outside a child moves its existing AppletContainer with releaseSpace/positionItem/save, and release over the original parent destroys the child. Locked desktops are respected. No public scripting geometry setter is used. This relies on PlasmaQuick's installed AppletQuickItem interface; rebuild after Qt/Plasma upgrades.

Each detached view has a separate Dashboard but inherits its parent's TimerOwner, TerminalOwner and PowerOwner, so splitting and merging retain live sessions. Shared profile synchronization preserves notes/task content, config and colors; local native topology is not exported to profiles. The initial sync waits for native initialization so clone metadata is applied before profile loading. If the original parent is removed, remaining children become standalone views; a newly created owner has the existing documented session-restart limits. Returning is supported to the original parent in the same containment, not as a cross-screen containment transfer. Note/to-dos remain one module; Timers contains both clocks.

Measurement: `tests/memory_usage.py` compares an eight-second offscreen full preview to a blank Qt window and reads live service PSS (apportioned shared pages). Current data is in [../docs/memory-usage.json](../docs/memory-usage.json). The final live run measured a 40.30 MiB preview increment, 21.45 MiB bridge PSS and 6.78 MiB active CAVA helper PSS, totaling an approximate 68.53 MiB. A 60–100 MiB working budget allows for helpers and variation; it is not a hard cap. The whole plasmashell process is shared by all desktop widgets and must not be attributed to Monitor. Software preview rendering differs from native GPU rendering; VRAM and per-detached-view growth are not individually measured.

Validation: the complete regression script passed 60 backend and 69 QML checks before the new standalone flow/native checks were added; the existing keep-awake lifecycle test passed in this run. The isolated native probe creates a temporary Plasma containment/configuration, verifies real split/move/merge, shared timer session retention, KDE shortcut registration and fullscreen QAction dispatch for both clocks, then releases its test actions. Logs: [../docs/native-desktop-test.log](../docs/native-desktop-test.log), [../docs/native-tests.log](../docs/native-tests.log), [../docs/flow-tests.log](../docs/flow-tests.log). Physical Wayland gestures/hardware key presses remain a desktop confirmation boundary.

Native probe: configure with `cmake -S native -B build/native -DMONITOR_NATIVE_TESTS=ON`, build, then run `build/native/monitor_native_probe "$PWD/plasmoid"`. It uses a temporary XDG config/data home and suppresses profile syncing; it must have local bridge and session-bus access. Normal packaging disables this extra test target. Memory probe: `.venv/bin/python tests/memory_usage.py`; it uses temporary preview settings. No Git actions are part of either workflow.

Deployment verification (2026-10-24): installed 1.17.0 matches the validated package/backend sources; instance 163 retained every pre-existing setting and geometry x=1424, y=32, width=624, height=1168. Live mean sample interval measured 0.2007s. KDE reports non-empty registrations for both default global shortcuts. Both services are active. Final regression: 60 backend, 76 QML checks; two additional safe-upgrade tests passed (private backup and restarting Plasma even when package upgrade fails). Native integration verifies split/move/merge, shared session and custom shortcut registration/fullscreen dispatch; hardware mouse/key behavior still needs physical confirmation. Evidence: [../docs/desktop-1.17-validation.json](../docs/desktop-1.17-validation.json). No Git actions performed.

Native package upgrades must stop Plasma before overwriting its mapped plugin libraries. Use `python scripts/refresh-desktop.py --package "$PWD/plasmoid"`; the helper privately backs up settings/geometry, stops Plasma, upgrades the package, and starts Plasma in a finally block. scripts/install.sh uses this workflow for upgrades. A shell/backend restart recreates timer/terminal sessions, unlike normal split/merge.


### Version 1.17.1 — correct history trajectories

The 1.17.0 history animation mixed values at matching array indices, although those indices represented different sample times after a history shift. This distorted existing peaks. Growing sampleCount with the number of stored samples also stretched the time axis during startup.

Sparkline now distinguishes time history from fixed frequency bins. CPU/RAM/GPU/Ping use 40 fixed slots (nominally eight seconds at 5 Hz). History animation translates the unchanged sample points on X; incoming samples enter from the right. One retained offscreen head preserves the left edge of the scrolling curve. Interrupted scrolls accumulate the remaining horizontal offset, keeping visible points in place. The buffer is bounded, resets/replacements display directly, and unknown values remain gaps. CAVA bins retain amplitude interpolation because their frequency identities do not shift. Sampling remains 200ms.

Ping's scale uses 1/2/5 buckets with 25% headroom rather than continuously fitting every sample. It expands when necessary and contracts only after ten seconds below 35% of the current maximum. The tooltip reports the active range. This keeps small latency changes from resizing the whole trajectory.

Regression coverage verifies fixed peak heights/spacing, startup time scale, interrupted updates without jumps, missing samples, replacement/reset, ping scale hysteresis and CAVA amplitude interpolation. Evidence: [../docs/flow-tests.log](../docs/flow-tests.log) and [../docs/flow-qmllint.log](../docs/flow-qmllint.log).

1.17.1 validation/deployment (2026-10-25): 62 backend and 80 QML checks passed, including eight flow checks; focused lint has zero diagnostics. A synthetic CPU/Ping render was inspected: [../docs/flow-preview.png](../docs/flow-preview.png). Focus Mode, real CAVA playback and five alpha/background assertions passed. The full runner stopped at the unrelated keep-awake lifecycle check, which remains inconclusive with two pre-existing same-name inhibition records; audio/alpha checks completed separately. Installed source matches 1.17.1; instance 163 kept all settings/geometry, both services are active, and no relevant live graph QML errors were observed. Evidence: [../docs/flow-1.17.1-validation.json](../docs/flow-1.17.1-validation.json). No Git actions performed.


### Version 1.18 — configurable flow intervals

Configure → Flows adds flowRefreshMs (100–5000ms, default 200) and audioRefreshMs (50–1000ms, default 100). Native KConfig and preview Apply/Cancel wiring stage the settings; the existing schema-derived profile store validates and saves them. The page scrolls on small windows.

Dashboard polls with its configured interval and a transient per-view client identifier. CPU/RAM/GPU sampling follows the fastest unexpired client demand; ping cadence is chosen per target from the clients requesting it. Demands expire after max(2s, 3 intervals), and at most 64 clients are retained. A short interruptible scheduler wait allows a newly opened fast view to wake a slow collector promptly; slow probes yield rather than spin. Slow/blocked pings still cannot overlap. Legacy requests retain the 200ms default. The response exposes sampling_interval_ms for diagnostics.

History scroll duration follows 90% of the selected interval without changing stored sample heights. The fixed 40 samples therefore cover about 40 × flowRefreshMs / 1000 seconds. CAVA polling and transitions follow audioRefreshMs in both MediaCard and FocusAmbient; the CAVA capture source remains its existing 20 Hz playback monitor. Refresh intervals govern reads/samples, not the compositor's animation frame rate. Multiple independent views can keep shared hardware sampling faster than a slower view's selected interval.

Coverage includes interval validation, profile round-trip persistence, fastest-client selection/expiry, independent ping target periods, bounded clients, prompt slow-to-fast scheduler response, HTTP validation, graph duration wiring, fullscreen CAVA wiring and preview Cancel/Apply/OK behavior.

1.18.0 validation/deployment (2026-10-25): full regression passed 67 backend and 81 QML checks, preview configuration transactions, Focus Mode, keep-awake, real CAVA playback and alpha checks; zero QML lint diagnostics. Installed package/backend match source, widget 163 retained all existing settings and geometry, and both services are active. New settings read correctly from the selected profile. A temporary 100ms client demand was checked on the live bridge and then replaced by a slow expiring demand; saved preferences were not changed. Evidence: [../docs/refresh-rate-validation.json](../docs/refresh-rate-validation.json), [../docs/refresh-rate-tests.log](../docs/refresh-rate-tests.log). No Git actions performed.

Live timing limit: the 100ms target produced about 159ms between observed samples in this run because collector work can exceed the requested period. sampling_interval_ms reports the selected shared target, not a hardware accuracy guarantee. The requested per-view read/animation intervals still apply; the collector yields on overruns.


### Version 1.19 — scrolling speed independent of sampling

Previously the chart showed 40 samples, so faster refresh also made the visible time window shorter and the whole line move faster. Configure → Flows now provides flowHistorySeconds (5–120s, default 30). CPU/RAM/GPU/Ping histories use the actual sampled_at/checked_at timestamps. X positions are calculated from elapsed time over the chosen window, so a second occupies the same width regardless of how many samples arrived in that second. A longer history window reduces scrolling speed. Stored Y values and missing-data gaps remain unchanged. CAVA still uses frequency-bin amplitude interpolation and its existing refresh setting.

Dashboard retains timestamped points for at most 130 seconds / 1302 samples per series (120s maximum view plus scroll-animation margin). Clock rollback or source reset starts a fresh series. Sparkline animates the time-window endpoint from its current displayed value, including interrupted updates. Legacy index-based rendering remains for standalone components without timestamps. Ping scaling uses the points in the selected visible window, preserving its headroom/hysteresis. The existing numeric 40-sample arrays remain as compatibility views; the main charts render the timestamped series.

Coverage verifies elapsed-time X displacement across different update spacings, peak-height preservation, slower movement for longer windows, interrupted timestamp animation, null gaps, bounded buffers, clock rollback, setting bounds/persistence and preview Cancel/Apply/OK transactions.

1.19.0 validation/deployment (2026-10-25): 67 backend and 84 QML checks passed; full regression also passed preview transactions, Focus Mode, keep-awake, real CAVA playback and alpha checks. Whole-package lint has zero diagnostics. Inspected a synthetic [30s/60s comparison](../docs/time-window-preview.png). Installed source matches, instance 163 retains all prior settings/geometry and its previous refresh interval, and both services are active. New history window reads 30s from the selected profile. Evidence: [../docs/history-window-validation.json](../docs/history-window-validation.json). No Git actions performed.


### Resource audit — 2026-10-25

A passive live observation and isolated GUI/collector probes found that the current 100ms/15s-history configuration is CPU-heavy, especially GPU process-counter discovery. A temporary full-coverage FD-filter prototype reduced per-scan CPU time by 35.6% in paired trials; it was not installed. Current backend/helper PSS is about 43 MiB and the software-preview UI increment about 60 MiB, giving a roughly 103 MiB proxy estimate with native attribution limits. See [the audit and feature-preserving optimization order](../docs/resource-audit-2026-10-25/description.md) for methodology, measurements and limitations. Production code and saved configuration were unchanged.


### Version 1.19.1 — continuous Ping motion and shortcut restoration

Timestamped graphs now advance their visible Unix-time window on visible animation frames, independently of probe completion or the configured polling interval. Slow/no replies no longer cause a short scroll followed by a freeze and accelerated catch-up. Incoming data retains its original timestamps and values, including explicit null gaps; no samples are invented to fill missing replies. Hidden graphs stop frame updates and catch up to the current clock when shown. Legacy indexed histories and CAVA interpolation retain their existing behavior. This supersedes the endpoint animation described in 1.19 above.

KGlobalAccel keeps inactive shortcut records across Plasma restarts. Alt+S was saved for monitor-163-stopwatch itself, but the new action had not loaded that record and incorrectly reported it as another owner's conflict. Registration now checks the persisted component and action identifiers, accepting its own record while rejecting another action, including an action in the same component. Saved user key choices are preserved.

Regression coverage includes scrolling without replies beyond multiple refresh intervals, unchanged clock position on delayed reply arrival, accurate time-based displacement and history-window speed, preserved null gaps/Y values, hidden-to-visible catch-up, saved inactive shortcut registration, genuine same-component conflict rejection, and fullscreen dispatch for both timer modes.

1.19.1 validation/deployment (2026-10-25): 67 backend and 85 QML checks passed, plus the native desktop probe covering inactive owned keys, same-component foreign-key rejection, fullscreen dispatch and split/merge. Whole-package QML lint produced zero diagnostics. Preview configuration, Focus Mode, real CAVA playback (peak 0.137) and alpha checks passed. The full verification script stopped at the keep-awake fixture with "Inhibition lifecycle did not settle" in the existing desktop session; audio/alpha checks were then run independently. No power-control code was changed and this result is not reported as a pass. Installed 1.19.1 matches source; widget 163 retains every saved General setting and geometry, including Alt+S. KDE reports Alt+S owned by monitor-163-stopwatch; Plasma/backend services are active. Physical keyboard dispatch on the user's Wayland desktop remains a manual boundary; the native fixture verified action dispatch. Evidence: [../docs/ping-shortcut-validation.json](../docs/ping-shortcut-validation.json), [../docs/shortcut-native-test.log](../docs/shortcut-native-test.log). No Git actions performed.
