// Uses isolated snapshots made by the real local-recognition validation.
import {chromium,expect} from '@playwright/test';
import {mkdtemp,cp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const parent='31068e13193b44fbb251a8df6f34bcc0',candidate='0a8d0b1b240e4849a0f2ab36205c7af3';
const source='test-results/region-validation',snapshot=await mkdtemp(join(tmpdir(),'sheetvis-region-'));
for(const id of [parent,candidate])await cp(`${source}/${id}`,join(snapshot,id),{recursive:true});
const before=await readFile(join(snapshot,parent,'result-0.mxl'));
const server=spawn('python',['server.py','--port','4288'],{stdio:'ignore',env:{...process.env,SHEETVIS_JOBS_DIR:snapshot}}),url='http://127.0.0.1:4288';let browser;
try{
  for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];let submissions=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=route.request().url();if(/^https?:/.test(u)&&!u.startsWith(url)){external.push(u);return route.abort();}return route.continue();});
  await page.route('**/api/recognize',route=>{submissions++;return route.abort();});
  await page.goto(`${url}/?cache=${parent}`);await expect(page.locator('#piece-kind')).toHaveText('PDF',{timeout:90000});
  const number=page.locator('.pdf-number');await number.fill('3');await number.dispatchEvent('change');await expect(page.locator('#pdf-view')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-page canvas')).toHaveCount(5);
  await page.locator('.pdf-scroll').evaluate(el=>{el.scrollTop=el.querySelector('[data-page="4"]').offsetTop-120;});
  await expect(number).toHaveValue('3');await page.locator('.pdf-scroll').hover();await page.mouse.wheel(0,180);
  await expect(number).toHaveValue('4');await expect(page.locator('.pdf-page[data-page="4"] canvas')).toHaveAttribute('aria-label','原 PDF 第 4 页');
  await page.mouse.wheel(0,-220);await expect(number).toHaveValue('3');
  await expect(page.locator('#pdf-view')).toHaveAttribute('aria-busy','false');await expect(page.locator('.pdf-follow')).not.toBeChecked();
  await page.locator('#toolbar-toggle').click();await page.locator('#region-select').click();
  const regions=await(await page.request.get(`${url}/api/jobs/${parent}/regions`)).json();const region=regions.measures.find(r=>r.index===23);
  const point=await page.locator('.pdf-page[data-page="3"]').evaluate((el,r)=>{const scroll=el.closest('.pdf-scroll');scroll.scrollTop=Math.max(0,el.offsetTop+10+(r.y+r.h/2)*el.clientHeight-scroll.clientHeight/2);const b=el.getBoundingClientRect();return {x:b.left+(r.x+r.w/2)*b.width,y:b.top+(r.y+r.h/2)*b.height};},region);
  await page.mouse.click(point.x,point.y);await expect(page.locator('#region-dialog')).toBeVisible();await expect(page.locator('#region-range')).toContainText('24');
  let selected;
  await page.route(`**/api/jobs/${parent}/regions`,route=>{
    if(route.request().method()!=='POST')return route.continue();selected=route.request().postDataJSON();return route.fulfill({status:202,json:{id:candidate}});
  });
  await page.locator('#region-start').click();await expect(page.locator('#region-accept')).toBeVisible({timeout:15000});
  expect(selected).toEqual({start:23,end:23,dpi:600,implicit_tuplets:false});
  await expect(page.locator('#region-comparison')).toContainText('14 → 13');
  await page.screenshot({path:'test-results/region-dialog.png'});
  await page.locator('#region-preview').click();await expect(page.locator('#read-facts')).toContainText('局部识别候选',{timeout:90000});await expect(page.locator('#transport-play')).toHaveText('暂停');
  await page.locator('#toolbar-toggle').click();await page.locator('#region-review').click();await expect(page.locator('#region-accept')).toBeVisible();await page.locator('#region-accept').click();
  await expect(page.locator('#region-dialog')).not.toBeVisible();await expect(page.locator('#region-review')).toBeHidden();await expect(page.locator('#read-facts')).toContainText('局部识别副本',{timeout:90000});
  const accepted=await(await page.request.get(`${url}/api/jobs/${candidate}`)).json();expect(accepted.pending_region).toBe(false);
  expect(await readFile(join(snapshot,parent,'result-0.mxl'))).toEqual(before);expect(submissions).toBe(0);expect(errors).toEqual([]);expect(external).toEqual([]);
  console.log('Region selection, candidate audition/adoption, source preservation and vertical paging passed; no full-score submissions or external requests.');
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await rm(snapshot,{recursive:true,force:true});}
