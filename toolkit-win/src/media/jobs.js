import {mkdtemp,rm,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertMediaAvailable,selectedMedia,downloadMediaEntries,withMediaTask,URL_AUDIO_LIMIT} from './service.js';
const types={'.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.opus':'audio/ogg','.ogg':'audio/ogg','.wav':'audio/wav','.aac':'audio/aac','.zip':'application/zip'};
const failure=(message,status)=>Object.assign(new Error(message),{status});

// Download/conversion lives independently of a polling HTTP connection. Files
// stay on disk; the browser's download manager streams them without a Blob copy.
export class MediaJobs {
  constructor({download=downloadMediaEntries,retention=15*60_000,maxRetained=4}={}) {
    this.download=download;this.retention=retention;this.maxRetained=maxRetained;
    this.jobs=new Map();this.files=new Map();this.closed=false;
  }
  status(view) {
    const job=this.jobs.get(view);
    return job?{state:job.state,message:job.message,progress:job.progress,filename:job.filename,
      bytes:job.bytes,link:job.state==='ready'?`/api/media/file/${job.id}`:null}
      :{state:'idle',message:'',link:null};
  }
  start(view,options) {
    if(this.closed)throw failure('Toolkit is shutting down.',503);
    if(this.jobs.get(view)?.state==='working')throw failure('Audio is already processing in this page.',409);
    assertMediaAvailable(view);
    // Copy the selection now; scans in other tabs cannot change this task.
    const entries=selectedMedia(view,options).map(entry=>({...entry}));
    const previous=this.jobs.get(view);
    const job={id:randomBytes(24).toString('hex'),state:'working',message:'Starting audio download…',
      controller:new AbortController(),readers:0};
    this.jobs.set(view,job);
    job.task=this.run(view,job,entries,options.format,previous);
    return this.status(view);
  }
  async run(view,job,entries,format,previous) {
    try {
      await withMediaTask(view,async signal=>{
        if(previous)await this.dispose(previous);
        job.folder=await mkdtemp(path.join(tmpdir(),'toolkit-url-audio-'));
        job.filename=await this.download(entries,format,job.folder,signal,value=>{
          if(job.deleted)return;
          const number=value=>Number.isFinite(value)&&value>=0?value:null;
          job.progress={stage:['extracting','downloading','converting','packaging','retrying'].includes(value.stage)?value.stage:'extracting',
            item:number(value.item),total:number(value.total),downloaded:number(value.downloaded),
            bytes:number(value.bytes),speed:number(value.speed),eta:number(value.eta)};
          job.message=({extracting:'Finding audio stream',downloading:'Downloading audio',converting:'Converting audio',packaging:'Preparing ZIP',retrying:'Retrying audio source'})[job.progress.stage];
        });
        if(signal.aborted)throw new Error('Cancelled.');
        if(typeof job.filename!=='string'||path.basename(job.filename)!==job.filename)throw new Error('Invalid audio output.');
        const info=await stat(path.join(job.folder,job.filename));
        if(!info.isFile()||!info.size||info.size>URL_AUDIO_LIMIT)throw new Error('Result exceeds the 2 GiB audio limit. Choose MP3/original audio or fewer items.');
        job.bytes=info.size;
      },job.controller.signal);
      if(!job.deleted){
        // Bound retained disk usage even when many pages create results.
        while(this.files.size>=this.maxRetained)await this.dispose(this.files.values().next().value);
        if(job.deleted)return;
        job.state='ready';job.message='Audio ready';this.files.set(job.id,job);
      }
    }catch(error){if(!job.deleted){job.state='error';job.message=error.message;}}
    finally {
      if(job.state!=='ready'&&job.folder)await rm(job.folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});
      if(!job.deleted){job.expiry=setTimeout(()=>this.clearJob(view,job).catch(()=>{}),this.retention);job.expiry.unref();}
    }
  }
  async dispose(job) {
    job.deleted=true;clearTimeout(job.expiry);job.controller.abort();this.files.delete(job.id);
    if(job.state==='ready'){job.state='expired';job.message='This audio download expired. Download the selection again.';}
    if(job.folder&&!job.readers)await rm(job.folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
  async clearJob(view,job) {
    // Wait for a running worker before removing its temporary files.
    job.deleted=true;job.controller.abort();await job.task;await this.dispose(job);
    if(this.jobs.get(view)===job)this.jobs.delete(view);
  }
  async clear(view){const job=this.jobs.get(view);if(job)await this.clearJob(view,job);}
  async send(id,req,res) {
    const job=this.files.get(id);
    if(!job||job.state!=='ready')throw failure('This audio link expired. Download the selection again.',410);
    job.readers++;
    try {
      const filename=path.join(job.folder,job.filename),size=job.bytes;
      let start=0,end=size-1,status=200;
      if(req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
        if(!match[1])start=Math.max(0,size-Number(match[2]));
        else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
        status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
      }
      res.writeHead(status,{'Content-Type':types[path.extname(job.filename)]||'application/octet-stream',
        'Content-Length':end-start+1,'Accept-Ranges':'bytes',
        'Content-Disposition':`attachment; filename="audio${path.extname(job.filename)}"; filename*=UTF-8''${encodeURIComponent(job.filename)}`});
      if(req.method==='HEAD')return res.end();
      await pipeline(createReadStream(filename,{start,end}),res);
    }finally{job.readers--;if(job.deleted&&!job.readers&&job.folder)await rm(job.folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
  }
  async close(){this.closed=true;await Promise.all([...this.jobs].map(([view,job])=>this.clearJob(view,job)));}
}
