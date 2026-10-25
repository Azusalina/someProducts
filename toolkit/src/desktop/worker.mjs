// Private stdin/stdout bridge for the native desktop client. No listening socket.
import { readFile, writeFile, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { ModuleRegistry } from '../core/registry.js';
import { readSource, documentStyle } from '../core/files.js';
import { exportPdf } from '../core/pdf.js';
import { compileTex } from '../modules/tex/index.js';
import { parsePages, extractPages } from '../../public/pdf-selection.js';
import { combinePhotos } from '../../public/photo-pdf.js';
import { runMediaProcess, convertMedia } from '../media/service.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const python = (env, folder) => process.env[env] || (existsSync(path.join(root, folder, 'bin/python')) ? path.join(root, folder, 'bin/python') : 'python3');
export async function processFile({ operation, inputs, output, options = {} }, signal) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Choose local files with absolute paths.');
  if (!path.isAbsolute(output || '')) throw new Error('Choose an absolute result path.');
  if (inputs.includes(output)) throw new Error('Save the result separately from the original.');
  const source = inputs[0];
  let bytes;
  const work = await mkdtemp(path.join(tmpdir(), 'toolkit-desktop-'));
  try {
    if (operation === 'tex-pdf') {
      const rendered = await compileTex(await readSource(source), { filename: source, signal });
      bytes = Buffer.from(rendered.pdf, 'base64');
    } else if (operation === 'markdown-pdf') {
      const rendered = await new ModuleRegistry().forFile(source).render(await readSource(source), { filename: source });
      bytes = await exportPdf(rendered.html, await documentStyle(), { paper: options.paper || 'A4', background: options.background || 'white', title: rendered.title });
    } else if (operation === 'pdf-markdown') {
      const result = JSON.parse(await runMediaProcess(python('TOOLKIT_MARKITDOWN_PYTHON', '.venv-markitdown'), [path.join(root, 'src/pdfmd/worker.py'), source], { signal, timeout: 180000 }));
      bytes = result.markdown;
    } else if (operation === 'pdf-pages') {
      const data = await readFile(source);
      if (data.length > 100 * 1024 * 1024) throw new Error('Choose a PDF up to 100 MB.');
      const pdf = await PDFDocument.load(data);
      if (pdf.getForm().getFields().length) throw new Error('Interactive PDF forms are not supported. Use a flattened copy.');
      if (pdf.getPageCount() > 5000) throw new Error('Choose a PDF with at most 5000 pages.');
      let pages = parsePages(options.pages || '', pdf.getPageCount());
      if (options.pageMode === 'delete') {
        const deleted = new Set(pages);
        pages = Array.from({ length: pdf.getPageCount() }, (_, n) => n + 1).filter(n => !deleted.has(n));
      }
      bytes = await extractPages(PDFDocument, pdf, pages);
    } else if (operation === 'photos-pdf') {
      const photos = [];
      for (const input of inputs) photos.push({ bytes: await readFile(input), jpeg: /\.jpe?g$/i.test(input) });
      bytes = await combinePhotos(PDFDocument, photos, options.paper || 'A4');
    } else if (operation === 'audio-mp3' || operation === 'audio-flac') {
      await copyFile(source, path.join(work, 'input'));
      const name = await convertMedia(work, operation.slice(6), signal);
      bytes = await readFile(path.join(work, name));
    } else if (operation === 'omr') {
      const result = path.join(work, 'candidate.pdf');
      await runMediaProcess(process.env.PYTHON || 'python3', [path.join(root, 'src/omr/enhance.py'), source, '--page', String(options.page || 1), '--profile', options.profile || 'preserve', '--rotation', String(options.rotation || 0), '--pdf-output', result, '--output', path.join(work, 'report.zip')], { signal, timeout: 180000 });
      bytes = await readFile(result);
    } else throw new Error('Unknown desktop operation.');
    if (signal?.aborted) throw new Error('Cancelled.');
    // The native client supplies a private staging pathname, then publishes it
    // atomically only after processing succeeds and the user selects a result.
    await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
    return { output, bytes: Buffer.byteLength(bytes) };
  } finally { await rm(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let text = '';
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 1024 * 1024) throw new Error('Request is too large.'); }
    const controller = new AbortController();
    process.on('SIGTERM', () => controller.abort());
    process.on('SIGINT', () => controller.abort());
    console.log(JSON.stringify(await processFile(JSON.parse(text), controller.signal)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
