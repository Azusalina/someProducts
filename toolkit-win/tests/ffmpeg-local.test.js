import test from 'node:test';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {nativeTool} from '../src/platform/runtime.js';
const local=name=>nativeTool(name,'TOOLKIT_FFMPEG');
import {convertFormat} from '../src/formats/service.js';
const run=promisify(execFile);
test('conversion uses project FFmpeg/ffprobe with system PATH and overrides unavailable',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'toolkit-local-ffmpeg-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const saved={PATH:process.env.PATH,TOOLKIT_FFMPEG:process.env.TOOLKIT_FFMPEG,TOOLKIT_FFPROBE:process.env.TOOLKIT_FFPROBE};
 process.env.PATH='';process.env.TOOLKIT_FFMPEG='/not-used/ffmpeg';process.env.TOOLKIT_FFPROBE='/not-used/ffprobe';
 try{
  for(const name of ['ffmpeg','ffprobe'])assert.ok(local(name).includes(path.join('tools','ffmpeg',`${process.platform}-${process.arch}`,'bin')));
  await run(local('ffmpeg'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.1',path.join(folder,'input')+'-source.wav']);
  const {rename}=await import('node:fs/promises');await rename(path.join(folder,'input')+'-source.wav',path.join(folder,'input'));
  const name=await convertFormat(folder,'audio','flac');assert.ok((await readFile(path.join(folder,name))).length>0);
 }finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
