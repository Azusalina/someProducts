# Local Toolkit

## Scope and behavior

The first module turns a local `.md` or `.markdown` file into a formatted browser document and a manually downloaded PDF. The app reads the original file; it never edits it. A saved version is checked every 300 ms by default and sent to the browser through an authenticated event stream. Polling the pathname supports ordinary writes and atomic editor saves. Missing files keep the last preview visible with a warning and recover when the same path returns. Opening an invalid new path preserves the current document.

No rendered HTML, Markdown copy, document history, IndexedDB, automatic PDF, or document cache file is written by the document preview. Only navigation visibility/order preferences use localStorage; document data does not. Source text, rendered HTML, embedded images, and export PDF bytes live in process/browser memory. HTTP responses use `Cache-Control: no-store`. Export rereads the original saved file at click time. The browser downloads the resulting PDF only after that explicit action. Chromium uses its normal temporary browser profile during export; this is browser infrastructure, not a saved target document. Operating systems and browsers may retain their own process or download metadata.

Each browser page owns an independent document session: file path, watcher, render revisions, current state, event subscribers, and export-in-progress flag. Pages share the loopback server and authentication cookie, but changing a path, losing a file, or rendering Markdown in one page never changes another page's state. Pages watching the same physical file naturally both reflect saved edits to that file. PDF exports run independently across pages and snapshot the respective page's selected file.

Every page load creates a fresh server-side view. Browser history stores only an opaque view ID (no Markdown, path, rendered content, or authentication token), allowing a refresh or duplicated tab to fork the prior selected file while creating an independent watcher. Document state does not use localStorage or sessionStorage; only navigation preferences use localStorage. Disconnected views remain in server memory for up to 30 minutes, then release their watcher and document state; active event streams retain their views. After this expiry or a server restart, a fresh load uses the CLI's initial file, or starts empty. A still-open page reconnecting to an expired view can reopen its current in-memory path. There is no persistent per-tab document history.

A file supplied to the CLI is the initial default for newly opened pages. It does not force already open pages back to that file. Separate toolkit processes and ports remain available, but are no longer needed for independent documents.

## PDF to Markdown

The optional MarkItDown 0.1.8 worker converts uploaded PDFs on the loopback server.
`npm run pdfmd:setup` installs only `markitdown[pdf]==0.1.8` into the ignored
`.venv-markitdown` environment. `TOOLKIT_MARKITDOWN_PYTHON` can select an alternative
Python with the converter installed. No cloud/OCR provider is configured.

The worker disables built-ins and plugins, registers only `PdfConverter`, calls
`convert_local()` with an application-generated local path and reads
`result.markdown`. Socket connection APIs are disabled in the worker. User file
names are never used as a path or polymorphic conversion URI. The PDF header is
checked before conversion. Original files remain untouched; uploaded bytes exist
only in a temporary work directory which is removed on success/error/cancel.
Converted Markdown is returned in memory and displayed with `textContent`.
Instructions and HTML within PDFs remain data, never executed by the UI.

The endpoint requires the existing session cookie and page-view ID. Limits are
25 MB input, 5 MB converted UTF-8 Markdown, 180 seconds, one conversion per view
and two across the process. Cancel, disconnection and server shutdown terminate
the worker. PDF-only operation requires no browser-side Chromium.

This is existing-text extraction, not OCR, image export, or visual reconstruction.
Image-only scans return an explicit OCR-needed message and no empty download.
Complex tables, columns, mathematical notation and PDF reading order may require
manual cleanup. Font ligatures and compatibility characters are left as emitted
by MarkItDown; tests compare Unicode-normalized text without silently normalizing
user output. Compare important conversions with the original authoritative PDF.

Implementation: `src/pdfmd/{worker.py,service.js}`, `public/pdfmd.js`,
`scripts/setup-pdfmd.py`. `npm test` covers real English/CJK PDFs, authenticated
conversion and invalid/no-text inputs; `npm run test:pdfmd` verifies browser
conversion, Markdown download, tool customization and independent page state.

## Customizable navigation

Customize tools exposes visibility checkboxes and earlier/later controls for all
tools, including hidden ones. At least one tool remains visible. Hiding the active
tool selects the first visible tool without clearing any current documents.
Restore defaults returns the standard visibility/order. Preferences are remembered
under `localStorage['toolkit-tools-v1']` as tool IDs in `hidden` and `order` arrays,
shared by tabs at the same local origin. No filenames, Markdown, PDFs or tokens
enter this storage. A new tool added by an update is visible by default. Malformed
or unavailable storage falls back to a usable toolbar; saving failures are shown
in the customization dialog. Hidden tools are a navigation preference, not an
access control or API-disable feature.

## Login startup

`scripts/autostart.py install` creates the current user's
`~/.config/systemd/user/toolkit.service`, enables it for `default.target`, and
uses the current absolute Node.js executable and product directory. It does not
open a browser, require root, alter VPN settings, or change login lingering.
The installer preserves a pre-existing service without its managed marker.
Removal disables/stops only this managed unit and leaves product/document files.
`systemctl --user start/stop/restart toolkit.service` controls the process.
The installer enables the service but leaves start explicit so an existing manual
process can be stopped before handing over port 4177. Reinstall if paths change.

Validation on 2026-10-21: `systemd-analyze --user verify` passed; the service was
enabled and active and HTTP responded at port 4177. The existing manual process
was stopped after verifying its working directory and CLI. Actual logout/login
or reboot validation was not performed.

## Conversion references

- [Microsoft MarkItDown](https://github.com/microsoft/markitdown), pinned local PDF extra 0.1.8.
- The MarkItDown procedural skill informed the PDF-only API, local processing and
  conversion-quality checks: Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner,
  A. M. (2026). *Scientific Agent Skills: A Library of Procedural Knowledge for
  Research Agents*. Latest arXiv record v2, verified 2026-10-21.
  https://doi.org/10.48550/arXiv.2609.00065

## Photo, audio and video format converters

Three separately manageable tools provide local file conversion through
`POST /api/formats/convert?kind=…&format=…`. Each saves a new download and keeps
its selected input/options in page memory while navigating. Only tool visibility
and ordering preferences persist. Formats are validated against the shared
`public/format-options.js` catalog; user-provided command strings and paths are
not accepted.

| Tool | Output formats | Implementation |
| --- | --- | --- |
| Photo formats | JPG, PNG, WebP, AVIF | Pillow 13.0.0 in `.venv-formats` |
| Audio formats | MP3, FLAC, WAV, M4A, AAC, Opus, OGG | Local FFmpeg/ffprobe |
| Video formats | MP4, WebM, MKV, MOV, AVI | Local FFmpeg/ffprobe |

`npm run formats:setup` installs only Pillow in an ignored product-local venv.
`TOOLKIT_FORMATS_PYTHON`, `TOOLKIT_FFMPEG` and `TOOLKIT_FFPROBE` override the
executables if needed. Available input decoding and output encoding depend on
the installed versions/builds. The current machine was verified for all listed
target formats; no cloud service or extra yt-dlp dependency is involved.

Photos accept JPEG/PNG/WebP/AVIF/BMP/TIFF/GIF inputs, normalize EXIF orientation,
and convert the first image frame to the chosen output. RGB-compatible ICC and
remaining EXIF data are copied where supported. JPG flattens transparent pixels
onto white at quality 95; WebP uses quality 95 and AVIF 90. PNG is lossless. Alpha
is retained in PNG/WebP/AVIF. Conversion is not a guarantee of identical metadata
or color management for unusual color spaces. Inputs are limited to 25 MB and
32 megapixels; processing times out after two minutes.

Audio converts the first audio stream. MP3 uses LAME quality 0 VBR; FLAC uses
lossless encoding; WAV uses 24-bit PCM; M4A/AAC use 256 kbps AAC; Opus uses
192 kbps at 48 kHz; OGG uses Vorbis quality 6. Multichannel MP3 sources are mixed
to stereo. Uncompressed/lossless containers do not upgrade a lossy input.
Input is capped at 100 MB with a ten-minute timeout.

Video transcodes the first non-cover-art video and optional first audio stream.
MP4/MOV/MKV use H.264 CRF 20 and AAC 192 kbps; WebM uses VP9 CRF 30 and Opus
160 kbps; AVI uses MPEG-4 Part 2 quality 3 and MP3 192 kbps. Output uses 8-bit
YUV420 for compatibility. Odd dimensions gain at most a one-pixel padded edge;
no cropping or requested resizing is applied. Multiple audio tracks, subtitles,
attachments, HDR color management, and lossless video remuxing are outside this
conversion workflow. Video input is capped at 250 MB and runs for at most
15 minutes; FFmpeg encoding uses two threads.

Authenticated uploads stream into fresh temporary directories rather than being
accumulated in Node memory. Media-processing limits remain one operation per page
and two across the process. The existing URL-audio working-data default remains
250 MB; format conversion can specify its own periodic quota (250 MB for
photo/audio, 1 GB for video, including input and output files). Binary results
stream back with a matching MIME type; temporary work is deleted on completion,
errors and cancellation. Source files are never rewritten. FFmpeg inputs restrict
protocols to local file/pipe and use a demuxer allowlist. Still-image conversion
allows only the selected raster decoders and blocks socket connections.

Implementation: `public/formats.js`, `public/format-options.js`,
`src/formats/{service.js,photo.py}` and `scripts/setup-formats.py` reuse the existing
media process and temporary-work helpers through backward-compatible options.
The URL audio tool keeps its existing MP3/FLAC quick conversion controls.

Validation on 2026-10-25: all 16 output formats were decoded/probed for their
actual format or codec, dimensions, audio presence and duration. Tests covered
EXIF normalization, alpha/white backgrounds, invalid inputs, auth, working-data
quota, and unchanged originals. `npm run test:formats` checked real downloads in
all three tools, output naming, toolbar preferences, independent page state,
mobile layout and cancellation across tool switches. Evidence is under
`/tmp/toolkit-validation/formats`. FFmpeg-decoded video and image output were
visually inspected.

## URL media and audio conversion

The URL audio tool uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) for public media
and playlist discovery/download, and FFmpeg for audio-only extraction and local
conversion. `npm run media:setup` creates `.venv-media` and installs/updates yt-dlp
there; the environment is ignored by Git. Python 3 and FFmpeg/ffprobe are optional
media dependencies, independent of ordinary Markdown/photo/PDF page tools.
`TOOLKIT_MEDIA_PYTHON` can select a Python with yt-dlp installed;
`TOOLKIT_FFMPEG` can select the FFmpeg executable. No browser cookies, account
credentials or third-party relays are imported. Sites that require login,
unsupported extractors, DRM, georestrictions, or current anti-bot checks can fail;
errors remain visible, and no restriction-bypass workflow is included.

Scanning is explicit and returns selectable media titles, type and duration where
available. Generic HTML audio/video entries retain their individual resource URLs;
HTML links to common audio/video extensions are also detected. Relative URLs use
the fetched page's location. Alternate encodings of one video are not separate
tracks. A scan is capped at 100 items, HTML fallback at 2 MB. A failed scan retains
the prior results; their source URL stays visible. Results are stored in memory
per page view, with independent browser selections. The server accepts only IDs
from that page's scan, rather than arbitrary client-supplied download URLs.

Downloads select the best available audio-only format where supported, otherwise
extract audio from a muxed video. Output choices are MP3 (`libmp3lame` quality 0
VBR), FLAC (lossless encoding of decoded source audio), or source audio without
re-encoding where the source codec permits extraction/remuxing. Lossless output
does not upgrade a lossy source. A single selection downloads one audio file;
2–20 selections become one ZIP containing separate numbered audio files. If a
selected item fails, the batch fails rather than silently omitting that item.
Local conversion accepts a file up to 100 MB and produces a new MP3 or FLAC from
its first audio stream; its source remains unchanged.

Requests retain cookie, Host/Origin and per-view checks. Worker URLs allow only
HTTP(S) without embedded credentials. Python sockets validate actual destination
IPs at connect time, blocking loopback/private/link-local destinations including
redirects and DNS rebinding. Private-network media and private proxy endpoints are
not supported. Only native HTTP/HLS/DASH download protocols are selected. FFmpeg
post-processing reads local files, with protocol and local-conversion demuxer
allowlists; browser-provided paths or shell commands are never executed.

Each view runs one operation at a time, with two concurrent operations across the
process. Scan timeout is 90 seconds; download/conversion timeout is 10 minutes.
Temporary per-request work directories are capped at 250 MB, including sources,
intermediate audio and ZIP data. A periodic quota check aborts oversized work.
Binary results stream to the browser and temporary files are removed on success,
failure or cancellation. Temporary media exists on disk while processing (unlike
in-memory PDF/photo previews). Input local audio is sent only to the loopback
server; remote media requests originate from this computer. No media library,
persistent download cache, or browser storage is maintained. Ctrl+C/shutdown
aborts active media subprocesses, including FFmpeg children.

Implementation: `public/media.js`, shared `public/tools.js`, `src/media/service.js`
and `src/media/worker.py`; optional dependency setup is `scripts/setup-media.py`.
Run `npm test` for request/auth/conversion/process/temporary-file cleanup checks and
`npm run test:media` for real local-HTML yt-dlp fixtures plus browser interaction.
The browser test stubs external metadata/download responses, while the Python
fixture verifies actual multi-item discovery, extraction and ZIP contents with
FFmpeg/ffprobe. Separate live smoke checks confirmed scanning/downloading a
public MP3 and extracting audio-only MP3 from a public MP4 at W3Schools. Website
support beyond these fixtures/live samples is not implied.

## Photos to PDF

The browser-local Photos to PDF tool appends multiple JPEG, PNG, WebP or AVIF
files in picker order. Thumbnail rows allow reordering/removal before an explicit
save-as download. Each photo produces one page. A4 and Letter use a 12 mm margin,
center the whole image, preserve its aspect ratio, and choose landscape for wide
photos. Fit photo maps decoded pixels to points at 96 DPI without margins. There
is no cropping, OCR, automatic export, or upload. A photo-only PDF can subsequently
be opened in PDF pages for ordinary page extraction/removal.

Browser decoding and Canvas normalization apply EXIF orientation before PDF
embedding. JPEG photos are re-encoded at quality 0.92; other accepted formats
become PNG, preserving alpha. Transparent image areas appear against the PDF's
normal white page. Browser support is required for decoding the selected format;
HEIC and animated/multi-frame image import are outside this tool's scope. A bad
image is skipped with a filename-specific message while valid photos remain.

The current tab retains normalized image bytes and blob thumbnail URLs in memory,
independently of Markdown and PDF page selections. Limits: 100 photos, 25 MB and
32 megapixels per photo, 100 MB aggregate source files and 100 MB normalized image
data. Images are normalized one at a time; a save embeds them sequentially.
Remove/clear revokes thumbnail URLs. Reload clears the selection. Shared tool
navigation is in `public/tools.js`, photo controls in `public/photos.js`, and PDF
layout/embedding in `public/photo-pdf.js`. The server serves these modules and the
existing local PDF-LIB distribution; no new dependency is needed.

Validation: `npm test` checks portrait/landscape fit and aspect ratios.
`npm run test:photos` verifies actual PNG/JPEG imports, append/reorder/remove/clear,
EXIF orientation, invalid-image recovery, A4/Letter/Fit photo output geometry,
rendered PDF page color order, immutable sources, independent tabs, tool switching,
mobile width and absence of image uploads or external network requests. Evidence
is in `/tmp/toolkit-validation/photos`.

## PDF page editor

The PDF pages tool runs locally in the browser using the installed
[PDF-LIB](https://pdf-lib.js.org/) library, served by the toolkit without a CDN.
It accepts one PDF through the browser file picker and keeps it in page-local
memory. PDF bytes never enter the server API or browser storage. Loading is
explicit rather than watched: reopen a PDF to read subsequent disk changes.
Switching back to Markdown preserves both tools' state; reloading clears the
PDF selection. Limits are 100 MB and 5000 original pages per PDF.

Ranges use one-based original page numbers, inclusive endpoints, comma
separators, and either ascending or descending order. For example `5-3, 1`
produces pages 5, 4, 3, 1. Duplicate, nonnumeric and out-of-range entries are
rejected without replacing the existing selection. Keep/reorder replaces the
selection; delete removes those original pages from the current selection.
Individual up/down/delete controls operate on output order. At least one page
must remain to preview or save. A result preview is updated only when requested;
the heading and status distinguish it from the original or pending edits.

Saving copies the selected PDF page objects into a new PDF, preserving their
content, dimensions and rotation rather than rasterizing them. The output has a
separate filename (an identical source filename receives an `-edited` suffix).
Downloads use browser-managed save behavior; the application never writes or
overwrites the selected file. Preview uses a memory-only blob URL in the native
browser PDF viewer, with an open-in-new-tab link for browsers that cannot embed
PDFs. Blob frame URLs are allowed by the outer CSP; Markdown's
script-free iframe policy is unchanged. Preview support depends on the browser.

This is whole-page editing, not text editing, redaction, or rectangular cropping
within a page. Encrypted files and interactive forms are rejected. Document-level
bookmarks, signatures, metadata, attachments and cross-page link destinations are
not guaranteed to survive page extraction. Export does not preserve signatures.
Only ordinary visual PDF page content is in scope.

## OMR scan preparation

The OMR scan view sends a locally selected PDF to the toolkit's loopback server
for one-page-at-a-time raster inspection. The server renders at the embedded
image's native sampling (clamped to 300–900 DPI), or 400 DPI when the page is
vector-only. Processing is limited to 40 megapixels per page and 100 MB per
source PDF. The source PDF is held in a temporary directory for the request and
removed when it completes; no score bytes are written into toolkit storage.
The browser receives two downscaled previews, an explicit provenance report,
and can request a separate one-page candidate PDF. A candidate is rasterized;
it is not a replacement for the original or a lossless edit. It includes the
selected page's source hash, page and profile in its PDF metadata. The JSON
report includes the same SHA-256, image dimensions, native/render DPI, action,
warnings and candidate-image hash.

Profiles are conservative. Preserve pixels keeps the rendered page unchanged.
Contrast normalization adjusts grayscale range but has little or no effect on
already-binary scans. Manual deskew rotates by a user-specified angle from -5°
to +5°, uses bicubic resampling, and may blur fine notation; always compare the
result. The CLI prototype also has an experimental beam-gap function requiring
an explicit region, but it is intentionally not exposed in the interface: beam
changes can alter rhythmic meaning and must not run automatically. The UI does
not guess an angle, erase staff lines, despeckle, sharpen, split systems, or
modify note symbols. Such transformations need a ground-truthed score and
recognition evaluation before they can be recommended. Output does not measure
OMR accuracy.

The server needs Python 3, Poppler (`pdfinfo`, `pdfimages`, `pdftoppm`), Pillow
and NumPy for this module. The original and candidate previews are transient in
page memory. The source PDF never leaves the machine. The selected candidate
page can be sent to another local workflow through the browser download; the
tool does not train or run an OMR model.

Validation: `npm test` includes range parsing, geometry/rotation and source
immutability checks. `npm run test:pdf-pages` exercises real browser imports,
ordered extraction and deletion, preview/download, empty selections, invalid
input recovery, independent tabs, and mobile width. Poppler text extraction and
rendered pages verify actual output order and appearance. The original Markdown,
Zen, Mermaid and PDF download workflow is covered by `npm run test:browser`.

## Markdown module

Supports headings with unique anchors and an outline, paragraphs, emphasis, links, ordered and unordered lists, task checkboxes, tables, blockquotes, rules, fenced code with syntax highlighting, Mermaid diagrams, and local raster images. English and Chinese content use installed system fonts. A4 and US Letter PDF output share the preview's document stylesheet and use print-specific margins and typography.

Raw HTML is displayed as text. Scripts, embedded websites, remote image fetches, user-supplied SVG images, LaTeX/math rendering, custom Markdown extensions, and YAML front matter are not interpreted in this version. External HTTP(S) and email links can be opened explicitly. Relative document links are inert; in-document anchors work. Heading slugs are derived from the heading's Markdown source, so complex formatted-heading anchors can differ from GitHub's.

Image paths must be relative to the Markdown file and remain inside its folder after symlink resolution. Supported formats: PNG, JPEG, GIF, WebP, AVIF; base64 data images of those types also work. Images are embedded in memory for both preview and PDF. Unsupported, missing, remote, or out-of-folder images become labeled placeholders and warnings. Source files and each local image are limited to 5 MB. Image-only edits are reflected on the next Markdown change or reopening the document, and always reread during export. Preview follows saved disk content, not unsaved keystrokes in another editor.

## Mermaid diagrams

Fenced `mermaid` blocks render through the locally installed Mermaid library in a separate headless Chromium context. Flowcharts, sequence diagrams, class diagrams, state diagrams, and other built-in Mermaid syntax are available without a CDN or internet connection after installation. Diagrams use neutral grayscale styling and invert for the dark preview or black PDF paper. Their generated SVG is embedded as inert image data; the Markdown preview and PDF document still run no scripts. User-supplied SVG files remain unsupported.

Diagram source is passed as data to Mermaid's strict rendering API. Click callbacks are disabled, protected security settings cannot be overridden by diagram directives, and all renderer network requests are blocked. Each diagram is limited to 50,000 characters and 500 edges, with a 10-second rendering deadline. Invalid syntax, missing Chromium, or rendering failures produce a warning and preserve the original fenced source in place. Valid diagrams in the same document still render after syntax errors. Source view always shows the original Markdown. Documents with no Mermaid fences do not launch a diagram browser.

Diagram output and source remain in memory. A browser is opened per document rendering batch and closed afterward. Saved-file updates may take longer when diagrams are present; PDF export rereads and rerenders the latest saved source. Diagram images scale to the available page width and existing image-height limits; very large diagrams may have small labels. Explicit custom colors are displayed in grayscale to match the black-and-white interface.

## Pagination and appearance

Each top-level Markdown heading (`#` through `######`, including Setext headings) starts a print section ending immediately before the next heading of any level, or at the document end. The heading level does not create a nested keep-together hierarchy. Headings inside a list or blockquote remain inside that block and do not divide the document; heading-like text in code fences is code. Text before the first heading uses ordinary pagination.

The renderer wraps each section, and print CSS applies `break-inside: avoid-page`. If a section fits a full page but not the space remaining on the current page, Chromium moves the whole section to the next page. A section longer than the printable page may split naturally; content is neither shrunk nor discarded. Existing heading, table-row, paragraph widow/orphan, and image break rules remain active. Printable space accounts for 18 mm margins on every side. Both A4 and Letter use this behavior. Browser preview stays continuous: section wrappers use `display: contents` outside print.

The interface, source view, and Markdown preview use a dark black-and-white theme. Buttons, focus rings, status indicators, headings, links, borders, and code highlighting use neutral grayscale accents instead of green. PDF paper is selected independently: white (`#ffffff`, default), warm yellow (`#fff4cc`), or dark black (`#161616`). Text, headings, code, tables, and quotations receive corresponding readable colors. Backgrounds cover the page margins too; embedded image colors are preserved. The Hide sidebar button hides the entire sidebar and gives its width back to the workspace, with an accessible button to reopen it on both desktop and mobile. These interface choices remain in the current page only; no preference storage is added.

## Zen mode

Zen mode fills the browser viewport with the existing rendered preview and hides
the outline, file controls, toolbar, metadata and status messages. It requires an
open document and creates no PDF or extra render. Escape exits from either the
outer page or the focused preview iframe; the listener is reattached after each
saved-file update. Previous Preview/Source selection, sidebar visibility and PDF
settings are preserved. Reading position and live watching remain active. The
mode belongs to the current page, resets on reload, and does not request browser
fullscreen. On a touch device, exiting requires an Escape-capable keyboard.

## Architecture and file inventory

| File | Responsibility |
| --- | --- |
| `src/cli.js` | Startup options, bare local URL, shutdown |
| `src/server.js` | Loopback HTTP API, page-view allocation/expiry, scoped event streams and exports |
| `src/core/document-session.js` | Per-page file watching, render revisions, state, event clients and cleanup |
| `src/core/files.js` | Bounded source reading and local image containment |
| `src/core/watcher.js` | Serialized pathname polling and recovery |
| `src/core/registry.js` | Format discovery and module metadata |
| `src/core/mermaid.js` | Offline Mermaid rendering, bounded work, inert SVG image output |
| `src/core/pdf.js` | Chrome discovery, memory-only HTML rendering and PDF bytes |
| `src/modules/markdown/index.js` | Markdown parsing, image embedding, outline, highlighting |
| `public/index.html`, `style.css`, `app.js` | Responsive browser interface and reconnecting event client |
| `public/document.css` | Shared preview/print typography |
| `examples/welcome.md` | Editable sample document |
| `tests/core.test.js`, `tests/mermaid.test.js`, `tests/browser.js`, `tests/tabs.js`, `tests/pdf.js` | Functional, browser, and rendered PDF validation |

Modules expose `{ id, name, extensions, outputs, async render(source, { filename }) }`. Rendering returns `{ html, outline, warnings, title }`; outline entries contain `{ id, label, level }`. Add a format under `src/modules/`, import it into `ModuleRegistry`'s default module array, and keep file watching and PDF export shared. New modules must produce safe HTML compatible with the restricted preview and local-only export. The first UI exposes the Markdown module; a module picker can accompany future formats.

## Local access and dependencies

The server binds only to IPv4 loopback `127.0.0.1`. Opening the bare local URL establishes a random per-process session through an `HttpOnly; SameSite=Strict` cookie; no token is shown in the URL or exposed to page JavaScript. The cookie has no expiry or Max-Age and follows the browser's session-cookie lifecycle (including any browser session restoration). Cookie names include the port so separate toolkit processes can coexist. Refreshing the main page after a server restart renews the cookie. Cookies must be enabled for the local address. Host, Origin, and cross-site Fetch Metadata checks reject access from unrelated sites. The preview iframe prohibits scripts; document CSP permits styles and embedded images only. PDF rendering blocks network requests, disables page JavaScript and Chromium's network cache, and never navigates to the source file. File access follows the current OS user's read permissions and requires explicitly opening a target path.

Runtime dependencies are installed by npm with a committed lockfile. Once installed, the app works offline. `playwright-core` uses an existing Chrome/Chromium executable and does not download a browser. Chromium is required for Mermaid preview as well as PDF export. It launches a temporary headless browser using Playwright's default launch settings. PDF layout and available glyphs depend on installed browser and fonts. Install suitable CJK fonts if Chinese characters are missing. Very wide tables or unusually large blocks may require editing the source or document stylesheet for publication layout.

API routes: `POST /api/views` with `{}` creates a page view (optional `previousView` forks an existing view; optional `path` opens a file). It returns module metadata, state and `viewId`. Subsequent `GET /api/info`, `GET /api/events`, `POST /api/open` with `{ "path": "…" }`, and `POST /api/export/pdf` with `{ "paper": "A4", "background": "white" }` (paper: `A4` or `Letter`; background: `white`, `yellow`, or `black`, default `white`). Every API route requires the automatically established session cookie. Document routes additionally require `X-Toolkit-View: <viewId>`; unscoped `GET /api/info` returns only server metadata and no document. Unknown/expired views return HTTP 410. PDF exports run one at a time per page, and different pages may export concurrently. No global settings, telemetry, cloud account, file writes, or Git operations are part of the application workflow.

## Development and maintenance

Run `npm test` for core checks, `npm run test:browser` for the real Chromium workflow, `npm run test:tabs` for independent tabs/refresh/duplicate/concurrent exports, and `npm run test:pdf` for exported page-break and background-pixel checks. The PDF checks additionally require Poppler's `pdftotext` and `pdftoppm` commands; these are test-only dependencies. Browser and PDF checks write temporary validation screenshots and explicitly requested test PDFs under `/tmp/toolkit-validation`; this is test evidence, not application caching. Test fixtures are temporary and removed after each run. Use `TOOLKIT_CHROMIUM` when Chrome lives elsewhere. Keep UI, preview, and PDF behavior in sync when changing `document.css`.

References: [markdown-it options](https://markdown-it.github.io/markdown-it/interfaces/MarkdownItOptions.html), [markdown-it architecture](https://markdown-it.github.io/markdown-it/documents/Architecture.html), [Playwright PDF API](https://playwright.dev/docs/api/class-page#page-pdf), [Playwright launch options](https://playwright.dev/docs/api/class-browsertype#browser-type-launch), [CSS fragmentation and break-inside](https://www.w3.org/TR/css-break-3/#break-within), [Mermaid rendering API](https://mermaid.js.org/config/usage), [Mermaid strict security level](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html). Libraries retain their licenses in their npm distributions.

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

2026-10-06: added Mermaid 12 rendering for fenced diagram blocks, local-only Chromium rendering, inert SVG images, grayscale light/dark display, and invalid-source fallback. The sample document now includes a working flowchart. All 11 core/diagram tests passed, including flowchart, sequence, class, state, CJK, invalid syntax, bounded input, and inert callback output. Chromium workflow verified save-triggered diagram updates and Mermaid diagrams in white/yellow/black PDFs; existing pagination/background tests passed. Inspected actual diagram previews and exported pages under `/tmp/toolkit-validation`.

2026-10-07: replaced the process-wide document with per-page sessions. Added scoped file watching, revision guards, event streams, warning states, and exports; refreshing/duplicating pages forks independent sessions with only opaque IDs in browser history. Browser checks used pages sharing one browser context/cookie and verified independent path selection, saved edits, refresh, duplicate isolation, concurrent PDF content, missing-file warnings, and continued watching after another tab closes. Existing browser/Mermaid/export checks passed. PDF evidence is in `/tmp/toolkit-validation/tabs`.

Additional validation: a deliberately slow renderer in one page did not block another page or overwrite a newer missing-file state. The running port-4177 service was restarted with the previously selected file retained as its initial default; live API checks confirmed independent view IDs and document states.

2026-10-15: added page-local Zen mode for an edge-to-edge document preview, with
Escape handling in both the page and the script-free preview iframe. Browser
checks verified desktop/mobile viewport coverage, saved-file updates while in
Zen, restored Source/sidebar choices and focus, and existing PDF/Mermaid export
workflows. All 13 core/diagram tests passed. Screenshots were inspected at
`/tmp/toolkit-validation/zen-desktop.png` and `zen-mobile.png`.


2026-10-16: added browser-local PDF page extraction, removal and reordering,
explicit result previews and save-as downloads. All 15 core/diagram/page tests
and the existing Markdown/Zen browser workflow passed. PDF editor browser checks
verified page ranges, downloads, text order, geometry and rotation, original file
immutability, invalid-file recovery, mobile width and independent tabs without
PDF uploads. Exported pages and the desktop preview were visually inspected in
`/tmp/toolkit-validation/pdf-pages`.

2026-10-21: shipped MarkItDown PDF-to-Markdown, persistent tool visibility/order,
and optional systemd login startup. All 22 core tests passed. Browser checks
covered real conversion/download, customization persistence/reset, Markdown/Zen,
PDF page editing and photo-to-PDF. Desktop/mobile customization screenshots and
source-vs-extracted text were inspected. The running login service also converted
the English/CJK fixture successfully through the live port-4177 API. Login startup
is enabled; no logout or reboot was performed for validation.
