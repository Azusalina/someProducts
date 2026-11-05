import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { Script } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'product1');
const files = await readdir(root);
const index = await readFile(path.join(root, 'index.html'), 'utf8');
let charts = 0;
for (const filename of files.filter(file => file.endsWith('.html') && file !== 'index.html')) {
  const html = await readFile(path.join(root, filename), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length, `${filename}: chart script missing`);
  for (const [, code] of scripts) new Script(code, { filename });
  const payload = html.match(/const DATA = (.*?);\n/);
  assert.ok(payload, `${filename}: data missing`);
  const data = JSON.parse(payload[1]);
  assert.ok(data.observations.length && data.forecasts.length, `${filename}: empty data`);
  assert.ok(html.includes('id="alpha"') && html.includes('brightness(1.14)'), `${filename}: interactions missing`);
  for (const forecast of data.forecasts) {
    for (const key of ['Estimate', 'MeanStandardError', 'PredictionStandardError', 'DegreesFreedom']) {
      assert.ok(Number.isFinite(forecast[key]), `${filename}: invalid ${key}`);
    }
    assert.ok(forecast.DegreesFreedom > 0);
    assert.ok(forecast.PredictionLow <= forecast.ConfidenceLow && forecast.ConfidenceHigh <= forecast.PredictionHigh);
  }
  assert.ok(index.includes(`href="${filename}"`), `${filename}: missing from subject index`);
  for (const extension of ['svg', 'png']) {
    assert.ok((await stat(path.join(root, filename.replace(/html$/, extension)))).size > 0);
  }
  charts++;
}
assert.ok(charts > 0, 'No subject charts');
assert.ok(files.includes('chart_data.csv') && files.some(file => /^forecast_\d+\.csv$/.test(file)));
console.log(`Validated ${charts} offline cutoff charts and their static assets.`);
