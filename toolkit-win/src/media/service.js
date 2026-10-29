import {pythonExecutable,nativeTool,stopProcessTree} from '../platform/runtime.js';
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
export const URL_AUDIO_LIMIT = 2 * 1024 ** 3;
export const URL_AUDIO_WORK_LIMIT = 4 * 1024 ** 3;
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
  let size=0;
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const filename=path.join(folder,entry.name);
    if(entry.isDirectory())size+=await sizeOf(filename);
    else if(entry.isFile())size+=(await stat(filename).catch(()=>({size:0}))).size;
  }
  return size;
}
export async function runMediaProcess(command, args, { input, signal, folder, timeout = 600000, maxWorkBytes = LIMIT, env = process.env, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled.'));
    const child = spawn(command, args, { env, detached: process.platform !== 'win32', windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let out='', err='', pending='', failure;
    const stop = reason => {
      failure ||= new Error(reason);
      stopProcessTree(child);
    };
    const abort = () => stop('Cancelled.');
    const timer = setTimeout(()=>stop('Media operation timed out. Try a smaller selection.'),timeout);
    let checking=false;
    const check = folder ? setInterval(async()=>{if(checking)return;checking=true;try{if(await sizeOf(folder)>maxWorkBytes)stop(`Conversion exceeds its ${maxWorkBytes/1024/1024} MB working-file limit.`);}catch{}finally{checking=false;}},1000) : null;
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',data=>{
      if(!onProgress)out+=data;
      else {
        pending+=data;
        let end;
        while((end=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,end);pending=pending.slice(end+1);
          let value;try{value=JSON.parse(line);}catch{}
          if(value?.type==='progress')onProgress(value);
          else out+=line+'\n';
        }
      }
      if(out.length+pending.length>2*1024*1024)stop('Media listing is too large.');
    });
    child.stderr.on('data',data=>{err=(err+data).slice(-4000);});
    child.stdin.on('error',()=>{});
    child.on('error',error=>{failure=error.code==='ENOENT'?new Error('Media dependency missing. Run npm run media:setup and npm run ffmpeg:setup.'):error;});
    child.on('close',code=>{
      clearTimeout(timer);clearInterval(check);signal?.removeEventListener('abort',abort);
      if(failure||code!==0)reject(failure||new Error(err.trim()||'Media processing failed.'));
      else resolve(out+pending);
    });
    child.stdin.end(input ? JSON.stringify(input) : undefined);
  });
}
async function worker(input, options) {
  const python=pythonExecutable('TOOLKIT_MEDIA_PYTHON','.venv-media');
  const stdout=await runMediaProcess(python,[script],{...options,input,env:{...process.env,TOOLKIT_FFMPEG:nativeTool('ffmpeg','TOOLKIT_FFMPEG'),TOOLKIT_FFPROBE:nativeTool('ffprobe','TOOLKIT_FFPROBE')}});
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
export function assertMediaAvailable(view) {
  if(mediaState(view).busy)throw Object.assign(new Error('A media operation is already running in this page.'),{status:409});
  if(running>=2)throw Object.assign(new Error('Two media operations are running. Please wait.'),{status:409});
}
export async function withMediaTask(view, fn, signal) {
  assertMediaAvailable(view);
  const state=mediaState(view),controller=new AbortController();
  state.busy=true;state.controller=controller;running++;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)controller.abort();
  try{return await fn(controller.signal);}
  finally{signal?.removeEventListener('abort',cancel);state.controller=null;state.busy=false;running--;}
}
export async function withMediaWork(view, res, fn) {
  const controller=new AbortController();
  const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
  let folder;
  try{return await withMediaTask(view,async signal=>{
    folder=await mkdtemp(path.join(tmpdir(),'toolkit-media-'));
    return await fn(folder,signal);
  },controller.signal);}
  finally{res.off('close',cancel);if(folder)await rm(folder,{recursive:true,force:true});}
}
export function selectedMedia(view, options) {
  const {entries}=mediaState(view),ids=options.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id)||!entries[Number(id)]))throw new Error('Select between 1 and 20 listed media items.');
  mediaFormat(options.format);
  return ids.map(id=>entries[Number(id)]);
}
export async function downloadMediaEntries(entries, format, folder, signal, onProgress) {
  const result=await worker({action:'download',entries,format:mediaFormat(format),folder,progress:!!onProgress},
    {signal,folder,onProgress,timeout:60*60_000,maxWorkBytes:URL_AUDIO_WORK_LIMIT});
  if(typeof result.filename!=='string'||!result.filename||path.basename(result.filename)!==result.filename)throw new Error('Invalid audio output.');
  return result.filename;
}
export async function downloadMedia(view, options, folder, signal) {
  return downloadMediaEntries(selectedMedia(view,options),options.format,folder,signal);
}
export async function convertMedia(folder, format, signal) {
  mediaFormat(format,false);
  const filename=`converted.${format}`;
  await runMediaProcess(nativeTool('ffmpeg','TOOLKIT_FFMPEG'),['-nostdin','-v','error','-protocol_whitelist','file,pipe','-format_whitelist','wav,mp3,flac,ogg,mov,matroska,webm,aac,aiff,asf,avi,mpegts,mpeg','-i',path.join(folder,'input'),'-map','0:a:0','-vn',...(format==='mp3'?['-c:a','libmp3lame','-q:a','0']:['-c:a','flac']),path.join(folder,filename)],{signal,folder});
  return filename;
}
export async function sendMedia(res, folder, filename, { maxBytes = LIMIT, contentType } = {}) {
  const file=path.join(folder,filename);
  if((await stat(file)).size>maxBytes)throw new Error(`Output exceeds the ${maxBytes/1024/1024} MB limit.`);
  res.writeHead(200,{'Content-Type':contentType||types[path.extname(filename)]||'application/octet-stream','Content-Disposition':`attachment; filename="audio${path.extname(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`});
  await pipeline(createReadStream(file),res);
}
