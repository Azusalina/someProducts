import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {EventEmitter} from 'node:events';
import {browserCandidates,executableOnPath,resolveUserFile,venvPython,stopProcessTree,nativeTool} from '../src/platform/runtime.js';
import {windowsAutostart,startupScript} from '../scripts/autostart.mjs';
import {createToolkit} from '../src/server.js';
test('Windows browsers include installed Edge, Chrome, per-user Chromium and quoted overrides',()=>{
 const candidates=browserCandidates({platform:'win32',env:{ProgramFiles:'C:\\Program Files','ProgramFiles(x86)':'C:\\Program Files (x86)',LOCALAPPDATA:'C:\\Users\\測試 User\\AppData\\Local',TOOLKIT_CHROMIUM:'"D:\\Browser App\\chrome.exe"'}});
 assert.ok(candidates.includes('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'));
 assert.ok(candidates.includes('C:\\Users\\測試 User\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
 assert.equal(candidates[0],'D:\\Browser App\\chrome.exe');assert.ok(!candidates.some(x=>x.startsWith('/usr/')));
});
test('Windows PATH supports executable suffixes and spaces without command shell interpolation',()=>{
 const expected='C:\\Tools With Spaces\\python.exe';
 assert.equal(executableOnPath('python',{platform:'win32',env:{Path:'"C:\\Tools With Spaces";C:\\Other'},exists:p=>p===expected}),expected);
 assert.equal(executableOnPath('python',{platform:'win32',env:{PATH:'C:\\Users\\a\\AppData\\Local\\Microsoft\\WindowsApps'},exists:()=>true}),null);
 assert.ok(venvPython('.venv-media','win32').endsWith(path.join('Scripts','python.exe')));
});
test('Windows quoted paths, home shorthand and Unicode do not depend on HOME',()=>{
 const options={platform:'win32',home:'C:\\Users\\測試 User'};
 assert.equal(resolveUserFile('"C:\\My Notes\\a.md"','C:\\repo',options),'C:\\My Notes\\a.md');
 for(const input of ['~/Documents/a.md','~\\Documents\\a.md'])assert.equal(resolveUserFile(input,'C:\\repo',options),'C:\\Users\\測試 User\\Documents\\a.md');
});
test('Windows cancellation kills the PID tree without a shell',()=>{
 const calls=[];const child={pid:4321,kill:()=>{throw new Error('Should use taskkill');}};
 stopProcessTree(child,{platform:'win32',env:{SystemRoot:'C:\\Windows'},spawnProcess:(...args)=>{calls.push(args);return new EventEmitter();}});
 assert.equal(calls[0][0],'C:\\Windows\\System32\\taskkill.exe');assert.deepEqual(calls[0][1],['/PID','4321','/T','/F']);assert.equal(calls[0][2].windowsHide,true);
});
test('Windows autostart is current-user, quoted, removable and preserves unowned files',async t=>{
 const folder=await mkdtemp(path.join(tmpdir(),'toolkit-win-startup-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const options={env:{APPDATA:folder},directory:'C:\\Repo With Spaces',node:'C:\\Program Files\\nodejs\\node.exe'};
 const file=await windowsAutostart('install',options);assert.match(await readFile(file,'utf8'),/CurrentDirectory/);assert.ok(startupScript(options.directory,options.node).includes('""C:\\Program Files\\nodejs\\node.exe""'));
 await windowsAutostart('uninstall',options);await assert.rejects(readFile(file),{code:'ENOENT'});
 await writeFile(file,'user-owned startup');await assert.rejects(windowsAutostart('install',options),/not managed/);assert.equal(await readFile(file,'utf8'),'user-owned startup');
});
test('JS SVG source endpoint succeeds with no server-side Chromium configured',async t=>{
 const app=await createToolkit({port:0});t.after(()=>app.close());
 const first=await fetch(app.url),cookie=first.headers.get('set-cookie').split(';')[0];await first.text();
 const headers={Cookie:cookie,'Content-Type':'application/json'};const view=await(await fetch(app.url+'api/views',{method:'POST',headers,body:'{}'})).json();headers['X-Toolkit-View']=view.viewId;
 const response=await fetch(app.url+'api/flowchart/source',{method:'POST',headers,body:JSON.stringify({source:'export function f(x){if(x) return 1;return 0;}',filename:'a.mjs'})});
 assert.equal(response.status,200);assert.match((await response.json()).diagram,/flowchart TD/);
 assert.equal((await fetch(app.url+'lib/mermaid.js')).status,200);
});
test('FFmpeg and ffprobe resolve inside the project, ignoring external overrides',()=>{
 const before=process.env.TOOLKIT_FFMPEG;process.env.TOOLKIT_FFMPEG='C:\\system\\ffmpeg.exe';
 try{for(const name of ['ffmpeg','ffprobe'])assert.ok(nativeTool(name,'TOOLKIT_FFMPEG').includes(path.join('tools','ffmpeg',`${process.platform}-${process.arch}`,'bin')));}finally{if(before===undefined)delete process.env.TOOLKIT_FFMPEG;else process.env.TOOLKIT_FFMPEG=before;}
});
