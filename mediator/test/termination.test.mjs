import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createTermination } from '../lib/termination.mjs';
import { createHandler } from '../server.mjs';

async function fixture(t, port = 0) {
  const source = `
    import http from 'node:http';
    import dgram from 'node:dgram';
    import { once } from 'node:events';
    const handler = (req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Disposable service</title>'); };
    const first = http.createServer(handler), second = http.createServer(handler), udp = dgram.createSocket('udp4');
    first.listen(Number(process.env.FIXTURE_PORT), '127.0.0.1'); await once(first, 'listening');
    second.listen(0, '127.0.0.1'); await once(second, 'listening');
    udp.bind(0, '127.0.0.1'); await once(udp, 'listening');
    process.send({ tcp: first.address().port, other: second.address().port, udp: udp.address().port });
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, FIXTURE_PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
  const ready = await Promise.race([
    once(child, 'message').then(([value]) => value),
    once(child, 'exit').then(([code]) => { throw new Error(`Fixture exited before readiness (${code}).`); }),
  ]);
  return { child, ...ready };
}

async function api(t, termination) {
  const ports = [];
  const server = http.createServer(createHandler({ ports, termination, discover: async () => ({ services: [] }) }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  ports.push(server.address().port);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${ports[0]}`;
  const post = (path, body, overrides = {}) => fetch(url + path, {
    method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', 'X-Mediator-Action': 'terminate', ...overrides }, body: JSON.stringify(body),
  });
  return { url, post };
}

test('termination API rejects cross-site, missing-origin, unsupported method, and invalid targets', async t => {
  let calls = 0;
  const { url, post } = await api(t, {
    prepare: async () => { calls++; return {}; }, terminate: async () => { calls++; return {}; },
  });
  assert.equal((await fetch(url + '/api/terminate/preview')).status, 405);
  assert.equal((await post('/api/terminate/preview', {}, { Origin: 'http://evil.test' })).status, 403);
  assert.equal((await post('/api/terminate/preview', {}, { Origin: '', 'X-Mediator-Action': '' })).status, 403);
  assert.equal((await post('/api/terminate', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/api/terminate/preview', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/terminate/preview', { padding: 'x'.repeat(1500) })).status, 413);
  assert.equal(calls, 0);
  const real = createTermination({ mediatorPorts: [80] });
  for (const payload of [{ port: '3000; kill -9 1', protocol: 'tcp' }, { port: 0, protocol: 'tcp' }, { port: 3000, protocol: 'file' }]) {
    await assert.rejects(real.prepare(payload), error => error.status === 400);
  }
  await assert.rejects(real.prepare({ port: 80, protocol: 'tcp' }), error => error.status === 403);
  await assert.rejects(real.terminate({ token: 'not-a-confirmation' }), error => error.status === 409);
});

test('actual fuser termination reports shared TCP/UDP listeners and consumes its confirmation', async t => {
  const target = await fixture(t);
  const { post } = await api(t, createTermination({ mediatorPorts: [80] }));
  const response = await post('/api/terminate/preview', { port: target.tcp, protocol: 'tcp' });
  assert.equal(response.status, 200);
  const plan = await response.json();
  assert.deepEqual(plan.processes.map(p => p.pid), [target.child.pid]);
  assert.ok(plan.related.some(p => p.protocol === 'tcp' && p.port === target.other));
  assert.ok(plan.related.some(p => p.protocol === 'udp' && p.port === target.udp));
  const exited = once(target.child, 'exit');
  const killed = await post('/api/terminate', { token: plan.token });
  assert.equal(killed.status, 200);
  const result = await killed.json();
  assert.deepEqual(result.remainingPids, []);
  const [, signal] = await exited;
  assert.equal(signal, 'SIGTERM');
  assert.equal((await post('/api/terminate', { token: plan.token })).status, 409);
});

test('UDP termination uses fuser UDP namespace and refuses another user identity', async t => {
  const target = await fixture(t);
  const denied = createTermination({ mediatorPorts: [80], userId: process.geteuid() + 1 });
  await assert.rejects(denied.prepare({ port: target.udp, protocol: 'udp' }), error => error.status === 403);
  assert.equal(target.child.signalCode, null);
  const action = createTermination({ mediatorPorts: [80] });
  const plan = await action.prepare({ port: target.udp, protocol: 'udp' });
  const exited = once(target.child, 'exit');
  const result = await action.terminate({ token: plan.token });
  assert.deepEqual(result.remainingPids, []);
  assert.equal((await exited)[1], 'SIGTERM');
});

test('a reused port cannot terminate its replacement using an old confirmation', async t => {
  const old = await fixture(t);
  const action = createTermination({ mediatorPorts: [80] });
  const plan = await action.prepare({ port: old.tcp, protocol: 'tcp' });
  const exited = once(old.child, 'exit');
  old.child.kill('SIGTERM'); await exited;
  const replacement = await fixture(t, old.tcp);
  await assert.rejects(action.terminate({ token: plan.token }), error => error.status === 409 && /owner changed/.test(error.message));
  assert.equal(replacement.child.signalCode, null);
  assert.equal((await fetch(`http://127.0.0.1:${replacement.tcp}/`)).status, 200);
});
