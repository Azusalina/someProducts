import { EventEmitter } from 'node:events';
import { readSource } from './files.js';
import { stat } from 'node:fs/promises';

// Poll the path rather than an inode: editors often save by replacing the file.
export class FileWatcher extends EventEmitter {
  constructor(filename, interval = 300) {
    super();
    this.filename = filename;
    this.interval = interval;
    this.lastSource = undefined;
    this.lastError = undefined;
    this.stopped = false;
    this.dependencies = new Map();
  }
  async setDependencies(files = []) {
    this.dependencies = new Map(await Promise.all(files.map(async file => [file, await this.signature(file)])));
  }
  async signature(file) { return stat(file).then(s => `${s.mtimeMs}:${s.size}`).catch(() => 'missing'); }
  async start() {
    await this.tick();
    return this;
  }
  async tick() {
    try {
      const source = await readSource(this.filename);
      let dependencyChanged = false;
      for (const [file, previous] of this.dependencies) {
        const next = await this.signature(file);
        if (next !== previous) { dependencyChanged = true; this.dependencies.set(file, next); }
      }
      if (!this.stopped && (source !== this.lastSource || this.lastError || dependencyChanged)) {
        this.lastSource = source;
        this.lastError = undefined;
        this.emit('change', source);
      }
    } catch (error) {
      if (!this.stopped && error.message !== this.lastError) {
        this.lastError = error.message;
        this.emit('unavailable', error);
      }
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.tick(), this.interval);
    }
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
