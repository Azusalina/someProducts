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
  // ---- second piece: Liebestraum No. 3 (rhythm solved from the PDF, 6/4, pickup, free-time cadenzas) ----
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('liebestraum: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') errors.push('liebestraum: ' + m.text()); });
  await p2.goto(`http://127.0.0.1:${port}/?piece=liebestraum3`);
  await p2.waitForFunction(() => window.ballade);
  const Q = (fn, arg) => p2.evaluate(fn, arg);
  const L = await Q(() => { const b = window.ballade, sc = b.score; return {
    title: document.title, pieces: [...document.getElementById('selPiece').options].map(o => o.value),
    ts: sc.meta.timeSignature, n: sc.notes.length, measures: sc.measures.length, pickup: sc.measures[0].length,
    sel: document.getElementById('selMeasure').options.length, pages: sc.pages.length,
    pagesHidden: document.getElementById('lblPages').hidden, tempo: b.S.bpm,
    free: sc.measures.filter(m => m.kind === 'free').map(m => m.label) }; });
  ok('piece selector lists both pieces', L.pieces.length === 2 && /Liebestraum/.test(L.title), JSON.stringify(L.pieces));
  ok('Liebestraum score loaded', L.ts === '6/4' && L.n > 1700 && L.measures === 88 && L.sel === 88 && L.pages === 6 && L.pagesHidden && L.tempo === 92, JSON.stringify(L));
  ok('pickup bar is one quarter, cadenzas are free-time rows', L.pickup === 1 && L.free.join() === '26–28,29–31,65–68,69–72,73', L.free.join());
  // every ordinary bar is 6 quarters, notes sit inside their measure and never earlier than their column neighbours
  const A = await Q(() => { const sc = window.ballade.score; let bad = 0;
    for (const n of sc.notes) { const m = sc.measureByNumber.get(n.measure); if (n.t < m.start - 1e-6 || n.t >= m.start + m.length - 1e-6) bad++; }
    const odd = sc.measures.filter(m => m.kind === 'normal' && m.length !== 6).length;
    return { bad, odd }; });
  ok('all notes lie inside their measure; normal bars last 6 quarters', A.bad === 0 && A.odd === 0, JSON.stringify(A));
  await Q(() => window.ballade.seek(window.ballade.score.measureByNumber.get(2).start + 0.1));
  ok('measure menu follows the time axis (bar 2 starts after the pickup)', (await Q(() => document.getElementById('selMeasure').value)) === '2');
  await Q(() => window.ballade.seek(window.ballade.score.measureByNumber.get(27) ? 0 : window.ballade.score.measureByNumber.get(26).start + 1));
  ok('a cadenza row is selected by its first number', (await Q(() => document.getElementById('selMeasure').value)) === '26');
  // playback across the pickup into bar 2, sheet highlights on the A4 page
  await Q(() => window.ballade.seek(-0.4));
  await p2.click('#btnPlay');
  await p2.waitForTimeout(2200);
  const run = await Q(() => ({ t: window.ballade.S.t, m: document.getElementById('selMeasure').value, hl: document.querySelectorAll('.hl-note').length,
    maxLeft: Math.max(0, ...[...document.querySelectorAll('.hl-note')].map(e => parseFloat(e.style.left))) }));
  await p2.click('#btnPlay');
  ok('Liebestraum plays and highlights notes on the sheet', run.t > 2 && run.hl > 0 && run.maxLeft < 100, JSON.stringify(run));
  // repeated figures of the cadenzas: cells A, B, C ... an octave apart, coloured differently
  const P = await Q(() => { const sc = window.ballade.score, ps = sc.patterns;
    const oct = ps.filter(p => p.shift).map(p => p.cells.slice(0, 2).map(c => c.list.map(n => n.midi)));
    const lastR = ps.find(p => p.hand === 'R' && p.shift === -12 && p.length === 8 && p.cells[0].list[0].measure === 69);   // m.69: F7 C7 C#7 ... E6, then the same 8va lower, twice
    return { n: ps.length, cells: ps.reduce((a, p) => a + p.cells.length, 0), inRange: ps.every(p => p.cells.every(c => c.list.every(n => (n.measure >= 23 && n.measure <= 31) || (n.measure >= 64 && n.measure <= 73)))),
      oct: oct.every(([a, b]) => b.filter((m, i) => a[i] !== undefined && (m - a[i]) % 12 === 0).length >= 0.6 * Math.min(a.length, b.length)),
      m69: lastR && lastR.cells.map(c => c.list.map(n => n.midi).join()).join(' | '),
      colours: lastR && new Set(lastR.cells.map(c => c.base)).size, letters: lastR && lastR.cells.map(c => c.letter).join(''),
      lblPat: document.getElementById('lblPat').hidden }; });
  ok('repeated figures found only in the cadenza bars', P.n >= 10 && P.cells >= 40 && P.inRange, JSON.stringify({ n: P.n, cells: P.cells }));
  ok('each repeat is the previous cell moved by whole octaves', P.oct);
  ok('m.69 descent: three cells, each 8 notes an octave lower (A has C#7 where B, C have D), A B C in three colours',
    P.m69 === '101,96,97,93,94,90,91,88 | 89,84,86,81,82,78,79,76 | 77,72,74,69,70,66,67,64' && P.colours === 3 && P.letters === 'ABC', `${P.m69} ${P.colours} ${P.letters}`);
  await Q(() => window.ballade.seek(window.ballade.score.patterns.find(p => p.hand === 'R' && p.length === 24).cells[1].t0 + 0.3));
  await p2.waitForTimeout(300);
  const V = await Q(() => { const b = window.ballade, wf = b.wf, ps = b.score.patterns; const p = ps.find(p => p.hand === 'R' && p.length === 24);
    const a = p.cells[0].list[3], c = p.cells[1].list[3];
    const on = [wf.colorOf(a), wf.colorOf(c)];
    return { on, legend: document.getElementById('patLegend').innerText, bands: document.querySelectorAll('.pat-band').length,
      shown: getComputedStyle(document.querySelector('.pat-band')).display }; });
  ok('waterfall colours differ between cells A and B', V.on[0] !== V.on[1] && V.on[0] !== '#ff8a3d' && V.on[1] !== '#ff8a3d', V.on.join(' '));
  ok('legend names the sounding figure; sheet shows a band per cell', /Right/.test(V.legend) && /octave lower/.test(V.legend) && V.bands >= 50 && V.shown !== 'none', `${V.bands} bands: ${V.legend.replace(/\n/g, ' ')}`);
  await p2.screenshot({ path: 'tests/out-patterns.png' });
  await Q(() => { const s = document.getElementById('selPat'); s.value = 'off'; s.dispatchEvent(new Event('change')); });
  await p2.waitForTimeout(300);
  const W = await Q(() => ({ c: window.ballade.wf.colorOf(window.ballade.score.patterns[0].cells[0].list[0]), hand: window.ballade.wf.colors.L,
    hidden: getComputedStyle(document.querySelector('.pat-band')).display, legend: document.getElementById('patLegend').innerText }));
  ok('pattern colours can be switched off (hand colours, no bands, no legend)', W.c === W.hand && W.hidden === 'none' && W.legend === '', JSON.stringify(W));
  await Q(() => { const s = document.getElementById('selPat'); s.value = 'on'; s.dispatchEvent(new Event('change')); });
  ok('the Ballade has no repeated-figure setting', P.lblPat === false && await B(() => document.getElementById('lblPat').hidden && !window.ballade.score.patterns));
  await Q(() => window.ballade.setMode('learn'));
  await Q(() => window.ballade.seek(window.ballade.score.measureByNumber.get(5).start));
  const ls = await Q(() => { const S = window.ballade.S; return { steps: S.steps.length, m: S.steps[S.idx].notes[0].measure }; });
  ok('learn mode builds steps for the whole piece', ls.steps > 800 && ls.m === 5, JSON.stringify(ls));
  await p2.screenshot({ path: 'tests/out-liebestraum.png' });
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
