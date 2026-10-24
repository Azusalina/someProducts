import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stat} from 'node:fs/promises';
import {formatOption} from '../../public/format-options.js';
import {runMediaProcess} from '../media/service.js';
const photoWorker=fileURLToPath(new URL('./photo.py',import.meta.url));
const python=fileURLToPath(new URL(process.platform==='win32'?'../../.venv-formats/Scripts/python.exe':'../../.venv-formats/bin/python',import.meta.url));
const containers='wav,mp3,flac,ogg,mov,matroska,webm,aac,aiff,asf,avi,mpegts,mpeg,m4v,flv';
const audio={mp3:['-c:a','libmp3lame','-q:a','0'],flac:['-c:a','flac'],wav:['-c:a','pcm_s24le'],m4a:['-c:a','aac','-b:a','256k','-movflags','+faststart'],aac:['-c:a','aac','-b:a','256k'],opus:['-c:a','libopus','-b:a','192k','-ar','48000'],ogg:['-c:a','libvorbis','-q:a','6']};
const video={
 mp4:['-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart'],
 mov:['-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-movflags','+faststart'],
 mkv:['-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k'],
 webm:['-c:v','libvpx-vp9','-crf','30','-b:v','0','-deadline','good','-cpu-used','4','-row-mt','1','-c:a','libopus','-b:a','160k','-ar','48000'],
 avi:['-c:v','mpeg4','-q:v','3','-c:a','libmp3lame','-b:a','192k'],
};
export async function convertFormat(folder,kind,target,signal){
 formatOption(kind,target);
 const input=path.join(folder,'input'),filename=`converted.${target}`,output=path.join(folder,filename);
 const maxWorkBytes=(kind==='video'?1024:250)*1024*1024;
 if(kind==='photo'){
  await runMediaProcess(process.env.TOOLKIT_FORMATS_PYTHON||(existsSync(python)?python:'python3'),[photoWorker,input,output,target],{signal,folder,maxWorkBytes,timeout:120000});
 }else{
  const flags=['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',containers];
  const probe=JSON.parse(await runMediaProcess(process.env.TOOLKIT_FFPROBE||'ffprobe',[...flags,'-show_streams','-show_format','-of','json',input],{signal,folder,maxWorkBytes,timeout:30000}));
  const streams=probe.streams||[],sound=streams.find(s=>s.codec_type==='audio'),picture=streams.find(s=>s.codec_type==='video'&&!s.disposition?.attached_pic);
  let options;
  if(kind==='audio'){
   if(!sound)throw new Error('This file has no audio stream. Choose an audio file.');
   options=['-map',`0:${sound.index}`,'-vn',...audio[target],...(target==='mp3'&&sound.channels>2?['-ac','2']:[])];
  }else{
   if(!picture||/avif|avis|heic/i.test(probe.format?.tags?.major_brand||''))throw new Error('Choose a video file with a video stream.');
   options=['-map',`0:${picture.index}`,'-map','0:a:0?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-pix_fmt','yuv420p',...video[target]];
  }
  await runMediaProcess(process.env.TOOLKIT_FFMPEG||'ffmpeg',['-nostdin',...flags,'-i',input,...options,'-threads','2',output],{signal,folder,maxWorkBytes,timeout:kind==='video'?900000:600000});
 }
 if(!(await stat(output)).size)throw new Error('Converter produced an empty file.');
 return filename;
}
