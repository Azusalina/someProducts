import {chromium,expect} from '@playwright/test';
import {spawn}from 'node:child_process';
import {mkdtemp, mkdir, copyFile, writeFile, readFile, rm}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'sheetvis-ensemble-')),id='e'.repeat(32),d=join(temp,id);
await mkdir(d);const source='.data/jobs/9befa9ad83de4b0599de1e079e32f2da';
for(const name of ['score.pdf','result-0.mxl','result-0.map.json'])await copyFile(`${source}/${name}`,join(d,name));
const before=await readFile(join(d,'result-0.mxl'));
await writeFile(join(d,'job.json'),JSON.stringify({id,state:'done',created:0,filename:'fantasie.pdf',pipeline:'image-octave-tuplet-curves-v9',total_pages:13,included_pages:Array.from({length:13},(_,i)=>i+1),results:[{name:'result-0.mxl',url:`/api/jobs/${id}/result-0.mxl`}]}));
const url='http://127.0.0.1:4282';
const server=spawn('python',['server.py','--port','4282'],{env:{...process.env,SHEETVIS_JOBS_DIR:temp,SHEETVIS_DEFAULT_SCORE:''},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('sheetvis-autoplay','false'));
 await page.goto(`${url}/?cache=${id}`);
 await expect(page.locator('#piece-title')).toContainText('fantasie',{timeout:60000});
 await page.locator('#toolbar-toggle').click();
 await expect(page.locator('#engine-compare')).toBeVisible({timeout:60000});
 await page.locator('#engine-compare').click();
 await page.locator('#ensemble-file').setInputFiles(join(d,'result-0.mxl'));
 await page.locator('#ensemble-run').click();
 await expect(page.locator('#ensemble-status')).toContainText('100.0%',{timeout:30000});
 await page.locator('#ensemble-end').fill('12');
 await page.locator('#ensemble-last').fill('1');
 await page.locator('#ensemble-local').click();
 await expect(page.locator('#ensemble-status')).toContainText('准确率未知',{timeout:180000});
 await expect(page.locator('#ensemble-status')).toContainText('38.7%',{timeout:180000});
 await expect(page.locator('#ensemble-differences li')).toHaveCount(10);
 await page.locator('#ensemble-differences button').first().click();
 await expect(page.locator('#ensemble-dialog')).not.toBeVisible();
 if(!before.equals(await readFile(join(d,'result-0.mxl'))))throw new Error('original modified');
 if(errors.length)throw new Error(errors.join('\n'));
 const entries=(await(await fetch(url+'/api/cache')).json()).entries;
 const second=entries.find(x=>x.second_engine);if(!second||second.state!=='done')throw new Error('secondary cache missing');
 await page.screenshot({path:'test-results/ensemble-v9/browser.png'});
 console.log('PASS: imported agreement, actual local homr, 10 disagreement bars, seek, immutable original and separate cache.');
}finally{
 await browser?.close();server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));await rm(temp,{recursive:true,force:true});
}
