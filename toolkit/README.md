# What is it?

A local, modular file-rendering toolkit. Its first module previews Markdown in your browser, follows changes whenever you save the original file in your editor, and exports a formatted PDF on demand. Preview content stays in memory; no rendered document or work-in-progress cache is saved. See [description.md](description.md) for architecture, limitations, and development details.

# How to use

Requires Node.js 22 or newer and npm. Chrome or Chromium is needed for PDF export; preview works without it.

```bash
cd /home/a/Documents/someProducts/toolkit
npm install
npm start
```

Open the full local session URL printed in the terminal. Enter an absolute Markdown path, a `~/` path, or a path relative to the directory where you started the app. Click **Open file**, or **Try the example document**. Edit the original file in your usual editor and **save** it: the preview updates automatically. Use **Source** to inspect the saved Markdown, or the outline to jump to a heading.

Select **A4** or **Letter**, then click **Export PDF** to download the current saved version. No PDF is generated automatically. Your browser controls the download location.

You can also start with a target file:

```bash
npm start -- /path/to/notes.md
npm start -- /path/to/notes.md --port 4180 --interval 500
```

The default address is `127.0.0.1:4177`, with a 300 ms file check interval. `--port 0` selects an available port. Set `TOOLKIT_CHROMIUM` to your Chrome/Chromium executable if it is not detected:

```bash
TOOLKIT_CHROMIUM=/path/to/chromium npm start
```

Stop with **Ctrl+C**. No global installation, startup service, or file association is created. To remove the toolkit, stop it and delete this folder; original Markdown files and PDFs downloaded elsewhere remain yours.
