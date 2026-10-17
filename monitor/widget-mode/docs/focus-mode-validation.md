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
