import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./worker.py', import.meta.url));
const localPython = fileURLToPath(new URL(process.platform === 'win32' ? '../../.venv-media/Scripts/python.exe' : '../../.venv-media/bin/python', import.meta.url));
const LIMIT = 250 * 1024 * 1024;
const types = {'.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.opus':'audio/ogg','.ogg':'audio/ogg','.wav':'audio/wav','.zip':'application/zip'};
const states = new WeakMap();
let running = 0;
export function mediaState(view) {
  if (!states.has(view)) states.set(view, { entries: [], busy: false });
  return states.get(view);
}
export function abortMedia(view) { states.get(view)?.controller?.abort(); }
export function mediaFormat(format, original = true) {
  if (!(original ? ['mp3','flac','original'] : ['mp3','flac']).includes(format)) throw new Error('Choose MP3 or FLAC audio.');
  return format;
}
export function publicMediaUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Enter a public HTTP(S) URL.');
  let url; try { url = new URL(value); } catch { throw new Error('Enter a valid HTTP(S) URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public HTTP(S) URL without login credentials.');
  return url.href;
}
async function sizeOf(folder) {
  let size = 0;
  for (const name of await readdir(folder)) size += (await stat(path.join(folder,name)).catch(()=>({size:0}))).size;
  return size;
}
export async function runMediaProcess(command, args, { input, signal, folder, timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled.'));
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio:['pipe','pipe','pipe'] });
    let out='', err='', failure;
    const stop = reason => {
      failure ||= new Error(reason);
      try { if (process.platform !== 'win32') process.kill(-child.pid,'SIGKILL'); else child.kill('SIGKILL'); } catch {}
    };
    const abort = () => stop('Cancelled.');
    const timer = setTimeout(()=>stop('Media operation timed out. Try a smaller selection.'),timeout);
    const check = folder ? setInterval(async()=>{try{if(await sizeOf(folder)>LIMIT)stop('Media exceeds the 250 MB working-file limit.');}catch{}},250) : null;
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',data=>{out+=data;if(out.length>2*1024*1024)stop('Media listing is too large.');});
    child.stderr.on('data',data=>{err=(err+data).slice(-4000);});
    child.stdin.on('error',()=>{});
    child.on('error',error=>{failure=error.code==='ENOENT'?new Error('Media dependency missing. Run npm run media:setup and install FFmpeg.'):error;});
    child.on('close',code=>{
      clearTimeout(timer);clearInterval(check);signal?.removeEventListener('abort',abort);
      if(failure||code!==0)reject(failure||new Error(err.trim()||'Media processing failed.'));
      else resolve(out);
    });
    child.stdin.end(input ? JSON.stringify(input) : undefined);
  });
}
async function worker(input, options) {
  const python=process.env.TOOLKIT_MEDIA_PYTHON || (existsSync(localPython)?localPython:'python3');
  const stdout=await runMediaProcess(python,[script],{...options,input});
  return JSON.parse(stdout);
}
export async function scanMedia(view, url, signal) {
  const state=mediaState(view);
  if(state.busy)throw new Error('A media operation is already running in this page.');
  if(running>=2)throw new Error('Two media operations are running. Please wait.');
  state.busy=true;running++;
  const controller=new AbortController(); state.controller=controller;
  const cancel=()=>controller.abort(); signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)controller.abort();
  try {
    const rows=await worker({action:'scan',url:publicMediaUrl(url)},{signal:controller.signal,timeout:90000});
    state.entries=rows;
    return rows.map(({title,kind,duration},index)=>({id:String(index),title,kind,duration}));
  } finally {signal?.removeEventListener('abort',cancel);state.controller=null;state.busy=false;running--;}
}
export async function withMediaWork(view, res, fn) {
  const state=mediaState(view);
  if(state.busy)throw new Error('A media operation is already running in this page.');
  if(running>=2)throw new Error('Two media operations are running. Please wait.');
  state.busy=true;running++;
  const controller=new AbortController(); state.controller=controller;
  const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
  let folder;
  try {folder=await mkdtemp(path.join(tmpdir(),'toolkit-media-'));return await fn(folder,controller.signal);}
  finally {state.controller=null;state.busy=false;running--;res.off('close',cancel);if(folder)await rm(folder,{recursive:true,force:true});}
}
export async function downloadMedia(view, options, folder, signal) {
  const {entries}=mediaState(view), ids=options.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id)||!entries[Number(id)]))throw new Error('Select between 1 and 20 listed media items.');
  const selected=ids.map(id=>entries[Number(id)]);
  const result=await worker({action:'download',entries:selected,format:mediaFormat(options.format),folder},{signal,folder});
  if(path.basename(result.filename)!==result.filename)throw new Error('Invalid audio output.');
  return result.filename;
}
export async function convertMedia(folder, format, signal) {
  mediaFormat(format,false);
  const filename=`converted.${format}`;
  await runMediaProcess(process.env.TOOLKIT_FFMPEG||'ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file,pipe','-format_whitelist','wav,mp3,flac,ogg,mov,matroska,webm,aac,aiff,asf,avi,mpegts,mpeg','-i',path.join(folder,'input'),'-map','0:a:0','-vn',...(format==='mp3'?['-c:a','libmp3lame','-q:a','0']:['-c:a','flac']),path.join(folder,filename)],{signal,folder});
  return filename;
}
export async function sendMedia(res, folder, filename) {
  const file=path.join(folder,filename);
  if((await stat(file)).size>LIMIT)throw new Error('Output exceeds the 250 MB limit.');
  res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Disposition':`attachment; filename="audio${path.extname(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`});
  await pipeline(createReadStream(file),res);
}
