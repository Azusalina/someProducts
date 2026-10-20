// Quick visual check: node tests/shot.mjs out.png [--learn] [--measure N]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const port = 4311;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'web'], { stdio: 'ignore' });
const out = process.argv[2] || 'shot.png';
const learn = process.argv.includes('--learn');
const mi = process.argv.indexOf('--measure');
const measure = mi > 0 ? +process.argv[mi + 1] : 184;
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* wait */ } await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ballade);
  await page.evaluate(m => { window.ballade.seek((m - 1) * 3 + 0.3); }, measure);
  if (learn) await page.click('#modeSeg [data-v=learn]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: out });
  console.log('errors:', errors);
} finally {
  await browser?.close();
  server.kill();
}
