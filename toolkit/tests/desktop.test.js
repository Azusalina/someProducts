import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { processFile } from '../src/desktop/worker.mjs';

test('native bridge reuses PDF page methods, preserves source and never overwrites output', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'toolkit-desktop-fixture-'));
  try {
    const source = path.join(folder, 'original.pdf'), output = path.join(folder, 'result.pdf');
    const pdf = await PDFDocument.create(); pdf.addPage([300, 500]); pdf.addPage([400, 600]);
    await writeFile(source, await pdf.save()); const original = await readFile(source);
    const request = { operation: 'pdf-pages', inputs: [source], output, options: { pages: '2,1', pageMode: 'keep' } };
    await processFile(request);
    const result = await PDFDocument.load(await readFile(output));
    assert.deepEqual(result.getPages().map(p => p.getWidth()), [400, 300]);
    await assert.rejects(processFile(request), /EEXIST/);
    await assert.rejects(processFile({ ...request, output: source }), /separately/);
    await processFile({ ...request, output: path.join(folder, 'deleted.pdf'), options: { pages: '1', pageMode: 'delete' } });
    assert.equal((await PDFDocument.load(await readFile(path.join(folder, 'deleted.pdf')))).getPageCount(), 1);
    assert.deepEqual(await readFile(source), original);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
