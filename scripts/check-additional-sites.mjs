import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';

const [name, folder] = process.argv.slice(2);
assert.ok(['balladeIV-liebe', 'hku', 'ict-notes'].includes(name));
const source = path.resolve(folder);
const runtime = path.join(source, name === 'balladeIV-liebe' ? 'web' : name === 'ict-notes' ? 'learn' : '');
async function asset(relative, base = runtime) {
  const file = path.resolve(base, decodeURIComponent(relative.split(/[?#]/)[0]));
  assert.ok(file === runtime || file.startsWith(runtime + path.sep), `Escaping asset: ${relative}`);
  assert.ok((await stat(file)).isFile(), `Missing asset: ${relative}`);
}
const json = async file => JSON.parse(await readFile(path.join(runtime, file), 'utf8'));
if (name === 'balladeIV-liebe') {
  const pieces = await json('data/pieces.json');
  assert.equal(pieces.length, 2);
  for (const piece of pieces) {
    const score = await json(piece.data);
    assert.ok(score.notes.length > 0 && score.measures.length > 0);
    for (const page of score.pages) await asset(page.src);
    for (const note of score.notes) {
      assert.ok(Number.isFinite(note.midi) && Number.isFinite(note.t) && Number.isFinite(note.d));
      assert.ok(note.page >= 0 && note.page < score.pages.length);
    }
  }
  let samples = 0;
  for (let octave = 0; octave <= 8; octave++) {
    for (const [pitch, label] of [[0, 'C'], [3, 'Ds'], [6, 'Fs'], [9, 'A']]) {
      const midi = 12 * (octave + 1) + pitch;
      if (midi >= 21 && midi <= 108) {
        await asset(`assets/piano/${label}${octave}.mp3`);
        samples++;
      }
    }
  }
  console.log(`Ballade/Liebestraum: ${pieces.length} scores, sheet pages, notes, ${samples} piano samples verified`);
} else if (name === 'hku') {
  const programmes = await json('data/programmes.json');
  assert.equal(programmes.programmes.length, 12);
  const admissions = await json('data/admissions-2026.json');
  const pdf = await readFile(path.join(runtime, admissions.source));
  assert.equal(createHash('sha256').update(pdf).digest('hex'), admissions.sourceSha256);
  console.log('HKU: 12 programme records and admission source PDF hash verified');
} else {
  for (const file of ['index.html', 'ch16-networking.html', 'ch17-protocols.html',
    'ch18-services.html', 'ch19-html.html', 'ch20-web-authoring.html']) await asset(file);
  console.log('ICT notes: overview and all five chapters verified');
}

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!/\.(html|css|js)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    if (file.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const imports = [...text.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
      for (const match of imports) await asset(match[1], path.dirname(file));
    }
    let references = [];
    if (file.endsWith('.html')) {
      references = [...text.matchAll(/<(?:script|link|img|a|source)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]);
      for (const script of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        if (script[1].trim() && !script[0].includes('type="module"')) new vm.Script(script[1]);
      }
    } else if (file.endsWith('.css')) {
      references = [...text.replace(/\bsrc\s*:[^;}]+/g, rule => 'src:' + (rule.match(/url\([^)]*\)/)?.[0] || ''))
        .matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(m => m[1]);
    }
    for (const reference of references) {
      if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) continue;
      await asset(reference, path.dirname(file));
    }
  }
}
await inspect(runtime);
console.log(`${name}: JavaScript syntax, module imports, and static links verified`);
