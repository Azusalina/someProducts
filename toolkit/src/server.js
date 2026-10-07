import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { ModuleRegistry } from './core/registry.js';
import { DocumentSession } from './core/document-session.js';
import { readSource, documentStyle } from './core/files.js';
import { exportPdf } from './core/pdf.js';

export async function createToolkit({ port = 4177, filename, interval = 300, baseDir = process.cwd() } = {}) {
  const registry = new ModuleRegistry();
  const token = randomBytes(24).toString('hex');
  const style = await documentStyle();
  const views = new Map();
  const initialPath = filename ? path.resolve(baseDir, filename.startsWith('~/') ? path.join(process.env.HOME, filename.slice(2)) : filename) : null;
  if (initialPath) { registry.forFile(initialPath); await readSource(initialPath); }
  const publicFiles = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/document.css', ['document.css', 'text/css']]]);
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
      if (req.method === 'GET' && url.pathname === '/api/info' && !viewId) return json(res, details());
      if (!view) return json(res, { error: 'This page session has expired. Refresh the page to reopen it.' }, 410);
      if (!view.clients.size) scheduleExpiry(viewId, view);
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
      if (req.method === 'POST' && url.pathname === '/api/open') return json(res, await view.openFile((await body(req)).path));
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
    for (const view of views.values()) view.close();
    views.clear();
    server.closeIdleConnections();
    await new Promise(resolve => server.close(resolve));
  };
  return { server, url, close };
}
