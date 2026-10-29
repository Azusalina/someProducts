# What is it?

A Windows-friendly version of the local toolkit, based on toolkit commit
`6d8e098`. It previews Markdown/TeX, edits PDF pages, combines photos, converts
files, generates JS/MJS flowchart SVGs, and includes optional URL-audio and Scribd
PDF tools. Use Firefox, Edge or Chrome. See [description.md](description.md) for
architecture, supported formats, limitations and validation.

# How to use

Requires **Node.js 22.12 or newer**. Open PowerShell in this directory:

```powershell
npm.cmd ci
npm.cmd run ffmpeg:setup
npm.cmd run doctor
npm.cmd start
```

Open **http://127.0.0.1:4177**. Using `npm.cmd` avoids PowerShell's restrictions
on the separate `npm.ps1` wrapper. You can also double-click `start.cmd` after
installation. Keep that console open; Ctrl+C stops toolkit. If another toolkit
already uses this port, run `npm.cmd start -- --port 4178`.

**JS / MJS → SVG** works directly in Firefox/Edge/Chrome without installing a
second browser. Choose a file or paste code, generate the preview, edit the
filename and download SVG. **PDF pages** and **Photos to PDF** also run in your
browser. Each tab keeps its own input. **Customize tools** remembers hidden tools
and their order. **Zen mode** focuses the document; Esc exits.

For saved Markdown or TeX, enter a Windows path such as
`C:\Users\Alice\Documents\notes.md`. Paths with spaces, quoted Explorer paths,
`~/Documents/notes.md` and `~\Documents\notes.md` are supported. Saving changes in
your editor updates the preview. Use the explicit PDF export button to download.

Markdown PDF export and Markdown Mermaid diagrams require a server-side browser.
Windows Edge, Chrome and Chromium are detected in their usual installation
folders, independently of your default browser. If none is available:

```powershell
npm.cmd run browser:setup
```

Or set an explicit browser path before starting:

```powershell
$env:TOOLKIT_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm.cmd start
```

Audio/video processing uses **only this project's FFmpeg and ffprobe** in
`tools/ffmpeg/win32-x64/bin`. `npm.cmd run ffmpeg:setup` downloads and verifies
both programs; system PATH and external FFmpeg overrides are not used. Windows
x64 and Linux x64 builds are supported. Re-run setup to replace the local build.
The binaries are intentionally excluded from Git, so run setup after cloning.

Optional converters require Python **3.12+**. The setup launcher finds `python`,
`python3` or the Windows `py -3` launcher. It creates project-local environments
and does not require activation:

```powershell
npm.cmd run formats:setup
npm.cmd run pdfmd:setup
npm.cmd run media:setup
```

These enable photo/TIFF/DNG conversion, PDF → Markdown, and URL audio respectively.
Audio outputs include ALAC/M4A, FLAC and WAV; video includes ProRes HQ/MOV. Select
a local file, output format and filename, then convert/download. Originals remain
unchanged. Linear DNG export cannot recover camera sensor data from a JPEG.

For Scribd PDF support, place the supplied downloader checkout under
`src/scribd-downloader`, then run `npm.cmd run scribd:setup`. Install matching
ChromeDriver and set `TOOLKIT_CHROMEDRIVER` to its executable if it is not on PATH.
Paste a Scribd document URL and generate a local preview/download link. Access
restrictions or browser verification can prevent export; errors are shown.

For TeX install MiKTeX/TeX Live (XeLaTeX). OMR preparation additionally needs
Poppler, Pillow and NumPy. Optional tool paths can be set using `TOOLKIT_PYTHON`,
`TOOLKIT_TEX_ENGINE`, `TOOLKIT_PDFINFO`, `TOOLKIT_PDFIMAGES` and
`TOOLKIT_PDFTOPPM`. Poppler can also be placed in `tools/poppler/bin`.
`npm.cmd run doctor` reports detected tools without installing anything.

Login startup is optional:

```powershell
npm.cmd run autostart:install
npm.cmd run autostart:remove
```

On Windows this manages a current-user Startup entry; it requires Windows Script
Host and does not require administrator access. On Linux the fork uses its own
`toolkit-win.service`, preserving the original toolkit service. Startup installation
does not start a second server immediately. To remove the product, remove login
startup, stop its console and delete this directory. Documents and downloads
outside the project are retained.

On Linux use `npm` instead of `npm.cmd`; the same web application and optional
setup commands work. KDE native desktop integration is a separate Linux product
and is not installed by this Windows-oriented fork.
