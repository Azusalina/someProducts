// Optional local browser QA. Supply PLAYWRIGHT_MODULE if Playwright is not installed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { STORAGE_KEY } from '../model.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'app.mjs', 'model.mjs', 'style.css'].includes(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', types[file.slice(file.lastIndexOf('.'))]);
    res.end(await readFile(new URL(file, root)));
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const q = { start: 2000 * 12 + 9, length: 22, fiscalStart: 3 };
const progress = (credits = 0, question = q) => ({ credits, question, solved: false, settings: { max: 60, fiscalStart: 3 } });
async function seed(state) {
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: state });
  await page.reload();
}
async function typeAnswer(text) {
  for (const char of text) await page.locator(`#keypad button[data-key="${char}"]`).click();
}
try {
  await page.goto(base);
  await seed(progress(9));
  assert.equal(await page.locator('#date-start').innerText(), '01 Oct 2000');
  assert.equal(await page.locator('#date-end').innerText(), '31 Jul 2002');
  await typeAnswer('22');
  await page.locator('#submit').click();
  assert.equal(await page.locator('#credits').innerText(), '9');
  assert.match(await page.locator('#feedback').innerText(), /Try again/);
  await page.locator('#clear').click();
  await typeAnswer('6+12+4');
  await page.locator('#submit').click();
  assert.equal(await page.locator('#credits').innerText(), '10');
  assert.match(await page.locator('#feedback').innerText(), /Trophy earned/);
  assert.equal(await page.locator('#trophy-count').innerText(), '1 / 6');
  await page.reload();
  assert.equal(await page.locator('#credits').innerText(), '10');
  assert.match(await page.locator('#submit').innerText(), /Next question/);
  assert.equal(await page.locator('#keypad button:disabled').count(), 12);
  await page.locator('#trophies-open').click();
  assert.equal(await page.locator('#trophy-list li.earned').count(), 1);
  await page.getByRole('button', { name: 'Close trophies' }).click();

  await page.locator('#calculator-open').click();
  assert.equal(await page.locator('#calculator-dialog').evaluate(el => Math.round(el.getBoundingClientRect().right)), 390);
  for (const char of ['2', '+', '3', '*', '4', '=']) await page.locator(`[data-calc="${char}"]`).click();
  assert.equal(await page.locator('#calculator-display').innerText(), '14');
  await page.locator('[data-calc="clear"]').click();
  for (const char of ['1', '/', '0', '=']) await page.locator(`[data-calc="${char}"]`).click();
  assert.match(await page.locator('#calculator-error').innerText(), /zero/);
  await page.getByRole('button', { name: 'Close calculator' }).click();
  assert.equal(await page.locator('#answer').inputValue(), '6+12+4');

  await page.locator('#settings-open').click();
  await page.locator('#fiscal-select').selectOption('8');
  await page.locator('#duration-select').selectOption('12');
  await page.locator('#apply-settings').click();
  assert.equal(await page.locator('#credits').innerText(), '10');
  assert.equal(await page.locator('#fiscal-range').innerText(), '01 Sep – 31 Aug');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.ok(saved.question.length <= 12);

  await page.locator('#settings-open').click();
  await page.locator('summary').click();
  await page.locator('#developer-password').fill('1234');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  assert.equal(await page.locator('#developer-controls').isVisible(), false);
  assert.equal(await page.locator('#credits').innerText(), '10');
  await page.locator('#developer-password').fill('0000');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('#reset-credits').click();
  assert.equal(await page.locator('#credits').innerText(), '10');
  await page.locator('#reset-credits').click();
  assert.equal(await page.locator('#credits').innerText(), '0');
  assert.equal(await page.locator('#trophy-count').innerText(), '0 / 6');
  await page.locator('#settings-open').click();
  await page.locator('summary').click();
  assert.equal(await page.locator('#developer-controls').isVisible(), false);
  await page.getByRole('button', { name: 'Close settings' }).click();

  await seed(progress(499, { ...q, length: 60 }));
  await typeAnswer('6+12+12+12+12+6');
  await page.locator('#submit').click();
  assert.equal(await page.locator('#credits').innerText(), '500');
  assert.equal(await page.locator('#trophy-count').innerText(), '6 / 6');

  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, submitBottom: document.querySelector('#submit').getBoundingClientRect().bottom, sections: [...document.querySelector('main').children].map(el => [el.className || el.id || el.tagName, Math.round(el.getBoundingClientRect().height)]) }));
    assert.ok(bounds.width <= width, `horizontal overflow at ${width}: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.submitBottom <= height, `Submit outside ${width}x${height}: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.height <= height, `vertical overflow at ${width}x${height}: ${JSON.stringify(bounds)}`);
    if (width === 320) await page.screenshot({ path: '/tmp/count-month-small-phone.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(progress());
  await page.screenshot({ path: '/tmp/count-month-mobile.png' });
  await page.locator('#calculator-open').click();
  await page.locator('#calculator-dialog').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  await page.screenshot({ path: '/tmp/count-month-calculator.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: strict answers, credits, trophies, reload, six FY terms, settings, password/reset, calculator and six viewport sizes.');

  const blocked = await browser.newContext();
  await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Blocked'); } }); });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base);
  assert.equal(await blockedPage.locator('#storage-warning').isVisible(), true);
  assert.equal(await blockedPage.locator('#keypad button').count(), 12);
  await blocked.close();
  console.log('PASS: blocked storage keeps practice available with an explicit persistence warning.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
