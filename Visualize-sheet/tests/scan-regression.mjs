// Run after recognising a local scan: node tests/scan-regression.mjs /path/score.pdf
// The PDF stays outside the repository. This checks its existing completed cache.
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const input=process.argv[2];
if(!input)throw new Error('Usage: node tests/scan-regression.mjs /absolute/path/score.pdf');
const bytes=await readFile(input),hash=createHash('sha256').update(bytes).digest('hex');
const jobs=[];
for(const name of await readdir('.data/jobs')){
  try{const j=JSON.parse(await readFile(`.data/jobs/${name}/job.json`,'utf8'));if(j.sha256===hash&&j.state==='done')jobs.push(j);}catch{}
}
const job=jobs.sort((a,b)=>b.created-a.created)[0];
if(!job)throw new Error('Recognise this PDF locally before running its browser regression.');
await mkdir('test-results',{recursive:true});
const url='http://127.0.0.1:4287',server=spawn('python',['server.py','--port','4287'],{stdio:'ignore'});
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
  await page.route('**/api/recognize',r=>r.fulfill({status:202,json:{id:job.id}}));
  await page.locator('#file').setInputFiles({name:path.basename(input),mimeType:'application/pdf',buffer:bytes});
  await expect(page.locator('#piece-kind')).toHaveText('PDF',{timeout:90000});
  await expect(page.locator('#recognition-percent')).toHaveText('100%');
  if(await page.locator('#transport-play').textContent()==='暂停')await page.locator('#transport-play').click();
  await page.locator('.pdf-follow').uncheck();
  const count=Number(await page.locator('.pdf-number').getAttribute('max')),pages=[];
  for(let number=1;number<=count;number++){
    await page.locator('.pdf-number').fill(String(number));await page.locator('.pdf-number').dispatchEvent('change');
    await expect(page.locator('.pdf-page canvas')).toHaveAttribute('aria-label',`原 PDF 第 ${number} 页`);
    await expect(page.locator('#pdf-view')).toHaveAttribute('aria-busy','false');
    const ink=await page.locator('.pdf-page canvas').evaluate(c=>{
      const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let black=0;
      for(let i=0;i<p.length;i+=4)if(p[i]<128&&p[i+1]<128&&p[i+2]<128&&p[i+3]>128)black++;
      return black/(c.width*c.height);
    });
    expect(ink).toBeGreaterThan(.01);pages.push({number,ink});
    if(number===Math.min(4,count))await page.screenshot({path:'test-results/scan-visible.png'});
  }
  await page.setViewportSize({width:1000,height:800});
  await expect.poll(()=>page.locator('.pdf-page canvas').evaluate(c=>Math.abs(c.getBoundingClientRect().width-(c.closest('.pdf-scroll').clientWidth-20)))).toBeLessThan(2);
  expect(external).toEqual([]);expect(errors).toEqual([]);
  expect(warnings.filter(s=>/unable to decode|failed to initialize|Content Security|Dependent image/i.test(s))).toEqual([]);
  const report={file:path.basename(input),job:job.id,pages,decoders,warnings,errors,external,metadata:await page.locator('#piece-meta').textContent()};
  await writeFile('test-results/scan-regression.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill('SIGTERM');}
