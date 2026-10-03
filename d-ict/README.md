# Data / Logic — HKDSE ICT 2026

## What is it?

An entirely English database learning companion covering the database-related compulsory material and the full Databases elective: relational concepts, SQL and database design methodology.

## How to use

Open **index.html** in a modern browser. Keep `style.css`, `lessons.js`, `app.js` and `vendor/` together. There is no build step, account, CDN or network dependency. The SQL engine also works when the page is opened directly from disk.

For a local HTTP preview, run `python3 -m http.server 8080 --bind 127.0.0.1 --directory d-ict` from the parent directory and visit `http://127.0.0.1:8080`.

Choose a chapter in the navigation, read its examples, and answer the self-checks. Use the SQL playground to run queries, Reset to restore the sample database, or CSV export to save the displayed results. Try the SQL challenges and mark lessons understood as you study. Printing produces notes for the entire course.

See [description.md](description.md) for background and technical details.
