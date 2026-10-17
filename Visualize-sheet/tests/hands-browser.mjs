import {chromium,expect}from '@playwright/test';
import {spawn}from 'node:child_process';
import {mkdtemp,rm,mkdir}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'sheetvis-hands-')),url='http://127.0.0.1:4285';
const server=spawn('python',['server.py','--port','4285'],{stdio:'ignore',env:{...process.env,SHEETVIS_JOBS_DIR:temp,SHEETVIS_DEFAULT_SCORE:''}});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1040}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   const inputs=new WeakMap(),samples=new WeakMap();window.__handStarts=[];
   const fetchOriginal=window.fetch;
   window.fetch=async(...args)=>{
     const response=await fetchOriginal(...args),name=String(args[0]);
     if(name.includes('/samples/')&&!name.endsWith('manifest.json')){
       const original=response.arrayBuffer.bind(response);
       response.arrayBuffer=async()=>{const buffer=await original();inputs.set(buffer,name);return buffer;};
     }
     return response;
   };
   const decode=AudioContext.prototype.decodeAudioData;
   AudioContext.prototype.decodeAudioData=async function(buffer){const decoded=await decode.call(this,buffer);samples.set(decoded,inputs.get(buffer));return decoded;};
   const create=AudioContext.prototype.createBufferSource;
   AudioContext.prototype.createBufferSource=function(){const source=create.call(this),start=source.start.bind(source);source.start=(...args)=>{window.__handStarts.push({sample:samples.get(source.buffer),when:args[0]});return start(...args);};return source;};
 });
 await page.goto(url+'/?demo');await expect(page.locator('#piece-meta')).toContainText('56 个音符');
 await page.locator('#toolbar-toggle').click();await page.locator('#autoplay').uncheck();
 const note=(octave,staff)=>`<note><pitch><step>C</step><octave>${octave}</octave></pitch><duration>8</duration><staff>${staff}</staff></note>`;
 const xml=`<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>${note(5,1)}<backup><duration>8</duration></backup>${note(3,2)}</measure></part></score-partwise>`;
 await page.locator('#file').setInputFiles({name:'hands.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await expect(page.locator('#piece-meta')).toContainText('2 个音符');
 for(const [mode,pitch]of [['left','C3'],['right','C5']]){
   await page.locator('#hand-mode').selectOption(mode);
   await page.evaluate(()=>window.__handStarts=[]);
   await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('暂停');
   await expect.poll(()=>page.evaluate(()=>window.__handStarts.length)).toBe(1);
   expect(await page.evaluate(()=>window.__handStarts[0].sample)).toContain(pitch+'.mp3');
   await page.locator('#play').click();await page.locator('#reset').click();
 }
 await page.locator('#hand-mode').selectOption('both');await page.locator('#play').click();await page.waitForTimeout(250);
 const before=Number(await page.locator('#progress').inputValue());
 await page.evaluate(()=>window.__handStarts=[]);
 await page.locator('#hand-mode').selectOption('left');await expect(page.locator('#play')).toHaveText('暂停');
 await expect.poll(()=>page.evaluate(()=>window.__handStarts.length)).toBe(1);
 expect(await page.evaluate(()=>window.__handStarts[0].sample)).toContain('C3.mp3');
 const after=Number(await page.locator('#progress').inputValue());expect(after).toBeGreaterThanOrEqual(before);expect(after-before).toBeLessThan(1);
 await page.locator('#play').click();await page.reload();await page.locator('#toolbar-toggle').click();
 await expect(page.locator('#hand-mode')).toHaveValue('left');
 if(errors.length)throw new Error(errors.join('\n'));
 await mkdir('test-results/hands',{recursive:true});await page.screenshot({path:'test-results/hands/browser.png'});
 console.log('PASS: real C3/C5 samples isolated by hand, in-play switching preserves position, and refresh restores selection.');
}catch(error){const page=browser?.contexts()[0]?.pages()[0];if(page)console.error(await page.evaluate(()=>({url:location.href,mode:!!document.getElementById('hand-mode'),checkbox:!!document.getElementById('left-hand'),toolbar:document.getElementById('toolbar')?.outerHTML.slice(0,600),body:document.body.innerText.slice(0,400)})));throw error;}finally{await browser?.close();server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await rm(temp,{recursive:true,force:true});}
