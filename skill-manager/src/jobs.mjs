import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export class Jobs {
  constructor({ onComplete = () => {}, timeout = 15 * 60 * 1000 } = {}) { this.jobs = new Map(); this.onComplete = onComplete; this.timeout = timeout; }
  busy() { return [...this.jobs.values()].some(j => !j.finishedAt); }
  async start(command, cwd) {
    if (this.busy()) throw Object.assign(new Error('已有命令正在执行。'), { status: 409 });
    if (typeof command !== 'string' || !command.trim() || command.length > 16000 || command.includes('\0')) throw new Error('请输入有效命令（最多 16000 字符）。');
    const stat = await fs.stat(cwd); if (!stat.isDirectory()) throw new Error('工作目录不存在。');
    const job = { id: randomUUID(), command, cwd: path.resolve(cwd), output: '', status: 'running', startedAt: new Date().toISOString(), exitCode: null };
    const child = spawn('/bin/bash', ['-lc', command], { cwd: job.cwd, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    job.child = child; this.jobs.set(job.id, job);
    while (this.jobs.size > 20) this.jobs.delete(this.jobs.keys().next().value);
    const append = data => { job.output += data.toString(); if (job.output.length > 1_000_000) { job.output = job.output.slice(-1_000_000); job.truncated = true; } };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.on('error', e => { append(e.message); job.status = 'failed'; });
    child.on('close', (code, signal) => { clearTimeout(job.timer); job.exitCode = code; job.signal = signal; if (job.status === 'running') job.status = code === 0 ? 'succeeded' : 'failed'; job.finishedAt = new Date().toISOString(); this.kill(job); Promise.resolve(this.onComplete(job)).catch(e => append(`\n扫描失败：${e.message}`)); });
    child.stdin.on('error', () => {});
    job.timer = setTimeout(() => { job.status = 'timedout'; append('\n命令已超过 15 分钟，已停止。'); this.kill(job); }, this.timeout); job.timer.unref();
    return this.public(job);
  }
  kill(job) { try { process.kill(-job.child.pid, 'SIGTERM'); const pid = job.child.pid; const t = setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch {} }, 1000); t.unref(); } catch {} }
  get(id) { const job = this.jobs.get(id); if (!job) throw Object.assign(new Error('命令记录不存在。'), { status: 404 }); return job; }
  cancel(id) { const job = this.get(id); if (job.status === 'running') { job.status = 'cancelled'; this.kill(job); } return this.public(job); }
  input(id, text) { const job = this.get(id); if (job.status !== 'running') throw new Error('命令已结束。'); if (typeof text !== 'string' || text.length > 4096) throw new Error('输入过长。'); job.child.stdin.write(text + '\n'); }
  public(job) { const { child, timer, ...data } = job; return data; }
  list() { return [...this.jobs.values()].reverse().map(j => this.public(j)); }
  close() { for (const job of this.jobs.values()) if (job.status === 'running') this.cancel(job.id); }
}
