import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, rename, unlink, rm, symlink, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { FileWatcher } from '../src/core/watcher.js';
import { markdownModule } from '../src/modules/markdown/index.js';
import { ModuleRegistry } from '../src/core/registry.js';
import { createToolkit } from '../src/server.js';

async function fixture(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'toolkit-test-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'notes.md');
  await writeFile(filename, '# First\n');
  return { folder, filename };
}

test('watcher handles edits, atomic replacement, deletion and recreation without writing files', async t => {
  const { filename, folder } = await fixture(t);
  const watcher = new FileWatcher(filename, 30);
  t.after(() => watcher.stop());
  let next = once(watcher, 'change');
  await watcher.start();
  assert.equal((await next)[0], '# First\n');
  next = once(watcher, 'change');
  await writeFile(filename, '# Edited\n');
  assert.equal((await next)[0], '# Edited\n');
  next = once(watcher, 'change');
  await writeFile(`${filename}.tmp`, '# Atomic save\n');
  await rename(`${filename}.tmp`, filename);
  assert.equal((await next)[0], '# Atomic save\n');
  next = once(watcher, 'unavailable');
  await unlink(filename);
  assert.equal((await next)[0].code, 'ENOENT');
  next = once(watcher, 'change');
  await writeFile(filename, '# Restored\n');
  assert.equal((await next)[0], '# Restored\n');
  assert.deepEqual(await readdir(folder), ['notes.md']);
});

test('renderer formats Markdown, creates unique anchors, and prevents active HTML and remote images', async t => {
  const { filename } = await fixture(t);
  const result = await markdownModule.render('# Heading\n## Heading\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![remote](https://example.com/a.png)\n\n|A|B|\n|-|-|\n|1|2|\n\n- [x] Done\n\n```js\nconst x = 1;\n```', { filename });
  assert.deepEqual(result.outline.map(item => item.id), ['heading', 'heading-2']);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /type="checkbox"/);
  assert.match(result.html, /hljs-keyword/);
  assert.doesNotMatch(result.html, /<script|href="javascript:|src="https:/);
  assert.equal(result.warnings.length, 1);
});

test('local images are embedded, including encoded filenames; symlink traversal is blocked', async t => {
  const { filename, folder } = await fixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'toolkit-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(folder, 'a b.png'), Buffer.from('image'));
  await writeFile(path.join(outside, 'hidden.png'), Buffer.from('private'));
  await symlink(path.join(outside, 'hidden.png'), path.join(folder, 'escape.png'));
  const result = await markdownModule.render('![ok](a%20b.png)\n![bad](escape.png)', { filename });
  assert.match(result.html, /data:image\/png;base64,aW1hZ2U=/);
  assert.equal(result.warnings.length, 1);
  assert.doesNotMatch(result.html, /cHJpdmF0ZQ==/);
});

test('heading sections end at the next heading of any level and preserve nested Markdown blocks', async t => {
  const { filename } = await fixture(t);
  const source = 'Introduction.\n\n# First\n\nFirst body.\n\n## Second\n\n> ### Quoted heading\n>\n> Quoted body.\n\n- List item\n  #### Listed heading\n\n```md\n# Code heading\n```\n\n###### Final\n\nLast body.';
  const { html, outline } = await markdownModule.render(source, { filename });
  const sections = [...html.matchAll(/<section class="document-section">\n([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(sections.length, 3);
  assert.ok(html.startsWith('<p>Introduction.</p>\n<section'));
  assert.match(sections[0], /<h1 id="first">First<\/h1>[\s\S]*First body/);
  assert.doesNotMatch(sections[0], /Second/);
  assert.match(sections[1], /<blockquote>\n<h3 id="quoted-heading">/);
  assert.match(sections[1], /<li>[\s\S]*<h4 id="listed-heading">[\s\S]*<\/li>/);
  assert.match(sections[1], /<pre><code[\s\S]*# Code heading/);
  assert.match(sections[2], /<h6 id="final">Final<\/h6>[\s\S]*Last body/);
  assert.deepEqual(outline.map(item => item.id), ['first', 'second', 'quoted-heading', 'listed-heading', 'final']);
  const plain = await markdownModule.render('No headings.\n\n- Still a list', { filename });
  assert.doesNotMatch(plain.html, /document-section/);
  const consecutive = await markdownModule.render('# One\n## Two\n### Three', { filename });
  assert.equal((consecutive.html.match(/<section /g) || []).length, 3);
});

test('registry permits adding a format without changing the watcher or server', () => {
  const custom = { id: 'text', name: 'Text', extensions: ['.txt'], outputs: [], render() {} };
  const registry = new ModuleRegistry([markdownModule, custom]);
  assert.equal(registry.forFile('a.txt'), custom);
  assert.equal(registry.forFile('A.MD'), markdownModule);
  assert.throws(() => registry.forFile('a.exe'), /Unsupported/);
});

test('bare local URL establishes a cookie session; API rejects unauthenticated and foreign requests', async t => {
  const { filename, folder } = await fixture(t);
  const app = await createToolkit({ port: 0, filename, baseDir: folder });
  t.after(() => app.close());
  const origin = new URL(app.url).origin;
  assert.equal(new URL(app.url).hash, '');
  const home = await fetch(app.url);
  assert.equal(home.status, 200);
  const cookie = home.headers.get('set-cookie');
  assert.match(cookie, /; HttpOnly; SameSite=Strict$/);
  assert.doesNotMatch(cookie, /Max-Age|Expires/i);
  const headers = { Cookie: cookie.split(';')[0], 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${origin}/api/info`)).status, 403);
  assert.equal((await fetch(`${origin}/api/info`, { headers: { ...headers, Cookie: `${headers.Cookie}wrong` } })).status, 403);
  assert.equal((await fetch(`${origin}/api/info`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${origin}/api/info`, { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const response = await fetch(`${origin}/api/info`, { headers });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).state.filename, filename);
  assert.equal((await fetch(`${origin}/api/open`, { method: 'POST', headers, body: JSON.stringify({ path: 'missing.md' }) })).status, 400);
  assert.equal((await fetch(`${origin}/api/export/pdf`, { method: 'POST', headers, body: JSON.stringify({ paper: 'A4', background: 'red' }) })).status, 400);
  assert.equal((await (await fetch(`${origin}/api/info`, { headers })).json()).state.filename, filename);
  assert.deepEqual(await readdir(folder), ['notes.md']);
});

test('separate toolkit ports have independent cookies and page reload renews the session', async t => {
  const { folder } = await fixture(t);
  const first = await createToolkit({ port: 0, baseDir: folder });
  t.after(() => first.close());
  const second = await createToolkit({ port: 0, baseDir: folder });
  t.after(() => second.close());
  const cookieFor = async url => (await fetch(url)).headers.get('set-cookie').split(';')[0];
  const firstCookie = await cookieFor(first.url), secondCookie = await cookieFor(second.url);
  assert.notEqual(firstCookie.split('=')[0], secondCookie.split('=')[0]);
  assert.equal(await cookieFor(first.url), firstCookie);
  const headers = { Cookie: `${firstCookie}; ${secondCookie}` };
  for (const app of [first, second]) {
    assert.equal((await fetch(new URL('/api/info', app.url), { headers })).status, 200);
  }
});
