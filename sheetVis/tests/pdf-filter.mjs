import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const url = 'http://127.0.0.1:4282';
const server = spawn('python', ['server.py', '--port', '4282'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent('<html><head><title>Composer notes</title></head><body style="font:18px serif;padding:40px"><h1>Composer notes</h1><p>Biographical introduction.</p><p>This page contains explanatory prose and no musical staff.</p></body></html>');
  await page.pdf({ path: 'test-results/composer-notes.pdf', format: 'A4' });
  execFileSync('pdfunite', ['test-results/composer-notes.pdf', 'tests/fixtures/demo-score.pdf', 'test-results/composer-notes.pdf', 'test-results/mixed-pages.pdf']);
  await page.goto(url);
  await expect(page.locator('#score-view svg')).toHaveCount(1);
  await page.locator('#toolbar-toggle').click();
  await page.locator('#autoplay').uncheck();
  const percentages = [];
  await page.locator('#file').setInputFiles('test-results/mixed-pages.pdf');
  for (let i = 0; i < 600; i++) {
    const pct = await page.locator('#recognition-percent').textContent();
    percentages.push(Number(pct.replace('%', '')));
    if (pct === '100%') break;
    if (await page.locator('#notice').isVisible()) throw new Error(await page.locator('#notice').textContent());
    await page.waitForTimeout(500);
  }
  await expect(page.locator('#recognition-percent')).toHaveText('100%');
  await expect(page.locator('#piece-meta')).toContainText('56 个音符');
  const job = (await page.locator('#log').getAttribute('href')).split('/')[3];
  const status = await (await fetch(`${url}/api/jobs/${job}`)).json();
  expect(status.included_pages).toEqual([2]);
  expect(status.skipped_pages).toEqual([1, 3]);
  expect(percentages.some(p => p > 0 && p < 100)).toBe(true);
  expect(percentages.every((p, i) => !i || p >= percentages[i - 1])).toBe(true);
  await page.screenshot({ path: 'test-results/page-filter.png', fullPage: true });
  const textResponse = await fetch(`${url}/api/recognize`, { method: 'POST', headers: { 'X-SheetVis': 'local', 'Content-Type': 'application/pdf' }, body: await readFile('test-results/composer-notes.pdf') });
  const textId = (await textResponse.json()).id;
  let textStatus;
  for (let i = 0; i < 600; i++) {
    textStatus = await (await fetch(`${url}/api/jobs/${textId}`)).json();
    if (['done', 'error'].includes(textStatus.state)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  expect(textStatus.state).toBe('error');
  expect(textStatus.message).toContain('未检测到五线谱');
  expect(textStatus.progress).toBeLessThan(100);
  await writeFile('test-results/page-filter.json', JSON.stringify({ included: status.included_pages, skipped: status.skipped_pages, percentages, textOnly: textStatus, metadata: await page.locator('#piece-meta').textContent() }, null, 2));
  console.log('Real PDF filter passed: pages 1 and 3 skipped; page 2 played; text-only input rejected; stage percentages monotonic.');
} finally { if (browser) await browser.close(); server.kill(); }
