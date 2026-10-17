import {chromium,expect}from '@playwright/test';
import {spawn}from 'node:child_process';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm,readdir}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'sheetvis-manual-only-')),parent='c'.repeat(32),child='d'.repeat(32),fresh='e'.repeat(32);
for(const id of [parent,fresh]){
 const d=join(temp,id);await mkdir(d);await copyFile('tests/fixtures/demo-score.pdf',join(d,'score.pdf'));await copyFile('public/demo.musicxml',join(d,'result-0.musicxml'));
 const job={id,state:'done',created:0,filename:'demo-score.pdf',pipeline:'image-octave-tuplet-curves-v9',total_pages:1,included_pages:[1],results:[{name:'result-0.musicxml',url:`/api/jobs/${id}/result-0.musicxml`}]};
 if(id===parent)job.assistance={state:'running',pages:[{page:1,start:0,end:7,job_id:child}]};
 await writeFile(join(d,'job.json'),JSON.stringify(job));
}
await mkdir(join(temp,child));
// Completed report fixture: opening historical reports must remain possible.
await writeFile(join(temp,child,'job.json'),JSON.stringify({id:child,state:'done',created:1,filename:'historical homr',results:[],comparison:{comparable:true,agreement:1,differing_measures:0,measures:[]},second_engine:{parent,result:0,first:1,last:1,start:0,end:7}}));
const url='http://127.0.0.1:4284',server=spawn('python',['server.py','--port','4284'],{env:{...process.env,SHEETVIS_JOBS_DIR:temp,SHEETVIS_DEFAULT_SCORE:''},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],starts=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/\/(assist|second-engine)$/.test(r.url()))starts.push(r.url());});
 for(const id of [parent,fresh]){
   await page.goto(`${url}/?cache=${id}`);await expect(page.locator('#piece-meta')).toContainText('56 个音符',{timeout:30000});
   await page.reload();await expect(page.locator('#piece-meta')).toContainText('56 个音符',{timeout:30000});
 }
 expect(starts).toEqual([]);
 // Simulate an old page repeatedly calling the removed auto-start endpoint.
 for(let i=0;i<3;i++){
   const r=await fetch(`${url}/api/jobs/${fresh}/assist`,{method:'POST',headers:{'X-SheetVis':'local'}});
   expect((await r.json()).manual_only).toBe(true);
 }
 expect((await readdir(temp)).sort()).toEqual([parent,child,fresh].sort());
 const config=await(await fetch(url+'/api/config')).json();expect(config.recognition.auto_assist).toBe(false);
 await page.goto(`${url}/?cache=${parent}`);await expect(page.locator('#piece-meta')).toContainText('56 个音符');
 await page.locator('#toolbar-toggle').click();await page.locator('#engine-compare').click();await page.locator('#ensemble-pages button').first().click();
 await expect(page.locator('#ensemble-status')).toContainText('100.0%');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS: opening/reloading fresh and historical caches starts no homr; stale auto requests create no copies; historical reports remain readable.');
}finally{await browser?.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await rm(temp,{recursive:true,force:true});}
