import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,firefox} from 'playwright-core';
import {PDFDocument,PDFName,PDFRawStream} from 'pdf-lib';
import {createToolkit} from '../src/server.js';
import {findChromium} from '../src/core/pdf.js';
const folder=await mkdtemp(path.join(tmpdir(),'toolkit-html-browser-'));
const evidence=path.join(tmpdir(),'toolkit-validation','markdown-html',process.argv.includes('--firefox')?'firefox':'chromium');await mkdir(evidence,{recursive:true});
const filename=path.join(folder,'notes.md');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6E4IAAAAASUVORK5CYII=','base64');
await writeFile(path.join(folder,'pixel.png'),pixel);
const source=[
 '# HTML in <span>Markdown</span>', '',
 '| Element | Rendered content |','|---|---|',
 '| Break | <span id="cell-lines">TABLE-FIRST<br>TABLE-SECOND</span> |',
 '| Script sizes | <span id="cell-formula">H<sub>2</sub>O + x<sup>2</sup></span> |',
 '| Style | <span id="cell-color" style="color:#b00020;font-weight:700">STYLED-CELL</span> |',
 '| List | <ul id="cell-list"><li>TABLE-LIST-ONE</li><li>TABLE-LIST-TWO</li></ul> |',
 '| Image | <img id="html-image" src="pixel.png" width="32" alt="Local pixel"> |', '',
 '<div id="outside" style="text-align:center;border:1px solid #888;padding:8px">',
 '<strong>OUTSIDE-BLOCK</strong><br><em>OUTSIDE-ITALIC</em> · <u>UNDERLINED</u>',
 '</div>', '',
 '<table id="html-table"><caption>RAW-HTML-TABLE</caption><tbody><tr><td id="merged" colspan="2" align="center">MERGED-CELL</td></tr><tr><td>LEFT-CELL</td><td>RIGHT-CELL</td></tr></tbody></table>', '',
 '<a href="https://example.com/read" onclick="window.HACKED=true">Safe link</a>', '',
 '<script>window.HACKED=true</script>', '<iframe src="https://example.com/frame"></iframe>',
 '<img src="https://example.com/remote.png" alt="remote" onerror="window.HACKED=true">', '',
 '```html', '<b>LITERAL-CODE</b>', '```',
].join('\n');
await writeFile(filename,source);
const app=await createToolkit({port:0,filename});let browser;
try {
 browser=process.argv.includes('--firefox')?await firefox.launch({headless:true}):await chromium.launch({executablePath:await findChromium(),headless:true});
 const context=await browser.newContext({viewport:{width:1380,height:1000},acceptDownloads:true});
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(app.url))external.push(request.url());});
 await page.goto(app.url);const frame=page.frameLocator('#preview');
 await frame.locator('#cell-lines').waitFor();assert.equal(await frame.locator('#cell-lines br').count(),1);
 assert.equal(await frame.locator('#cell-list li').count(),2);
 assert.equal(await frame.locator('#cell-color').evaluate(element=>getComputedStyle(element).color),'rgb(176, 0, 32)');
 assert.equal(await frame.locator('#outside').evaluate(element=>getComputedStyle(element).textAlign),'center');
 assert.equal(await frame.locator('#merged').evaluate(element=>getComputedStyle(element).textAlign),'center');
 assert.equal(await frame.locator('#merged').getAttribute('colspan'),'2');
 assert.equal(await frame.locator('#cell-formula sub').textContent(),'2');assert.equal(await frame.locator('#cell-formula sup').textContent(),'2');
 await page.waitForFunction(()=>document.querySelector('#preview').contentDocument.querySelector('#html-image')?.naturalWidth===1);
 assert.equal(await frame.locator('#html-image').evaluate(element=>Math.round(element.getBoundingClientRect().width)),32);
 assert.equal(await frame.locator('body').evaluate(()=>window.HACKED),undefined);
 assert.equal(await frame.locator('script,iframe').count(),0);
 assert.match(await frame.locator('pre code').textContent(),/<b>LITERAL-CODE<\/b>/);
 assert.equal(await page.locator('#outline a').first().textContent(),'HTML in Markdown');
 assert.equal(await frame.getByRole('link',{name:'Safe link'}).getAttribute('rel'),'noopener noreferrer');
 await page.screenshot({path:path.join(evidence,'preview.png'),fullPage:true});
 const downloading=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloading;
 assert.equal(download.suggestedFilename(),'notes.pdf');const pdfFile=path.join(evidence,'notes.pdf');await download.saveAs(pdfFile);
 const data=await readFile(pdfFile),pdf=await PDFDocument.load(data);assert.ok(pdf.getPageCount()>=1);
 assert.ok(pdf.context.enumerateIndirectObjects().some(([,object])=>object instanceof PDFRawStream&&object.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'));
 // Extract PDF text using the same offline PDF.js assets; works on Windows
 // runners too, with no Poppler or Python dependency for this check.
 const text=await page.evaluate(async bytes=>{
  const library=await import('/lib/pdfjs/pdf.mjs');library.GlobalWorkerOptions.workerSrc='/lib/pdfjs/pdf.worker.mjs';
  const task=library.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,standardFontDataUrl:'/lib/pdfjs/standard_fonts/',cMapUrl:'/lib/pdfjs/cmaps/',cMapPacked:true,wasmUrl:'/lib/pdfjs/wasm/'});
  const doc=await task.promise,rows=[];
  for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);for(const item of (await page.getTextContent()).items)if(item.str)rows.push({text:item.str,y:item.transform[5],page:n});}
  await task.destroy();return rows;
 },[...data]);
 const all=text.map(item=>item.text).join(' ');
 for(const marker of ['TABLE-FIRST','TABLE-SECOND','STYLED-CELL','TABLE-LIST-ONE','OUTSIDE-BLOCK','RAW-HTML-TABLE','MERGED-CELL','LEFT-CELL','RIGHT-CELL','<b>LITERAL-CODE</b>'])assert.ok(all.includes(marker),marker);
 const first=text.find(item=>item.text.includes('TABLE-FIRST')),second=text.find(item=>item.text.includes('TABLE-SECOND'));
 assert.equal(first.page,second.page);assert.ok(first.y>second.y,'HTML br creates separate printed lines');
 assert.doesNotMatch(all,/<br\s*\/?\s*>|<span|<div/);
 assert.deepEqual((await readdir(folder)).sort(),['notes.md','pixel.png']);assert.equal(await readFile(filename,'utf8'),source);
 await writeFile(filename,source.replace('OUTSIDE-BLOCK','SAVED-HTML-UPDATE'));
 await frame.locator('#outside strong').filter({hasText:'SAVED-HTML-UPDATE'}).waitFor();
 assert.equal(await frame.locator('#cell-list li').count(),2);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('PASS HTML: Markdown cells, standalone blocks, HTML tables, inline styles/alignment, lists/sub/sup, local images, literal code, live saved edits and actual PDF line breaks/text/image embedding; no remote requests or script execution.');
}finally{await browser?.close();await app.close();await rm(folder,{recursive:true,force:true});}
