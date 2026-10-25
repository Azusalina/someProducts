import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inside } from './scanner.mjs';
import { quote } from './jobs.mjs';
export function removalPlan(item, scanner, locationId) {
  if (item.kind === 'skill' && item.owners?.length) {
    const owner = scanner.get(item.owners[0]);
    return { type: 'owner', ownerId: owner.id, message: `此技能属于 ${owner.name}。请在所属插件页面卸载，避免破坏插件。` };
  }
  if (item.kind === 'plugin') {
    if (item.provider === 'Claude' && item.registrations?.length) return { type: 'command', options: item.registrations.map(r => ({ label: `${r.scope}${r.projectPath ? ' · ' + r.projectPath : ''}`, command: `claude plugin uninstall ${quote(r.selector)} --scope ${quote(r.scope)} --keep-data`, cwd: r.projectPath || scanner.home })) };
    if (item.provider === 'Codex' && item.selector && ['enabled', 'disabled', 'missing'].includes(item.status)) return { type: 'command', options: [{ label: item.selector, command: `codex plugin remove ${quote(item.selector)}`, cwd: scanner.home }] };
    // Unregistered cache folders may be referenced outside the available registry.
    if (item.scope === 'cache') return { type: 'command', options: [{ label: '通过 CLI 移除缓存及注册信息', command: item.provider === 'Codex' ? `codex plugin remove ${quote(item.selector)}` : `claude plugin uninstall ${quote(item.selector)} --keep-data`, cwd: scanner.home }], message: '缓存存在不等于已安装；CLI 将核实注册信息，未注册时可能返回错误。' };
  }
  const loc = item.locations.find(l => l.id === locationId) || item.locations[0];
  const dependents = scanner.items.filter(i => i.id !== item.id && i.locations.some(l => l.symlink && inside(item.realPath, i.realPath))).map(i => i.name);
  const aliases = item.locations.filter(l => l.path !== loc.path).map(l => l.path);
  return { type: 'trash', locationId: loc.id, path: loc.path, symlink: !!loc.symlink, dependents, aliases, message: loc.symlink ? '只移除这个符号链接，原始文件保留。可从已移除项目恢复。' : `将目录移至同级隐藏暂存区，可恢复。${aliases.length || dependents.length ? '其他共享入口可能随之失效。' : ''}` };
}
export class Actions {
  constructor(scanner, state) { this.scanner = scanner; this.state = state; this.busy = false; }
  async exclusive(fn) { if (this.busy) throw Object.assign(new Error('文件操作进行中。'), { status: 409 }); this.busy = true; try { return await fn(); } finally { this.busy = false; } }
  async trash(id, locationId) { return this.exclusive(async () => {
    const item = this.scanner.get(id), plan = removalPlan(item, this.scanner, locationId);
    if (plan.type !== 'trash') throw new Error('此项目需通过所属插件或 CLI 卸载。');
    const original = plan.path, parent = path.dirname(original);
    // Reject replaced ancestors, but permit the selected entry itself to be a symlink.
    const actualParent = await fs.realpath(parent);
    if (actualParent !== parent) throw new Error('父目录是符号链接，请从实际安装位置管理此入口。');
    await fs.lstat(original);
    const key = randomUUID(), trashDir = path.join(parent, '.skill-manager-trash');
    await fs.mkdir(trashDir, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(trashDir)).isSymbolicLink()) throw new Error('暂存目录不能是符号链接。');
    const destination = path.join(trashDir, key);
    const record = { key, name: item.name, original, destination, time: new Date().toISOString(), status: 'pending' };
    await this.state.update(s => s.trash.push(record));
    try { await fs.rename(original, destination); await this.state.update(s => { s.trash.find(t => t.key === key).status = 'stored'; }); }
    catch (e) { // Keep a recoverable journal even if writing final state fails.
      if (await fs.lstat(destination).catch(() => false)) await fs.rename(destination, original).catch(() => {});
      throw e;
    }
    return { key };
  }); }
  async restore(key) { return this.exclusive(async () => {
    const rec = this.state.data.trash.find(t => t.key === key && t.status === 'stored'); if (!rec) throw new Error('恢复记录不存在。');
    if (await fs.lstat(rec.original).catch(() => false)) throw new Error('原位置已有文件，请先移走后再恢复。');
    const parent = path.dirname(rec.original);
    if (await fs.realpath(parent) !== parent || await fs.realpath(path.dirname(rec.destination)) !== path.join(parent, '.skill-manager-trash')) throw new Error('恢复路径已改变。');
    await fs.rename(rec.destination, rec.original);
    try { await this.state.update(s => { s.trash.find(t => t.key === key).status = 'restored'; }); }
    catch (e) { await fs.rename(rec.original, rec.destination).catch(() => {}); throw e; }
  }); }
}
