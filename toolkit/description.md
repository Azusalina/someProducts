# Local Toolkit

## Scope and behavior

The first module turns a local `.md` or `.markdown` file into a formatted browser document and a manually downloaded PDF. The app reads the original file; it never edits it. A saved version is checked every 300 ms by default and sent to the browser through an authenticated event stream. Polling the pathname supports ordinary writes and atomic editor saves. Missing files keep the last preview visible with a warning and recover when the same path returns. Opening an invalid new path preserves the current document.

No rendered HTML, Markdown copy, session history, localStorage, IndexedDB, automatic PDF, or document cache file is written by the application. Source text, rendered HTML, embedded images, and export PDF bytes live in process/browser memory. HTTP responses use `Cache-Control: no-store`. Export rereads the original saved file at click time. The browser downloads the resulting PDF only after that explicit action. Chromium uses its normal temporary browser profile during export; this is browser infrastructure, not a saved target document. Operating systems and browsers may retain their own process or download metadata.

Only one target file is active per running toolkit process. Tabs sharing that process follow the same target. Start separate processes on different ports for independent documents.

## Markdown module

Supports headings with unique anchors and an outline, paragraphs, emphasis, links, ordered and unordered lists, task checkboxes, tables, blockquotes, rules, fenced code with syntax highlighting, and local raster images. English and Chinese content use installed system fonts. A4 and US Letter PDF output share the preview's document stylesheet and use print-specific margins and typography.

Raw HTML is displayed as text. Scripts, embedded websites, remote image fetches, SVG, LaTeX/math rendering, Mermaid diagrams, custom Markdown extensions, and YAML front matter are not interpreted in this version. External HTTP(S) and email links can be opened explicitly. Relative document links are inert; in-document anchors work. Heading slugs are derived from the heading's Markdown source, so complex formatted-heading anchors can differ from GitHub's.

Image paths must be relative to the Markdown file and remain inside its folder after symlink resolution. Supported formats: PNG, JPEG, GIF, WebP, AVIF; base64 data images of those types also work. Images are embedded in memory for both preview and PDF. Unsupported, missing, remote, or out-of-folder images become labeled placeholders and warnings. Source files and each local image are limited to 5 MB. Image-only edits are reflected on the next Markdown change or reopening the document, and always reread during export. Preview follows saved disk content, not unsaved keystrokes in another editor.

## Architecture and file inventory

| File | Responsibility |
| --- | --- |
| `src/cli.js` | Startup options, local session URL, shutdown |
| `src/server.js` | Loopback HTTP API, active document, event stream, export coordination |
| `src/core/files.js` | Bounded source reading and local image containment |
| `src/core/watcher.js` | Serialized pathname polling and recovery |
| `src/core/registry.js` | Format discovery and module metadata |
| `src/core/pdf.js` | Chrome discovery, memory-only HTML rendering and PDF bytes |
| `src/modules/markdown/index.js` | Markdown parsing, image embedding, outline, highlighting |
| `public/index.html`, `style.css`, `app.js` | Responsive browser interface and reconnecting event client |
| `public/document.css` | Shared preview/print typography |
| `examples/welcome.md` | Editable sample document |
| `tests/core.test.js`, `tests/browser.js` | Functional and browser validation |

Modules expose `{ id, name, extensions, outputs, async render(source, { filename }) }`. Rendering returns `{ html, outline, warnings, title }`; outline entries contain `{ id, label, level }`. Add a format under `src/modules/`, import it into `ModuleRegistry`'s default module array, and keep file watching and PDF export shared. New modules must produce safe HTML compatible with the restricted preview and local-only export. The first UI exposes the Markdown module; a module picker can accompany future formats.

## Local access and dependencies

The server binds only to IPv4 loopback `127.0.0.1`. Its random per-process token is carried in the session URL fragment and API headers; it is not persisted. Host and Origin checks reject access from unrelated sites. The preview iframe prohibits scripts; document CSP permits styles and embedded images only. PDF rendering blocks network requests, disables page JavaScript and Chromium's network cache, and never navigates to the source file. File access follows the current OS user's read permissions and requires explicitly opening a target path.

Runtime dependencies are installed by npm with a committed lockfile. Once installed, the app works offline. `playwright-core` uses an existing Chrome/Chromium executable and does not download a browser. It launches a temporary headless browser using Playwright's default launch settings. PDF layout and available glyphs depend on installed browser and fonts. Install suitable CJK fonts if Chinese characters are missing. Very wide tables or unusually large blocks may require editing the source or document stylesheet for publication layout.

API routes: `GET /api/info`, `GET /api/events`, `POST /api/open` with `{ "path": "…" }`, and `POST /api/export/pdf` with `{ "paper": "A4" }` or `Letter`. Every API route requires the session token. PDF exports run one at a time. No global settings, telemetry, cloud account, file writes, or Git operations are part of the application workflow.

## Development and maintenance

Run `npm test` for core checks and `npm run test:browser` for the real Chromium workflow. Browser checks write temporary validation screenshots and an explicitly requested test PDF under `/tmp/toolkit-validation`; this is test evidence, not application caching. Test fixtures are temporary and removed after each run. Use `TOOLKIT_CHROMIUM` when Chrome lives elsewhere. Keep UI, preview, and PDF behavior in sync when changing `document.css`.

References: [markdown-it options](https://markdown-it.github.io/markdown-it/interfaces/MarkdownItOptions.html), [markdown-it architecture](https://markdown-it.github.io/markdown-it/documents/Architecture.html), [Playwright PDF API](https://playwright.dev/docs/api/class-page#page-pdf), [Playwright launch options](https://playwright.dev/docs/api/class-browsertype#browser-type-launch). Libraries retain their licenses in their npm distributions.

## Validation and history

2026-10-05: initial implementation following the requested local web workflow, saved-file updates, modular renderer structure, and manual PDF export without work-in-progress document files.

Validation on Node.js 24.20.0 and system Chromium 153:

- All five core tests passed: file update/replacement/recovery, safe Markdown formatting, local image embedding and symlink containment, module registration, and authenticated local API behavior.
- The real browser workflow passed source/preview switching, atomic saves, file deletion and recreation, invalid-path handling, A4 and Letter downloads, and original-source preservation. Test saves became visible in 130–240 ms with a 100 ms test polling interval; normal startup uses 300 ms. Timing is environment-dependent.
- Verified the document folder contained no generated preview/cache files before or after export. No external browser requests or page errors were observed.
- Inspected desktop and 390 px mobile screenshots; the narrow interface had no horizontal page overflow.
- PDF metadata confirmed A4 and Letter sizes. Rendered and visually inspected the one-page test and both pages of the example's Letter PDF, including the table, highlighted code, checkboxes, and Traditional Chinese text; no clipping or missing glyphs was observed.
- Verified empty startup and the example-document button against the running CLI app. Temporary evidence is in `/tmp/toolkit-validation`, outside the product folder.
