# Countdown Focus Mode — 1.14.0

Validated on 2026-10-16. Usage: the countdown header's ⛶ button opens a fullscreen
dark window with the same timer, configured color and style. Escape or Exit
returns to the desktop without resetting. Time editing, pause/reset, completion
blinking and Enter acknowledgement remain available.

Implementation: TimerOwner lazily creates CountdownFocus; both desktop and
fullscreen ClockFace instances reference the same owner/session. Closing Focus
does not touch timer controls. Disabling Timers releases its fullscreen window.
Focus does not change the existing sleep inhibition setting or desktop background.

Validation:

- 60 backend tests and 64 QML checks passed.
- The new offscreen Qt window integration test passed: actual header-button
  activation, fullscreen visibility, shared session/progress, pause, optional-colon
  editing, Escape (including during editing), native close, completion blinking,
  Enter reset and module cleanup. No QML warnings in this test.
- Modified/new timer QML files have zero lint diagnostics. The whole-package
  lint log includes one existing static KConfigPropertyMap warning about
  `settingsProfile` in main.qml.
- Preview configuration transactions, live KDE sleep inhibition, real CAVA
  playback and five background/alpha assertions passed. The full verification
  script initially stopped at a screenshot wrapper import in the new test;
  after correcting the test, that test and all remaining checks passed. The
  standalone sleep-inhibition check also timed out once and passed on retry.
- Inspected [fullscreen render](preview-countdown-focus.png). Logs:
  [focus test](focus-mode-test.log), [timer lint](focus-mode-qmllint.log),
  [QML checks](qml-tests.log), [backend checks](backend-tests.log).

Installed version 1.14.0 matches source byte for byte. Plasma and bridge services
are active. Instance 163 retained all settings and geometry
`x=1552, y=32, width=464, height=1168` across the shell refresh. A private settings
backup was created by refresh-desktop.py. No Git actions were performed.

Fullscreen/key behavior was tested using Qt's offscreen platform. Physical
Wayland compositor placement, multi-monitor selection and mouse operation still
need desktop confirmation. Opening or closing Focus preserves progress; a Plasma
shell/bridge restart still ends the existing in-memory timer session.

## 1.14.1 — Space control and prominent status

Validated and installed on 2026-10-17. Fullscreen Space starts/pauses the shared
countdown. Auto-repeat is disabled; busy/finished states are guarded. The time
editor retains normal key handling. Focus status is now 28px semibold at full
opacity. Desktop status remains 8px at its existing opacity.

The updated focus integration test passed with actual Space key events for
pause/resume, editor isolation and completion protection, plus assertions for
status text, font size and opacity. The 9 existing power/timer QML checks passed;
the two changed QML files have zero lint diagnostics. The updated fullscreen
render was inspected. Physical Wayland input remains a manual check.

Installed source matches version 1.14.1; widget 163 retained all settings and
geometry across refresh. Both bridge and Plasma services are active. No Git
actions were performed. Logs: [focus](focus-mode-test.log),
[timer regression](focus-mode-power-regression.log),
[lint](focus-mode-qmllint.log).

## 1.15.0 — stopwatch fullscreen and milliseconds

Validated and installed on 2026-10-18. Both desktop clocks display HH:MM:SS.mmm
and have fullscreen actions. Focus Mode chooses the corresponding shared clock,
color/style and controls; Space starts/pauses that clock. Editing keeps the
existing whole-second format and optional-colon countdown shortcuts.

The 16ms local display update interpolates backend fractional samples without
increasing HTTP polling. It clamps countdown at zero, freezes paused values,
caps extrapolation at one second and stops extrapolating on bridge errors.
Actual completion remains backend-controlled; millisecond digits indicate
display precision rather than a one-millisecond update/accuracy guarantee.

The expanded focus integration test passed: both fullscreen clocks, Space,
independent countdown/stopwatch state, three-digit fractions, paused stability,
exit/reopen, stopwatch editing/reset, and countdown completion/Enter regression.
No QML warnings. Nine existing power/timer QML checks passed. Three modified
QML files have zero lint diagnostics. The stopwatch fullscreen screenshot was
visually inspected: [render](preview-stopwatch-focus.png).

Installed files match source; widget 163 retained all settings and geometry.
Bridge and Plasma services are active. No Git actions were performed.
Physical Wayland compositor behavior remains a manual check.
