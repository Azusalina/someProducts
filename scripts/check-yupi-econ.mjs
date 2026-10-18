import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const product = path.resolve(process.argv[2] || 'd-yupi-econ');
const root = path.join(product, 'claude-product/study-site');
const read = relative => readFile(path.join(root, relative), 'utf8');
const context = vm.createContext({ localStorage: { getItem: () => null } });
context.window = context;
vm.runInContext(await read('js/engine.js'), context);
vm.runInContext(await read('js/manifest.js'), context);
const manifest = context.Yupi.manifest;
assert.equal(manifest.length, 20, 'Expected all 20 chapters');
assert.equal(new Set(manifest.map(chapter => chapter.id)).size, manifest.length);

async function asset(relative) {
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(root + path.sep), `Asset outside runtime: ${relative}`);
  assert.ok((await stat(file)).isFile(), `Missing asset: ${relative}`);
}

let questionCount = 0;
let scanCount = 0;
for (const entry of manifest) {
  assert.ok(entry.ready, `Unavailable chapter: ${entry.id}`);
  let chapter;
  context.Yupi.register = value => { chapter = value; };
  vm.runInContext(await read(`data/${entry.id}.js`), context);
  assert.equal(chapter?.id, entry.id, 'Chapter registration mismatch');
  const ids = new Set();
  for (const question of chapter.q || []) {
    assert.ok(!ids.has(question.id), `Duplicate question: ${entry.id}/${question.id}`);
    ids.add(question.id);
    assert.ok(question.o?.length >= 2 && /^[ABCD]$/.test(question.a),
      `Invalid answers: ${entry.id}/${question.id}`);
    questionCount++;
  }
  const scans = [];
  function scan(file, page) {
    const source = chapter.files?.[file];
    assert.ok(source, `Unknown scan source: ${entry.id}/${file}`);
    scans.push(`assets/pages/${source.pre}${String(page).padStart(source.pad || 0, '0')}.jpg`);
  }
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value) && typeof value[0] === 'string' &&
        typeof value[1] === 'number' && chapter.files?.[value[0]]) scan(value[0], value[1]);
    Object.values(value).forEach(collect);
  }
  collect(chapter);
  for (const question of [...(chapter.q || []), ...(chapter.long || [])]) {
    if (question.p) scan(question.f || chapter.qfile || 'pp', question.p);
    if (Array.isArray(question.k)) {
      if (typeof question.k[0] === 'string') scan(question.k[0], question.k[1]);
      else scan(question.kf || chapter.afile || 'ans', question.k[0]);
    }
  }
  for (const scan of new Set(scans)) {
    await asset(scan);
    scanCount++;
  }
}

async function inspect(directory = '') {
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(relative);
      continue;
    }
    if (!/\.(?:html|css|js)$/.test(entry.name)) continue;
    const source = await read(relative);
    if (entry.name.endsWith('.js')) new vm.Script(source, { filename: relative });
    const references = entry.name.endsWith('.html')
      ? [...source.matchAll(/<(?:script|link|img|a|source)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1])
      : entry.name.endsWith('.css')
        ? [...source.replace(/\bsrc\s*:[^;}]+/g, rule =>
          'src:' + (rule.match(/url\([^)]*\)/)?.[0] || '')
        ).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(match => match[1])
        : [];
    for (const reference of references) {
      if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) continue;
      await asset(path.join(directory, decodeURIComponent(reference.split(/[?#]/)[0])));
    }
  }
}
await inspect();
console.log(`Yupi Economics: ${manifest.length} chapters, ${questionCount} questions, ` +
  `${scanCount} chapter scan references, and runtime assets verified`);
