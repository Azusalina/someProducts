import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {chromium} from 'playwright-core';import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const run=promisify(execFile),folder=await mkdtemp(path.join(os.tmpdir(),'toolkit-formats-browser-')),evidence='/tmp/toolkit-validation/formats';await mkdir(evidence,{recursive:true});
await run('.venv-formats/bin/python',['-c',"from PIL import Image; import sys; Image.new('RGBA',(80,60),(180,30,20,150)).save(sys.argv[1])",path.join(folder,'photo.png')]);
await run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4',path.join(folder,'audio.wav')]);
await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x48:d=0.4','-f','lavfi','-i','sine=frequency=660:duration=0.4','-c:v','libx264','-c:a','aac','-shortest',path.join(folder,'video.mp4')]);
const app=await createToolkit({port:0}),browser=await chromium.launch({executablePath:await findChromium(),headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(new URL(app.url).origin))external.push(r.url());});
 await page.goto(app.url);await page.waitForFunction(()=>history.state?.toolkitView);
 await page.evaluate(()=>localStorage.setItem('toolkit-tools-v1',JSON.stringify({order:['markdown-tab','omr-tab'],hidden:['omr-tab']})));await page.reload();
 assert.equal(await page.locator('#omr-tab').isVisible(),false);
 for(const [kind,source,target]of [['photo','photo.png','webp'],['audio','audio.wav','m4a'],['video','video.mp4','webm']]){
  await page.locator(`#format-${kind}-tab`).click();
  await page.locator(`#format-${kind}-file`).setInputFiles(path.join(folder,source));
  await page.locator(`#format-${kind}-format`).selectOption(target);
  assert.equal(await page.locator(`#format-${kind}-name`).inputValue(),`${kind}-converted.${target}`);
  const promise=page.waitForEvent('download');await page.locator(`#format-${kind}-convert`).click();const download=await promise;
  assert.equal(download.suggestedFilename(),`${kind}-converted.${target}`);await download.saveAs(`${evidence}/${kind}.${target}`);
  await page.locator(`#format-${kind}-status`).filter({hasText:'Downloaded'}).waitFor();
  if(kind==='photo')await run('.venv-formats/bin/python',['-c',"from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.format=='WEBP'; assert im.size==(80,60)",`${evidence}/${kind}.${target}`]);
  else{const {stdout}=await run('ffprobe',['-v','error','-show_streams','-of','json',`${evidence}/${kind}.${target}`]);const streams=JSON.parse(stdout).streams;assert.ok(streams.find(s=>s.codec_name===(kind==='audio'?'aac':'vp9')));}
 }
 await run('ffmpeg',['-y','-v','error','-i',`${evidence}/video.webm`,'-frames:v','1',`${evidence}/video-frame.png`]);
 await page.screenshot({path:`${evidence}/video-desktop.png`,fullPage:true});
 await page.locator('#format-photo-tab').click();assert.match(await page.locator('#format-photo-status').textContent(),/Downloaded/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${evidence}/photo-mobile.png`,fullPage:true});
 await page.locator('#tools-customize').click();await page.getByRole('checkbox',{name:'Video formats',exact:true}).uncheck();await page.locator('#tools-done').click();assert.equal(await page.locator('#format-video-tab').isVisible(),false);
 const second=await context.newPage();await second.goto(app.url);await second.locator('#format-audio-tab').click();assert.equal(await second.locator('#format-audio-convert').isDisabled(),true);await second.close();
 let finish;await page.route('**/api/formats/convert?*',async route=>{await new Promise(resolve=>finish=resolve);await route.abort().catch(()=>{});});
 await page.locator('#format-photo-convert').click();await page.locator('#format-photo-cancel').waitFor();
 await page.locator('#format-audio-tab').click();assert.equal(await page.locator('#format-audio-convert').isDisabled(),true);assert.match(await page.locator('#format-audio-status').textContent(),/Photo formats is converting/);
 await page.locator('#format-audio-cancel').click();finish?.();await page.locator('#format-photo-tab').click();await page.locator('#format-photo-status').filter({hasText:'Cancelled'}).waitFor();
 assert.equal(await page.locator('#format-photo-convert').isDisabled(),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS three conversion tools: real photo/audio/video downloads, output filenames, no network, saved toolbar preferences, independent inputs, mobile, cancellation across tool navigation.');
}finally{await browser.close();await app.close();await rm(folder,{recursive:true,force:true});}
