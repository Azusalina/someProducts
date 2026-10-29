import {existsSync} from 'node:fs';
import {findChromium} from '../src/core/pdf.js';
import {pythonExecutable,nativeTool,venvPython,executableOnPath} from '../src/platform/runtime.js';
console.log(`Toolkit Win · ${process.platform} ${process.arch} · Node ${process.version}`);
console.log('JS/MJS → SVG: uses your browser (Firefox/Edge/Chrome); no server Chromium needed.');
try{console.log('PDF/Markdown diagrams:',await findChromium());}catch(error){console.log('PDF/Markdown diagrams:',error.message);}
for(const name of ['ffmpeg','ffprobe','chromedriver','pdfinfo','pdfimages','pdftoppm']){
 let value;try{value=nativeTool(name,'TOOLKIT_'+name.toUpperCase());}catch(error){console.log(`${name}: ${error.message}`);continue;}
 console.log(`${name}: ${existsSync(value)||executableOnPath(value)?value:'not found'}`);
}
console.log('Python:',pythonExecutable('TOOLKIT_PYTHON'));
for(const folder of ['.venv-media','.venv-formats','.venv-markitdown','.venv-scribd'])console.log(`${folder}: ${existsSync(venvPython(folder))?'installed':'optional; not installed'}`);
console.log('TeX:',process.env.TOOLKIT_TEX_ENGINE||executableOnPath('xelatex')||'optional; install MiKTeX/TeX Live');
