import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { parsePages, extractPages } from '../public/pdf-selection.js';

test('page ranges preserve requested order and reject ambiguous or out-of-bounds selections', () => {
  assert.deepEqual(parsePages('1-3, 7, 5', 8), [1, 2, 3, 7, 5]);
  assert.deepEqual(parsePages('4-2, 1', 4), [4, 3, 2, 1]);
  for (const text of ['', '0', '1-9', '-1', '1.5', 'foo', '1,,2', '1,1', '1-3,2']) {
    assert.throws(() => parsePages(text, 8), undefined, text);
  }
});

test('extraction preserves page geometry and rotation without changing the source', async () => {
  const original = await PDFDocument.create();
  for (let n = 1; n <= 4; n++) {
    const page = original.addPage([300 + n, 500 + n]);
    page.drawText(`Original page ${n}`, { x: 30, y: 300 });
    if (n === 3) page.setRotation(degrees(90));
  }
  const before = await original.save();
  const bytes = await extractPages(PDFDocument, original, [3, 1]);
  const output = await PDFDocument.load(bytes);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(output.getPages().map(p => p.getWidth()), [303, 301]);
  assert.deepEqual(output.getPages().map(p => p.getHeight()), [503, 501]);
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.equal(original.getPageCount(), 4);
  assert.deepEqual(await original.save(), before);
  await assert.rejects(extractPages(PDFDocument, original, []));
  await assert.rejects(extractPages(PDFDocument, original, [0]));
  await assert.rejects(extractPages(PDFDocument, original, [1, 1]));
});
