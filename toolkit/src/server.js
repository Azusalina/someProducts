import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { ModuleRegistry } from './core/registry.js';
import { FileWatcher } from './core/watcher.js';
import { readSource, documentStyle } from './core/files.js';
import { exportPdf } from './core/pdf.js';

export async function createToolkit({ port = 4177, filename, interval = 300, baseDir = process.cwd() } = {}) {
  const registry = new ModuleRegistry();
  const token = randomBytes(24).toString('hex');
  const style = await documentStyle();
  const clients = new Set();
  let watcher, state = null, generation = 0, rendering = Promise.resolve(), exporting = false;
  const publicFiles = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/document.css', ['document.css', 'text/css']]]);
  const sendState = () => { for (const client of clients) client.write(`data: ${JSON.stringify(state)}\n\n`); };
  async function openFile(input) {
    if (typeof input !== 'string' || !input.trim()) throw new Error('Enter a local Markdown file path.');
    const target = path.resolve(baseDir, input.startsWith('~/') ? path.join(process.env.HOME, input.slice(2)) : input.trim());
    const module = registry.forFile(target);
    await readSource(target); // Keep the current document when a new path is invalid.
    const current = ++generation;
    let revision = 0;
    watcher?.stop();
    watcher = new FileWatcher(target, interval);
    const update = source => {
      const version = ++revision;
      rendering = rendering.catch(() => {}).then(async () => {
        if (current !== generation || version !== revision) return;
        try {
          const result = await module.render(source, { filename: target });
          if (current !== generation || version !== revision) return;
          state = { ...result, source, filename: target, module: module.id, updatedAt: new Date().toISOString(), error: null };
        } catch (error) {
          if (current !== generation || version !== revision) return;
          state = { ...state, filename: target, error: `Rendering failed: ${error.message}` };
        }
        sendState();
      });
    };
    watcher.on('change', update);
    watcher.on('unavailable', error => {
      if (current !== generation) return;
      revision++;
      state = { ...state, filename: target, error: error.code === 'ENOENT' ? 'File is missing. Waiting for it to return…' : error.message };
      sendState();
    });
    await watcher.start();
    await rendering;
    return state;
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
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
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
      if (req.method === 'GET' && url.pathname === '/api/info') return json(res, { modules: registry.list(), baseDir, interval, state, examplePath: new URL('../examples/welcome.md', import.meta.url).pathname });
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        clients.add(res);
        res.write(`data: ${JSON.stringify(state)}\n\n`);
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        res.on('close', () => { clients.delete(res); clearInterval(heartbeat); });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/open') return json(res, await openFile((await body(req)).path));
      if (req.method === 'POST' && url.pathname === '/api/export/pdf') {
        const options = await body(req);
        if (!['A4', 'Letter'].includes(options.paper)) throw new Error('Choose A4 or Letter paper.');
        const background = options.background ?? 'white';
        if (!['white', 'yellow', 'black'].includes(background)) throw new Error('Choose white, yellow, or black PDF background.');
        if (exporting) return json(res, { error: 'An export is already running. Please wait.' }, 409);
        // Refresh from disk at click time; export never uses a stale browser preview.
        if (!state?.filename) throw new Error('Open a Markdown file first.');
        const target = state.filename;
        exporting = true;
        try {
          const snapshot = await registry.forFile(target).render(await readSource(target), { filename: target });
          const buffer = await exportPdf(snapshot.html, style, { paper: options.paper, background, title: snapshot.title });
          const download = `${path.basename(target, path.extname(target))}.pdf`;
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(download)}` });
          return res.end(buffer);
        } finally { exporting = false; }
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
    generation++; watcher?.stop();
    for (const client of clients) client.end();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
  };
  if (filename) { try { await openFile(filename); } catch (error) { await close(); throw error; } }
  return { server, url, openFile, close };
}
