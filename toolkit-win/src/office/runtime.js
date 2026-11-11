import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';

const unquote=value=>String(value||'').trim().replace(/^"(.*)"$/,'$1');
export function findOffice({platform=process.platform,env=process.env,exists=existsSync}={}) {
  const windows=platform==='win32',p=windows?path.win32:path;
  const value=name=>env[Object.keys(env).find(key=>key.toLowerCase()===name.toLowerCase())];
  const override=unquote(value('TOOLKIT_LIBREOFFICE'));
  const search=name=>{
    if(p.isAbsolute(name)||name.includes('/')||name.includes('\\'))return exists(name)?name:null;
    for(const directory of (value('PATH')||'').split(windows?';':path.delimiter).filter(Boolean)){
      for(const suffix of windows&&!p.extname(name)?['.com','.exe']:['']){
        const candidate=p.join(unquote(directory),name+suffix);if(exists(candidate))return candidate;
      }
    }
  };
  if(override){const found=search(override);if(found)return found;}
  else {
    const candidates=windows?[...new Set([value('ProgramFiles'),value('ProgramFiles(x86)'),value('LOCALAPPDATA')].filter(Boolean))]
      .flatMap(folder=>['soffice.com','soffice.exe'].map(name=>p.join(folder,'LibreOffice','program',name)))
      :platform==='darwin'?['/Applications/LibreOffice.app/Contents/MacOS/soffice']:[];
    for(const name of [...candidates,'libreoffice','soffice']){const found=search(name);if(found)return found;}
  }
  throw Object.assign(new Error(override?'TOOLKIT_LIBREOFFICE does not point to a LibreOffice executable.':'Install LibreOffice (Writer and Calc), or set TOOLKIT_LIBREOFFICE to its soffice executable.'),{status:503});
}
export function stopOfficeProcess(child) {
  if(!child.pid)return;
  if(process.platform==='win32'){
    const taskkill=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe');
    const killer=spawn(taskkill,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.on('error',()=>{try{child.kill();}catch{}});
  }else{try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}
}
