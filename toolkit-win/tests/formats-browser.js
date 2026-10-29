import {nativeTool,venvPython} from '../src/platform/runtime.js';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {formatExtension} from '../public/format-options.js';
import {chromium} from 'playwright-core';import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const run=promisify(execFile),folder=await mkdtemp(path.join(os.tmpdir(),'toolkit-formats-browser-')),evidence='/tmp/toolkit-validation/formats';await mkdir(evidence,{recursive:true});
await run(venvPython('.venv-formats'),['-c',"from PIL import Image; import sys; Image.new('RGBA',(80,60),(180,30,20,150)).save(sys.argv[1])",path.join(folder,'photo.png')]);
await run(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4',path.join(folder,'audio.wav')]);
await run(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-v','error','-f','lavfi','-i','color=c=blue:s=64x48:d=0.4','-f','lavfi','-i','sine=frequency=660:duration=0.4','-c:v','libx264','-c:a','aac','-shortest',path.join(folder,'video.mp4')]);
const app=await createToolkit({port:0}),browser=await chromium.launch({executablePath:await findChromium(),headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(new URL(app.url).origin))external.push(r.url());});
 await page.goto(app.url);await page.waitForFunction(()=>history.state?.toolkitView);
 await page.evaluate(()=>localStorage.setItem('toolkit-tools-v1',JSON.stringify({order:['markdown-tab','omr-tab'],hidden:['omr-tab']})));await page.reload();
 assert.equal(await page.locator('#omr-tab').isVisible(),false);
 for(const [kind,source,target]of [['photo','photo.png','tiff'],['photo','photo.png','dng'],['audio','audio.wav','alac'],['video','video.mp4','prores']]){
  const extension=formatExtension(kind,target);
  await page.locator(`#format-${kind}-tab`).click();
  await page.locator(`#format-${kind}-file`).setInputFiles(path.join(folder,source));
  await page.locator(`#format-${kind}-format`).selectOption(target);
  assert.equal(await page.locator(`#format-${kind}-name`).inputValue(),`${kind}-converted.${extension}`);
  const promise=page.waitForEvent('download');await page.locator(`#format-${kind}-convert`).click();const download=await promise;
  assert.equal(download.suggestedFilename(),`${kind}-converted.${extension}`);await download.saveAs(`${evidence}/${kind}.${extension}`);
  await page.locator(`#format-${kind}-status`).filter({hasText:'Downloaded'}).waitFor();
  if(kind==='photo')await run(venvPython('.venv-formats'),['-c',target==='dng'?"import rawpy,sys; raw=rawpy.imread(sys.argv[1]); assert raw.postprocess().shape==(60,80,3); raw.close()":"from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.format=='TIFF'; assert im.size==(80,60)",`${evidence}/${kind}.${extension}`]);
  else{const {stdout}=await run(nativeTool('ffprobe','TOOLKIT_FFPROBE'),['-v','error','-show_streams','-of','json',`${evidence}/${kind}.${extension}`]);const streams=JSON.parse(stdout).streams;assert.ok(streams.find(s=>s.codec_name===(kind==='audio'?'alac':'prores')));}
 }
 await run(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-y','-v','error','-i',`${evidence}/video.mov`,'-frames:v','1',`${evidence}/video-frame.png`]);
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
