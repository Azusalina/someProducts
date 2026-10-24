import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {createToolkit} from '../src/server.js';
import {FORMAT_OPTIONS,formatOption} from '../public/format-options.js';
import {runMediaProcess} from '../src/media/service.js';
const run=promisify(execFile);
const python=path.resolve('.venv-formats/bin/python');
test('format choices reject unknown kinds and outputs',()=>{
 for(const [kind,value]of [['other','mp3'],['__proto__','jpg'],['photo','../../file'],['video','mp3'],['audio','mp4']])assert.throws(()=>formatOption(kind,value));
 for(const [kind,config]of Object.entries(FORMAT_OPTIONS))for(const [target]of config.formats)assert.equal(formatOption(kind,target)[0],target);
});
test('process working-file quota can be bounded per conversion',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'toolkit-quota-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 await writeFile(path.join(folder,'large'),Buffer.alloc(2048));
 await assert.rejects(runMediaProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{folder,maxWorkBytes:1024,timeout:5000}),/working-file limit/);
});
test('all 16 format outputs are real files with expected codecs, geometry, audio and immutability',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'toolkit-formats-test-'));const app=await createToolkit({port:0});t.after(async()=>{await app.close();await rm(folder,{recursive:true,force:true});});
 await run(python,['-c',"from PIL import Image; import sys; p=sys.argv[1]; im=Image.new('RGBA',(64,48),(255,0,0,0)); im.paste((224,0,0,255),(16,12,48,36)); im.save(p+'/photo.png'); ex=Image.Exif(); ex[274]=6; Image.new('RGB',(80,40),(0,180,0)).save(p+'/phone.jpg',exif=ex)",folder]);
 await run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4',path.join(folder,'audio.wav')]);
 await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x48:d=0.4','-f','lavfi','-i','sine=frequency=660:duration=0.4','-c:v','libx264','-c:a','aac','-shortest',path.join(folder,'video.mp4')]);
 const first=await fetch(app.url),cookie=first.headers.get('set-cookie').split(';')[0];await first.text();
 const view=await(await fetch(app.url+'api/views',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).json();
 const headers={Cookie:cookie,'X-Toolkit-View':view.viewId,'Content-Type':'application/octet-stream'};
 const original={photo:await readFile(path.join(folder,'photo.png')),audio:await readFile(path.join(folder,'audio.wav')),video:await readFile(path.join(folder,'video.mp4'))};
 const convert=async(kind,format,bytes)=>{
  const response=await fetch(`${app.url}api/formats/convert?kind=${kind}&format=${format}`,{method:'POST',headers,body:bytes});
  assert.equal(response.status,200,await response.clone().text().catch(()=>''));
  assert.equal(response.headers.get('Content-Type'),formatOption(kind,format)[2]);
  const file=path.join(folder,`output-${kind}.${format}`);await writeFile(file,Buffer.from(await response.arrayBuffer()));return file;
 };
 for(const [target]of FORMAT_OPTIONS.photo.formats){
  const file=await convert('photo',target,original.photo);
  await run(python,['-c',"from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.format==sys.argv[2],im.format; assert im.size==(64,48); pixel=im.getpixel((0,0));\nif im.format=='JPEG': assert min(pixel)>235,pixel\nelse: assert im.mode=='RGBA' and pixel[3]<10,(im.mode,pixel)",file,{jpg:'JPEG',png:'PNG',webp:'WEBP',avif:'AVIF'}[target]]);
 }
 const phone=await convert('photo','png',await readFile(path.join(folder,'phone.jpg')));
 await run(python,['-c',"from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.size==(40,80); assert im.getexif().get(274,1)==1",phone]);
 const expectedAudio={mp3:'mp3',flac:'flac',wav:'pcm_s24le',m4a:'aac',aac:'aac',opus:'opus',ogg:'vorbis'};
 for(const [target]of FORMAT_OPTIONS.audio.formats){
  const file=await convert('audio',target,original.audio);
  const {stdout}=await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]);const data=JSON.parse(stdout);
  assert.equal(data.streams.length,1);assert.equal(data.streams[0].codec_type,'audio');assert.equal(data.streams[0].codec_name,expectedAudio[target]);assert.ok(Number(data.format.duration)>0.2);
 }
 for(const [target]of FORMAT_OPTIONS.video.formats){
  const file=await convert('video',target,original.video);
  const {stdout}=await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]);const data=JSON.parse(stdout),streams=data.streams;
  assert.ok(Number(data.format.duration)>=0.35&&Number(data.format.duration)<0.7);
  const v=streams.find(s=>s.codec_type==='video'),a=streams.find(s=>s.codec_type==='audio');assert.equal(v.width,64);assert.equal(v.height,48);assert.ok(a);
  assert.equal(v.codec_name,target==='webm'?'vp9':target==='avi'?'mpeg4':'h264');
 }
 const noVideo=await fetch(app.url+'api/formats/convert?kind=video&format=mp4',{method:'POST',headers,body:original.audio});assert.equal(noVideo.status,400);assert.match((await noVideo.json()).error,/video/);
 const invalid=await fetch(app.url+'api/formats/convert?kind=photo&format=png',{method:'POST',headers,body:'bad image'});assert.equal(invalid.status,400);await invalid.text();
 assert.equal((await fetch(app.url+'api/formats/convert?kind=audio&format=mp3',{method:'POST',body:original.audio})).status,403);
 for(const [kind,file]of [['photo','photo.png'],['audio','audio.wav'],['video','video.mp4']])assert.deepEqual(await readFile(path.join(folder,file)),original[kind]);
});
