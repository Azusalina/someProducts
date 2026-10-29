import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root} from '../src/platform/runtime.js';
const marker="' Managed by Toolkit Win";
export function startupScript(directory,node){
 const vbs=text=>'"'+text.replaceAll('"','""')+'"';
 const command=`"${node}" "${path.join(directory,'src','cli.js')}"`;
 return `${marker}\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = ${vbs(directory)}\r\nshell.Run ${vbs(command)}, 0, False\r\n`;
}
export async function windowsAutostart(action,{env=process.env,directory=root,node=process.execPath}={}){
 if(!['install','uninstall'].includes(action))throw new Error('Choose install or uninstall.');
 if(!env.APPDATA)throw new Error('APPDATA is missing. Run this as your normal Windows user.');
 const file=path.join(env.APPDATA,'Microsoft','Windows','Start Menu','Programs','Startup','toolkit-win.vbs');
 let previous;try{previous=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(previous&&!previous.startsWith(marker))throw new Error('Existing startup file is not managed by toolkit-win.');
 if(action==='install'){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,startupScript(directory,node),'utf8');console.log('Toolkit Win will start after login.');}
 else{if(previous)await unlink(file);console.log('Toolkit Win login startup removed. Running windows are unchanged.');}
 return file;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.platform==='win32')await windowsAutostart(process.argv[2]);
  else{const child=spawn(process.execPath,[path.join(root,'scripts','python.mjs'),'scripts/autostart.py',process.argv[2]],{stdio:'inherit'});child.on('exit',code=>process.exitCode=code??1);}
 }catch(error){console.error(error.message);process.exitCode=1;}
}
