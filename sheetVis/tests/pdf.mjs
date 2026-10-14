import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.SHEETVIS_TEST_URL || 'http://127.0.0.1:4280';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(url)) requests.push(r.url()); });
  await page.goto(url);
  await expect(page.locator('#score-view svg')).toHaveCount(1);
  await page.locator('#toolbar-toggle').click();
  await page.locator('#file').setInputFiles('tests/fixtures/demo-score.pdf');
  await expect(page.locator('#piece-kind')).toHaveText('PDF', { timeout: 660_000 });
  await expect(page.locator('#recognition-percent')).toHaveText('100%');
  await expect(page.locator('#play')).toHaveText('暂停', { timeout: 30_000 });
  await expect(page.locator('#original-tab')).toBeVisible();
  await expect(page.locator('#download')).toBeEnabled();
  const metadata = await page.locator('#piece-meta').textContent();
  const notice = await page.locator('#notice').textContent();
  await page.locator('#bpm').fill('96'); await page.locator('#bpm').dispatchEvent('change');
  await expect(page.locator('#piece-meta')).toContainText('96 BPM · 00:20');
  const correctedMetadata = await page.locator('#piece-meta').textContent();
  await page.locator('#play').click();
  await page.screenshot({ path: 'test-results/pdf-recognized.png', fullPage: true });
  await page.locator('#original-tab').click();
  await expect(page.locator('#pdf-view')).toBeVisible();
  await expect(page.locator('#score-view')).toBeHidden();
  await page.locator('#score-tab').click();
  await expect(page.locator('#score-view')).toBeVisible();
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  await writeFile('test-results/pdf.json', JSON.stringify({ metadata, correctedMetadata, notice, errors, externalRequests: requests, expected: { notes: 56, bpm: 96, duration: 20 }, fixture: 'Self-authored 8-measure C-major exercise printed from OSMD. This is a pipeline smoke test, not an OMR accuracy benchmark.' }, null, 2));
  console.log('PDF → Audiveris → MusicXML → waterfall + autoplay passed:', metadata);
} finally { await browser.close(); }
