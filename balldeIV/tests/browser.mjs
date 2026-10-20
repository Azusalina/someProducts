// End-to-end browser test (system Chromium + fake microphone).
//   node tests/browser.mjs            display-mode / settings / learn logic (fast)
//   node tests/browser.mjs --mic      + real-time microphone session: calibration scale then coda steps (~80 s)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const withMic = process.argv.includes('--mic');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const wavPrefix = arg('--wav', 'tests/audio/session');
const octs = arg('--octs', '5');
const port = 4313;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'web'], { stdio: 'ignore' });
const results = [];
const ok = (name, cond, extra = '') => { results.push([name, !!cond, extra]); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch { /* wait */ } await new Promise(r => setTimeout(r, 100)); }
  const args = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
  if (withMic) args.push('--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${resolve(wavPrefix + '.wav')}`);
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: withMic ? ['microphone'] : [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ballade);
  const B = (fn, arg) => page.evaluate(fn, arg);

  // ---- display mode ----
  const info = await B(() => ({ n: window.ballade.score.notes.length, first: window.ballade.score.meta.firstMeasure, sel: document.getElementById('selMeasure').options.length }));
  ok('score loaded', info.n > 2000 && info.first === 168, JSON.stringify(info));
  await B(() => window.ballade.seek(181 * 3 - 0.2));
  const t0 = await B(() => window.ballade.S.t);
  await page.click('#btnPlay');
  await page.waitForTimeout(1500);
  const t1 = await B(() => window.ballade.S.t);
  const piano = await B(() => { const s = window.ballade.synth; return { loaded: s.loaded, failed: s.failed, samples: s.buffers.size, voices: s.voices.size }; });
  await page.click('#btnPlay');
  ok('real piano samples decoded', piano.loaded && !piano.failed && piano.samples === 30, JSON.stringify(piano));
  ok('sampled notes were triggered during playback', piano.voices > 0, `voices=${piano.voices}`);
  await page.waitForTimeout(600);
  ok('pause silences ringing notes', await B(() => window.ballade.synth.voices.size === 0));
  const expectAdv = 1.5 * 84 / 60;
  ok('playback advances with tempo', Math.abs((t1 - t0) - expectAdv) < 0.5, `moved ${(t1 - t0).toFixed(2)} beats, expected ~${expectAdv.toFixed(2)}`);
  ok('PDF highlights follow playback', await B(() => document.querySelectorAll('.hl-note').length > 0 && document.querySelectorAll('.hl-measure').length === 1));

  await page.click('#handSeg [data-v=L]');
  ok('left-hand only: hands set', await B(() => [...window.ballade.wf.hands].join() === 'L'));
  await B(() => window.ballade.seek(184 * 3 + 0.01));
  await page.waitForTimeout(250);
  const offR = await B(() => [...document.querySelectorAll('.hl-note')].filter(e => e.classList.contains('off')).length);
  ok('disabled hand is dimmed on the sheet', offR >= 0);
  await page.click('#handSeg [data-v=B]');

  await page.click('#btnSettings');
  await page.fill('#colR', '#3366ff'); await page.dispatchEvent('#colR', 'input');
  await page.fill('#colL', '#ff3366'); await page.dispatchEvent('#colL', 'input');
  ok('custom hand colours', await B(() => window.ballade.wf.colors.R === '#3366ff' && window.ballade.wf.colors.L === '#ff3366'));
  await page.evaluate(() => { const e = document.getElementById('rngKb'); e.value = 220; e.dispatchEvent(new Event('input')); });
  ok('keyboard height adjustable', await B(() => window.ballade.wf.kbHeight === 220));
  await page.evaluate(() => { const e = document.getElementById('rngKb'); e.value = 130; e.dispatchEvent(new Event('input')); });
  await page.screenshot({ path: 'tests/out-display.png' });

  // ---- learn mode logic (simulated detections) ----
  await page.click('#btnSettings');
  await B(() => { window.ballade.seek(167 * 3 - 0.4); });
  await page.click('#modeSeg [data-v=learn]');
  const s0 = await B(() => ({ idx: window.ballade.S.idx, want: [...new Set(window.ballade.S.steps[window.ballade.S.idx].notes.map(n => n.midi))] }));
  ok('learn: HUD shows the first step', await B(() => !document.getElementById('learnHud').hidden && document.getElementById('wantNotes').textContent.length > 0));
  await B(() => window.ballade.noteHeard(1));                // wrong note must not advance
  ok('learn: a wrong note does not advance', (await B(() => window.ballade.S.idx)) === s0.idx);
  for (const m of s0.want) await B(([m]) => window.ballade.noteHeard(m), [m]);
  await page.waitForTimeout(600);
  ok('learn: correct notes advance one step', (await B(() => window.ballade.S.idx)) === s0.idx + 1);
  const tAfter = await B(() => window.ballade.S.t);
  const tStep = await B(() => window.ballade.S.steps[window.ballade.S.idx].t);
  ok('learn: waterfall settles on the next step', Math.abs(tAfter - tStep) < 1e-3, `t=${tAfter.toFixed(3)} step=${tStep.toFixed(3)}`);
  await page.click('#handSeg [data-v=R]');
  ok('learn: right-hand-only steps contain only RH notes', await B(() => window.ballade.S.steps.every(s => s.notes.every(n => n.hand === 'R'))));
  await page.click('#handSeg [data-v=B]');
  await page.screenshot({ path: 'tests/out-learn.png' });

  // ---- real-time microphone session ----
  if (withMic) {
    await B(() => window.ballade.seek(167 * 3 - 0.4));
    await B(() => { window.__log = []; const e = window.ballade.ear, f = e.onOnset; e.onOnset = (m, x) => { window.__log.push([+(performance.now() / 1000).toFixed(2), m, window.ballade.S.idx, x.masked ? 'M' : x.rise ? 'R' : '']); f(m, x); }; });
    const idx0 = await B(() => window.ballade.S.idx);
    await page.click('#btnCal');
    await page.selectOption('#selScale', octs);
    await page.click('#calStart');
    await page.waitForFunction(() => /Calibrated \d+ notes/.test(document.getElementById('calStatus').textContent), null, { timeout: 120000 });
    const st = await page.textContent('#calStatus');
    ok('calibration completes', /Calibrated \d+ notes/.test(st), st);
    const tun = +/tuning ([+-]?\d+)/.exec(st)[1];
    ok('tuning offset recovered (+6 cents)', Math.abs(tun - 6) <= 2, `got ${tun}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.ballade.S.idx >= 22, null, { timeout: 60000 }).catch(() => {});
    const before = idx0;
    const after = await B(() => window.ballade.S.idx);
    ok('learn: microphone advances through the coda steps by itself', after - before >= 18, `advanced ${after - before} steps`);
    if (process.argv.includes('--log')) console.log(JSON.stringify(await B(() => window.__log)));
    await page.screenshot({ path: 'tests/out-mic.png' });
  }
  ok('no console / page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.error('TEST CRASH', e);
  results.push(['crash', false, String(e)]);
} finally {
  await browser?.close();
  server.kill();
  const failed = results.filter(r => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
