import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { createToolkit } from '../src/server.js';
import { findChromium } from '../src/core/pdf.js';

const folder = await mkdtemp(path.join(tmpdir(), 'toolkit-tex-browser-'));
const filename = path.join(folder, 'live notes.tex');
const document = text => `\\documentclass{article}\n\\begin{document}${text}\\end{document}`;
await writeFile(filename, document('First live preview $x^2$'));
const app = await createToolkit({ port: 0, filename, interval: 80, baseDir: folder });
const browser = await chromium.launch({ executablePath: await findChromium(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.url);
  await page.locator('#tex-preview').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#tex-canvas canvas').waitFor({ timeout: 20000 });
  assert.ok(await page.locator('#tex-canvas canvas').evaluate(c => c.getBoundingClientRect().width > 600));
  assert.equal(await page.locator('#preview').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Save PDF', exact: true }).isEnabled(), true);
  assert.equal(await page.locator('#paper').isDisabled(), true);
  const first = await page.locator('#tex-preview').getAttribute('data-source');
  await writeFile(filename, document('Updated live preview'));
  await page.waitForFunction(previous => document.getElementById('tex-preview').dataset.source !== previous, first, { timeout: 20000 });
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('source').textContent.includes('Updated live preview'));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save PDF', exact: true }).click()]);
  assert.equal(download.suggestedFilename(), 'live notes.pdf');
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
  await page.screenshot({ path: '/tmp/toolkit-tex-preview.png', fullPage: true });
  await writeFile(filename, document('\\unknownCommand'));
  await page.waitForFunction(() => document.getElementById('message').textContent.includes('Rendering failed'), { timeout: 15000 });
  assert.equal(await page.locator('#tex-preview').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Save PDF', exact: true }).isDisabled(), true);
  assert.deepEqual(await readdir(folder), ['live notes.tex']);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/toolkit-tex-live.png', fullPage: true });
  console.log('TeX browser: live updates, source view, explicit PDF download, failure recovery and no adjacent compiler artifacts passed.');
} finally {
  await browser.close(); await app.close(); await rm(folder, { recursive: true, force: true });
}
