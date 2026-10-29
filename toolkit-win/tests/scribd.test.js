import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {PDFDocument} from 'pdf-lib';
import {createToolkit} from '../src/server.js';import {scribdDocument,pdfName} from '../src/scribd/service.js';
const args=[fileURLToPath(new URL('./scribd-fixture-worker.js',import.meta.url))];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<100;i++){const value=await fn();if(value)return value;await pause(50);}throw new Error('Timed out');}
test('Scribd URL normalization only admits canonical HTTPS document URLs',()=>{
 assert.equal(scribdDocument('https://scribd.com/doc/123/title?tracking=a#page=2'),'https://www.scribd.com/doc/123/title');
 for(const url of ['https://scribd.com.evil.org/document/1/a','https://a:b@scribd.com/document/1/a','http://scribd.com/document/1/a','https://127.0.0.1/document/1/a','https://scribd.com:444/doc/1/a','https://scribd.com/books/1'])assert.throws(()=>scribdDocument(url));
 assert.equal(pdfName('../exam\n.pdf'),'.._exam_.pdf');assert.equal(pdfName('試卷'),'試卷.pdf');
});
test('Scribd jobs isolate views, deliver authenticated inline/download PDFs, cancel and expire',async t=>{
 const app=await createToolkit({port:0,scribdOptions:{command:process.execPath,args,retention:500}});t.after(()=>app.close());
 const first=await fetch(app.url),cookie=first.headers.get('set-cookie').split(';')[0];await first.text();
 const base={Cookie:cookie,'Content-Type':'application/json'};
 const view=async()=>await(await fetch(app.url+'api/views',{method:'POST',headers:base,body:'{}'})).json();
 const a=await view(),b=await view();
 const req=(action,method='GET',body,id=a.viewId)=>fetch(app.url+'api/scribd/'+action,{method,headers:{...base,'X-Toolkit-View':id},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await fetch(app.url+'api/scribd/start',{method:'POST',body:'{}'})).status,403);
 assert.equal((await req('start','POST',{url:'https://127.0.0.1/doc/123/a'})).status,400);
 await req('start','POST',{url:'https://www.scribd.com/document/123/exam',filename:'試卷.pdf'});
 assert.equal((await(await req('status','GET',null,b.viewId)).json()).state,'idle');
 const ready=await until(async()=>{const s=await(await req('status')).json();return s.state==='ready'&&s;});
 assert.equal(ready.pages,2);assert.equal(ready.filename,'試卷.pdf');
 const response=await fetch(new URL(ready.link,app.url),{headers:base});assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);assert.match(response.headers.get('Content-Disposition'),/^inline/);
 assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),2);
 const download=await fetch(new URL(ready.link+'?download=1',app.url),{headers:base});assert.match(download.headers.get('Content-Disposition'),/^attachment/);await download.arrayBuffer();
 assert.equal((await fetch(new URL(ready.link,app.url))).status,403);
 await until(async()=>(await(await req('status')).json()).state==='idle');
 assert.equal((await fetch(new URL(ready.link,app.url),{headers:base})).status,400);
 await req('start','POST',{url:'https://www.scribd.com/doc/999/wait'});
 assert.equal((await req('start','POST',{url:'https://www.scribd.com/doc/123/a'},b.viewId)).status,400);
 await req('cancel','POST');assert.equal((await(await req('status')).json()).state,'idle');
 await req('start','POST',{url:'https://www.scribd.com/doc/888/error'});
 const error=await until(async()=>{const s=await(await req('status')).json();return s.state==='error'&&s;});assert.match(error.message,/Fixture exporter failed/);
});
