import {spawn} from 'node:child_process';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {pythonExecutable,venvPython,root} from '../src/platform/runtime.js';
const args=process.argv.slice(2);let executable;
if(args[0]==='--venv'){
 const folder=args[1];if(!['.venv-media','.venv-formats','.venv-markitdown','.venv-scribd'].includes(folder))throw new Error('Unknown converter environment.');
 executable=venvPython(folder);args.splice(0,2);if(!existsSync(executable))throw new Error('Install this optional converter first; see README.md.');
}else executable=pythonExecutable('TOOLKIT_PYTHON');
if(!args.length)throw new Error('Pass a Python script.');
const child=spawn(executable,[path.resolve(root,args[0]),...args.slice(1)],{cwd:root,stdio:'inherit',windowsHide:false});
child.on('error',error=>{console.error(error.code==='ENOENT'?'Install Python 3.12+ and enable its launcher/PATH, or set TOOLKIT_PYTHON to python.exe.':error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
