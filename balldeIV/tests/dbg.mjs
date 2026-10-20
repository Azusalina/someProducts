import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const port = 4312;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'web'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* wait */ } await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.url()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ballade);
  await page.evaluate(() => window.ballade.seek(183 * 3 + 0.3));
  await page.waitForTimeout(2500);
  console.log(await page.evaluate(() => ({
    scrollTop: document.getElementById('sheet').scrollTop,
    hl: document.querySelectorAll('.hl-note').length, measure: document.querySelectorAll('.hl-measure').length,
    t: window.ballade.S.t,
  })));
  console.log('bad responses', bad);
} finally { await browser?.close(); server.kill(); }
