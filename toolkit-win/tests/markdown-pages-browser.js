import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {chromium,firefox} from 'playwright-core';import {PDFDocument} from 'pdf-lib';
import {createToolkit} from '../src/server.js';import {findChromium} from '../src/core/pdf.js';
const folder=await mkdtemp(path.join(tmpdir(),'toolkit-math-pages-'));
const evidence=path.join(tmpdir(),'toolkit-validation','math-pages',process.argv.includes('--firefox')?'firefox':'chromium');await mkdir(evidence,{recursive:true});
const filename=path.join(folder,'math.md');
const lines=(prefix,count)=>Array.from({length:count},(_,i)=>`${prefix}${String(i+1).padStart(3,'0')}`).join('  \n');
const source=String.raw`# LaTeX preview

Inline $E=mc^2$ and \(\sqrt{x}\).

$$\frac{a}{b}=\int_0^1 x^2\,dx$$

| Formula | Result |
|---|---|
| $\alpha+\beta$ | $\frac{1}{2}$ |

## Lead

`+lines('LEAD',26)+String.raw`

## MoveTogether

`+lines('BODY',12)+String.raw`

\[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]

## Tail

FinalBody.
`;
await writeFile(filename,source);const app=await createToolkit({port:0,filename,interval:100});let browser;
try{
 browser=process.argv.includes('--firefox')?await firefox.launch({headless:true}):await chromium.launch({executablePath:await findChromium(),headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(app.url))external.push(r.url());});
 const response=()=>page.waitForResponse(r=>r.url().endsWith('/api/preview/pdf')&&r.status()===200);
 await page.goto(app.url);const frame=page.frameLocator('#preview');await frame.locator('.katex').first().waitFor();assert.equal(await frame.locator('.katex').count(),6);
 await frame.locator('body').evaluate(()=>document.fonts.ready);assert.equal(await frame.locator('body').evaluate(()=>document.fonts.check('16px KaTeX_Main')),true);
 assert.equal(await page.locator('#page-breaks').getAttribute('aria-pressed'),'false');await page.screenshot({path:path.join(evidence,'continuous.png'),fullPage:true});
 let pending=response();await page.locator('#page-breaks').click();const buffer=await(await pending).body();await writeFile(path.join(evidence,'preview-a4.pdf'),buffer);
 await page.locator('#pages-status').filter({hasText:/A4 · \d+ pages/}).waitFor();
 const pdf=await PDFDocument.load(buffer),count=pdf.getPageCount();assert.ok(count>=2);assert.equal(await page.locator('.paper-page').count(),count);
 const size=pdf.getPage(0).getSize();assert.ok(Math.abs(size.width-595.28)<1);assert.ok(Math.abs(size.height-841.89)<1);
 await page.locator('.paper-page[data-page="1"][data-rendered="true"]').waitFor();const box=await page.locator('.paper-sheet').first().boundingBox();assert.ok(Math.abs(box.width/box.height-210/297)<0.005);
 await page.screenshot({path:path.join(evidence,'a4-desktop.png'),fullPage:true});
 for(let number=1;number<=count;number++){const sheet=page.locator(`.paper-page[data-page="${number}"]`);await sheet.scrollIntoViewIfNeeded();await sheet.locator('canvas').waitFor();await sheet.screenshot({path:path.join(evidence,`a4-page-${number}.png`)});}
 async function textPages(bytes){return page.evaluate(async bytes=>{
  const lib=await import('/lib/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/lib/pdfjs/pdf.worker.mjs';
  const task=lib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl:'/lib/pdfjs/standard_fonts/'}),doc=await task.promise,result=[];
  for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);result.push((await p.getTextContent()).items.map(i=>i.str||'').join(' '));}await task.destroy();return result;
 },[...bytes]);}
 const texts=await textPages(buffer);assert.match(texts.join(' '),/FinalBody/);const moved=texts.findIndex(t=>t.includes('MoveTogether'));assert.ok(moved>=0);assert.match(texts[moved],/BODY001[\s\S]*BODY012/);
 let download=page.waitForEvent('download');await page.locator('#export-button').click();await(await download).saveAs(path.join(evidence,'export-a4.pdf'));
 const exported=await readFile(path.join(evidence,'export-a4.pdf'));assert.equal((await PDFDocument.load(exported)).getPageCount(),count);assert.deepEqual(await textPages(exported),texts);
 await page.locator('#source-tab').click();assert.equal(await page.locator('#markdown-pages').isVisible(),false);assert.match(await page.locator('#source').textContent(),/\$E=mc\^2\$/);
 await page.locator('#preview-tab').click();await page.locator('#zen-button').click();assert.equal(Math.round((await page.locator('#markdown-pages').boundingBox()).height),1100);
 await page.locator('#markdown-pages').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('zen-mode')),false);
 pending=response();await page.locator('#pdf-background').selectOption('yellow');await pending;await page.locator('#pages-status').filter({hasText:/A4 ·/}).waitFor();await page.locator('.paper-page[data-page="1"] canvas').waitFor();
 assert.deepEqual(await page.locator('.paper-page[data-page="1"] canvas').evaluate(c=>[...c.getContext('2d').getImageData(5,5,1,1).data].slice(0,3)),[255,244,204]);
 pending=response();await page.locator('#paper').selectOption('Letter');const letter=await(await pending).body();await page.locator('#pages-status').filter({hasText:/Letter ·/}).waitFor();assert.ok(Math.abs((await PDFDocument.load(letter)).getPage(0).getWidth()-612)<1);
 pending=response();await writeFile(filename,source.replace('FinalBody.','UPDATED-FORMULA $z^3$.'));const updated=await(await pending).body();assert.match((await textPages(updated)).join(' '),/UPDATED-FORMULA/);await page.locator('#pages-status').filter({hasText:/Letter ·/}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#markdown-pages').evaluate(e=>e.scrollTop=0);await page.locator('.paper-page[data-page="1"] canvas').waitFor();await page.screenshot({path:path.join(evidence,'pages-mobile.png'),fullPage:true});
 const started=page.waitForRequest(r=>r.url().endsWith('/api/preview/pdf'));await page.locator('#pdf-background').selectOption('black');await started;await page.locator('#page-breaks').click();assert.equal(await page.locator('#markdown-pages').isVisible(),false);assert.equal(await page.locator('#preview').isVisible(),true);await page.locator('#preview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'continuous-mobile.png'),fullPage:true});assert.equal(await page.locator('#preview').evaluate(f=>f.contentDocument.querySelectorAll('.katex').length),7);
 const second=await context.newPage();await second.goto(app.url);await second.waitForFunction(()=>history.state?.toolkitView,null,{timeout:15000});assert.equal(await second.locator('#page-breaks').getAttribute('aria-pressed'),'false');await second.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await readFile(filename,'utf8'),source.replace('FinalBody.','UPDATED-FORMULA $z^3$.'));
 console.log('PASS LaTeX + pages: offline fonts, A4/Letter dimensions, exact PDF page/text agreement, section grouping, paper colors, live updates, Source, Zen, cancellation, page-local mode and mobile. '+evidence);
}finally{await browser?.close();await app.close();await rm(folder,{recursive:true,force:true});}
