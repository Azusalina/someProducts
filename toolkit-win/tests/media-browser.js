import {nativeTool,venvPython} from '../src/platform/runtime.js';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {chromium} from 'playwright-core';
import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const run=promisify(execFile),folder=await mkdtemp(path.join(tmpdir(),'toolkit-media-browser-'));
const evidence='/tmp/toolkit-validation/media';await mkdir(evidence,{recursive:true});
await run(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.3',path.join(folder,'input.wav')]);
const app=await createToolkit({port:0}),browser=await chromium.launch({executablePath:await findChromium(),headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // URL UI uses deterministic metadata/download fixtures; actual yt-dlp HTML
 // discovery and extraction are exercised in tests/test_media.py.
 await page.route('**/api/media/scan',route=>route.fulfill({json:{items:[{id:'0',title:'Video <test>',kind:'video / media',duration:65},{id:'1',title:'Audio track',kind:'audio',duration:5}]}}));
 let chosen;
 await page.route('**/api/media/audio',async route=>{chosen=route.request().postDataJSON();await route.fulfill({contentType:'application/zip',headers:{'Content-Disposition':"attachment; filename*=UTF-8''selected-audio.zip"},body:Buffer.from('PK\x05\x06'+'\x00'.repeat(18),'binary')});});
 await page.goto(app.url);await page.waitForFunction(()=>history.state?.toolkitView);
 await page.getByRole('button',{name:'URL audio',exact:true}).click();
 await page.getByLabel('Video, audio or playlist URL',{exact:true}).fill('https://example.com/media');
 await page.getByRole('button',{name:'Find media',exact:true}).click();await page.locator('#media-status').filter({hasText:'Found 2'}).waitFor();
 assert.equal(await page.locator('#media-list input:checked').count(),2);assert.match(await page.locator('#media-list').textContent(),/Video <test>/);
 await page.getByRole('button',{name:'Select none',exact:true}).click();assert.equal(await page.locator('#media-download').isDisabled(),true);
 await page.getByRole('button',{name:'Select all',exact:true}).click();await page.locator('#media-format').selectOption('flac');
 let downloaded=page.waitForEvent('download');await page.locator('#media-download').click();assert.equal((await downloaded).suggestedFilename(),'selected-audio.zip');
 assert.deepEqual(chosen,{ids:['0','1'],format:'flac'});
 await page.locator('#media-local-file').setInputFiles(path.join(folder,'input.wav'));await page.locator('#media-local-format').selectOption('flac');
 downloaded=page.waitForEvent('download');await page.locator('#media-convert').click();const download=await downloaded;await download.saveAs(`${evidence}/converted.flac`);
 const {stdout}=await run(nativeTool('ffprobe','TOOLKIT_FFPROBE'),['-v','error','-show_entries','stream=codec_name','-of','json',`${evidence}/converted.flac`]);assert.equal(JSON.parse(stdout).streams[0].codec_name,'flac');
 await page.locator('#media-status').filter({hasText:'Downloaded'}).waitFor();
 await page.screenshot({path:`${evidence}/desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'Photos to PDF',exact:true}).click();await page.getByRole('button',{name:'URL audio',exact:true}).click();assert.equal(await page.locator('#media-list li').count(),2);
 const second=await context.newPage();await second.goto(app.url);await second.locator('#media-tab').click();assert.equal(await second.locator('#media-list li').count(),0);await second.close();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${evidence}/mobile.png`,fullPage:true});
 await page.unroute('**/api/media/scan');let finish;
 await page.route('**/api/media/scan',async route=>{await new Promise(resolve=>finish=resolve);await route.fulfill({json:{items:[]}}).catch(()=>{});});
 await page.locator('#media-scan').click();await page.locator('#media-cancel').waitFor();await page.locator('#media-cancel').click();await page.locator('#media-status').filter({hasText:'Cancelled'}).waitFor();finish?.();
 assert.equal(await page.locator('#media-scan').isDisabled(),false);assert.deepEqual(errors,[]);
 console.log('PASS URL audio UI: multi-select, format selection, ZIP request/download, real FLAC conversion, tool/tab isolation, mobile, cancellation, inert titles.');
}finally{await browser.close();await app.close();await rm(folder,{recursive:true,force:true});}
