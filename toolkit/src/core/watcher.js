import { EventEmitter } from 'node:events';
import { readSource } from './files.js';

// Poll the path rather than an inode: editors often save by replacing the file.
export class FileWatcher extends EventEmitter {
  constructor(filename, interval = 300) {
    super();
    this.filename = filename;
    this.interval = interval;
    this.lastSource = undefined;
    this.lastError = undefined;
    this.stopped = false;
  }
  async start() {
    await this.tick();
    return this;
  }
  async tick() {
    try {
      const source = await readSource(this.filename);
      if (!this.stopped && (source !== this.lastSource || this.lastError)) {
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
