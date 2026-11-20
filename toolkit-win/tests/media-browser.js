import {nativeTool,venvPython} from '../src/platform/runtime.js';
import assert from 'node:assert/strict';
import {mediaDownloadName} from '../src/media/jobs.js';
import {mkdir,mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {chromium,firefox} from 'playwright-core';
import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const run=promisify(execFile),folder=await mkdtemp(path.join(tmpdir(),'toolkit-media-browser-'));
const evidence=path.join(tmpdir(),'toolkit-validation','media');await mkdir(evidence,{recursive:true});
await run(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.3',path.join(folder,'input.wav')]);
const app=await createToolkit({port:0}),browser=await (process.argv.includes('--firefox')?firefox.launch({headless:true}):chromium.launch({executablePath:await findChromium(),headless:true}));
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // URL UI uses deterministic metadata/download fixtures; actual yt-dlp HTML
 // discovery and extraction are exercised in tests/test_media.py.
 await page.route('**/api/media/scan',route=>route.fulfill({json:{items:[{id:'0',title:'Video <test>',kind:'video / media',duration:65},{id:'1',title:'Audio track',kind:'audio',duration:5}]}}));
 let chosen,starts=0;
 await page.route('**/api/media/start',async route=>{starts++;chosen=route.request().postDataJSON();await route.fulfill({status:202,json:{state:'working',message:'Downloading audio',progress:{stage:'downloading',item:1,total:2,downloaded:500000000,bytes:600000000}}});});
 let polls=0;
 await page.route('**/api/media/status',route=>{polls++;return route.fulfill({json:{state:'ready',filename:chosen.ids.length>1?'selected-audio.zip':chosen.format==='original'?'source.opus':`source.${chosen.format}`,bytes:600000000,link:'/api/media/file/'+ 'a'.repeat(48)}});});
 // Serve the attachment through real HTTP: older Chromium/Playwright releases
 // do not consistently intercept download-manager requests with page.route.
 const serve=app.server.listeners('request')[0];app.server.removeListener('request',serve);
 app.server.on('request',(req,res)=>{
  const url=new URL(req.url,app.url);
  if(!url.pathname.startsWith('/api/media/file/'))return serve(req,res);
  const original=chosen.ids.length>1?'selected-audio.zip':chosen.format==='original'?'source.opus':`source.${chosen.format}`;
  const filename=mediaDownloadName(url.searchParams.get('filename'),original);
  const body=Buffer.from('PK\x05\x06'+'\x00'.repeat(18),'binary');
  res.writeHead(200,{'Content-Type':chosen.ids.length>1?'application/zip':chosen.format==='original'?'application/octet-stream':'audio/flac',
   'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Length':body.length});res.end(body);
 });
 await page.goto(app.url);await page.waitForFunction(()=>history.state?.toolkitView);
 await page.getByRole('button',{name:'URL audio',exact:true}).click();
 await page.getByLabel('Video, audio or playlist URL',{exact:true}).fill('https://example.com/media');
 await page.getByRole('button',{name:'Find media',exact:true}).click();await page.locator('#media-status').filter({hasText:'Found 2'}).waitFor();
 assert.equal(await page.locator('#media-list input:checked').count(),2);assert.match(await page.locator('#media-list').textContent(),/Video <test>/);
 await page.getByRole('button',{name:'Select none',exact:true}).click();assert.equal(await page.locator('#media-download').isDisabled(),true);
 await page.getByRole('button',{name:'Select all',exact:true}).click();await page.locator('#media-format').selectOption('flac');
 let downloaded=page.waitForEvent('download');await page.locator('#media-download').click();assert.equal((await downloaded).suggestedFilename(),'selected-audio.zip');
 assert.deepEqual(chosen,{ids:['0','1'],format:'flac'});assert.ok(polls>0);
 await page.locator('#media-status').filter({hasText:'Ready'}).waitFor();assert.equal(await page.locator('#media-result').isVisible(),true);
 downloaded=page.waitForEvent('download');await page.locator('#media-result').click();assert.equal((await downloaded).suggestedFilename(),'selected-audio.zip');
 await page.locator('#media-output-name').fill('播放清單.mp3');
 downloaded=page.waitForEvent('download');await page.locator('#media-result').click();assert.equal((await downloaded).suggestedFilename(),'播放清單.zip');
 await page.getByRole('button',{name:'Select none',exact:true}).click();await page.locator('#media-list input').first().check();
 await page.locator('#media-output-name').fill('課堂/錄音.mp3');
 downloaded=page.waitForEvent('download');await page.locator('#media-download').click();assert.equal((await downloaded).suggestedFilename(),'課堂_錄音.flac');
 await page.locator('#media-cancel').waitFor({state:'hidden'});
 const jobsBeforeRename=starts;
 await page.locator('#media-output-name').fill('修訂版');
 downloaded=page.waitForEvent('download');await page.locator('#media-result').click();assert.equal((await downloaded).suggestedFilename(),'修訂版.flac');
 await page.locator('#media-output-name').fill('');
 downloaded=page.waitForEvent('download');await page.locator('#media-result').click();assert.equal((await downloaded).suggestedFilename(),'source.flac');
 assert.equal(starts,jobsBeforeRename);
 await page.locator('#media-format').selectOption('original');await page.locator('#media-output-name').fill('原音檔.flac');
 downloaded=page.waitForEvent('download');await page.locator('#media-download').click();assert.equal((await downloaded).suggestedFilename(),'原音檔.opus');
 await page.locator('#media-cancel').waitFor({state:'hidden'});
 await page.locator('#media-local-file').setInputFiles(path.join(folder,'input.wav'));await page.locator('#media-local-format').selectOption('flac');
 downloaded=page.waitForEvent('download');await page.locator('#media-convert').click();const download=await downloaded;await download.saveAs(`${evidence}/converted.flac`);
 const {stdout}=await run(nativeTool('ffprobe','TOOLKIT_FFPROBE'),['-v','error','-show_entries','stream=codec_name','-of','json',`${evidence}/converted.flac`]);assert.equal(JSON.parse(stdout).streams[0].codec_name,'flac');
 await page.locator('#media-status').filter({hasText:'Downloaded'}).waitFor();
 await page.screenshot({path:`${evidence}/desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'Photos to PDF',exact:true}).click();await page.getByRole('button',{name:'URL audio',exact:true}).click();assert.equal(await page.locator('#media-list li').count(),2);
 const second=await context.newPage();await second.goto(app.url);await second.locator('#media-tab').click();assert.equal(await second.locator('#media-list li').count(),0);assert.equal(await second.locator('#media-output-name').inputValue(),'');assert.equal(await page.locator('#media-output-name').inputValue(),'原音檔.flac');await second.close();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${evidence}/mobile.png`,fullPage:true});
 await page.unroute('**/api/media/scan');let finish;
 await page.route('**/api/media/scan',async route=>{await new Promise(resolve=>finish=resolve);await route.fulfill({json:{items:[]}}).catch(()=>{});});
 await page.locator('#media-scan').click();await page.locator('#media-cancel').waitFor();await page.locator('#media-cancel').click();await page.locator('#media-status').filter({hasText:'Cancelled'}).waitFor();finish?.();
 assert.equal(await page.locator('#media-scan').isDisabled(),false);assert.deepEqual(errors,[]);
 let cancelled=false;
 await page.route('**/api/media/status',route=>route.fulfill({json:{state:'working',message:'Converting audio'}}));
 await page.route('**/api/media/cancel',route=>{cancelled=true;return route.fulfill({json:{state:'idle'}});});
 await page.locator('#media-download').click();await page.locator('#media-cancel').waitFor();await page.locator('#media-cancel').click();
 await page.locator('#media-status').filter({hasText:'Cancelled'}).waitFor();assert.equal(cancelled,true);
 console.log('PASS URL audio UI: multi-select, format selection, editable Unicode audio/ZIP names, extension correction, rename without re-conversion, real FLAC conversion, tool/tab isolation, mobile, cancellation, inert titles.');
}finally{await browser.close();await app.close();await rm(folder,{recursive:true,force:true});}
