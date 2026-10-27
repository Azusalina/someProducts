# Count Month — implementation and rules

## Counting model

Generated questions cover 1–60 inclusive whole months. Each range starts on the
first day of a month and ends on the last day of a month, including leap days.
Start years range from 2000 through 2030; an end date can fall in a later year.
Every duration in the selected range is equally likely. The fiscal starting
month is random unless a specific month is selected in Settings.

For 1–12 months, enter the total even if the period crosses a financial-year
boundary. For 13–60 months, enter each overlapping financial year's portion,
earliest first. The exact ordered split is required: `22` or `4+12+6` cannot
replace `6+12+4`. A five-year span can overlap six financial years. Zero-length
portions are omitted. The displayed financial-year range is the recurring
annual boundary, with inclusive month-end dates. A March financial year starts
01 March and ends on the last day of February (28 or 29 in the relevant year).

Example: 01 Oct 2000 through 31 Jul 2002, FY 01 Apr–31 Mar, requires `6+12+4`.
Month indices drive the arithmetic, avoiding daylight saving and timestamp
rounding. The game is a whole-month exercise, not a depreciation policy tool;
partial-month conventions are outside its scope.

## Credits, trophies and storage

A correct answer grants one credit and locks the question until Next question.
Reloading a solved question preserves its solved status and does not award the
credit again. Mistakes and setting changes do not deduct or reset credits.
Trophy thresholds are 10, 25, 50, 100, 250 and 500, with no redemption deduction.

The versioned localStorage key `count-month:progress:v1` stores credits, the
current question, its solved status and practice settings. The key and public
URL stay the same when the source directory is renamed. Browser tabs reconcile
stored state before awarding credit and listen for storage events. This is
local practice storage, not a transactional shared account or anti-cheat system.
Clearing site data, private browsing expiry, changing browser/device, or storage
eviction can remove progress. A visible warning appears when storage is blocked.

The only application reset is in Developer mode, gated by the requested `0000`
password and a second confirmation click. It resets credits and trophies and
starts a new question. Closing Settings locks developer mode. As a static
browser app, this gate is a convenience against accidental resets rather than
a security boundary; source and localStorage are inspectable.

## Interface and calculator

One narrow practice surface uses responsive text, large keypad targets and a
bottom Submit/Next control. Dialogs contain Settings and trophy details. The
calculator opens as a right-hand drawer, including on phones, and is independent
of the answer. It supports numbers, decimals, addition, subtraction,
multiplication and division with conventional operator precedence. It rejects
invalid expressions and division by zero without evaluating JavaScript.
Dialogs support Escape, explicit close controls, focus management through
native HTML dialog, and backdrop dismissal. Reduced-motion preference is honored.

## Files and maintenance

- `index.html`: semantic interface, keypad and dialogs.
- `style.css`: responsive layout and right-side calculator.
- `model.mjs`: question generation, fiscal splitting, validation and arithmetic.
- `app.mjs`: interactions, local progress and developer reset.
- `tests/model.test.mjs`: month arithmetic, storage validation and calculator.

There are no runtime packages, remote fonts, analytics, services or API calls.
Node.js 22+ runs `node --test tests/*.test.mjs`; `node --check app.mjs` checks
the controller syntax. The workspace builder publishes only runtime files to
`/someProducts/count-month/`. Its source resolver accepts both `count-month/`
and `d-count-month/` for the initial deployment and subsequent rename.

## Validation

The model suite compares all 8,640 fiscal-start/start-month/duration combinations
against an independent month-by-month UTC calendar reference. It also covers
the inclusive example, strict answer ordering, 60-month/six-FY spans, leap days,
generator bounds, progress restoration and the basic calculator.

Local headless Chromium checks passed for strict answer rejection, correct
credits, trophy unlocks (including the final trophy), reload without duplicate
credit, six-term answers, retained credits after settings changes, wrong and
correct developer passwords, confirmed reset and relocking, calculator
precedence and division-by-zero feedback, and blocked storage fallback.
First submissions in a fresh browser and after settings changes are explicitly
checked; progress comparison uses field values rather than JSON property order.
Viewports checked: 320×568, 360×640, 390×844, 430×932, 768×1024 and 1440×900.
Every checked viewport fits the keypad and Submit without page overflow.
These are automated Chromium checks, not physical iOS/Safari device tests.

Optional browser QA uses a local Playwright installation and Chromium:
`PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser.mjs`.
Its temporary loopback server closes when the checks finish. Screenshots are
written to `/tmp/count-month-mobile.png`, `/tmp/count-month-small-phone.png`
and `/tmp/count-month-calculator.png`.

## Publication history

2026-10-28: Built directly in `count-month/` and deployed through the existing
Pages hub. Initial commit `5b4e56e` passed Actions run `40540261911`; the live
entry returned HTTP 200 and `deployment.json` confirmed that revision. Only
after this verification was the source renamed to `d-count-month/`. The public
path and browser progress key remain unchanged.
