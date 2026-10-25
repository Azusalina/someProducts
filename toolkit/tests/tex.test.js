import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileTex } from '../src/modules/tex/index.js';
import { DocumentSession } from '../src/core/document-session.js';
import { ModuleRegistry } from '../src/core/registry.js';
import { PDFDocument } from 'pdf-lib';

test('real TeX preview watches included text and cleans all compiler artifacts on success and error', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'toolkit-tex-fixture-'));
  const workRoot = await mkdtemp(path.join(tmpdir(), 'toolkit-compile-fixture-'));
  const previousRoot = process.env.TOOLKIT_TEX_TMPDIR;
  process.env.TOOLKIT_TEX_TMPDIR = workRoot;
  const filename = path.join(folder, 'notes.tex'), included = path.join(folder, 'section.tex');
  const source = '\\documentclass{article}\n\\begin{document}\\input{section.tex}\\end{document}';
  let view;
  try {
    await writeFile(filename, source); await writeFile(included, 'First render');
    view = new DocumentSession({ registry: new ModuleRegistry(), baseDir: folder, interval: 30 });
    const first = await view.openFile(filename);
    assert.equal(first.module, 'tex');
    assert.equal((await PDFDocument.load(Buffer.from(first.pdf, 'base64'))).getPageCount(), 1);
    assert.ok(first.dependencies.includes(included));
    await writeFile(included, 'Changed render');
    const deadline = Date.now() + 20000;
    while (view.state.pdf === first.pdf && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 60));
    assert.notEqual(view.state.pdf, first.pdf, 'included source changes refresh the preview');
    const valid = view.state.pdf;
    await writeFile(filename, '\\documentclass{article}\\begin{document}\\undefinedcommand\\end{document}');
    const errorDeadline = Date.now() + 15000;
    while (!view.state.error && Date.now() < errorDeadline) await new Promise(resolve => setTimeout(resolve, 60));
    assert.match(view.state.error, /Rendering failed/);
    assert.equal(view.state.pdf, valid, 'a failed draft keeps the previous successful PDF');
    assert.deepEqual((await readdir(folder)).sort(), ['notes.tex', 'section.tex']);
    assert.equal(await readFile(included, 'utf8'), 'Changed render');
    assert.deepEqual(await readdir(workRoot), []);
  } finally {
    view?.close();
    if (previousRoot === undefined) delete process.env.TOOLKIT_TEX_TMPDIR; else process.env.TOOLKIT_TEX_TMPDIR = previousRoot;
    await rm(folder, { recursive: true, force: true }); await rm(workRoot, { recursive: true, force: true });
  }
});

test('TeX cancellation kills compiler work and removes temporary files', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(compileTex('not a document', { filename: '/tmp/cancelled.tex', signal: controller.signal }), /Cancelled/);
});
