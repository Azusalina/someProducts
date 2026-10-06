import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createDiscovery } from './lib/discovery.mjs';
import { createTermination, ActionError } from './lib/termination.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function allowedHost(host, port) {
  return ['localhost', '127.0.0.1', '[::1]'].some(name => host === `${name}:${port}` || (port === 80 && host === name));
}

async function jsonBody(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new ActionError(415, 'Use application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024) throw new ActionError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body;
  } catch { throw new ActionError(400, 'Invalid JSON request.'); }
}

export function createHandler({ discover, ports, termination = createTermination({ mediatorPorts: ports }) }) {
  return async (request, response) => {
    const port = request.socket.localPort;
    const host = request.headers.host?.toLowerCase();
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (!ports.includes(port) || !allowedHost(host, port) || request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403); response.end('Mediator is available only through localhost.'); return;
    }
    if (request.headers.origin && request.headers.origin !== `http://${host}`) {
      response.writeHead(403); response.end('Cross-origin requests are not allowed.'); return;
    }
    try {
      const url = new URL(request.url, `http://${host}`);
      const pathname = url.pathname;
      if (['/api/terminate/preview', '/api/terminate'].includes(pathname)) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(JSON.stringify({ error: 'Use POST.' })); return; }
        if (request.headers.origin !== `http://${host}` || request.headers['x-mediator-action'] !== 'terminate') {
          throw new ActionError(403, 'Termination requires a same-origin request from Mediator.');
        }
        const payload = await jsonBody(request);
        const result = pathname.endsWith('/preview') ? await termination.prepare(payload) : await termination.terminate(payload);
        response.end(JSON.stringify(result)); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
      }
      if (pathname === '/favicon.ico' || pathname === '/favicon.svg') {
        response.writeHead(204); response.end(); return;
      }
      if (pathname === '/api/ports') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (request.method === 'HEAD') { response.end(); return; }
        response.end(JSON.stringify(await discover({ force: url.searchParams.get('fresh') === '1' }))); return;
      }
      const file = files.get(pathname);
      if (!file) { response.writeHead(404); response.end('Not found'); return; }
      const content = await readFile(resolve(root, 'public', file[0]));
      response.setHeader('Content-Type', file[1]);
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof ActionError) {
        response.writeHead(error.status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: error.message })); return;
      }
      console.error('Mediator request failed:', error.message);
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Port discovery is unavailable. Check that ss (iproute2) is installed and Mediator runs on the host.' }));
    }
  };
}

export async function start({ port = 8787, systemd = false } = {}) {
  const ports = [systemd ? 80 : port];
  const discover = createDiscovery({ configPath: resolve(root, 'services.json'), mediatorPorts: ports });
  const handler = createHandler({ discover, ports });
  const servers = [];
  if (systemd && (Number(process.env.LISTEN_PID) !== process.pid || Number(process.env.LISTEN_FDS) !== 2)) {
    throw new Error('Expected two listening sockets from mediator.socket. Start it with systemctl start mediator.socket.');
  }
  for (let index = 0; index < 2; index++) {
    const server = http.createServer({ requestTimeout: 10000, headersTimeout: 10000 }, handler);
    servers.push(server);
    try {
      await new Promise((ready, reject) => {
        server.once('error', reject);
        server.listen(systemd ? { fd: 3 + index } : { host: index === 0 ? '127.0.0.1' : '::1', port, ipv6Only: true }, ready);
      });
    } catch (error) {
      if (!systemd && index === 1 && error.code === 'EAFNOSUPPORT') { servers.pop(); continue; }
      for (const listener of servers) listener.close();
      throw error;
    }
    server.on('error', error => console.error(error.message));
  }
  console.log(`Mediator ready at http://localhost${ports[0] === 80 ? '' : `:${ports[0]}`} and http://127.0.0.1${ports[0] === 80 ? '' : `:${ports[0]}`}`);
  return servers;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--port');
  const port = index >= 0 ? Number(args[index + 1]) : 8787;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
  start({ port, systemd: args.includes('--systemd') }).then(servers => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
      for (const server of servers) server.close();
    });
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
