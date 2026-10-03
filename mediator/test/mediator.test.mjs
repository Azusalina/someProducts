import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { parseListeners, isLocal, extractTitle, probeWeb } from '../lib/discovery.mjs';
import { allowedHost, createHandler } from '../server.mjs';

test('groups dual-stack TCP listeners while keeping UDP and network addresses distinct', () => {
  const services = parseListeners([
    'tcp LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=123,fd=4))',
    'tcp LISTEN 0 128 [::1]:5432 [::]:* users:(("postgres",pid=123,fd=5))',
    'udp UNCONN 0 0 *:1716 *:* users:(("kdeconnectd",pid=456,fd=9))',
    'tcp LISTEN 0 50 *:1716 *:* users:(("kdeconnectd",pid=456,fd=8))',
    'tcp LISTEN 0 50 [::ffff:127.0.0.1]:8081 *:*',
    'udp UNCONN 0 0 [fe80::abcd]%wlan0:546 [::]:*',
  ].join('\n'));
  assert.equal(services.length, 5);
  const db = services.find(s => s.port === 5432);
  assert.deepEqual(db.addresses, ['127.0.0.1', '::1']);
  assert.equal(db.processes.length, 1);
  assert.equal(services.find(s => s.port === 8081).addresses[0], '127.0.0.1');
  assert.equal(services.filter(s => s.port === 1716).length, 2);
  assert.equal(isLocal(services.find(s => s.port === 546).addresses[0]), false);
  assert.equal(isLocal('*'), true);
  assert.equal(isLocal('127.0.0.2'), true);
});

test('extracts bounded page titles as plain text, including entities', () => {
  assert.equal(extractTitle('<title>Hello &amp; &#x1F600; <b>there</b></title>'), 'Hello & 😀 there');
  assert.equal(extractTitle('<title>&#999999999;</title>'), null);
  assert.equal(extractTitle('<title>' + 'a'.repeat(200) + '</title>').length, 160);
  assert.equal(extractTitle('<h1>Missing title</h1>'), null);
});

test('accepts only loopback hosts on the actual serving port', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'localhost:80']) assert.equal(allowedHost(host, 80), true);
  for (const host of ['evil.test', 'localhost.evil.test', 'localhost:3000', '127.0.0.1@evil.test']) assert.equal(allowedHost(host, 80), false);
  assert.equal(allowedHost('localhost', 8787), false);
  assert.equal(allowedHost('localhost:8787', 8787), true);
});

test('web probe reads HTML titles and does not follow redirects', async t => {
  let redirected = false;
  let redirect = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/sensitive') redirected = true;
    if (redirect) { response.writeHead(302, { Location: '/sensitive' }); response.end(); }
    else { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<title>Local &amp; useful</title>'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const port = server.address().port;
  assert.equal((await probeWeb('127.0.0.1', port)).title, 'Local & useful');
  redirect = true;
  assert.equal((await probeWeb('127.0.0.1', port)).status, 302);
  assert.equal(redirected, false);
});

test('HTTP API and assets work while cross-site access and writes are rejected', async t => {
  let calls = 0;
  const ports = [];
  const server = http.createServer(createHandler({ ports, discover: async () => { calls++; return { services: [] }; } }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  ports.push(server.address().port);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${ports[0]}`;
  assert.deepEqual(await (await fetch(url + '/api/ports')).json(), { services: [] });
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url + '/style.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  const rejectedHost = await new Promise((resolve, reject) => {
    http.get(url + '/api/ports', { headers: { Host: 'evil.test' } }, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(rejectedHost, 403);
  assert.equal((await fetch(url + '/api/ports', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(url + '/api/ports', { headers: { Origin: 'http://evil.test' } })).status, 403);
  assert.equal((await fetch(url + '/api/ports', { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + '/../../package.json')).status, 404);
  assert.equal(calls, 1);
});
