import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export class State {
  constructor(dir) { this.dir = dir; this.data = { pins: [], opacity: 20, theme: 'light', roots: [], trash: [] }; this.queue = Promise.resolve(); }
  async load() { await fs.mkdir(this.dir, { recursive: true, mode: 0o700 }); try { Object.assign(this.data, JSON.parse(await fs.readFile(path.join(this.dir, 'state.json'), 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') throw new Error(`无法读取设置：${e.message}`); } for (const record of this.data.trash) if (record.status === 'pending') record.status = await fs.lstat(record.destination).catch(() => null) ? 'stored' : 'cancelled'; return this; }
  update(fn) { const run = this.queue.then(async () => { const next = structuredClone(this.data); fn(next); const tmp = path.join(this.dir, `state-${randomUUID()}.tmp`); await fs.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 }); await fs.rename(tmp, path.join(this.dir, 'state.json')); this.data = next; return next; }); this.queue = run.catch(() => {}); return run; }
  public() { const { pins, opacity, theme, roots, trash } = this.data; return { pins, opacity, theme, roots, trash: trash.filter(t => t.status === 'stored').map(({ key, name, original, time }) => ({ key, name, original, time })) }; }
}
