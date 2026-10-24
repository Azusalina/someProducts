import http from 'node:http';
import { FORMAT_OPTIONS, formatOption } from '../public/format-options.js';
import { convertFormat } from './formats/service.js';
import { convertPdfMarkdown, abortPdfMarkdown } from './pdfmd/service.js';
import path from 'node:path';
import { readFile, open } from 'node:fs/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ModuleRegistry } from './core/registry.js';
import { DocumentSession } from './core/document-session.js';
import { readSource, documentStyle } from './core/files.js';
import { exportPdf } from './core/pdf.js';
import { scanMedia, withMediaWork, downloadMedia, convertMedia, sendMedia, mediaFormat, abortMedia } from './media/service.js';

export async function createToolkit({ port = 4177, filename, interval = 300, baseDir = process.cwd() } = {}) {
  const registry = new ModuleRegistry();
  const token = randomBytes(24).toString('hex');
  const style = await documentStyle();
  const views = new Map();
  const initialPath = filename ? path.resolve(baseDir, filename.startsWith('~/') ? path.join(process.env.HOME, filename.slice(2)) : filename) : null;
  if (initialPath) { registry.forFile(initialPath); await readSource(initialPath); }
  const publicFiles = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/document.css', ['document.css', 'text/css']], ['/media.js', ['media.js', 'text/javascript']], ['/pdfmd.js', ['pdfmd.js', 'text/javascript']], ['/tool-preferences.js', ['tool-preferences.js', 'text/javascript']], ['/formats.js', ['formats.js', 'text/javascript']], ['/format-options.js', ['format-options.js', 'text/javascript']], ['/tools.js', ['tools.js', 'text/javascript']], ['/photos.js', ['photos.js', 'text/javascript']], ['/photo-pdf.js', ['photo-pdf.js', 'text/javascript']], ['/pdf-pages.js', ['pdf-pages.js', 'text/javascript']], ['/pdf-selection.js', ['pdf-selection.js', 'text/javascript']], ['/omr.js', ['omr.js', 'text/javascript']], ['/lib/pdf-lib.js', ['../node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'text/javascript']]]);
  const details = (view, viewId) => ({ modules: registry.list(), baseDir, interval, state: view?.state ?? null, viewId, examplePath: new URL('../examples/welcome.md', import.meta.url).pathname });
  // Retain disconnected views briefly for reload/duplicate, then release memory
  // and watchers. No page IDs, paths or document data are written to disk.
  function scheduleExpiry(viewId, view) {
    clearTimeout(view.expiry);
    view.expiry = setTimeout(() => {
      if (view.clients.size || view.exporting) return scheduleExpiry(viewId, view);
      view.close(); views.delete(viewId);
    }, 30 * 60 * 1000);
    view.expiry.unref();
  }
  async function body(req) {
    let input = '';
    for await (const chunk of req) {
      input += chunk;
      if (input.length > 16384) throw new Error('Request is too large.');
    }
    try { return JSON.parse(input); } catch { throw new Error('Invalid JSON request.'); }
  }
  const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob: about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const host = req.headers.host;
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, { error: 'Invalid local origin.' }, 403);
    const url = new URL(req.url, origin);
    // Port-specific names let separate toolkit processes coexist in one browser.
    const sessionCookie = `toolkit_session_${server.address().port}=${token}`;
    try {
      if (publicFiles.has(url.pathname) && req.method === 'GET') {
        const [file, type] = publicFiles.get(url.pathname);
        if (url.pathname === '/') res.setHeader('Set-Cookie', `${sessionCookie}; Path=/; HttpOnly; SameSite=Strict`);
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(await readFile(new URL(`../public/${file}`, import.meta.url)));
      }
      if (!url.pathname.startsWith('/api/')) return json(res, { error: 'Not found.' }, 404);
      if (!(req.headers.cookie || '').split(';').some(cookie => cookie.trim() === sessionCookie)) return json(res, { error: 'Refresh the toolkit at its local address to start a session. Allow cookies for this local address.' }, 403);
      if (req.method === 'POST' && url.pathname === '/api/views') {
        const options = await body(req);
        const previous = typeof options.previousView === 'string' ? views.get(options.previousView) : null;
        const view = new DocumentSession({ registry, baseDir, interval, state: previous?.state ?? null });
        const viewId = randomBytes(24).toString('hex');
        try {
          if (options.path) await view.openFile(options.path);
          else if (previous?.state?.filename) await view.openFile(previous.state.filename, { recover: true });
          else if (initialPath) await view.openFile(initialPath, { recover: true });
          views.set(viewId, view); scheduleExpiry(viewId, view);
          return json(res, details(view, viewId));
        } catch (error) { view.close(); throw error; }
      }
      const viewId = req.headers['x-toolkit-view'];
      const view = views.get(viewId);
      const omrRequest = req.method === 'POST' && url.pathname === '/api/omr/prepare';
      if (req.method === 'GET' && url.pathname === '/api/info' && !viewId) return json(res, details());
      if (!view && !omrRequest) return json(res, { error: 'This page session has expired. Refresh the page to reopen it.' }, 410);
      if (view && !view.clients.size) scheduleExpiry(viewId, view);
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, details(view, viewId));
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        clearTimeout(view.expiry);
        view.clients.add(res);
        res.write(`data: ${JSON.stringify(view.state)}\n\n`);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        res.on('close', () => {
          view.clients.delete(res); clearInterval(heartbeat);
          if (!view.clients.size && views.has(viewId)) scheduleExpiry(viewId, view);
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/pdfmd/convert') return json(res, await convertPdfMarkdown(view, req, res));
      if (req.method === 'POST' && url.pathname === '/api/formats/convert') {
        const kind=url.searchParams.get('kind'),format=url.searchParams.get('format');
        const option=formatOption(kind,format),limit=FORMAT_OPTIONS[kind].limit*1024*1024;
        return await withMediaWork(view,res,async(folder,signal)=>{
          let size=0;
          const input=await open(path.join(folder,'input'),'wx');
          try {
            for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error(`Choose a ${kind} file up to ${FORMAT_OPTIONS[kind].limit} MB.`);await input.writeFile(chunk);}
          } finally {await input.close();}
          if(!size)throw new Error('Choose a local file.');
          const filename=await convertFormat(folder,kind,format,signal);
          await sendMedia(res,folder,filename,{maxBytes:(kind==='video'?1024:250)*1024*1024,contentType:option[2]});
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/media/scan') {
        const options = await body(req);
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', cancel);
        try { return json(res, { items: await scanMedia(view, options.url, controller.signal) }); }
        finally { res.off('close', cancel); }
      }
      if (req.method === 'POST' && url.pathname === '/api/media/audio') {
        const options = await body(req);
        return await withMediaWork(view, res, async (folder, signal) => {
          const filename = await downloadMedia(view, options, folder, signal);
          await sendMedia(res, folder, filename);
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/media/convert') {
        const format = mediaFormat(url.searchParams.get('format'), false);
        return await withMediaWork(view, res, async (folder, signal) => {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 100 * 1024 * 1024) throw new Error('Choose an audio file up to 100 MB.');
            chunks.push(chunk);
          }
          if (!size) throw new Error('Choose an audio file.');
          await writeFile(path.join(folder, 'input'), Buffer.concat(chunks));
          const filename = await convertMedia(folder, format, signal);
          await sendMedia(res, folder, filename);
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/open') return json(res, await view.openFile((await body(req)).path));
      if (req.method === 'POST' && url.pathname === '/api/omr/prepare') {
        const page = Number(url.searchParams.get('page') || 1), rotation = Number(url.searchParams.get('rotation') || 0);
        const profile = url.searchParams.get('profile') || 'preserve', download = url.searchParams.get('download') === '1';
        if (!Number.isInteger(page) || page < 1 || !Number.isFinite(rotation) || rotation < -5 || rotation > 5 || !['preserve','contrast','deskew'].includes(profile)) throw new Error('Choose a valid page, profile and rotation between -5° and 5°.');
        const chunks=[];let size=0;
        for await (const chunk of req) { size+=chunk.length; if(size>100*1024*1024) throw new Error('Choose a PDF smaller than 100 MB.'); chunks.push(chunk); }
        if (!size || (req.headers['content-type']||'').split(';')[0] !== 'application/pdf') throw new Error('Send one local PDF file.');
        const work=await mkdtemp(path.join(tmpdir(),'toolkit-omr-'));
        try {
          const input=path.join(work,'source.pdf'), output=path.join(work,'candidate.pdf');
          await writeFile(input,Buffer.concat(chunks));
          let sourceName='score.pdf';try{sourceName=decodeURIComponent(req.headers['x-source-name']||sourceName);}catch{}
          const script=fileURLToPath(new URL('./omr/enhance.py',import.meta.url));
          const args=[script,input,'--page',String(page),'--profile',profile,'--rotation',String(rotation),'--preview-only'];
          if(download) args.push('--pdf-output',output);
          const result=await new Promise((resolve,reject)=>{const child=spawn(process.env.PYTHON||'python3',args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(stderr.slice(-2000)||`OMR image preparation failed (${code}).`)));});
          const data=JSON.parse(result);data.report.source_name=path.basename(sourceName);
          if(download){res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="candidate-page-${page}.pdf"`});return res.end(await readFile(output));}
          return json(res,data);
        } finally {await rm(work,{recursive:true,force:true});}
      }
      if (req.method === 'POST' && url.pathname === '/api/export/pdf') {
        const options = await body(req);
        if (!['A4', 'Letter'].includes(options.paper)) throw new Error('Choose A4 or Letter paper.');
        const background = options.background ?? 'white';
        if (!['white', 'yellow', 'black'].includes(background)) throw new Error('Choose white, yellow, or black PDF background.');
        if (view.exporting) return json(res, { error: 'An export is already running. Please wait.' }, 409);
        // Refresh from disk at click time; export never uses a stale browser preview.
        if (!view.state?.filename) throw new Error('Open a Markdown file first.');
        const target = view.state.filename;
        view.exporting = true;
        try {
          const snapshot = await registry.forFile(target).render(await readSource(target), { filename: target });
          const buffer = await exportPdf(snapshot.html, style, { paper: options.paper, background, title: snapshot.title });
          const download = `${path.basename(target, path.extname(target))}.pdf`;
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(download)}` });
          return res.end(buffer);
        } finally { view.exporting = false; }
      }
      return json(res, { error: 'Not found.' }, 404);
    } catch (error) {
      if (!res.headersSent) json(res, { error: error.code === 'ENOENT' ? 'File not found. Check the local path.' : error.message }, 400);
      else res.end();
    }
  });
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const close = async () => {
    for (const view of views.values()) { abortMedia(view); abortPdfMarkdown(view); view.close(); }
    views.clear();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
  };
  return { server, url, close };
}
