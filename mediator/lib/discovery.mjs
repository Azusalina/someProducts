import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const exec = promisify(execFile);
const known = new Map([
  [22, ['SSH', 'Secure shell and remote terminal access', false]],
  [53, ['DNS', 'Domain name resolution', false]],
  [323, ['Chrony', 'Local clock synchronization control', false]],
  [631, ['CUPS', 'Printer management and Internet Printing Protocol', true]],
  [1716, ['KDE Connect', 'Desktop and phone connectivity', false]],
  [3306, ['MySQL', 'Relational database connections', false]],
  [3389, ['Remote desktop', 'Remote Desktop Protocol connections', false]],
  [5432, ['PostgreSQL', 'Relational database connections', false]],
  [5600, ['ActivityWatch', 'Local activity tracking dashboard', true]],
  [6379, ['Redis', 'In-memory data storage', false]],
  [27017, ['MongoDB', 'Document database connections', false]],
  [37700, ['claude-mem', 'Memory worker and activity dashboard', true]],
]);

function endpoint(value) {
  const colon = value.lastIndexOf(':');
  if (colon < 0) return null;
  const port = Number(value.slice(colon + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  let address = value.slice(0, colon).replace(/^\[|\]$/g, '');
  address = address.replace(/^::ffff:/, '');
  return { address, port };
}

export function isLocal(address) {
  return address === '*' || address === '0.0.0.0' || address === '::' ||
    address === '::1' || /^127\./.test(address);
}

export function parseListeners(output) {
  const groups = new Map();
  for (const line of output.trim().split('\n')) {
    const columns = line.trim().split(/\s+/);
    if (!['tcp', 'udp'].includes(columns[0])) continue;
    const local = endpoint(columns[4] || '');
    if (!local) continue;
    const protocol = columns[0];
    const key = `${protocol}:${local.port}`;
    const group = groups.get(key) || { id: key, protocol, port: local.port, addresses: [], processes: [] };
    if (!group.addresses.includes(local.address)) group.addresses.push(local.address);
    for (const match of line.matchAll(/\("([^"]+)",pid=(\d+),fd=\d+\)/g)) {
      const pid = Number(match[2]);
      if (!group.processes.some(process => process.pid === pid)) group.processes.push({ pid, name: match[1] });
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
}

export function extractTitle(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return title.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, code) => {
    if (code[0] !== '#') return entities[code.toLowerCase()] || whole;
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replace(/\s+/g, ' ').trim().slice(0, 160) || null;
}

async function processInfo(process) {
  try {
    const [cwd, command, executable] = await Promise.all([
      readlink(`/proc/${process.pid}/cwd`),
      readFile(`/proc/${process.pid}/cmdline`, 'utf8'),
      readlink(`/proc/${process.pid}/exe`).catch(() => process.name),
    ]);
    const args = command.split('\0').filter(Boolean);
    // Read only a package in the service's own directory; never expose full command arguments.
    let project;
    try { project = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8')); } catch {}
    const directoryIndex = args.indexOf('--directory');
    const servedDirectory = directoryIndex >= 0 && args[directoryIndex + 1]
      ? basename(resolve(cwd, args[directoryIndex + 1])) : null;
    const script = args.find((arg, index) => index > 0 && /\.(m?js|cjs|py)$/.test(arg));
    return {
      ...process,
      name: basename(executable),
      project: servedDirectory || project?.name || (script ? basename(dirname(resolve(cwd, script))) : null),
      description: typeof project?.description === 'string' ? project.description.slice(0, 220) : null,
      script: script ? basename(script) : null,
    };
  } catch { return process; }
}

function requestProbe(host, port, scheme, method) {
  return new Promise(resolveProbe => {
    let settled = false;
    let request;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveProbe(value);
      request?.destroy();
    };
    const deadline = setTimeout(() => finish(null), 900);
    request = (scheme === 'https' ? https : http).request({
      host, port, path: '/', method, agent: false,
      // Only loopback is probed. A self-signed certificate is reported to the UI.
      ...(scheme === 'https' ? { rejectUnauthorized: false } : {}),
      headers: { 'User-Agent': 'Mediator/1.0', Accept: 'text/html, application/json;q=0.5' },
    }, response => {
      const result = {
        scheme, status: response.statusCode,
        contentType: String(response.headers['content-type'] || '').split(';')[0],
        certificateTrusted: scheme !== 'https' || Boolean(response.socket.authorized),
      };
      if (method === 'HEAD') return finish(result);
      const chunks = [];
      let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        chunks.push(chunk.subarray(0, Math.max(0, 65536 - (length - chunk.length))));
        if (length >= 65536) finish({ ...result, title: extractTitle(Buffer.concat(chunks).toString('utf8')) });
      });
      response.on('end', () => finish({ ...result, title: extractTitle(Buffer.concat(chunks).toString('utf8')) }));
      response.on('error', () => finish(result));
    });
    request.on('error', () => finish(null));
    request.end();
  });
}

export async function probeWeb(host, port) {
  for (const scheme of ['http', 'https']) {
    const result = await requestProbe(host, port, scheme, 'HEAD');
    if (!result) continue;
    if (result.contentType === 'text/html' || [405, 501].includes(result.status)) {
      const page = await requestProbe(host, port, scheme, 'GET');
      return page || result;
    }
    return result;
  }
  return null;
}

function hostsFor(addresses) {
  const hosts = [];
  if (addresses.some(address => address === '*' || address === '0.0.0.0' || /^127\./.test(address))) {
    // Some services bind to 127.0.0.2 rather than 127.0.0.1.
    const specific = addresses.find(address => /^127\./.test(address));
    hosts.push(specific || '127.0.0.1');
  }
  if (addresses.some(address => address === '*' || address === '::' || address === '::1')) hosts.push('::1');
  return hosts;
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export function createDiscovery({ configPath, mediatorPorts = [] } = {}) {
  const probeCache = new Map();
  let snapshot;
  let inFlight;
  return async function discover() {
    if (inFlight) return inFlight;
    if (snapshot && Date.now() - snapshot.timestamp < 2500) return snapshot.data;
    inFlight = (async () => {
      const { stdout } = await exec('/usr/bin/ss', ['-H', '-lntup'], { timeout: 4000, maxBuffer: 2 * 1024 * 1024 });
      const listeners = parseListeners(stdout);
      let overrides = {};
      let configWarning;
      if (configPath) {
        try { overrides = JSON.parse(await readFile(configPath, 'utf8')).services || {}; }
        catch (error) { configWarning = `Service descriptions could not be read (${error.code || 'invalid JSON'}).`; }
      }
      const pidInfo = new Map();
      const services = await mapConcurrent(listeners, 6, async listener => {
        const processes = await Promise.all(listener.processes.map(process => {
          if (!pidInfo.has(process.pid)) pidInfo.set(process.pid, processInfo(process));
          return pidInfo.get(process.pid);
        }));
        const local = listener.addresses.some(isLocal);
        const self = listener.protocol === 'tcp' && mediatorPorts.includes(listener.port);
        const standard = known.get(listener.port);
        const override = overrides[listener.id] || overrides[String(listener.port)] || {};
        let web = null;
        let host = hostsFor(listener.addresses)[0];
        if (local && listener.protocol === 'tcp' && !self && standard?.[2] !== false) {
          // Reprobe when ownership changes or at least every 15 seconds.
          const key = `${listener.id}:${listener.addresses.join(',')}:${processes.map(p => p.pid).join(',')}`;
          const cached = probeCache.get(key);
          if (cached && Date.now() - cached.timestamp < 15000) ({ web, host } = cached);
          else {
            for (const candidate of hostsFor(listener.addresses)) {
              web = await probeWeb(candidate, listener.port);
              if (web) { host = candidate; break; }
            }
            probeCache.set(key, { timestamp: Date.now(), web, host });
          }
        }
        const process = processes.find(p => p.project) || processes[0];
        const inferredName = web?.title || process?.project || standard?.[0] || process?.name || 'Unidentified service';
        const title = self ? 'Mediator' : typeof override.name === 'string' ? override.name.slice(0, 160) : inferredName;
        const description = self ? 'Your local port directory — you are here.' :
          typeof override.description === 'string' ? override.description.slice(0, 300) :
          process?.description || standard?.[1] ||
          (web ? (web.contentType.includes('json') ? 'Local HTTP API' : 'Local web service') :
            listener.protocol === 'udp' ? 'UDP listener; browsers cannot open this service.' : 'Listening TCP service; HTTP was not detected.');
        return {
          ...listener, processes, local, self, name: title, description,
          source: self ? 'Mediator' : override.name ? 'Your description' : web?.title ? 'Page title' : process?.project ? 'Project' : standard ? 'Port convention' : process?.name ? 'Process' : 'Unknown',
          web: web ? { ...web, url: `${web.scheme}://${host.includes(':') ? `[${host}]` : host}:${listener.port}/` } : null,
        };
      });
      for (const [key, value] of probeCache) if (Date.now() - value.timestamp > 60000) probeCache.delete(key);
      const data = { services, scannedAt: new Date().toISOString(), ...(configWarning ? { warning: configWarning } : {}) };
      snapshot = { timestamp: Date.now(), data };
      return data;
    })();
    try { return await inFlight; } finally { inFlight = null; }
  };
}
