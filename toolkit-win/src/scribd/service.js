import {pythonExecutable,nativeTool,stopProcessTree} from '../platform/runtime.js';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,stat,readdir,open} from 'node:fs/promises';
import {existsSync,createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findChromium} from '../core/pdf.js';
const worker=fileURLToPath(new URL('./worker.py',import.meta.url));
const repository=fileURLToPath(new URL('../scribd-downloader/',import.meta.url));
const python=pythonExecutable('TOOLKIT_SCRIBD_PYTHON','.venv-scribd');
export function scribdDocument(value){
 if(typeof value!=='string'||value.length>4096)throw new Error('Enter a Scribd document address.');
 let url;try{url=new URL(value);}catch{throw new Error('Enter a valid Scribd document address.');}
 if(url.protocol!=='https:'||!['scribd.com','www.scribd.com'].includes(url.hostname)||url.port||url.username||url.password||!/^\/(document|doc)\/\d+(?:\/|$)/.test(url.pathname))throw new Error('Use an HTTPS scribd.com/document/… or scribd.com/doc/… URL.');
 return 'https://www.scribd.com'+url.pathname;
}
export function pdfName(value='document'){
 let name=String(value).replace(/[\\/\x00-\x1f\x7f]/g,'_').trim().slice(0,160)||'document';
 return /\.pdf$/i.test(name)?name:name+'.pdf';
}
async function workSize(folder){
 let bytes=0;
 for(const entry of await readdir(folder,{withFileTypes:true})){const name=path.join(folder,entry.name);if(entry.isDirectory())bytes+=await workSize(name);else if(entry.isFile())bytes+=(await stat(name).catch(()=>({size:0}))).size;}
 return bytes;
}
export class ScribdJobs{
 constructor({command,args,retention=15*60_000,timeout=15*60_000}={}){this.command=command;this.args=args;this.retention=retention;this.timeout=timeout;this.jobs=new Map();this.files=new Map();this.active=null;this.closed=false;}
 status(view){const job=this.jobs.get(view);return job?{state:job.state,message:job.message,pages:job.pages||null,filename:job.filename,link:job.state==='ready'?`/api/scribd/file/${job.id}`:null}:{state:'idle',message:'',link:null};}
 async start(view,options){
  const url=scribdDocument(options.url);
  if(this.closed)throw new Error('Toolkit is shutting down.');
  if(this.active)throw new Error('A Scribd PDF is already generating. Wait or cancel it first.');
  if(!this.command&&(!existsSync(python)||!existsSync(path.join(repository,'scribd-downloader.py'))))throw new Error('Install Scribd support with npm run scribd:setup.');
  let slug;try{slug=decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1));}catch{slug='document';}
  const job={id:randomBytes(24).toString('hex'),filename:pdfName(options.filename||slug),state:'working',message:'Starting…',stopped:false};
  this.active=job;
  try{await this.clear(view);if(this.closed)throw new Error('Toolkit is shutting down.');this.jobs.set(view,job);job.task=this.run(job,url);return this.status(view);}
  catch(error){if(this.active===job)this.active=null;throw error;}
 }
 async run(job,url){
  let timer,quota;
  try{
   job.folder=await mkdtemp(path.join(tmpdir(),'toolkit-scribd-'));job.file=path.join(job.folder,'result.pdf');
   if(job.stopped)return;
   const executable=this.command||python,args=this.args||[worker];
   const env={...process.env,TMPDIR:job.folder,TMP:job.folder,TEMP:job.folder,PYTHONUNBUFFERED:'1',SCRIBD_HEADLESS:'1',SCRIBD_PAGE_LOAD_TIMEOUT:'60',SCRIBD_CDP_TIMEOUT:'120',SCRIBD_EXPORT_BATCH_SIZE:'4',TOOLKIT_CHROMIUM:await findChromium({allowEdge:false}),TOOLKIT_CHROMEDRIVER:nativeTool('chromedriver','TOOLKIT_CHROMEDRIVER')};
   if(job.stopped)return;
   const child=spawn(executable,args,{cwd:job.folder,env,detached:process.platform!=='win32',windowsHide:true,stdio:['pipe','pipe','pipe']});job.child=child;
   let buffer='',error='',failure,complete=false;
   job.stop=message=>{failure||=new Error(message);stopProcessTree(child);};
   timer=setTimeout(()=>job.stop('Scribd export timed out after 15 minutes.'),this.timeout);
   let checking=false;
   quota=setInterval(async()=>{if(checking)return;checking=true;try{if(await workSize(job.folder)>512*1024*1024)job.stop('Scribd export exceeds its 512 MB temporary-file limit.');}catch{}finally{checking=false;}},1000);
   await new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.stdout.on('data',chunk=>{
     buffer+=chunk;
     if(buffer.length>65536){job.stop('Exporter returned too much status data.');return;}
     let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const data=JSON.parse(line);if(data.type==='progress')job.message=String(data.message).slice(0,240);if(data.type==='error')error=String(data.message).slice(0,700);if(data.type==='complete'){complete=true;job.pages=data.pages;}}catch{}}
    });
    child.stderr.on('data',chunk=>{error=(error+chunk).slice(-2000);});
    child.stdin.on('error',()=>{});
    child.on('close',code=>failure?reject(failure):code===0&&complete?resolve():reject(new Error(error||'Scribd PDF generation failed.')));
    child.stdin.end(JSON.stringify({url,repository,output:job.file}));
   });
   const info=await stat(job.file);if(!info.size||info.size>100*1024*1024)throw new Error('Choose a document producing a PDF up to 100 MB.');
   const file=await open(job.file,'r');try{const header=Buffer.alloc(5);await file.read(header,0,5,0);if(header.toString()!=='%PDF-')throw new Error('Exporter did not produce a PDF.');}finally{await file.close();}
   if(!job.stopped){job.state='ready';job.message=`${job.pages} pages · PDF ready`;this.files.set(job.id,job);}
  }catch(error){if(!job.stopped){job.state='error';job.message=error.message;}}
  finally{
   clearTimeout(timer);clearInterval(quota);job.stopped=true;if(this.active===job)this.active=null;
   if(job.folder&&job.state!=='ready')await rm(job.folder,{recursive:true,force:true});
   job.expiry=setTimeout(()=>{for(const [view,value]of this.jobs)if(value===job)this.clear(view).catch(()=>{});},this.retention);job.expiry.unref();
  }
 }
 async send(id,res,download){
  const job=this.files.get(id);if(!job||job.state!=='ready')throw new Error('This PDF link has expired. Generate it again.');
  res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'");
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`${download?'attachment':'inline'}; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(job.filename)}`,'Content-Length':(await stat(job.file)).size});
  await pipeline(createReadStream(job.file),res);
 }
 async clear(view){const job=this.jobs.get(view);if(!job)return;job.stopped=true;job.stop?.('Cancelled.');await job.task;clearTimeout(job.expiry);this.files.delete(job.id);if(job.folder)await rm(job.folder,{recursive:true,force:true});this.jobs.delete(view);}
 async close(){this.closed=true;for(const view of this.jobs.keys())await this.clear(view);}
}
