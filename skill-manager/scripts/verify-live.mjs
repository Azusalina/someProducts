import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const url = 'http://127.0.0.1:' + (process.env.PORT || '4380');
const bootstrap = await (await fetch(url + '/api/bootstrap')).json();
if (process.argv.includes('--idle')) { const busy = bootstrap.jobs.some(j => !j.finishedAt) || bootstrap.batch && !bootstrap.batch.finishedAt; console.log(JSON.stringify({idle:!busy})); process.exit(busy ? 1 : 0); }
const response = await fetch(url + '/api/inventory', {headers:{'X-Skill-Manager-Token':bootstrap.token}});
if (!response.ok) throw new Error('Inventory HTTP ' + response.status);
const inventory = await response.json();
const reviewItems = inventory.items.filter(i => i.kind === 'skill' && !i.owners?.length && i.status !== 'broken').slice(0, 2);
const review = await fetch(url + '/api/batch/plan', {method:'POST', headers:{'X-Skill-Manager-Token':bootstrap.token, 'Content-Type':'application/json'}, body:JSON.stringify({selections:reviewItems.map(i => ({id:i.id}))})});
if (!review.ok || !(await review.json()).fingerprint) throw new Error('Batch review API unavailable');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:940}});
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.locator('.item-row').first().waitFor(); await page.locator('#document h1').first().waitFor();
  await fs.mkdir('artifacts', {recursive:true});
  await page.screenshot({path:'artifacts/live-desktop.png',fullPage:true});
  for (const item of reviewItems) await page.locator(`[data-select="${item.id}"]`).check();
  await page.screenshot({path:'artifacts/live-bulk.png',fullPage:true,animations:'disabled'});
  await page.locator('#bulk-remove').click();
  await page.screenshot({path:'artifacts/live-bulk-review.png',fullPage:true,animations:'disabled'});
  await page.locator('#batch-dialog [data-close]').first().click();
  await page.locator('#bulk-clear').click();
  await page.setViewportSize({width:390,height:844}); await page.locator('#back').click();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile overflow');
  await page.screenshot({path:'artifacts/live-mobile.png',fullPage:true});
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
const report = {url,skills:inventory.items.filter(i=>i.kind==='skill').length,plugins:inventory.items.filter(i=>i.kind==='plugin').length,shared:inventory.items.filter(i=>i.providers.length>1).length,opacity:bootstrap.settings.opacity,scanMs:inventory.durationMs,directoriesVisited:inventory.directoriesVisited,truncated:inventory.truncated,scanErrors:inventory.errors, browserErrors:errors,batchReview:true,service:execFileSync('systemctl',['--user','show','skill-manager.service','-p','ActiveState','-p','SubState','-p','UnitFileState','-p','MainPID'],{encoding:'utf8'}).trim(), listener:execFileSync('ss',['-H','-lnt','sport = :'+(process.env.PORT||'4380')],{encoding:'utf8'}).trim()};
if (report.listener.split(/\s+/)[3] !== '127.0.0.1:' + (process.env.PORT || '4380')) throw new Error('Unexpected bind: '+report.listener);
await fs.writeFile('artifacts/live-validation.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
