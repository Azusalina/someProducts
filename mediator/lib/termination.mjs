import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { parseListeners } from './discovery.mjs';
import { processIdentity } from './processes.mjs';

const exec = promisify(execFile);
export const fuserPath = '/usr/bin/fuser';

export class ActionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateTarget({ port, protocol } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['tcp', 'udp'].includes(protocol)) {
    throw new ActionError(400, 'Choose a valid TCP or UDP port.');
  }
  return { port, protocol };
}

async function listeners() {
  const { stdout } = await exec('/usr/bin/ss', ['-H', '-lntup'], { timeout: 4000, maxBuffer: 2 * 1024 * 1024 });
  return parseListeners(stdout);
}

async function portPids({ port, protocol }) {
  try {
    const { stdout } = await exec(fuserPath, ['-n', protocol, String(port)], { timeout: 4000, maxBuffer: 65536 });
    return [...new Set(stdout.trim().split(/\s+/).filter(value => /^\d+$/.test(value)).map(Number))].sort((a, b) => a - b);
  } catch (error) {
    if (error.code === 1 && !error.stdout?.trim()) return [];
    throw new ActionError(503, 'fuser could not inspect this port.');
  }
}

export function createTermination({ mediatorPorts, protectedPid = process.pid, userId = process.geteuid() }) {
  const plans = new Map();
  let busy = false;

  async function inspect(target) {
    if (target.protocol === 'tcp' && mediatorPorts.includes(target.port)) throw new ActionError(403, 'Mediator cannot terminate itself.');
    try { await access(fuserPath, constants.X_OK); }
    catch { throw new ActionError(503, 'Install psmisc to provide /usr/bin/fuser.'); }
    const current = await listeners();
    if (!current.some(service => service.port === target.port && service.protocol === target.protocol)) {
      throw new ActionError(409, 'This port is no longer listening. Refresh the list.');
    }
    const pids = await portPids(target);
    if (!pids.length) throw new ActionError(403, 'No accessible process owns this port. Mediator runs as your normal user.');
    const protectedPids = new Set([protectedPid, ...current.filter(service => service.protocol === 'tcp' && mediatorPorts.includes(service.port)).flatMap(service => service.processes.map(process => process.pid))]);
    if (pids.some(pid => protectedPids.has(pid))) throw new ActionError(403, 'This process also serves Mediator and cannot be terminated.');
    const processes = await Promise.all(pids.map(async pid => {
      let identity;
      try { identity = await processIdentity(pid); }
      catch { throw new ActionError(409, 'The process changed. Select Terminate again to review the current owner.'); }
      if (identity.uid !== userId || identity.euid !== userId) throw new ActionError(403, 'This process belongs to another user and cannot be terminated here.');
      return identity;
    }));
    const related = current.filter(service => service.processes.some(process => pids.includes(process.pid)))
      .map(service => ({ port: service.port, protocol: service.protocol }));
    return { ...target, processes, related };
  }

  return {
    async prepare(payload) {
      const target = validateTarget(payload);
      const plan = await inspect(target);
      for (const [token, entry] of plans) if (entry.expiresAt < Date.now()) plans.delete(token);
      while (plans.size >= 32) plans.delete(plans.keys().next().value);
      const token = randomUUID();
      const expiresAt = Date.now() + 60000;
      plans.set(token, { ...plan, expiresAt });
      return { token, expiresAt, port: plan.port, protocol: plan.protocol,
        processes: plan.processes.map(({ pid, name }) => ({ pid, name })), related: plan.related };
    },

    async terminate(payload) {
      if (busy) throw new ActionError(409, 'Another termination is in progress.');
      const token = payload?.token;
      const plan = typeof token === 'string' ? plans.get(token) : null;
      if (!plan || plan.expiresAt < Date.now()) throw new ActionError(409, 'Confirmation expired. Select Terminate again.');
      plans.delete(token);
      busy = true;
      try {
        const current = await inspect(plan);
        if (current.processes.length !== plan.processes.length || current.processes.some((process, index) => process.pid !== plan.processes[index].pid || process.startTime !== plan.processes[index].startTime)) {
          throw new ActionError(409, 'The port owner changed. Select Terminate again to review the new process.');
        }
        // Numeric port and fixed protocol are validated; no shell, command text, or signal comes from the browser.
        try {
          await exec(fuserPath, ['-k', '-TERM', '-n', plan.protocol, String(plan.port)], { timeout: 4000, maxBuffer: 65536 });
        } catch { throw new ActionError(409, 'fuser could not terminate the process. It may have exited or changed ownership.'); }
        await delay(350);
        const remaining = await portPids(plan);
        return { port: plan.port, protocol: plan.protocol, pids: plan.processes.map(process => process.pid),
          remainingPids: remaining,
          message: remaining.length ? `SIGTERM sent to ${plan.protocol.toUpperCase()} port ${plan.port}; the port is still in use and may be shutting down or restarting.` : `Terminated ${plan.protocol.toUpperCase()} port ${plan.port}.` };
      } finally { busy = false; }
    },
  };
}
