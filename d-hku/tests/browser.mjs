import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.HKU_BASE_URL||'http://127.0.0.1:8787/';
const out=process.env.HKU_TEST_OUTPUT||'/tmp/hku-browser';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[],bad=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport overflow');
const open=async c=>page.locator(`#programme-list .name-button[data-open="${c}"]`).click();
const close=async()=>page.locator('#close-detail').click();
const checks=[];
try{
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.setItem('hku2027-workbench-v1',JSON.stringify({version:1,csd:'unknown',plan:['JS6315','JS6377','JS6937'],compare:['JS6315'],notes:{JS6999:'preserve note'}})));
  await page.reload({waitUntil:'networkidle'});
  const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('hku2027-workbench-v1')));
  assert.equal(migrated.version,2);assert.equal(migrated.csd,'attained');assert.deepEqual(migrated.plan,[]);assert.deepEqual(migrated.compare,[]);assert.equal(migrated.notes.JS6999,'preserve note');
  assert.equal(await page.locator('.programme').count(),12);assert.equal(await page.locator('#programme-list .admission-block').count(),12);await noOverflow();
  await page.screenshot({path:out+'/desktop.png',fullPage:true});
  const codes=await page.locator('.name-button').evaluateAll(es=>es.map(e=>e.dataset.open));
  for(const c of codes){await open(c);assert.equal(await page.locator('dialog[open]').count(),1);assert.ok((await page.locator('#detail-code').innerText()).includes(c));assert.ok((await page.locator('#detail-content').innerText()).includes('第二主修'));assert.ok(await page.locator('#detail-content .review').count());assert.ok((await page.locator('#detail-content .admission-block').innerText()).includes('Median'));assert.ok(await page.locator('#detail-content a[href^="data/hku26.pdf#page="]').count());await close();}
  checks.push('12 programme dialogs, PDF quartiles/formulas/current score, evidence and second-major fields; v1 migration removes deleted routes and assumes CSD attained');
  await page.locator('#search').fill('6779');assert.equal(await page.locator('.programme').count(),1);
  await page.locator('#search').fill('zzzz-no-match');assert.equal(await page.locator('.programme').count(),0);assert.ok(await page.locator('#programme-list .empty').isVisible());
  await page.locator('#search').fill('');await page.locator('#field').selectOption('business');assert.equal(await page.locator('.programme').count(),3);
  await page.locator('#field').selectOption('all');await page.locator('#status').selectOption('priority');assert.equal(await page.locator('.programme').count(),4);
  await page.locator('#status').selectOption('eligible');assert.equal(await page.locator('.programme').count(),11);
  await page.locator('#status').selectOption('all');
  await page.locator('.profile summary').click();
  assert.equal(await page.locator('#csd').inputValue(),'attained');
  assert.ok((await page.locator('#score-summary').innerText()).includes('44.30'));
  await page.locator('#csd').selectOption('attained');await page.locator('[data-grade="english"]').selectOption('4');
  const law=page.locator('.programme').filter({has:page.locator('.name-button[data-open="JS6810"]')});
  assert.ok((await law.innerText()).includes('英文須5'));
  assert.equal(await page.locator('#programme-list [data-current-score="JS6755"]').innerText(),'42.05');
  await page.locator('#reset-grades').click();assert.equal(await page.locator('[data-grade="english"]').inputValue(),'5');assert.equal(await page.locator('#csd').inputValue(),'attained');
  assert.equal(await page.locator('#programme-list [data-current-score="JS6755"]').innerText(),'44.30');
  checks.push('search, direction, eligibility filter; grade/English qualification gates');
  for(const c of ['JS6999','JS6779','JS6793','JS6767'])await page.locator(`#programme-list [data-compare="${c}"]`).click();
  await page.locator('#programme-list [data-compare="JS6755"]').click();assert.equal(await page.locator('#compare-count').innerText(),'4');
  await page.locator('nav a[href="#compare"]').click();assert.equal(await page.locator('#comparison thead th').count(),5);await noOverflow();
  await page.screenshot({path:out+'/comparison.png',fullPage:true});
  await page.locator('nav a[href="#explore"]').click();
  for(const c of ['JS6999','JS6779','JS6767'])await page.locator(`#programme-list [data-save="${c}"]`).click();
  await page.locator('#programme-list [data-save="JS6224"]').click();
  await page.locator('nav a[href="#plan"]').click();assert.equal(await page.locator('.plan-item').count(),3);
  await page.locator('[data-move="JS6779"][data-direction="-1"]').click();
  assert.ok((await page.locator('.plan-item').first().innerText()).includes('JS6779'));
  await page.locator('[data-note="JS6779"]').fill('我喜歡概率模型；問2027第二主修條件。 <img src=x onerror=alert(1)>');
  await page.locator('#global-notes').fill('比較程式開發與經濟實證。');
  await page.reload({waitUntil:'networkidle'});
  assert.ok((await page.locator('.plan-item').first().innerText()).includes('JS6779'));
  assert.ok((await page.locator('[data-note="JS6779"]').inputValue()).includes('<img'));
  assert.equal(await page.locator('#plan img').count(),0);
  assert.equal(await page.locator('#global-notes').inputValue(),'比較程式開發與經濟實證。');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-plan').click();const download=await downloadPromise;
  await download.saveAs(out+'/export.json');const exported=JSON.parse(await readFile(out+'/export.json','utf8'));
  assert.deepEqual(exported.plan,['JS6779','JS6999','JS6767']);assert.equal(exported.compare.length,4);
  await page.locator('.plan-item [data-save="JS6779"]').click();assert.equal(await page.locator('.plan-item').count(),2);
  await page.locator('#import').setInputFiles(out+'/export.json');await page.waitForFunction(()=>document.querySelectorAll('.plan-item').length===3);
  await page.locator('#import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('未匯入'));assert.equal(await page.locator('.plan-item').count(),3);
  checks.push('four-course compare limit; historic code blocked from live plan; sorting, persistence, escaped notes, export/import and invalid-file recovery');
  for(const route of ['guide','evidence']){await page.locator(`nav a[href="#${route}"]`).click();assert.ok((await page.locator(`#${route}`).innerText()).length>1000);await noOverflow();}
  await page.locator('#evidence details').first().locator('summary').click();await noOverflow();
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:850});
    for(const route of ['explore','compare','plan','guide','evidence']){await page.locator(`nav a[href="#${route}"]`).click();await noOverflow();}
    await page.locator('nav a[href="#explore"]').click();await open('JS6779');
    assert.ok(await page.locator('#close-detail').isVisible());await close();
    await page.screenshot({path:`${out}/mobile-${width}.png`,fullPage:true});
  }
  checks.push('320/390/768px all five views, accessible modal close, desktop/mobile screenshots');
  // Buildless distribution must work by direct file open, with no fetch server.
  const offline=await context.newPage();await offline.goto(new URL('../index.html',import.meta.url).href,{waitUntil:'load'});
  assert.equal(await offline.locator('.programme').count(),12);await offline.close();
  checks.push('direct file:// offline opening');
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({status:'passed',checks,errors,bad,external,screenshots:out},null,2));
}finally{await browser.close();}
