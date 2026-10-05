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

test('registry permits adding a format without changing the watcher or server', () => {
  const custom = { id: 'text', name: 'Text', extensions: ['.txt'], outputs: [], render() {} };
  const registry = new ModuleRegistry([markdownModule, custom]);
  assert.equal(registry.forFile('a.txt'), custom);
  assert.equal(registry.forFile('A.MD'), markdownModule);
  assert.throws(() => registry.forFile('a.exe'), /Unsupported/);
});

test('local API requires session token, rejects foreign origins, preserves current file after invalid open', async t => {
  const { filename, folder } = await fixture(t);
  const app = await createToolkit({ port: 0, filename, baseDir: folder });
  t.after(() => app.close());
  const origin = app.url.split('/#')[0];
  const headers = { 'X-Toolkit-Token': app.token, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${origin}/api/info`)).status, 403);
  assert.equal((await fetch(`${origin}/api/info`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  const response = await fetch(`${origin}/api/info`, { headers });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).state.filename, filename);
  assert.equal((await fetch(`${origin}/api/open`, { method: 'POST', headers, body: JSON.stringify({ path: 'missing.md' }) })).status, 400);
  assert.equal((await (await fetch(`${origin}/api/info`, { headers })).json()).state.filename, filename);
  assert.deepEqual(await readdir(folder), ['notes.md']);
});
