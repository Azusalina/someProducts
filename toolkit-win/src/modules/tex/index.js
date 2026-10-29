import {stopProcessTree} from '../../platform/runtime.js';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

let running = 0;
function runEngine(engine, args, { cwd, env, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled.'));
    const child = spawn(engine, args, { cwd, env, detached: process.platform !== 'win32', windowsHide:true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', failure;
    const stop = message => {
      failure ||= new Error(message);
      stopProcessTree(child);
    };
    const abort = () => stop('Cancelled.');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('TeX compilation timed out after 45 seconds.'), 45000);
    let size = 0;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      size += data.length; output = (output + data).slice(-5000);
      if (size > 2 * 1024 * 1024) stop('TeX compiler output exceeds 2 MB.');
    });
    child.on('error', error => { failure = error.code === 'ENOENT' ? new Error('TeX preview needs XeLaTeX. Install MiKTeX/TeX Live, or set TOOLKIT_TEX_ENGINE to xelatex.exe.') : error; });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure || new Error(output.trim() || 'TeX compilation failed.'));
      else resolve();
    });
  });
}

export async function compileTex(source, { filename, signal } = {}) {
  if (running >= 2) throw new Error('Two TeX previews are compiling. Save again shortly.');
  running++;
  let folder;
  try {
    folder = await mkdtemp(path.join(process.env.TOOLKIT_TEX_TMPDIR || tmpdir(), 'toolkit-tex-'));
    const input = path.join(folder, 'source.tex');
    await writeFile(input, source, { mode: 0o600 });
    const directory = await realpath(path.dirname(filename));
    // Even compiler logs, aux files and font caches live only in this workdir.
    const env = { ...process.env, TEXINPUTS: `${directory}${path.delimiter}${process.env.TEXINPUTS || ''}${path.delimiter}`,
      TEXMFOUTPUT: folder, TEXMFVAR: path.join(folder, 'texmf-var'), TEXMFCONFIG: path.join(folder, 'texmf-config'),
      TEXMFCACHE: path.join(folder, 'texmf-cache'), openout_any: 'p', shell_escape: 'f' };
    const args = ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-recorder', '-jobname=preview', input];
    for (let pass = 0; pass < 2; pass++) await runEngine(process.env.TOOLKIT_TEX_ENGINE || 'xelatex', args, { cwd: folder, env, signal });
    const output = path.join(folder, 'preview.pdf');
    if ((await stat(output)).size > 20 * 1024 * 1024) throw new Error('TeX preview exceeds 20 MB.');
    const pdf = await readFile(output);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('TeX did not produce a complete PDF.');
    const dependencies = new Set();
    for (const line of (await readFile(path.join(folder, 'preview.fls'), 'utf8')).split('\n')) {
      if (!line.startsWith('INPUT ')) continue;
      const candidate = await realpath(path.resolve(folder, line.slice(6))).catch(() => null);
      if (candidate && !candidate.startsWith(folder + path.sep) && candidate.startsWith(directory + path.sep) && candidate !== filename && dependencies.size < 200) dependencies.add(candidate);
    }
    return { html: '', pdf: pdf.toString('base64'), title: path.basename(filename, path.extname(filename)), outline: [], dependencies: [...dependencies],
      warnings: ['Preview stays in memory. Save PDF keeps a copy; paper and colors come from the TeX source.'] };
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true });
    running--;
  }
}
export const texModule = { id: 'tex', name: 'Live TeX → PDF', extensions: ['.tex'], outputs: ['pdf'], render: compileTex };
