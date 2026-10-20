# What is it?

A local, modular file-rendering toolkit. Preview saved Markdown with live updates, export a formatted PDF, combine photos into one PDF, extract/delete/reorder PDF pages, or download audio from a URL and convert audio formats. Preview content stays in memory; no rendered document or work-in-progress cache is saved. See [description.md](description.md) for architecture, limitations, and development details.

# How to use

Requires Node.js 22 or newer and npm. Chrome or Chromium is needed for Markdown PDF export and Mermaid diagrams; ordinary Markdown preview works without it.

```bash
cd /home/a/Documents/someProducts/toolkit
npm install
npm start
```

Open **http://127.0.0.1:4177** (or the local address printed in the terminal if you chose another port). No token or URL fragment is needed; allow cookies for this local address. Enter an absolute Markdown path, a `~/` path, or a path relative to the directory where you started the app. Click **Open file**, or **Open example**. Edit the original file in your usual editor and **save** it: the preview updates automatically. Use **Source** to inspect the saved Markdown, or the outline to jump to a heading. The interface and preview use a dark black-and-white theme. Use **Hide sidebar** or **Show sidebar** to completely hide or reopen the outline.

Open the same local address in additional tabs or windows to work on different Markdown files. Each page keeps its own path, outline, preview, file watching, and export settings. Changing a path in one page does not affect another. Refreshing or duplicating an active page starts an independent view of its selected file.

Click **Zen mode** to fill the window with only the rendered document. Press **Esc** to return to the controls, including when the document has keyboard focus. Saved-file changes continue to update while reading. Your previous Preview/Source view and sidebar state return when you exit.

For an existing PDF, click **PDF pages** and **Open PDF** to choose a local file.
Enter original page numbers such as `1-3, 7, 5`, choose **Keep / reorder these
pages** or **Delete these pages**, then click **Apply**. The page list also has
earlier/later and delete buttons; **Restore all pages** resets it. Use **Preview
result**, choose a new filename and click **Save as new PDF**. The browser downloads
a separate PDF; the original stays unchanged. Editing runs in the current browser
page without uploading the PDF. Each tab has its own PDF selection. The preview
uses your browser's PDF viewer; **Open preview in new tab** is available if it
cannot display embedded PDFs. Page editing also works without Chromium installed
on the server. Password-protected PDFs and interactive forms are not supported.

To combine photos, click **Photos to PDF**, then **Add photos** and select several
JPEG, PNG, WebP or AVIF files. You can add more batches, move photos earlier/later,
remove individual photos, or clear the list. Choose **A4**, **Letter** or **Fit
photo**, enter a filename, then click **Save photos as PDF**. Each photo becomes
one page in list order. A4/Letter pages automatically use portrait or landscape
orientation and fit the whole image without cropping; Fit photo has no margins.
Photo processing stays in the current browser tab and leaves the originals
unchanged. No uploads or server-side Chromium are needed for this tool.

For scanned scores, Python 3, Poppler (`pdfinfo`, `pdfimages`, `pdftoppm`),
Pillow and NumPy are also needed. Click **OMR scan**, choose a PDF page, and compare the
source-resolution render with **Preserve pixels**, **Contrast normalization**,
or a small **Manual deskew** rotation. Save the selected page as a separate
candidate PDF to try in an OMR engine; save the JSON report to keep its source
hash and processing details. The original stays unchanged. This tool does not
recognize notes or establish that a candidate is more accurate. See
[description.md](description.md) for the local processing and limitations.

For URL audio downloads and local audio conversion, install the optional media
support once (Python 3 with venv support, plus FFmpeg on PATH):

```bash
npm run media:setup
```

Open **URL audio**, paste a public video/audio/page/playlist URL, then click **Find
media**. Select one or more listed items, choose **MP3**, **FLAC** or **Original
audio**, and click **Download selected audio**. One item downloads as an audio
file; multiple items download together as a ZIP. Videos are reduced to their
soundtrack. The scanner lists at most 100 items; download up to 20 at a time.
Supported websites depend on yt-dlp; login-only or protected media may fail.

Use **Convert local audio** to convert an existing file to MP3 or FLAC. FLAC keeps
lossless encoding of the decoded source; it cannot restore details missing from
a compressed original. Conversion uses the local toolkit server and preserves
the input file. **Cancel** stops processing. URL requests happen only after an
explicit scan/download; audio work uses temporary files which are removed after
completion, cancellation or errors. Re-run `npm run media:setup` to update yt-dlp.

Select **A4** or **Letter** and **White paper**, **Yellow paper**, or **Black paper**, then click **Export PDF** to download the current saved version. PDF background defaults to white and is independent of the dark preview. A heading and its content up to the next heading move together to the next page when they do not fit; sections longer than a full page can span pages. No PDF is generated automatically. Your browser controls the download location.

Use a fenced `mermaid` block for diagrams in both preview and PDF:

````markdown
```mermaid
flowchart LR
    A[Open file] --> B[Save changes] --> C[Export PDF]
```
````

Save the file to update the diagram. Invalid diagrams show their source and an error message; other content remains readable. **Open example** includes a working diagram.

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
