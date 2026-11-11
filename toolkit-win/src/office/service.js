import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,open,stat,readdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {findOffice,stopOfficeProcess} from './runtime.js';
export const OFFICE_LIMIT=100*1024*1024;
const WORK_LIMIT=512*1024*1024;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function officeOptions(extension,sheets='print') {
  if(!['doc','docx','xls','xlsx'].includes(extension))throw fail('Choose a DOC, DOCX, XLS or XLSX file.',415);
  if(!['print','single'].includes(sheets)||sheets==='single'&&!['xls','xlsx'].includes(extension))throw fail('Choose a valid spreadsheet layout.');
  const filter=['xls','xlsx'].includes(extension)?'calc_pdf_Export':'writer_pdf_Export';
  return `pdf:${filter}:${JSON.stringify({SinglePageSheets:{type:'boolean',value:sheets==='single'}})}`;
}
async function workSize(folder) {
  let bytes=0;
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())bytes+=await workSize(file);
    else if(entry.isFile())bytes+=(await stat(file).catch(()=>({size:0}))).size;
  }
  return bytes;
}
// An isolated profile prevents handing conversion to an already open office
// instance. Never execute document macros or active OLE/DDE content.
const profileSettings=`<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting">
<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop>
<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>
<prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop>
<prop oor:name="DisableActiveContent" oor:op="fuse"><value>true</value></prop>
</item></oor:items>`;

export class OfficeConverter {
  constructor({executable,args=[],timeout=180000,workRoot=tmpdir()}={}) {
    this.executable=executable;this.args=args;this.timeout=timeout;this.workRoot=workRoot;this.jobs=new Map();this.closed=false;
  }
  abort(view){this.jobs.get(view)?.controller.abort();}
  async convert(view,req,res,{extension,sheets}) {
    const filter=officeOptions(extension,sheets);
    if(this.closed)throw fail('Toolkit is shutting down.',503);
    if(this.jobs.has(view))throw fail('An Office conversion is already running in this page.',409);
    if(this.jobs.size>=2)throw fail('Two Office conversions are running. Please wait.',409);
    const executable=this.executable||findOffice();
    if(Number(req.headers['content-length'])>OFFICE_LIMIT)throw fail('Choose an Office file up to 100 MB.',413);
    const controller=new AbortController();let finish;
    const job={controller,done:new Promise(resolve=>finish=resolve)};this.jobs.set(view,job);
    const cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
    const stopUpload=()=>{if(!req.complete)req.destroy(new Error('Cancelled.'));};controller.signal.addEventListener('abort',stopUpload,{once:true});
    let folder;
    try {
      folder=await mkdtemp(path.join(this.workRoot,'toolkit-office-'));
      const input=path.join(folder,`source.${extension}`),output=path.join(folder,'pdf'),profile=path.join(folder,'profile');
      await mkdir(output);await mkdir(path.join(profile,'user'),{recursive:true});
      await writeFile(path.join(profile,'user','registrymodifications.xcu'),profileSettings);
      const source=await open(input,'wx');let size=0;const signature=Buffer.alloc(8);let signatureBytes=0;
      try {
        for await(const chunk of req){
          if(controller.signal.aborted)throw fail('Cancelled.');
          size+=chunk.length;if(size>OFFICE_LIMIT)throw fail('Choose an Office file up to 100 MB.',413);
          if(signatureBytes<8)signatureBytes+=chunk.copy(signature,signatureBytes,0,8-signatureBytes);
          await source.writeFile(chunk);
        }
      }finally{await source.close();}
      if(!size)throw fail('Choose an Office file.');
      const legacy=['doc','xls'].includes(extension);
      if(legacy?!signature.equals(Buffer.from('d0cf11e0a1b11ae1','hex')):signature.readUInt32LE(0)!==0x04034b50)
        throw fail('The file does not match its Office format. Choose a DOC/DOCX or XLS/XLSX file.');
      if(controller.signal.aborted)throw fail('Cancelled.');
      await this.run(executable,[...this.args,`-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless','--nologo','--nodefault','--norestore','--convert-to',filter,'--outdir',output,input],folder,controller.signal);
      const file=path.join(output,'source.pdf');let info;
      try{info=await stat(file);}catch{throw fail('LibreOffice could not convert this file. Check that it opens normally and is not password-protected.');}
      if(!info.isFile()||!info.size)throw fail('LibreOffice did not produce a PDF.');
      if(info.size>OFFICE_LIMIT)throw fail('The resulting PDF exceeds 100 MB. Convert a smaller document.',413);
      const pdf=await open(file,'r');try{const header=Buffer.alloc(5);await pdf.read(header,0,5,0);if(header.toString()!=='%PDF-')throw fail('LibreOffice did not produce a valid PDF.');}finally{await pdf.close();}
      if(controller.signal.aborted)throw fail('Cancelled.');
      res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':info.size,'Content-Disposition':'attachment; filename="converted.pdf"'});
      await pipeline(createReadStream(file),res);
    }finally {
      res.off('close',cancel);controller.signal.removeEventListener('abort',stopUpload);
      try{if(folder)await rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
      finally{this.jobs.delete(view);finish();}
    }
  }
  run(executable,args,folder,signal) {
    return new Promise((resolve,reject)=>{
      if(signal.aborted)return reject(fail('Cancelled.'));
      const child=spawn(executable,args,{cwd:folder,detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,SAL_USE_VCLPLUGIN:'svp'}});
      let error='',failure,checking=false;
      const stop=reason=>{failure||=reason;stopOfficeProcess(child);};
      const abort=()=>stop(fail('Cancelled.'));signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted)abort();
      const timer=setTimeout(()=>stop(fail('Office conversion timed out after 3 minutes. Try a smaller document.',504)),this.timeout);
      const quota=setInterval(async()=>{
        if(checking)return;checking=true;
        try{if(await workSize(folder)>WORK_LIMIT)stop(fail('Office conversion exceeds its 512 MB temporary-file limit.',413));}catch{}finally{checking=false;}
      },1000);
      child.stdout.on('data',()=>{});
      child.stderr.on('data',data=>{error=(error+data).slice(-2000);});
      child.on('error',reason=>{failure=reason.code==='ENOENT'?fail('Install LibreOffice (Writer and Calc), or set TOOLKIT_LIBREOFFICE to its soffice executable.',503):reason;});
      child.on('close',code=>{
        clearTimeout(timer);clearInterval(quota);signal.removeEventListener('abort',abort);
        if(failure||code!==0)reject(failure||fail(`LibreOffice conversion failed. ${error.trim()}`));else resolve();
      });
    });
  }
  async close(){this.closed=true;const jobs=[...this.jobs.values()];for(const job of jobs)job.controller.abort();await Promise.all(jobs.map(job=>job.done));}
}
