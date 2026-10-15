import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const url = process.env.SHEETVIS_TEST_URL || 'http://127.0.0.1:4280';
const source = '/home/a/Documents/materials/PianoSheets/chopin_ballade1.pdf';
const original = await readFile(source);
const served = Buffer.from(await (await fetch(`${url}/api/default-score`)).arrayBuffer());
expect(served.equals(original)).toBe(true);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(url)) external.push(r.url()); });
  await page.addInitScript(() => {
    const create = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
      const compressor = create.call(this), analyser = this.createAnalyser(), mute = this.createGain();
      mute.gain.value = 0; compressor.connect(analyser); analyser.connect(mute); mute.connect(this.destination);
      window.__sheetvisAudioProbe = { context: this, analyser };
      return compressor;
    };
  });
  const loadedAt = performance.now(); await page.goto(url);
  await expect(page.locator('#piece-title')).toHaveText('chopin_ballade1', { timeout: 90_000 });
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90_000 });
  await expect(page.locator('#recognition-percent')).toHaveText('100%');
  await expect(page.locator('#pdf-view canvas')).toBeVisible();
  await expect(page.locator('#score-view')).toBeHidden();
  await expect(page.locator('.note-highlight')).toHaveCount(2);
  const loadMilliseconds = performance.now() - loadedAt;
  const left = await page.locator('#pdf-view').boundingBox(), right = await page.locator('#waterfall').boundingBox();
  expect(left.x + left.width).toBeLessThan(right.x);
  await expect(page.locator('#progress')).toBeVisible();
  await expect(page.locator('#toolbar')).toBeHidden();
  await expect(page.locator('#read-summary')).toContainText('16 页 / 乐谱 15 页');
  await expect(page.locator('#audio-status')).toHaveText('音频待启用');
  const id = (await page.locator('#log').getAttribute('href')).split('/')[3];
  const job = await (await fetch(`${url}/api/jobs/${id}`)).json();
  expect(job.state).toBe('done'); expect(job.included_pages).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  expect(job.skipped_pages).toEqual([16]); expect(job.quality.accuracy).toBeNull();
  await page.locator('#feedback-open').click();
  await expect(page.locator('#quality-issues')).toContainText(`${job.quality.rhythm_issues.length} 处小节节奏`);
  expect(job.quality.rhythm_issues.length).toBeLessThan(211);
  expect(job.quality.missing_offsets).toBeLessThan(236);
  expect(job.quality.export_errors).toHaveLength(0);
  await expect(page.locator('#read-facts')).toContainText('6/4');
  await expect(page.locator('#quality-limit')).toContainText('准确率未知');
  const feedback = await page.locator('#quality-report').textContent();
  const metadata = await page.locator('#piece-meta').textContent();
  await page.screenshot({ path: 'test-results/chopin-feedback.png', fullPage: false });
  await page.keyboard.press('Escape');
  await page.locator('#transport-play').click();
  await expect(page.locator('#play')).toHaveText('暂停', { timeout: 30_000 });
  await page.screenshot({ path:'test-results/chopin-split.png' });
  await page.waitForFunction(() => {
    const p = window.__sheetvisAudioProbe; if (!p) return false;
    const data = new Float32Array(p.analyser.fftSize); p.analyser.getFloatTimeDomainData(data);
    return data.some(n => Math.abs(n) > .0001);
  });
  const amplitude = await page.evaluate(() => {
    const p = window.__sheetvisAudioProbe, data = new Float32Array(p.analyser.fftSize); p.analyser.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  });
  await page.keyboard.press('Space'); // Also works while the play button has focus.
  await expect(page.locator('#transport-play')).toHaveText('播放');
  await page.locator('#progress').focus(); await page.keyboard.press('Space');
  await expect(page.locator('#transport-play')).toHaveText('暂停');
  await page.keyboard.press('Space'); await expect(page.locator('#transport-play')).toHaveText('播放');
  // Two different onsets inside the same first measure must move the PDF marks.
  await page.locator('#progress').fill('0.05'); await page.locator('#progress').dispatchEvent('input');
  await page.waitForTimeout(100);
  const firstHeads = await page.locator('.note-highlight').evaluateAll(es=>es.map(e=>e.dataset.head));
  await page.locator('#progress').fill('1.05'); await page.locator('#progress').dispatchEvent('input');
  await page.waitForTimeout(100);
  const nextHeads = await page.locator('.note-highlight').evaluateAll(es=>es.map(e=>e.dataset.head));
  expect(nextHeads).not.toEqual(firstHeads);
  await page.locator('#toolbar-toggle').click();
  const position = Number(await page.locator('#progress').inputValue());
  await page.locator('#forward').click();
  expect(Number(await page.locator('#progress').inputValue())).toBeCloseTo(position + 5, 1);
  await page.locator('#rewind').click();
  expect(Number(await page.locator('#progress').inputValue())).toBeCloseTo(position, 1);
  await page.locator('#speed').fill('50'); await page.locator('#speed').dispatchEvent('input');
  await expect(page.locator('#speed-value')).toHaveText('0.50×');
  // A late seek exercises a much longer score/cursor than the small fixture.
  const duration = Number(await page.locator('#progress').getAttribute('max'));
  // Dragging must move the actual transport while paused; release resumes a
  // previously playing transport instead of fighting the animation frame.
  const bar = await page.locator('#progress').boundingBox();
  await page.mouse.move(bar.x + bar.width * .1, bar.y + bar.height / 2); await page.mouse.down();
  await page.mouse.move(bar.x + bar.width * .4, bar.y + bar.height / 2, {steps:8}); await page.mouse.up();
  expect(Number(await page.locator('#progress').inputValue())).toBeGreaterThan(duration * .35);
  const latePosition = Math.round(duration * .8 * 100) / 100;
  await page.locator('#progress').fill(String(latePosition)); await page.locator('#progress').dispatchEvent('input');
  expect(Number(await page.locator('#progress').inputValue())).toBeCloseTo(latePosition, 1);
  await page.waitForTimeout(400);
  expect(Number(await page.locator('.pdf-number').inputValue())).toBeGreaterThan(1);
  await page.locator('#zen').click();
  await expect(page.locator('.topbar')).toBeHidden(); await expect(page.locator('.score-section')).toBeHidden();
  await expect(page.locator('#toolbar')).toBeHidden();
  const box = await page.locator('#waterfall').boundingBox(); expect(box.height).toBe(960); expect(box.width).toBe(1440);
  await page.keyboard.press('Space'); await expect(page.locator('#play')).toHaveText('暂停');
  await page.screenshot({ path: 'test-results/chopin-zen.png' });
  await page.keyboard.press('Space'); await expect(page.locator('#play')).toHaveText('播放');
  await page.keyboard.press('Escape'); await expect(page.locator('.topbar')).toBeVisible();
  await page.reload();
  await expect(page.locator('#play')).toBeEnabled({ timeout: 90_000 });
  expect((await page.locator('#log').getAttribute('href')).split('/')[3]).toBe(id);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  const sourceMapping = await (await fetch(url + job.results[0].mapping)).json();
  await writeFile('test-results/chopin-improved.json', JSON.stringify({ source, sha256: createHash('sha256').update(original).digest('hex'), bytes: original.length, job: id, loadMilliseconds,
    includedPages: job.included_pages, skippedPages: job.skipped_pages, engineRhythmIssues: job.quality.rhythm_issues.length,
    missingChordOffsets: job.quality.missing_offsets, exportErrors: job.quality.export_errors, meterRepairs:job.meter_repairs, dynamicsRepairs:job.dynamics_repairs, mapping:{mapped:sourceMapping.mapped,total:sourceMapping.total}, firstHeads,nextHeads, metadata, feedback, duration, amplitude, errors, externalRequests: external,
    validation: 'The real local PDF was processed and rendered on the left with note-level highlighting; piano audio/waterfall played on the right. Space, drag seek, late-page following, speed, Zen and cache reuse passed. Pitch/rhythm accuracy was not validated against the source.' }, null, 2));
  console.log('Chopin default-file checks passed:', metadata, '; rhythm diagnostics:', job.quality.rhythm_issues.length, '; export errors:', job.quality.export_errors.length);
} finally { await browser.close(); }
