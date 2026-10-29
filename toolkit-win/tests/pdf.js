import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { markdownModule } from '../src/modules/markdown/index.js';
import { exportPdf } from '../src/core/pdf.js';

const run = promisify(execFile);
const evidence = '/tmp/toolkit-validation/pagination';
await mkdir(evidence, { recursive: true });
const style = await readFile(new URL('../public/document.css', import.meta.url), 'utf8');
const lines = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`).join('  \n');

async function pagesFor(name, source, paper, css = style, background = 'white') {
  const { html, title } = await markdownModule.render(source, { filename: `${evidence}/${name}.md` });
  const file = `${evidence}/${name}-${paper}.pdf`;
  await writeFile(file, await exportPdf(html, css, { paper, title, background }));
  const { stdout } = await run('pdftotext', ['-layout', file, '-']);
  const pages = stdout.split('\f');
  if (!pages.at(-1).trim()) pages.pop(); // Poppler's trailing page delimiter.
  assert.ok(pages.every(page => page.trim()), `${name}: no blank pages`);
  return pages;
}

for (const paper of ['A4', 'Letter']) {
  const boundary = `# Lead\n\n${lines('LEAD', 26)}\n\n## MoveTogether\n\n${lines('BODY', 12)}\n\n###### FinalHeading\n\nFinalBody.`;
  // Show that this fixture would split without the keep-section rule.
  const baseline = await pagesFor('without-grouping', boundary, paper, `${style}\n@media print{.document-section{break-inside:auto}}`);
  assert.match(baseline[0], /MoveTogether/);
  assert.doesNotMatch(baseline[0], /BODY012/);
  const grouped = await pagesFor('moved-section', boundary, paper);
  assert.equal(grouped.length, 2);
  assert.match(grouped[0], /LEAD026/);
  assert.doesNotMatch(grouped[0], /MoveTogether|BODY/);
  assert.match(grouped[1], /MoveTogether[\s\S]*BODY001[\s\S]*BODY012[\s\S]*FinalHeading[\s\S]*FinalBody/);

  const short = '# SmallFirst\n\nFirst body.\n\n## SmallSecond\n\nSecond body.\n\n###### SmallLast\n\nLast body.';
  assert.equal((await pagesFor('fits-current-page', short, paper)).length, 1);

  // Tables, code, tasks and images must move with their heading as well.
  const mixed = `# Lead\n\n${lines('LEAD', 26)}\n\n### MixedHeading\n\n${lines('MIXED', 5)}\n\n| Column | Value |\n| --- | --- |\n| TableMarker | Data |\n\n~~~text\nCodeMarker\n~~~\n\n- [x] TaskMarker\n\n![Pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6E4IAAAAASUVORK5CYII=)\n\nLastMixedMarker.`;
  const mixedPages = await pagesFor('mixed-blocks', mixed, paper);
  assert.equal(mixedPages.length, 2);
  assert.doesNotMatch(mixedPages[0], /MixedHeading|MIXED|TableMarker|CodeMarker|TaskMarker|LastMixedMarker/);
  assert.match(mixedPages[1], /MixedHeading[\s\S]*MIXED005[\s\S]*TableMarker[\s\S]*CodeMarker[\s\S]*TaskMarker[\s\S]*LastMixedMarker/);

  const oversized = `# OversizedHeading\n\n${lines('LONG', 95)}\n\n## TailHeading\n\nTailBody.`;
  const longPages = await pagesFor('oversized-section', oversized, paper);
  assert.ok(longPages.length >= 3);
  assert.match(longPages[0], /OversizedHeading[\s\S]*LONG001/);
  const text = longPages.join('\n');
  for (let i = 1; i <= 95; i++) {
    const marker = `LONG${String(i).padStart(3, '0')}`;
    assert.equal(text.split(marker).length - 1, 1, `${paper}: ${marker} preserved exactly once`);
  }
  assert.match(longPages.at(-1), /TailHeading[\s\S]*TailBody/);
}

// Check actual exported page pixels, including the page margins.
for (const [background, rgb] of [['white', [255, 255, 255]], ['yellow', [255, 244, 204]], ['black', [22, 22, 22]]]) {
  const name = `background-${background}`;
  const pages = await pagesFor(name, '# Background test\n\nReadable body.\n\n## Next heading\n\nFinal body.', 'A4', style, background);
  assert.equal(pages.length, 1);
  assert.match(pages[0], /Background test[\s\S]*Readable body[\s\S]*Final body/);
  const root = `${evidence}/${name}`;
  await run('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '400', `${root}-A4.pdf`, root]);
  const ppm = await readFile(`${root}.ppm`);
  const header = ppm.subarray(0, 100).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  assert.ok(header, 'Poppler produced an RGB image');
  const width = Number(header[1]), height = Number(header[2]);
  for (const [x, y] of [[5, 5], [Math.floor(width / 2), height - 10]]) {
    const offset = header[0].length + (y * width + x) * 3;
    const actual = [...ppm.subarray(offset, offset + 3)];
    assert.ok(actual.every((value, i) => Math.abs(value - rgb[i]) <= 1), `${background} background at ${x},${y}: ${actual}`);
  }
}
console.log(JSON.stringify({ result: 'PASS', checks: ['A4 and Letter', 'would split without grouping', 'section moves intact', 'short sections share a page', 'last section included', 'mixed Markdown blocks', 'oversized section without lost content or blank pages', 'white/yellow/black page pixels including margins'], evidence }, null, 2));
