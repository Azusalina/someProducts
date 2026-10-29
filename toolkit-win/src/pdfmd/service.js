import {pythonExecutable,nativeTool,stopProcessTree} from '../platform/runtime.js';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./worker.py',import.meta.url));
const localPython=fileURLToPath(new URL(process.platform==='win32'?'../../.venv-markitdown/Scripts/python.exe':'../../.venv-markitdown/bin/python',import.meta.url));
const jobs=new WeakMap();let running=0;
export function abortPdfMarkdown(view){jobs.get(view)?.abort();}
export async function convertPdfMarkdown(view,req,res){
 if(jobs.has(view))throw new Error('A PDF conversion is already running in this page.');
 if(running>=2)throw new Error('Two PDF conversions are running. Please wait.');
 const controller=new AbortController();jobs.set(view,controller);running++;
 const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
 let folder;
 try{
  if((req.headers['content-type']||'').split(';')[0]!=='application/pdf')throw new Error('Choose a PDF file.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>25*1024*1024)throw new Error('Choose a PDF up to 25 MB.');chunks.push(chunk);}
  if(!size)throw new Error('Choose a PDF file.');
  if(controller.signal.aborted)throw new Error('Cancelled.');
  folder=await mkdtemp(path.join(tmpdir(),'toolkit-pdfmd-'));
  const input=path.join(folder,'source.pdf');await writeFile(input,Buffer.concat(chunks));
  const python=pythonExecutable('TOOLKIT_MARKITDOWN_PYTHON','.venv-markitdown');
  return await new Promise((resolve,reject)=>{
   if(controller.signal.aborted)return reject(new Error('Cancelled.'));
   const child=spawn(python,[script,input],{detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});
   let output='',stderr='',failure;
   const stop=message=>{failure ||= new Error(message);stopProcessTree(child);};
   const abort=()=>stop('Cancelled.');controller.signal.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>stop('PDF conversion timed out. Try fewer pages.'),180000);
   child.stdout.on('data',data=>{output+=data;if(Buffer.byteLength(output)>32*1024*1024)stop('Converted Markdown is too large.');});
   child.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000);});
   child.on('error',error=>{failure=error.code==='ENOENT'?new Error('Run npm run pdfmd:setup to install MarkItDown.'):error;});
   child.on('close',code=>{
    clearTimeout(timer);controller.signal.removeEventListener('abort',abort);
    if(failure||code!==0)return reject(failure||new Error(stderr.trim()||'PDF conversion failed.'));
    try{resolve(JSON.parse(output));}catch{reject(new Error('Invalid converter response.'));}
   });
  });
 }finally{res.off('close',cancel);jobs.delete(view);running--;if(folder)await rm(folder,{recursive:true,force:true});}
}
