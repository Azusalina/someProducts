import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,mkdtemp,rm,readdir,stat,chmod,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
export function buildAssetName(platform,arch){
 if(arch!=='x64'||!['linux','win32'].includes(platform))throw new Error('Bundled FFmpeg currently supports Linux x64 and Windows x64.');
 return platform==='win32'?'ffmpeg-n8.1-latest-win64-gpl-8.1.zip':'ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz';
}
const target=process.argv[2]||process.platform,arch=process.arch;
const name=buildAssetName(target,arch),folder=path.join(root,'tools','ffmpeg',`${target}-${arch}`);
const response=await fetch('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest',{headers:{'User-Agent':'Toolkit-FFmpeg-Setup',...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`FFmpeg release lookup failed (${response.status}).`);
const release=await response.json(),asset=release.assets.find(item=>item.name===name);
if(!asset||!/^sha256:[0-9a-f]{64}$/.test(asset.digest||''))throw new Error('Trusted FFmpeg build or SHA256 digest is missing.');
await mkdir(path.dirname(folder),{recursive:true});
const temporary=await mkdtemp(path.join(path.dirname(folder),'.install-'));
try{
 const archive=path.join(temporary,name),download=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(600000)});
 if(!download.ok)throw new Error(`FFmpeg download failed (${download.status}).`);
 const hash=createHash('sha256');let size=0;
 await pipeline(download.body,new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>350*1024*1024)return callback(new Error('FFmpeg archive exceeds 350 MB.'));hash.update(chunk);callback(null,chunk);}}),createWriteStream(archive,{flags:'wx'}));
 if('sha256:'+hash.digest('hex')!==asset.digest)throw new Error('FFmpeg archive checksum does not match. Nothing installed.');
 const unpack=path.join(temporary,'unpack');await mkdir(unpack);
 const zip=name.endsWith('.zip');let entries;
 if(zip&&process.platform!=='win32')entries=(await run('unzip',['-Z1',archive],{maxBuffer:4*1024*1024})).stdout;
 else entries=(await run('tar',['-tf',archive],{maxBuffer:4*1024*1024,windowsHide:true})).stdout;
 if(entries.split(/\r?\n/).some(item=>item&&(path.posix.isAbsolute(item)||/^[a-z]:/i.test(item)||item.replaceAll('\\','/').split('/').includes('..'))))throw new Error('Unsafe FFmpeg archive paths.');
 if(zip&&process.platform!=='win32')await run('unzip',['-q',archive,'-d',unpack]);
 else await run('tar',['-xf',archive,'-C',unpack],{windowsHide:true});
 const directories=await readdir(unpack,{withFileTypes:true});const first=directories.find(item=>item.isDirectory());
 if(!first)throw new Error('Invalid FFmpeg archive structure.');
 const source=path.join(unpack,first.name),extension=target==='win32'?'.exe':'';
 for(const tool of ['ffmpeg','ffprobe']){const file=path.join(source,'bin',tool+extension);if(!(await stat(file)).isFile())throw new Error(`Missing ${tool}.`);if(target!=='win32')await chmod(file,0o755);}
 await writeFile(path.join(source,'toolkit-build.json'),JSON.stringify({source:'https://github.com/BtbN/FFmpeg-Builds',release:release.html_url,asset:asset.name,digest:asset.digest,downloadedAt:new Date().toISOString()},null,2)+'\n');
 // Existing installation remains usable until a fully verified replacement exists.
 const backup=folder+'.previous';await rm(backup,{recursive:true,force:true});let old=false;
 try{await rename(folder,backup);old=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 try{await rename(source,folder);}catch(error){if(old)await rename(backup,folder);throw error;}
 await rm(backup,{recursive:true,force:true});
 console.log(`Installed FFmpeg and ffprobe: ${folder}`);
}finally{await rm(temporary,{recursive:true,force:true});}
