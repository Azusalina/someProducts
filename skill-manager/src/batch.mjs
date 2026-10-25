import { createHash, randomUUID } from 'node:crypto';
import { removalPlan } from './actions.mjs';
import { inside } from './scanner.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export class Batch {
  constructor(scanner, state, actions, jobs) { Object.assign(this, { scanner, state, actions, jobs }); this.task = null; }
  get busy() { return !!this.task && !this.task.finishedAt; }
  validate(selections) {
    if (!Array.isArray(selections) || !selections.length || selections.length > 500) throw new Error('请选择 1–500 个项目。');
    const seen = new Set();
    return selections.map(s => {
      if (!s || typeof s.id !== 'string' || seen.has(s.id)) throw new Error('选择包含无效或重复项目。');
      seen.add(s.id); const item = this.scanner.get(s.id);
      if (s.locationId !== undefined && !item.locations.some(l => l.id === s.locationId)) throw new Error('安装入口已改变，请重新核对。');
      return { ...s, item };
    });
  }
  plan(selections) {
    const entries = this.validate(selections), selected = new Set(entries.map(e => e.id));
    const rows = entries.map(({ item, ...choice }) => {
      const plan = removalPlan(item, this.scanner, choice.locationId);
      const row = { id: item.id, name: item.name, kind: item.kind, type: plan.type, message: plan.message || '', locations: item.locations, ...plan, disposition: 'ready' };
      if (plan.type === 'owner') { row.disposition = selected.has(plan.ownerId) ? 'covered' : 'blocked'; row.message = selected.has(plan.ownerId) ? '随已选中的所属插件一起处理。' : plan.message; }
      if (plan.type === 'command') {
        const option = choice.option ?? 0;
        if (!Number.isInteger(option) || !plan.options[option]) throw new Error('卸载范围已改变，请重新核对。');
        Object.assign(row, { option, ...plan.options[option] });
      }
      return row;
    });
    const commands = new Set();
    for (const row of rows) if (row.disposition === 'ready') {
      if (row.type === 'command') {
        const key = JSON.stringify([row.cwd, row.command]);
        if (commands.has(key)) { row.disposition = 'covered'; row.message = '与另一选中项共用相同卸载命令，仅执行一次。'; }
        commands.add(key);
      } else if (row.type === 'trash' && rows.some(other => other !== row && other.type === 'trash' && other.disposition === 'ready' && inside(other.path, row.path) && other.path !== row.path)) {
        row.disposition = 'covered'; row.message = '已包含在另一选中目录的移除范围内。';
      }
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    return { rows, fingerprint, executable: rows.filter(r => r.disposition === 'ready').length };
  }
  async start(selections, fingerprint) {
    if (this.busy || this.jobs.busy() || this.actions.busy) throw Object.assign(new Error('已有管理操作正在进行。'), {status:409});
    // Reserve before awaiting the rescan so another request cannot start a second batch.
    this.task = { id: randomUUID(), status: 'running', reviewing: true, results: [], startedAt: new Date().toISOString(), cancelled: false };
    try {
      await this.scanner.scan(this.state.data.roots);
      const plan = this.plan(selections);
      if (fingerprint !== plan.fingerprint) throw Object.assign(new Error('安装信息已变化，请重新打开批量移除并核对。'), {status:409});
      if (!plan.executable) throw new Error('没有可执行的移除目标；请先选择需要移除的所属插件。');
      this.task.reviewing = false;
      this.task.results = plan.rows.map(row => ({ ...row, status: row.disposition === 'ready' ? 'pending' : 'skipped' }));
      void this.run(this.task);
      return this.public();
    } catch (e) { this.task.status = 'failed'; this.task.error = e.message; this.task.finishedAt = new Date().toISOString(); throw e; }
  }
  async run(task) {
    try {
      for (const row of task.results) {
        if (row.status !== 'pending') continue;
        if (task.cancelled) { row.status = 'skipped'; row.message = '操作已停止，尚未执行。'; continue; }
        row.status = 'running';
        try {
          if (row.type === 'trash') { const result = await this.actions.trash(row.id, row.locationId); row.trashKey = result.key; row.status = 'succeeded'; }
          else {
            const job = await this.jobs.start(row.command, row.cwd); task.jobId = job.id;
            while (!this.jobs.get(job.id).finishedAt) { if (task.cancelled) this.jobs.cancel(job.id); await pause(50); }
            const final = this.jobs.public(this.jobs.get(job.id));
            row.output = final.output.slice(-100000); row.exitCode = final.exitCode;
            row.status = final.status === 'succeeded' ? 'succeeded' : final.status === 'cancelled' ? 'cancelled' : 'failed';
            if (row.status !== 'succeeded') row.error = `命令${final.status === 'cancelled' ? '已停止' : '失败'} · exit ${final.exitCode ?? '—'}`;
            task.jobId = null;
          }
        } catch (e) { row.status = 'failed'; row.error = e.message; }
      }
      task.status = task.cancelled ? 'cancelled' : 'completed';
    } catch (e) { task.status = 'failed'; task.error = e.message; }
    finally {
      try { await this.scanner.scan(this.state.data.roots); } catch (e) { task.scanError = e.message; }
      task.finishedAt = new Date().toISOString();
    }
  }
  cancel() { if (this.busy) { this.task.cancelled = true; if (this.task.jobId) this.jobs.cancel(this.task.jobId); } return this.public(); }
  public() {
    if (!this.task) return null;
    const copy = structuredClone(this.task);
    if (copy.jobId) { const job = this.jobs.public(this.jobs.get(copy.jobId)); const row = copy.results.find(r => r.status === 'running'); if (row) row.output = job.output.slice(-100000); }
    return copy;
  }
}
