import path from 'node:path';
import {homedir} from 'node:os';
import {existsSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const unquote=value=>String(value||'').trim().replace(/^"(.*)"$/,'$1');
export function envValue(env,key){const found=Object.keys(env).find(k=>k.toLowerCase()===key.toLowerCase());return found?env[found]:undefined;}
export function executableOnPath(name,{platform=process.platform,env=process.env,exists=existsSync}={}){
 const windows=platform==='win32',p=windows?path.win32:path;
 name=unquote(name);if(!name)return null;
 const extensions=windows&&!p.extname(name)?['.exe','.com']:[''];
 const folders=p.isAbsolute(name)||name.includes('/')||name.includes('\\')?['']:(envValue(env,'PATH')||'').split(windows?';':path.delimiter).filter(Boolean).map(unquote);
 for(const folder of folders)for(const extension of extensions){const candidate=folder?p.join(folder,name+extension):name+extension;if(exists(candidate)&&!candidate.toLowerCase().includes('\\microsoft\\windowsapps\\'))return candidate;}
 return null;
}
export function venvPython(folder,platform=process.platform){return path.join(root,folder,...(platform==='win32'?['Scripts','python.exe']:['bin','python']));}
let launcherPython;
export function pythonExecutable(envName,folder){
 const override=unquote(process.env[envName]);if(override)return override;
 if(folder&&existsSync(venvPython(folder)))return venvPython(folder);
 const global=unquote(process.env.TOOLKIT_PYTHON||process.env.PYTHON);if(global)return global;
 for(const name of ['python3','python']){const candidate=executableOnPath(name);if(candidate)return candidate;}
 if(process.platform==='win32'){
  if(launcherPython)return launcherPython;
  const py=executableOnPath('py');
  if(py){try{const value=execFileSync(py,['-3','-c','import sys;print(sys.executable)'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();if(existsSync(value))return launcherPython=value;}catch{}}
 }
 return process.platform==='win32'?'python.exe':'python3';
}
export function nativeTool(name,envName){
 if(['ffmpeg','ffprobe'].includes(name)){
  const file=path.join(root,'tools','ffmpeg',`${process.platform}-${process.arch}`,'bin',name+(process.platform==='win32'?'.exe':''));
  if(!existsSync(file))throw new Error('Project FFmpeg is missing. Run npm run ffmpeg:setup.');
  return file;
 }
 const override=unquote(process.env[envName]);if(override)return override;
 const executable=name+(process.platform==='win32'?'.exe':'');
 for(const folder of [path.join(root,'tools','bin'),path.join(root,'tools',name==='ffmpeg'||name==='ffprobe'?'ffmpeg':'poppler','bin')]){const candidate=path.join(folder,executable);if(existsSync(candidate))return candidate;}
 return executableOnPath(name)||executable;
}
export function browserCandidates({platform=process.platform,env=process.env,managed}={}){
 const candidates=[unquote(envValue(env,'TOOLKIT_CHROMIUM'))];
 if(platform==='win32'){
  const p=path.win32;
  for(const folder of [envValue(env,'ProgramFiles'),envValue(env,'ProgramFiles(x86)'),envValue(env,'LocalAppData')].filter(Boolean))for(const relative of ['Microsoft/Edge/Application/msedge.exe','Google/Chrome/Application/chrome.exe','Chromium/Application/chrome.exe'])candidates.push(p.join(folder,...relative.split('/')));
 }else if(platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Chromium.app/Contents/MacOS/Chromium');
 else candidates.push('/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/opt/google/chrome/chrome','/usr/bin/microsoft-edge');
 if(managed)candidates.push(managed);
 return [...new Set(candidates.filter(Boolean))];
}
export function stopProcessTree(child,{platform=process.platform,spawnProcess=spawn,env=process.env}={}){
 if(!child?.pid||!Number.isInteger(child.pid)||child.pid<=0)return;
 if(platform==='win32'){
  const system=envValue(env,'SystemRoot');const taskkill=system?path.win32.join(system,'System32','taskkill.exe'):'taskkill.exe';
  try{const killer=spawnProcess(taskkill,['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>{try{child.kill('SIGKILL');}catch{}});killer.unref?.();}catch{try{child.kill('SIGKILL');}catch{}}
 }else{try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}
}

export function resolveUserFile(input,baseDir,{platform=process.platform,home=homedir()}={}){const p=platform==='win32'?path.win32:path;const value=unquote(input);return p.resolve(baseDir,/^~[\\/]/.test(value)?p.join(home,value.slice(2)):value);}
