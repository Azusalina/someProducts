import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm, mkdir, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { createToolkit } from '../src/server.js';
import { findChromium } from '../src/core/pdf.js';

const run = promisify(execFile);
const folder = await mkdtemp(path.join(os.tmpdir(), 'toolkit-tabs-'));
const evidence = '/tmp/toolkit-validation/tabs';
await mkdir(evidence, { recursive: true });
const a = path.join(folder, 'alpha.md'), b = path.join(folder, 'beta.md'), c = path.join(folder, 'gamma.md');
await writeFile(a, '# Alpha\n\nAlpha export marker.');
await writeFile(b, '# Beta\n\nBeta export marker.');
await writeFile(c, '# Gamma\n\nGamma export marker.');
const app = await createToolkit({ port: 0, interval: 50, baseDir: folder });
const browser = await chromium.launch({ executablePath: await findChromium(), headless: true });
try {
  // Same browser context intentionally shares cookies, like ordinary tabs.
  const context = await browser.newContext({ acceptDownloads: true });
  const first = await context.newPage(), second = await context.newPage();
  const errors = [];
  for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
  await Promise.all([first.goto(app.url), second.goto(app.url)]);
  const heading = page => page.frameLocator('#preview').locator('h1');
  const expectHeading = (page, text) => heading(page).filter({ hasText: text }).waitFor();
  const open = async (page, file, title) => {
    await page.locator('#filepath').fill(file);
    await page.getByRole('button', { name: 'Open file', exact: true }).click();
    await expectHeading(page, title);
  };
  await Promise.all([open(first, a, 'Alpha'), open(second, b, 'Beta')]);
  assert.equal(await heading(first).textContent(), 'Alpha');
  assert.equal(await heading(second).textContent(), 'Beta');
  const idFor = page => page.evaluate(() => history.state.toolkitView);
  const firstId = await idFor(first), secondId = await idFor(second);
  assert.notEqual(firstId, secondId);
  await open(first, c, 'Gamma');
  assert.equal(await heading(second).textContent(), 'Beta');
  assert.equal(await second.locator('#filepath').inputValue(), b);
  await writeFile(b, '# Beta edited\n\nBeta export marker.');
  await expectHeading(second, 'Beta edited');
  assert.equal(await heading(first).textContent(), 'Gamma');
  await first.reload();
  await expectHeading(first, 'Gamma');
  assert.notEqual(await idFor(first), firstId);
  assert.equal(await heading(second).textContent(), 'Beta edited');

  // A duplicated page carries the original history entry. Its reload must fork.
  const duplicate = await context.newPage();
  duplicate.on('pageerror', error => errors.push(error.message));
  await duplicate.goto(app.url);
  await duplicate.evaluate(id => history.replaceState({ toolkitView: id }, ''), secondId);
  await duplicate.reload();
  await expectHeading(duplicate, 'Beta edited');
  assert.notEqual(await idFor(duplicate), secondId);
  await open(duplicate, a, 'Alpha');
  assert.equal(await heading(second).textContent(), 'Beta edited');
  await duplicate.close();

  // Concurrent exports must use each page's own file and paper settings.
  await first.locator('#paper').selectOption('A4');
  await second.locator('#paper').selectOption('Letter');
  const exportPage = async (page, name) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `${name}.pdf`);
    const file = `${evidence}/${name}.pdf`;
    await download.saveAs(file);
    return (await run('pdftotext', [file, '-'])).stdout;
  };
  const [gammaPdf, betaPdf] = await Promise.all([exportPage(first, 'gamma'), exportPage(second, 'beta')]);
  assert.match(gammaPdf, /Gamma export marker/);
  assert.doesNotMatch(gammaPdf, /Beta export marker/);
  assert.match(betaPdf, /Beta export marker/);
  assert.doesNotMatch(betaPdf, /Gamma export marker/);
  assert.equal(await readFile(c, 'utf8'), '# Gamma\n\nGamma export marker.');
  await unlink(c);
  await first.locator('#message').filter({ hasText: 'File is missing' }).waitFor();
  assert.equal(await second.locator('#message').isVisible(), false);
  assert.equal(await second.locator('#export-button').isEnabled(), true);
  await first.close();
  await writeFile(b, '# Beta survives\n\nBeta export marker.');
  await expectHeading(second, 'Beta survives');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['shared-cookie tabs select independently', 'path changes stay local', 'saved-file updates stay local', 'refresh retains path in a fresh view', 'duplicate forks independently', 'concurrent PDFs contain the correct documents', 'missing-file warnings stay local', 'closing a tab leaves other watchers running', 'no browser errors'], evidence }, null, 2));
} finally {
  await browser.close(); await app.close(); await rm(folder, { recursive: true, force: true });
}
