# Data / Logic — HKDSE ICT 2026

An entirely English database learning companion covering the database-related compulsory material and the full Databases elective: relational concepts, SQL and database design methodology.

Open **index.html** in a modern browser. Keep `style.css`, `lessons.js`, `app.js` and `vendor/` together. There is no build step, account, CDN or network dependency. The SQL engine also works when the page is opened directly from disk.

For a local HTTP preview, run `python3 -m http.server 8080 --bind 127.0.0.1 --directory ict` from the parent directory and visit `http://127.0.0.1:8080`.

## Included

- 16 chapters, worked SQL examples and model-answer design exercises.
- 32 self-check questions with explanations.
- A real SQLite playground with reset, multiple result sets and CSV export.
- 12 SQL challenges, checked against a separate fresh dataset.
- Interactive query tracing, normalisation stages and accessible SVG ER diagrams.
- Searchable navigation, local progress, light/dark themes, mobile navigation and printable notes for the entire course.
- A source page mapping every database learning outcome to the lessons.

The SQL examples use a consistent three-table school database with 6 students, 4 courses and 9 enrolments. Playground edits are in memory and disappear on Reset or reload. Understanding marks, last quiz scores and solved challenges are stored in this browser where local storage is available. Quiz completion does not automatically mark a lesson as understood.

## Official scope

The applicable syllabus is the [2021 EDB ICT Curriculum and Assessment Guide](https://www.edb.gov.hk/attachment/en/curriculum-development/kla/technology-edu/curriculum-doc/ICT_C%26A_Guide_e_final.pdf), effective from Secondary 4 in 2022/23 and the 2025 HKDSE onwards. The [2026 HKEAA assessment framework](https://www.hkeaa.edu.hk/DocLibrary/HKDSE/Subject_Information/ict/2026hkdse-e-ict.pdf) identifies Databases as Paper 2A. References and coverage are available inside the learning page. All explanations and practice exercises are original, not reproduced examination questions. This is an independent resource, not an official publication.

## Practice dialect

The bundled engine is **sql.js 1.14.2**, using its asm.js build to avoid a separate WebAssembly download. Its licence is in `vendor/sql.js-LICENSE`. It runs inside a Web Worker with a query time limit so an expensive query does not freeze the learning interface. A timed-out query restarts the engine and resets temporary data. Result display is capped at 200 rows per statement; CSV exports the last displayed result only, with NULL as an empty cell.

SQLite supports the included INNER, NATURAL, LEFT, RIGHT and FULL join examples. Type enforcement, string/date functions, schema alterations and permissions differ from some server DBMSs. Non-SQLite commands such as GRANT/REVOKE and MySQL's ALTER … MODIFY are labelled as explanatory examples. Follow the dialect specified in an examination question.

Challenge checks compare column positions, values and requested order on the sample database, not the written syntax or all possible datasets. Equivalent valid queries can pass. They require one SELECT statement without leading comments. Lesson examples opened in the lab reset its temporary database first, to make the example reproducible.
