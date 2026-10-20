import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {EventEmitter} from 'node:events';
import {createToolkit} from '../src/server.js';
import {mediaFormat, publicMediaUrl, runMediaProcess, withMediaWork} from '../src/media/service.js';
const run=promisify(execFile);

test('media inputs reject non-HTTP URLs, embedded credentials and unsupported formats',()=>{
 for(const url of ['file:///etc/passwd','ftp://example.com/a','https://x:y@example.com/a','bad'])assert.throws(()=>publicMediaUrl(url));
 assert.equal(publicMediaUrl('https://example.com/a'),'https://example.com/a');
 for(const format of ['mp3','flac','original'])assert.equal(mediaFormat(format),format);
 assert.throws(()=>mediaFormat('original',false));assert.throws(()=>mediaFormat('wav'));
});

test('media child processes stop on cancellation and timeouts',async()=>{
 const controller=new AbortController();
 const job=runMediaProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
 controller.abort();await assert.rejects(job,/Cancelled/);
 await assert.rejects(runMediaProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}),/timed out/);
});

test('media API converts real audio both ways, scopes selections to views and blocks local URL access',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'toolkit-media-api-'));
 const app=await createToolkit({port:0});
 t.after(async()=>{await app.close();await rm(folder,{recursive:true,force:true});});
 await run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.3',path.join(folder,'input.wav')]);
 const first=await fetch(app.url);const cookie=first.headers.get('set-cookie').split(';')[0];await first.text();
 const headers={'Cookie':cookie,'Content-Type':'application/json'};
 const view=await(await fetch(`${app.url}api/views`,{method:'POST',headers,body:'{}'})).json();
 const scoped={...headers,'X-Toolkit-View':view.viewId};
 assert.equal((await fetch(`${app.url}api/media/convert?format=mp3`,{method:'POST',body:'data'})).status,403);
 let bytes=await readFile(path.join(folder,'input.wav'));
 for(const format of ['flac','mp3','flac']){
  const response=await fetch(`${app.url}api/media/convert?format=${format}`,{method:'POST',headers:{...scoped,'Content-Type':'application/octet-stream'},body:bytes});
  assert.equal(response.status,200,await response.clone().text().catch(()=>''));
  bytes=Buffer.from(await response.arrayBuffer());
  const output=path.join(folder,`converted.${format}`);await (await import('node:fs/promises')).writeFile(output,bytes);
  const {stdout}=await run('ffprobe',['-v','error','-show_entries','stream=codec_name','-of','json',output]);
  assert.equal(JSON.parse(stdout).streams[0].codec_name,format);
 }
 const invalid=await fetch(`${app.url}api/media/audio`,{method:'POST',headers:scoped,body:JSON.stringify({ids:['0'],format:'mp3'})});
 assert.equal(invalid.status,400);await invalid.text();
 const forbidden=await fetch(`${app.url}api/media/scan`,{method:'POST',headers:scoped,body:JSON.stringify({url:app.url})});
 assert.equal(forbidden.status,400);assert.match((await forbidden.json()).error,/private network/);
});

test('media work directories are removed after success and failure',async()=>{
 const res=new EventEmitter();res.writableEnded=false;
 let target;
 await withMediaWork({},res,async folder=>{target=folder;await access(folder);});
 await assert.rejects(access(target),{code:'ENOENT'});
 await assert.rejects(withMediaWork({},res,async folder=>{target=folder;throw new Error('Test failure');}),/Test failure/);
 await assert.rejects(access(target),{code:'ENOENT'});
});
