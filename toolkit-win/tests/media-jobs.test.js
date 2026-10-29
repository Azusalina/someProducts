import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {open,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {MediaJobs} from '../src/media/jobs.js';
import {mediaState,runMediaProcess} from '../src/media/service.js';
import {createToolkit} from '../src/server.js';
const view=()=>{const value={};mediaState(value).entries=[{url:'https://example.com/audio',title:'Audio'}];return value;};
const options={ids:['0'],format:'flac'};

test('background audio survives polling disconnects, streams large files and supports retry/ranges',async t=>{
 const bytes=300*1024*1024+17;let folder;
 const jobs=new MediaJobs({download:async(entries,format,work,signal,report)=>{
  folder=work;report({stage:'converting',item:1,total:1});
  const file=await open(path.join(work,'long.flac'),'wx');
  try{await file.truncate(bytes);await file.write(Buffer.from('fLaC'),0,4,0);}finally{await file.close();}
  return 'long.flac';
 }});t.after(()=>jobs.close());
 const first=view(),second=view();assert.equal(jobs.start(first,options).state,'working');
 assert.throws(()=>jobs.start(first,options),/already/);assert.equal(jobs.status(second).state,'idle');
 await jobs.jobs.get(first).task;
 const ready=jobs.status(first);assert.equal(ready.state,'ready');assert.equal(ready.bytes,bytes);
 const server=http.createServer((req,res)=>jobs.send(ready.link.split('/').at(-1),req,res).catch(e=>{if(!res.headersSent)res.writeHead(e.status||500);res.end(e.message);}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes);
 const range=await fetch(url,{headers:{Range:'bytes=0-3'}});assert.equal(range.status,206);assert.equal(await range.text(),'fLaC');
 assert.equal(range.headers.get('content-range'),`bytes 0-3/${bytes}`);
 const tail=await fetch(url,{headers:{Range:'bytes=-17'}});assert.equal((await tail.arrayBuffer()).byteLength,17);
 const bad=await fetch(url,{headers:{Range:`bytes=${bytes}-`}});assert.equal(bad.status,416);await bad.text();
 // Abandon a full transfer, then retry without regenerating the FLAC.
 const interrupted=await fetch(url);await interrupted.body.cancel();
 const retry=await fetch(url,{headers:{Range:'bytes=0-3'}});assert.equal(await retry.text(),'fLaC');
 await jobs.clear(first);await assert.rejects(access(folder),{code:'ENOENT'});
 const expired=await fetch(url);assert.equal(expired.status,410);await expired.text();
});

test('cancel and failure release the shared worker slot, remove work and retain an actionable error',async t=>{
 let folder,started;
 const entered=new Promise(resolve=>started=resolve);
 const jobs=new MediaJobs({download:async(_entries,_format,work,signal)=>{
   folder=work;started();await new Promise((resolve,reject)=>{const abort=()=>reject(new Error('Cancelled.'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 }});t.after(()=>jobs.close());const first=view();jobs.start(first,options);await entered;await jobs.clear(first);
 assert.equal(mediaState(first).busy,false);await assert.rejects(access(folder),{code:'ENOENT'});
 jobs.download=async()=>{throw new Error('Upstream HTTP Error 400: Bad Request');};jobs.start(first,options);await jobs.jobs.get(first).task;
 assert.equal(jobs.status(first).state,'error');assert.match(jobs.status(first).message,/Upstream HTTP Error 400/);
 assert.equal(mediaState(first).busy,false);
});

test('result retention evicts old files and shutdown removes every result',async()=>{
 const jobs=new MediaJobs({maxRetained:1,download:async(_e,_f,folder)=>{await writeFile(path.join(folder,'audio.flac'),'fLaC');return 'audio.flac';}});
 const first=view(),second=view();jobs.start(first,options);await jobs.jobs.get(first).task;const old=jobs.jobs.get(first).folder;
 jobs.start(second,options);await jobs.jobs.get(second).task;
 assert.equal(jobs.status(first).state,'expired');await assert.rejects(access(old),{code:'ENOENT'});
 const current=jobs.jobs.get(second).folder;await jobs.close();await assert.rejects(access(current),{code:'ENOENT'});
});

test('progress is consumed incrementally without accumulating stdout for a long transfer',async()=>{
 const source=`for(let i=0;i<40000;i++)process.stdout.write(JSON.stringify({type:'progress',downloaded:i})+'\\n');process.stdout.write(JSON.stringify({filename:'audio.flac'})+'\\n');`;
 let count=0;const result=await runMediaProcess(process.execPath,['-e',source],{onProgress:value=>{assert.equal(value.type,'progress');count++;}});
 assert.equal(count,40000);assert.equal(JSON.parse(result).filename,'audio.flac');
});

test('job APIs require the local session, isolate tabs and use proper status codes',async t=>{
 const app=await createToolkit({port:0});t.after(()=>app.close());
 const unauth=await fetch(app.url+'api/media/start',{method:'POST',body:'{}'});assert.equal(unauth.status,403);await unauth.text();
 const page=await fetch(app.url);const cookie=page.headers.get('set-cookie').split(';')[0];await page.text();
 const headers={'Cookie':cookie,'Content-Type':'application/json'};
 const first=await(await fetch(app.url+'api/views',{method:'POST',headers,body:'{}'})).json();headers['X-Toolkit-View']=first.viewId;
 const state=await fetch(app.url+'api/media/status',{headers});assert.equal((await state.json()).state,'idle');
 const invalid=await fetch(app.url+'api/media/start',{method:'POST',headers,body:JSON.stringify(options)});assert.equal(invalid.status,400);await invalid.text();
 const file=await fetch(app.url+'api/media/file/'+'a'.repeat(48),{headers:{Cookie:cookie}});assert.equal(file.status,410);await file.text();
 const other=await fetch(app.url+'api/media/start',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'{}'});assert.equal(other.status,403);await other.text();
});
