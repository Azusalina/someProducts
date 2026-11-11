import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {PDFDocument} from 'pdf-lib';
import {findOffice} from '../src/office/runtime.js';
import {officeOptions} from '../src/office/service.js';
import {createToolkit} from '../src/server.js';
const run=promisify(execFile),fixture=name=>new URL(`./fixtures/office/${name}`,import.meta.url);
let executable;try{executable=findOffice();}catch(error){if(process.env.TOOLKIT_REQUIRE_OFFICE)throw error;}
async function session(app){
  const page=await fetch(app.url),cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
  const headers={Cookie:cookie,'Content-Type':'application/json'};
  const view=await(await fetch(app.url+'api/views',{method:'POST',headers,body:'{}'})).json();
  return {...headers,'X-Toolkit-View':view.viewId};
}
async function eventually(check){for(let n=0;n<300;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Timed out waiting for Office cleanup');}

test('Office discovery supports Windows console executable, quoted overrides, case-insensitive PATH and missing dependency',()=>{
  const file='C:\\Program Files\\LibreOffice\\program\\soffice.com';
  assert.equal(findOffice({platform:'win32',env:{ProgramFiles:'C:\\Program Files'},exists:value=>value===file}),file);
  assert.equal(findOffice({platform:'win32',env:{TOOLKIT_LIBREOFFICE:'"'+file+'"'},exists:value=>value===file}),file);
  assert.equal(findOffice({platform:'win32',env:{Path:'C:\\Office'},exists:value=>value==='C:\\Office\\soffice.exe'}),'C:\\Office\\soffice.exe');
  assert.throws(()=>findOffice({env:{},exists:()=>false}),/Install LibreOffice/);
  assert.throws(()=>findOffice({env:{TOOLKIT_LIBREOFFICE:'/missing'},exists:()=>false}),/TOOLKIT_LIBREOFFICE/);
  for(const extension of ['doc','docx','xls','xlsx'])assert.match(officeOptions(extension),/pdf_Export/);
  assert.throws(()=>officeOptions('../docx'));assert.throws(()=>officeOptions('docx','single'));
});

test('actual Word/Excel conversion preserves originals, pages, sheet layout, auth and cleans isolated profiles',{skip:!executable},async t=>{
  const work=await mkdtemp(path.join(tmpdir(),'toolkit-office-test-'));
  const app=await createToolkit({port:0,officeOptions:{workRoot:work}});t.after(async()=>{await app.close();await rm(work,{recursive:true,force:true});});
  const headers=await session(app),hashes=[];
  for(const [filename,extension,sheets]of [['document.docx','docx','print'],['workbook.xlsx','xlsx','print'],['workbook.xlsx','xlsx','single']]){
    const bytes=await readFile(fixture(filename));hashes.push([filename,bytes]);
    const response=await fetch(`${app.url}api/office/convert?extension=${extension}&sheets=${sheets}`,{method:'POST',headers,body:bytes});
    assert.equal(response.status,200,response.ok?'':await response.text());assert.equal(response.headers.get('content-type'),'application/pdf');
    const pdf=await PDFDocument.load(await response.arrayBuffer());
    if(extension==='docx')assert.equal(pdf.getPageCount(),2);
    else if(sheets==='single')assert.equal(pdf.getPageCount(),3);else assert.ok(pdf.getPageCount()>3);
    await eventually(async()=>(await readdir(work)).length===0);
  }
  for(const [name,bytes]of hashes)assert.deepEqual(await readFile(fixture(name)),bytes);
  for(const [extension,body,status]of [['docx',Buffer.from('bad'),400],['pdf',Buffer.from('data'),415],['docx',Buffer.alloc(0),400]]){
    const response=await fetch(`${app.url}api/office/convert?extension=${extension}`,{method:'POST',headers,body});assert.equal(response.status,status);await response.text();
  }
  const unauth=await fetch(app.url+'api/office/convert?extension=docx',{method:'POST',body:'data'});assert.equal(unauth.status,403);await unauth.text();
  const foreign=await fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'data'});assert.equal(foreign.status,403);await foreign.text();
  await eventually(async()=>(await readdir(work)).length===0);
});

test('legacy DOC and XLS inputs produce real PDFs',{skip:!executable},async t=>{
  const folder=await mkdtemp(path.join(tmpdir(),'toolkit-office-legacy-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const app=await createToolkit({port:0});t.after(()=>app.close());const headers=await session(app);
  for(const [filename,extension,filter]of [['document.docx','doc','doc:MS Word 97'],['workbook.xlsx','xls','xls:MS Excel 97']]){
    await run(executable,[`-env:UserInstallation=${pathToFileURL(path.join(folder,extension+'-profile')).href}`,'--headless','--convert-to',filter,'--outdir',folder,fileURLToPath(fixture(filename))],{windowsHide:true,timeout:60000});
    const body=await readFile(path.join(folder,filename.replace(/\.[^.]+$/,'.'+extension)));
    const response=await fetch(`${app.url}api/office/convert?extension=${extension}`,{method:'POST',headers,body});
    assert.equal(response.status,200,response.ok?'':await response.text());const pdf=await PDFDocument.load(await response.arrayBuffer());assert.ok(pdf.getPageCount()>=2);
  }
});

test('concurrency, disconnect cancellation, timeout and shutdown clean owned jobs',async t=>{
  const folder=await mkdtemp(path.join(tmpdir(),'toolkit-office-cancel-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const app=await createToolkit({port:0,officeOptions:{executable:process.execPath,args:['-e','setInterval(()=>{},1000)','--'],timeout:3000,workRoot:folder}});
  t.after(()=>app.close());const headers=await session(app),controller=new AbortController();
  const pending=fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers,body:await readFile(fixture('document.docx')),signal:controller.signal});pending.catch(()=>{});
  await eventually(async()=>(await readdir(folder)).length===1);
  const conflict=await fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers,body:'x'});assert.equal(conflict.status,409);await conflict.text();
  const body=await readFile(fixture('document.docx'));
  const secondHeaders=await session(app),secondController=new AbortController();
  const second=fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers:secondHeaders,body,signal:secondController.signal});second.catch(()=>{});
  await eventually(async()=>(await readdir(folder)).length===2);
  const third=await fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers:await session(app),body});assert.equal(third.status,409);await third.text();
  controller.abort();secondController.abort();await assert.rejects(pending,/abort/i);await assert.rejects(second,/abort/i);
  await eventually(async()=>(await readdir(folder)).length===0);
  const timeout=await fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers,body:await readFile(fixture('document.docx'))});assert.equal(timeout.status,504);assert.match((await timeout.json()).error,/timed out/);
  await eventually(async()=>(await readdir(folder)).length===0);
  const duringShutdown=fetch(app.url+'api/office/convert?extension=docx',{method:'POST',headers,body});
  await eventually(async()=>(await readdir(folder)).length===1);
  await app.close();assert.equal((await duringShutdown).status,400);
  assert.equal((await readdir(folder)).length,0);
});
