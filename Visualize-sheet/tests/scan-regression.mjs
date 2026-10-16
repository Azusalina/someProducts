// Run after recognising a local scan: node tests/scan-regression.mjs /path/score.pdf
// The PDF stays outside the repository. This checks its existing completed cache.
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
const input=process.argv[2];
if(!input)throw new Error('Usage: node tests/scan-regression.mjs /absolute/path/score.pdf');
const bytes=await readFile(input),hash=createHash('sha256').update(bytes).digest('hex');
const jobs=[],jobsRoot=process.env.SHEETVIS_SCAN_JOBS_DIR||'.data/jobs';
for(const name of await readdir(jobsRoot)){
  try{const j=JSON.parse(await readFile(`${jobsRoot}/${name}/job.json`,'utf8'));if(j.sha256===hash&&j.state==='done')jobs.push(j);}catch{}
}
const job=jobs.filter(j=>!process.env.SHEETVIS_SCAN_JOB_ID||j.id===process.env.SHEETVIS_SCAN_JOB_ID).sort((a,b)=>b.created-a.created)[0];
if(!job)throw new Error('Recognise this PDF locally before running its browser regression.');
await mkdir('test-results',{recursive:true});
const snapshot=await mkdtemp(path.join(tmpdir(),'sheetvis-scan-'));
await cp(path.join(jobsRoot,job.id),path.join(snapshot,job.id),{recursive:true});
const url='http://127.0.0.1:4287',server=spawn('python',['server.py','--port','4287'],{stdio:'ignore',env:{...process.env,SHEETVIS_JOBS_DIR:snapshot}});
let browser;
try{
  for(let i=0;i<40;i++){try{if((await fetch(`${url}/api/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),warnings=[],external=[],errors=[],decoders=[];
  page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')warnings.push(m.text());});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(/\/pdfjs\/wasm\//.test(r.url()))decoders.push({url:r.url(),status:r.status()});});
  await page.route('**/*',r=>{const u=r.request().url();if(/^https?:/.test(u)&&!u.startsWith(url)){external.push(u);return r.abort();}return r.continue();});
  await page.goto(`${url}/?demo`);await expect(page.locator('#piece-meta')).toContainText('56 个音符');
  let submissions=0;
  await page.route('**/api/recognize',r=>{submissions++;return r.fulfill({status:202,json:{id:job.id}});});
  await page.locator('#file').setInputFiles({name:path.basename(input),mimeType:'application/pdf',buffer:bytes});
  await expect(page.locator('#piece-kind')).toHaveText('PDF',{timeout:90000});
  await expect(page.locator('#recognition-percent')).toHaveText('100%');
  // A prepared-cache link must never upload the default PDF or start a job.
  const before=submissions;
  await page.goto(`${url}/?cache=${job.id}`);
  await expect(page.locator('#piece-kind')).toHaveText('PDF',{timeout:90000});
  expect(submissions).toBe(before);
  await expect(page.locator('#read-summary')).toContainText(path.basename(input));

  if(job.symbol_audit){
    await expect(page.locator('#symbol-report')).toHaveAttribute('href',`/api/jobs/${job.id}/symbol-audit.json`);
    const report=await page.request.get(`${url}/api/jobs/${job.id}/symbol-audit.json`);
    expect(report.status()).toBe(200);
    expect((await report.json()).export.unexported_heads).toEqual(job.symbol_audit.unexported_heads);
    await expect(page.locator('#read-facts')).toContainText('原图符号复核');
  }

  if(await page.locator('#transport-play').textContent()==='暂停')await page.locator('#transport-play').click();
  await page.locator('.pdf-follow').uncheck();
  const count=Number(await page.locator('.pdf-number').getAttribute('max')),pages=[];
  await expect(page.locator('.pdf-page canvas')).toHaveCount(count);
  await page.evaluate(()=>{window.__pdfCanvases=[...document.querySelectorAll('.pdf-page canvas')];window.__pdfCanvasRemovals=[];window.__pdfObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.removedNodes)if(n.nodeName==='CANVAS')window.__pdfCanvasRemovals.push(n);});window.__pdfObserver.observe(document.querySelector('.pdf-pages'),{childList:true,subtree:true});});
  for(let number=1;number<=count;number++){
    await page.locator('.pdf-number').fill(String(number));await page.locator('.pdf-number').dispatchEvent('change');
    await expect(page.locator(`.pdf-page[data-page="${number}"] canvas`)).toHaveAttribute('aria-label',`原 PDF 第 ${number} 页`);
    await expect(page.locator('#pdf-view')).toHaveAttribute('aria-busy','false');
    const ink=await page.locator(`.pdf-page[data-page="${number}"] canvas`).evaluate(c=>{
      const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let black=0;
      for(let i=0;i<p.length;i+=4)if(p[i]<128&&p[i+1]<128&&p[i+2]<128&&p[i+3]>128)black++;
      return black/(c.width*c.height);
    });
    expect(ink).toBeGreaterThan(.01);pages.push({number,ink});
    if(number===Math.min(4,count))await page.screenshot({path:'test-results/scan-visible.png'});
  }
  const retained=await page.evaluate(()=>({same:window.__pdfCanvases.every((c,i)=>c===document.querySelectorAll('.pdf-page canvas')[i]&&c.isConnected&&c.width>0&&c.height>0),removed:window.__pdfCanvasRemovals.length}));
  expect(retained).toEqual({same:true,removed:0});await page.evaluate(()=>window.__pdfObserver.disconnect());
  await page.setViewportSize({width:1000,height:800});
  await expect.poll(()=>page.locator('.pdf-page canvas').first().evaluate(c=>{const pane=c.closest('.pdf-scroll');return pane?Math.abs(c.getBoundingClientRect().width-(pane.clientWidth-20)):Infinity;})).toBeLessThan(2);
  expect(external).toEqual([]);expect(errors).toEqual([]);
  expect(warnings.filter(s=>/unable to decode|failed to initialize|Content Security|Dependent image/i.test(s))).toEqual([]);
  if(process.argv.includes('--staff')) {
    await page.locator('#toolbar-toggle').click();await page.locator('#score-tab').click();
    await expect(page.locator('#score-view svg').first()).toBeVisible({timeout:60000});
    await expect(page.locator('#score-view .seek-note').first()).toBeAttached();
    await page.screenshot({path:'test-results/scan-staff.png'});
  }
  expect(external).toEqual([]);expect(errors).toEqual([]);
  const report={file:path.basename(input),job:job.id,pages,retained,decoders,warnings,errors,external,metadata:await page.locator('#piece-meta').textContent()};
  await writeFile(`test-results/scan-${path.basename(input).replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,JSON.stringify(report,null,2));
  await writeFile('test-results/scan-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));await rm(snapshot,{recursive:true,force:true});}
