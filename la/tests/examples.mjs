import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { lessons } from '../js/lessons.js';
const dir=await mkdtemp(join(tmpdir(),'little-algebra-examples-'));
function run(command,file) { const r=spawnSync(command,[file],{cwd:dir,env:{...process.env,MPLBACKEND:'Agg'},encoding:'utf8',timeout:60000});assert.equal(r.status,0,`${command} failed for ${file}: ${r.stderr||r.error}`); }
for(const l of lessons){
  const py=join(dir,`${l.id}.py`),r=join(dir,`${l.id}.R`);
  await writeFile(py,l.py+'\n');await writeFile(r,`pdf(${JSON.stringify(join(dir,l.id+'.pdf'))})\n${l.r}\ndev.off()\n`);
  run('python3',py);run('Rscript',r);
  console.log(`✓ ${l.id}: Python and R`);
}
run('python3',resolve('examples/start_here.py'));
const wrapper=join(dir,'starter.R');await writeFile(wrapper,`pdf(${JSON.stringify(join(dir,'starter.pdf'))})\nsource(${JSON.stringify(resolve('examples/start_here.R'))})\ndev.off()\n`);run('Rscript',wrapper);
const notebookCheck=join(dir,'notebook.py');await writeFile(notebookCheck,`import json\nwith open(${JSON.stringify(resolve('examples/linear_algebra_statistics.ipynb'))}) as f: book=json.load(f)\nassert book['nbformat'] == 4\nfor cell in book['cells']:\n    if cell['cell_type'] == 'code':\n        exec(compile(''.join(cell['source']), '<notebook>', 'exec'), {})\nprint('Notebook code cells executed.')\n`);run('python3',notebookCheck);
console.log('✓ Starter scripts and every notebook code cell executed.');
console.log(`Temporary graphs and scripts: ${dir}`);
