# Validation

Checked 3 October 2026 using Chromium and SQLite 3.49.1 (sql.js 1.14.2).

- All 41 runnable lesson examples execute successfully against a fresh seed database.
- All 12 challenge model answers pass the browser checker; incorrect results and multiple statements are rejected.
- All 32 self-check model choices score correctly.
- Foreign-key, duplicate-key and mark-range violations are rejected; rollback restores the original fee.
- Direct file opening works with zero external requests and zero browser page errors.
- Verified empty result headings, multiple results, escaped output, mutation/reset, CSV download, progress/theme persistence, query tracing and normalisation stages.
- A non-terminating query times out in the worker, restarts the engine and restores the seed data.
- No page-level horizontal overflow at 390px or 320px; tables and diagrams can scroll within their containers.
- Print output contains all 16 chapters, the overview, revision and sources, with model answers expanded.

Screenshots and the print-check PDF were generated in /tmp for visual inspection. These checks validate the authored resource; they are not an official syllabus approval.
