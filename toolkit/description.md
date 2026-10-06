# Local Toolkit

## Scope and behavior

The first module turns a local `.md` or `.markdown` file into a formatted browser document and a manually downloaded PDF. The app reads the original file; it never edits it. A saved version is checked every 300 ms by default and sent to the browser through an authenticated event stream. Polling the pathname supports ordinary writes and atomic editor saves. Missing files keep the last preview visible with a warning and recover when the same path returns. Opening an invalid new path preserves the current document.

No rendered HTML, Markdown copy, session history, localStorage, IndexedDB, automatic PDF, or document cache file is written by the application. Source text, rendered HTML, embedded images, and export PDF bytes live in process/browser memory. HTTP responses use `Cache-Control: no-store`. Export rereads the original saved file at click time. The browser downloads the resulting PDF only after that explicit action. Chromium uses its normal temporary browser profile during export; this is browser infrastructure, not a saved target document. Operating systems and browsers may retain their own process or download metadata.

Only one target file is active per running toolkit process. Tabs sharing that process follow the same target. Start separate processes on different ports for independent documents.

## Markdown module

Supports headings with unique anchors and an outline, paragraphs, emphasis, links, ordered and unordered lists, task checkboxes, tables, blockquotes, rules, fenced code with syntax highlighting, and local raster images. English and Chinese content use installed system fonts. A4 and US Letter PDF output share the preview's document stylesheet and use print-specific margins and typography.

Raw HTML is displayed as text. Scripts, embedded websites, remote image fetches, SVG, LaTeX/math rendering, Mermaid diagrams, custom Markdown extensions, and YAML front matter are not interpreted in this version. External HTTP(S) and email links can be opened explicitly. Relative document links are inert; in-document anchors work. Heading slugs are derived from the heading's Markdown source, so complex formatted-heading anchors can differ from GitHub's.

Image paths must be relative to the Markdown file and remain inside its folder after symlink resolution. Supported formats: PNG, JPEG, GIF, WebP, AVIF; base64 data images of those types also work. Images are embedded in memory for both preview and PDF. Unsupported, missing, remote, or out-of-folder images become labeled placeholders and warnings. Source files and each local image are limited to 5 MB. Image-only edits are reflected on the next Markdown change or reopening the document, and always reread during export. Preview follows saved disk content, not unsaved keystrokes in another editor.

## Pagination and appearance

Each top-level Markdown heading (`#` through `######`, including Setext headings) starts a print section ending immediately before the next heading of any level, or at the document end. The heading level does not create a nested keep-together hierarchy. Headings inside a list or blockquote remain inside that block and do not divide the document; heading-like text in code fences is code. Text before the first heading uses ordinary pagination.

The renderer wraps each section, and print CSS applies `break-inside: avoid-page`. If a section fits a full page but not the space remaining on the current page, Chromium moves the whole section to the next page. A section longer than the printable page may split naturally; content is neither shrunk nor discarded. Existing heading, table-row, paragraph widow/orphan, and image break rules remain active. Printable space accounts for 18 mm margins on every side. Both A4 and Letter use this behavior. Browser preview stays continuous: section wrappers use `display: contents` outside print.

The interface, source view, and Markdown preview use a dark black-and-white theme. Buttons, focus rings, status indicators, headings, links, borders, and code highlighting use neutral grayscale accents instead of green. PDF paper is selected independently: white (`#ffffff`, default), warm yellow (`#fff4cc`), or dark black (`#161616`). Text, headings, code, tables, and quotations receive corresponding readable colors. Backgrounds cover the page margins too; embedded image colors are preserved. The Hide sidebar button hides the entire sidebar and gives its width back to the workspace, with an accessible button to reopen it on both desktop and mobile. These interface choices remain in the current page only; no preference storage is added.

## Architecture and file inventory

| File | Responsibility |
| --- | --- |
| `src/cli.js` | Startup options, bare local URL, shutdown |
| `src/server.js` | Loopback HTTP API, active document, event stream, export coordination |
| `src/core/files.js` | Bounded source reading and local image containment |
| `src/core/watcher.js` | Serialized pathname polling and recovery |
| `src/core/registry.js` | Format discovery and module metadata |
| `src/core/pdf.js` | Chrome discovery, memory-only HTML rendering and PDF bytes |
| `src/modules/markdown/index.js` | Markdown parsing, image embedding, outline, highlighting |
| `public/index.html`, `style.css`, `app.js` | Responsive browser interface and reconnecting event client |
| `public/document.css` | Shared preview/print typography |
| `examples/welcome.md` | Editable sample document |
| `tests/core.test.js`, `tests/browser.js`, `tests/pdf.js` | Functional, browser, and rendered PDF validation |

Modules expose `{ id, name, extensions, outputs, async render(source, { filename }) }`. Rendering returns `{ html, outline, warnings, title }`; outline entries contain `{ id, label, level }`. Add a format under `src/modules/`, import it into `ModuleRegistry`'s default module array, and keep file watching and PDF export shared. New modules must produce safe HTML compatible with the restricted preview and local-only export. The first UI exposes the Markdown module; a module picker can accompany future formats.

## Local access and dependencies

The server binds only to IPv4 loopback `127.0.0.1`. Opening the bare local URL establishes a random per-process session through an `HttpOnly; SameSite=Strict` cookie; no token is shown in the URL or exposed to page JavaScript. The cookie has no expiry or Max-Age and follows the browser's session-cookie lifecycle (including any browser session restoration). Cookie names include the port so separate toolkit processes can coexist. Refreshing the main page after a server restart renews the cookie. Cookies must be enabled for the local address. Host, Origin, and cross-site Fetch Metadata checks reject access from unrelated sites. The preview iframe prohibits scripts; document CSP permits styles and embedded images only. PDF rendering blocks network requests, disables page JavaScript and Chromium's network cache, and never navigates to the source file. File access follows the current OS user's read permissions and requires explicitly opening a target path.

Runtime dependencies are installed by npm with a committed lockfile. Once installed, the app works offline. `playwright-core` uses an existing Chrome/Chromium executable and does not download a browser. It launches a temporary headless browser using Playwright's default launch settings. PDF layout and available glyphs depend on installed browser and fonts. Install suitable CJK fonts if Chinese characters are missing. Very wide tables or unusually large blocks may require editing the source or document stylesheet for publication layout.

API routes: `GET /api/info`, `GET /api/events`, `POST /api/open` with `{ "path": "…" }`, and `POST /api/export/pdf` with `{ "paper": "A4", "background": "white" }` (paper: `A4` or `Letter`; background: `white`, `yellow`, or `black`, default `white`). Every API route requires the automatically established session cookie. PDF exports run one at a time. No global settings, telemetry, cloud account, file writes, or Git operations are part of the application workflow.

## Development and maintenance

Run `npm test` for core checks, `npm run test:browser` for the real Chromium workflow, and `npm run test:pdf` for exported page-break and background-pixel checks. The PDF checks additionally require Poppler's `pdftotext` and `pdftoppm` commands; these are test-only dependencies. Browser and PDF checks write temporary validation screenshots and explicitly requested test PDFs under `/tmp/toolkit-validation`; this is test evidence, not application caching. Test fixtures are temporary and removed after each run. Use `TOOLKIT_CHROMIUM` when Chrome lives elsewhere. Keep UI, preview, and PDF behavior in sync when changing `document.css`.

References: [markdown-it options](https://markdown-it.github.io/markdown-it/interfaces/MarkdownItOptions.html), [markdown-it architecture](https://markdown-it.github.io/markdown-it/documents/Architecture.html), [Playwright PDF API](https://playwright.dev/docs/api/class-page#page-pdf), [Playwright launch options](https://playwright.dev/docs/api/class-browsertype#browser-type-launch), [CSS fragmentation and break-inside](https://www.w3.org/TR/css-break-3/#break-within). Libraries retain their licenses in their npm distributions.

## Validation and history

2026-10-05: initial implementation following the requested local web workflow, saved-file updates, modular renderer structure, and manual PDF export without work-in-progress document files.

Validation on Node.js 24.20.0 and system Chromium 153:

- All five core tests passed: file update/replacement/recovery, safe Markdown formatting, local image embedding and symlink containment, module registration, and authenticated local API behavior.
- The real browser workflow passed source/preview switching, atomic saves, file deletion and recreation, invalid-path handling, A4 and Letter downloads, and original-source preservation. Test saves became visible in 130–240 ms with a 100 ms test polling interval; normal startup uses 300 ms. Timing is environment-dependent.
- Verified the document folder contained no generated preview/cache files before or after export. No external browser requests or page errors were observed.
- Inspected desktop and 390 px mobile screenshots; the narrow interface had no horizontal page overflow.
- PDF metadata confirmed A4 and Letter sizes. Rendered and visually inspected the one-page test and both pages of the example's Letter PDF, including the table, highlighted code, checkboxes, and Traditional Chinese text; no clipping or missing glyphs was observed.
- Verified empty startup and the example-document button against the running CLI app. Temporary evidence is in `/tmp/toolkit-validation`, outside the product folder.


2026-10-06: added heading-section pagination, direct access through the bare local address with automatic cookie sessions, a dark interface and preview, white/yellow/black PDF paper, and a fully collapsible sidebar.

- All seven core tests passed, covering section boundaries, nested headings, cookie authentication, independent ports, and existing file/rendering behavior.
- Chromium browser checks passed bare-address opening and refresh, dark appearance, desktop/mobile sidebar collapse and reopening, all three PDF paper selections, live saved-file updates, and existing export workflows. No external requests, browser errors, or 390 px page overflow were observed.
- Actual A4 and Letter PDF text extraction verified sections moved intact where the equivalent ungrouped output split, short sections shared a page, final sections were included, mixed tables/code/tasks/images stayed together, and oversized sections preserved every line without blank pages.
- Raster pixel checks verified all three A4 backgrounds including the margins. Rendered example PDFs and desktop/mobile screenshots were inspected for legibility, clipping, and pagination. Evidence remains in `/tmp/toolkit-validation`, with detailed pagination cases in its `pagination/` subfolder.

2026-10-06: replaced green and tinted interface/document accents with a neutral black-and-white palette. Kept the explicit yellow PDF paper option and embedded image colors. Browser and PDF regression checks passed; the final desktop screenshot was inspected for contrast and layout.

2026-10-06: simplified the interface to its file controls, outline, saved-file status, preview/source tabs, and PDF export controls. Removed branding decorations, slogans, badges, ornamental icons, shadows, and the redundant footer/word count. Added subtle translucent grayscale surfaces with backdrop blur; document and PDF typography remain unchanged. The local service must use the current server code for automatic sessions at the bare address.

Validation: Chromium browser regression checks passed for the simplified glass interface, sidebar collapse, saved-file updates, and PDF controls. Desktop and 390 px screenshots were inspected. Restarted the outdated toolkit process on port 4177 and verified the bare URL returns the new interface, establishes its session automatically, and permits API access without a URL token.
