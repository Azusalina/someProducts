import path from 'node:path';
import { FileWatcher } from './watcher.js';
import { readSource } from './files.js';

// Each browser page owns its watcher, render revisions and event subscribers.
export class DocumentSession {
  constructor({ registry, baseDir, interval, state = null }) {
    Object.assign(this, { registry, baseDir, interval, state });
    this.clients = new Set();
    this.generation = 0;
    this.rendering = Promise.resolve();
    this.exporting = false;
  }
  sendState() {
    for (const client of this.clients) client.write(`data: ${JSON.stringify(this.state)}\n\n`);
  }
  async openFile(input, { recover = false } = {}) {
    if (typeof input !== 'string' || !input.trim()) throw new Error('Enter a local Markdown file path.');
    const target = path.resolve(this.baseDir, input.startsWith('~/') ? path.join(process.env.HOME, input.slice(2)) : input.trim());
    const module = this.registry.forFile(target);
    if (!recover) await readSource(target); // Invalid paths preserve this page's document.
    const current = ++this.generation;
    let revision = 0;
    this.watcher?.stop();
    this.watcher = new FileWatcher(target, this.interval);
    this.watcher.on('change', source => {
      const version = ++revision;
      this.rendering = this.rendering.catch(() => {}).then(async () => {
        if (current !== this.generation || version !== revision) return;
        try {
          const result = await module.render(source, { filename: target });
          if (current !== this.generation || version !== revision) return;
          this.state = { ...result, source, filename: target, module: module.id, updatedAt: new Date().toISOString(), error: null };
        } catch (error) {
          if (current !== this.generation || version !== revision) return;
          this.state = { ...this.state, filename: target, error: `Rendering failed: ${error.message}` };
        }
        this.sendState();
      });
    });
    this.watcher.on('unavailable', error => {
      if (current !== this.generation) return;
      revision++;
      this.state = { ...this.state, filename: target, error: error.code === 'ENOENT' ? 'File is missing. Waiting for it to return…' : error.message };
      this.sendState();
    });
    await this.watcher.start();
    await this.rendering;
    return this.state;
  }
  close() {
    this.generation++;
    this.watcher?.stop();
    clearTimeout(this.expiry);
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.state = null;
  }
}
