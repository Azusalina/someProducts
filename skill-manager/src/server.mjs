import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { Scanner } from './scanner.mjs';
import { State } from './state.mjs';
import { Jobs } from './jobs.mjs';
import { Actions, removalPlan } from './actions.mjs';
import { Batch } from './batch.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
md.renderer.rules.image = (tokens, idx) => `<span class="image-placeholder">[图片：${md.utils.escapeHtml(tokens[idx].content || '')}]</span>`;
const linkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => { tokens[idx].attrSet('rel', 'noopener noreferrer'); tokens[idx].attrSet('target', '_blank'); return linkOpen(tokens, idx, options, env, self); };
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('需要 JSON 请求。'), { status: 415 });
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 65536) throw Object.assign(new Error('请求过大。'), { status: 413 }); parts.push(part); }
  try { return JSON.parse(Buffer.concat(parts).toString()); } catch { throw Object.assign(new Error('JSON 无效。'), { status: 400 }); }
}
export async function createApp(options = {}) {
  const state = await new State(options.dataDir || process.env.SKILL_MANAGER_DATA || path.join(root, '.data')).load();
  const scanner = options.scanner || new Scanner();
  const actions = new Actions(scanner, state), token = randomBytes(32).toString('hex');
  const jobs = new Jobs({ onComplete: () => scanner.scan(state.data.roots) });
  const batch = new Batch(scanner, state, actions, jobs);
  const expand = p => path.resolve(p === '~' ? scanner.home : p.startsWith('~/') ? path.join(scanner.home, p.slice(2)) : p);
  let scanning = scanner.scan(state.data.roots);
  scanning.catch(e => console.error('初始扫描失败：', e.message));
  const server = http.createServer(async (req, res) => {
    const address = server.address(), port = address?.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      if (!hosts.has(req.headers.host) || (req.headers.origin && ![...hosts].some(h => req.headers.origin === `http://${h}`)) || req.headers['sec-fetch-site'] === 'cross-site') return send({ error: '仅允许本机同源访问。' }, 403);
      const url = new URL(req.url, `http://${req.headers.host}`), route = url.pathname;
      if (route.startsWith('/api/')) {
        if (route === '/api/bootstrap' && req.method === 'GET') return send({ token, home: scanner.home, cwd: root, settings: state.public(), jobs: jobs.list(), batch: batch.public() });
        const given = Buffer.from(req.headers['x-skill-manager-token'] || '');
        if (given.length !== token.length || !timingSafeEqual(given, Buffer.from(token))) return send({ error: '会话已失效，请刷新页面。' }, 403);
        if (route === '/api/inventory' && req.method === 'GET') { if (scanner.running) await scanner.running; if (!scanner.result) await scanning; return send({ ...scanner.result, scanning: !!scanner.running, settings: state.public() }); }
        if (route === '/api/scan' && req.method === 'POST') { await body(req); scanning = scanner.scan(state.data.roots); return send({ ...await scanning, settings: state.public() }); }
        if (route === '/api/settings' && req.method === 'POST') {
          const d = await body(req);
          if (d.opacity !== undefined && (!Number.isFinite(d.opacity) || d.opacity < 0 || d.opacity > 100)) throw new Error('透明度范围是 0–100。');
          if (d.theme !== undefined && !['light', 'dark'].includes(d.theme)) throw new Error('主题无效。');
          if (d.roots !== undefined && (!Array.isArray(d.roots) || d.roots.length > 20 || d.roots.some(p => typeof p !== 'string' || !p.trim() || p.length > 4096))) throw new Error('扫描目录无效（最多 20 个）。');
          const roots = d.roots?.map(expand); if (roots) for (const p of roots) if (!(await fs.stat(p)).isDirectory()) throw new Error('扫描位置必须是目录。');
          await state.update(s => { if (d.opacity !== undefined) s.opacity = d.opacity; if (d.theme !== undefined) s.theme = d.theme; if (roots) s.roots = [...new Set(roots)]; }); return send(state.public());
        }
        if (route === '/api/pin' && req.method === 'POST') { const d = await body(req); scanner.get(d.id); if (typeof d.pinned !== 'boolean') throw new Error('收藏状态无效。'); await state.update(s => { s.pins = s.pins.filter(id => id !== d.id); if (d.pinned) s.pins.push(d.id); }); return send(state.public()); }
        if (route === '/api/batch/pin' && req.method === 'POST') {
          const d = await body(req); if (typeof d.pinned !== 'boolean') throw new Error('收藏状态无效。');
          const ids = batch.validate(d.selections).map(s => s.id), targets = new Set(ids);
          await state.update(s => { s.pins = s.pins.filter(id => !targets.has(id)); if (d.pinned) s.pins.push(...ids); }); return send(state.public());
        }
        if (route === '/api/batch/plan' && req.method === 'POST') { const d = await body(req); return send(batch.plan(d.selections)); }
        if (route === '/api/batch/remove' && req.method === 'POST') { const d = await body(req); return send(await batch.start(d.selections, d.fingerprint), 202); }
        if (route === '/api/batch' && req.method === 'GET') return send(batch.public());
        if (route === '/api/batch/cancel' && req.method === 'POST') { await body(req); return send(batch.cancel()); }
        if (batch.busy && req.method === 'POST' && ['/api/trash', '/api/restore', '/api/jobs'].includes(route)) return send({ error: '批量管理进行中，请先等待完成或停止。' }, 409);
        if (route === '/api/documents' && req.method === 'GET') return send({ files: await scanner.documents(url.searchParams.get('id')) });
        if (route === '/api/document' && req.method === 'GET') { const doc = await scanner.document(url.searchParams.get('id'), url.searchParams.get('file')); return send({ ...doc, html: /\.md$/i.test(doc.file) ? md.render(doc.content.replace(/^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')) : `<pre><code>${md.utils.escapeHtml(doc.content)}</code></pre>` }); }
        if (route === '/api/removal-plan' && req.method === 'GET') return send(removalPlan(scanner.get(url.searchParams.get('id')), scanner, url.searchParams.get('location')));
        if (route === '/api/trash' && req.method === 'POST') { const d = await body(req); if (jobs.busy()) throw new Error('请先等待命令结束。'); await scanner.scan(state.data.roots); const result = await actions.trash(d.id, d.locationId); await scanner.scan(state.data.roots); return send(result); }
        if (route === '/api/restore' && req.method === 'POST') { const d = await body(req); if (jobs.busy()) throw new Error('请先等待命令结束。'); await actions.restore(d.key); await scanner.scan(state.data.roots); return send(state.public()); }
        if (route === '/api/jobs' && req.method === 'GET') return send(jobs.list());
        if (route === '/api/jobs' && req.method === 'POST') { const d = await body(req); if (actions.busy) throw new Error('请等待文件操作结束。'); return send(await jobs.start(d.command, expand(d.cwd || root)), 201); }
        const jobRoute = route.match(/^\/api\/jobs\/([\w-]+)(?:\/(cancel|input))?$/);
        if (jobRoute && req.method === 'GET' && !jobRoute[2]) return send(jobs.public(jobs.get(jobRoute[1])));
        if (jobRoute && req.method === 'POST') { const d = await body(req); if (jobRoute[2] === 'cancel') return send(jobs.cancel(jobRoute[1])); if (jobRoute[2] === 'input') { jobs.input(jobRoute[1], d.text); return send({ ok: true }); } }
        return send({ error: 'API 不存在。' }, 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send({ error: '不支持的方法。' }, 405);
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      if (!assets[route]) return send({ error: '页面不存在。' }, 404);
      const [file, type] = assets[route]; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(await fs.readFile(path.join(root, 'public', file)));
    } catch (e) { if (!res.headersSent) send({ error: e.message }, e.status || 400); else res.end(); }
  });
  server.on('close', () => { batch.cancel(); jobs.close(); });
  return { server, scanner, state, jobs, batch, ready: scanning };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4380); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须介于 1–65535。');
  const app = await createApp();
  app.server.listen(port, '127.0.0.1', () => console.log(`Skill Manager · http://127.0.0.1:${port}`));
  app.server.on('error', e => { console.error(e.message); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { app.jobs.close(); app.server.close(); });
}
