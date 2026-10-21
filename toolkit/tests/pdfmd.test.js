import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {exportPdf} from '../src/core/pdf.js';
import {createToolkit} from '../src/server.js';

test('MarkItDown API extracts real English/CJK PDF text, rejects missing text and keeps authentication',async t=>{
 const app=await createToolkit({port:0});t.after(()=>app.close());
 const first=await fetch(app.url),cookie=first.headers.get('set-cookie').split(';')[0];await first.text();
 const details=await(await fetch(`${app.url}api/views`,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).json();
 const headers={Cookie:cookie,'X-Toolkit-View':details.viewId,'Content-Type':'application/pdf'};
 const pdf=await exportPdf('<h1>Conversion fixture</h1><p>中文轉換測試</p><ul><li>First item</li><li>Second item</li></ul><table><tr><th>Item</th><th>Value</th></tr><tr><td>Alpha</td><td>123</td></tr></table>', 'body{font-family:"Noto Sans CJK TC",sans-serif;line-height:1.8}',{paper:'A4'});
 const original=Buffer.from(pdf);
 const response=await fetch(`${app.url}api/pdfmd/convert`,{method:'POST',headers,body:pdf});
 assert.equal(response.status,200,await response.clone().text());
 const result=await response.json();assert.equal(result.converter,'MarkItDown');assert.equal(result.version,'0.1.8');
 for(const text of ['Conversion fixture','中文轉換測試','First item','Second item','Alpha','123'])assert.ok(result.markdown.normalize('NFKC').includes(text),text);
 assert.deepEqual(pdf,original);
 assert.equal((await fetch(`${app.url}api/pdfmd/convert`,{method:'POST',body:pdf})).status,403);
 const bad=await fetch(`${app.url}api/pdfmd/convert`,{method:'POST',headers,body:'Not a PDF'});assert.equal(bad.status,400);assert.match((await bad.json()).error,/valid PDF/);
 const empty=await PDFDocument.create();empty.addPage();
 const scan=await fetch(`${app.url}api/pdfmd/convert`,{method:'POST',headers,body:await empty.save()});assert.equal(scan.status,400);assert.match((await scan.json()).error,/OCR/);
});
