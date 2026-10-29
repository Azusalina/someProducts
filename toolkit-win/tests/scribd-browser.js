import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {mkdir,readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';import {chromium} from 'playwright-core';
import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const args=[fileURLToPath(new URL('./scribd-fixture-worker.js',import.meta.url))];
const app=await createToolkit({port:0,scribdOptions:{command:process.execPath,args}});
const browser=await chromium.launch({executablePath:await findChromium(),headless:true});
try{
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/frame-ancestors/.test(m.text()))errors.push(m.text());});
 await page.goto(app.url);await page.waitForFunction(()=>history.state?.toolkitView);
 await page.getByRole('button',{name:'Scribd PDF',exact:true}).click();
 await page.locator('#scribd-url').fill('https://www.scribd.com/document/123/exam');
 await page.locator('#scribd-name').fill('經濟試卷.pdf');await page.locator('#scribd-generate').click();
 await page.locator('#scribd-download').waitFor({state:'visible'});
 assert.match(await page.locator('#scribd-preview').getAttribute('src'),/\/api\/scribd\/file\/[a-f0-9]{48}#view=FitH/);
 const ready=page.waitForEvent('download');await page.locator('#scribd-download').click();const download=await ready;
 assert.equal(download.suggestedFilename(),'經濟試卷.pdf');assert.equal((await PDFDocument.load(await readFile(await download.path()))).getPageCount(),2);
 await mkdir('/tmp/toolkit-validation/scribd',{recursive:true});await download.saveAs('/tmp/toolkit-validation/scribd/browser-fixture.pdf');
 await page.waitForTimeout(1500);await page.screenshot({path:'/tmp/toolkit-validation/scribd/desktop.png',fullPage:true});
 const second=await browser.newPage();await second.goto(app.url);await second.getByRole('button',{name:'Scribd PDF',exact:true}).click();assert.equal(await second.locator('#scribd-url').inputValue(),'');assert.equal(await second.locator('#scribd-result').isHidden(),true);await second.close();
 await page.locator('#scribd-url').fill('https://www.scribd.com/doc/999/wait');assert.equal(await page.locator('#scribd-result').isHidden(),true);
 await page.locator('#scribd-generate').click();await page.locator('#scribd-cancel').waitFor({state:'visible'});await page.locator('#scribd-cancel').click();await page.locator('#scribd-status').filter({hasText:'Cancelled'}).waitFor();
 await page.locator('#scribd-url').fill('https://www.scribd.com/doc/888/error');await page.locator('#scribd-generate').click();await page.locator('#scribd-status').filter({hasText:'Fixture exporter failed'}).waitFor();assert.equal(await page.locator('#scribd-result').isHidden(),true);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/toolkit-validation/scribd/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS Scribd browser: generated PDF preview/link, Unicode filename download, isolated tabs, cancellation, errors and mobile. Source export tested separately with actual Selenium.');
}finally{await browser.close();await app.close();}
