import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parse as yaml } from 'yaml';
import { parse as toml } from 'smol-toml';
export const idFor = p => createHash('sha256').update(p).digest('hex').slice(0, 24);
export const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const skip = new Set(['node_modules', 'vendor', 'target', 'build', 'dist', '.git', '.venv', 'venv', '__pycache__', '.skill-manager-trash', '.data', 'artifacts']);
async function json(p, fallback = {}) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; } }
async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
export function frontmatter(text) {
  const m = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return {};
  try { const d = yaml(m[1]); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}
export class Scanner {
  constructor({ home = os.homedir(), codexHome = process.env.CODEX_HOME, claudeHome = process.env.CLAUDE_CONFIG_DIR, discoverRoots, systemRoots } = {}) {
    this.home = home; this.codex = codexHome || path.join(home, '.codex'); this.claude = claudeHome || path.join(home, '.claude');
    this.discoverRoots = discoverRoots || [home];
    this.systemRoots = systemRoots || ['/etc/codex/skills', '/etc/claude-code/skills', '/usr/local/share/codex/skills', '/usr/share/codex/skills', '/usr/local/share/claude/skills'];
    this.items = []; this.running = null; this.result = null;
  }
  scan(extra = []) { if (this.running) return this.running; this.running = this.run(extra).finally(() => { this.running = null; }); return this.running; }
  async run(extra) {
    const start = Date.now(), sources = [], errors = [], plugins = [], skillRoots = [], locations = new Map();
    let visited = 0, truncated = false;
    const readDir = async p => { try { return await fs.readdir(p, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT' && errors.length < 100) errors.push({ path: p, message: e.code }); return []; } };
    const source = (p, provider, scope, mode = 'skills') => { p = path.resolve(p); if (!sources.some(s => s.path === p && s.mode === mode)) sources.push({ path: p, provider, scope, mode }); };
    source(path.join(this.codex, 'skills'), 'Codex', 'user'); source(path.join(this.claude, 'skills'), 'Claude', 'user'); source(path.join(this.home, '.agents/skills'), 'Shared', 'user');
    source(path.join(this.codex, 'plugins/cache'), 'Codex', 'cache', 'plugins'); source(path.join(this.claude, 'plugins/cache'), 'Claude', 'cache', 'plugins');
    source(path.join(this.home, '.agents/plugins'), 'Shared', 'user', 'plugins');
    for (const p of this.systemRoots) source(p, p.includes('claude') ? 'Claude' : 'Codex', 'system');
    for (const p of extra) source(p, 'Custom', 'custom', 'discover');
    const claudeRegistry = await json(path.join(this.claude, 'plugins/installed_plugins.json'));
    const claudeSettings = await json(path.join(this.claude, 'settings.json'));
    let codexConfig = {};
    try { codexConfig = toml(await fs.readFile(path.join(this.codex, 'config.toml'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') errors.push({ path: path.join(this.codex, 'config.toml'), message: 'TOML 读取失败' }); }
    const rootsVisited = new Set();
    const discover = async (p, depth = 0, custom = false) => {
      p = path.resolve(p); if (rootsVisited.has(p)) return; rootsVisited.add(p);
      if (++visited > 50000 || Date.now() - start > 25000) { truncated = true; return; }
      const entries = await readDir(p), names = new Set(entries.map(e => e.name));
      for (const marker of ['.codex', '.claude', '.agents']) if (names.has(marker)) {
        const provider = marker === '.codex' ? 'Codex' : marker === '.claude' ? 'Claude' : 'Shared';
        source(path.join(p, marker, 'skills'), provider, p === this.home ? 'user' : 'project');
        source(path.join(p, marker, 'plugins'), provider, p === this.home ? 'user' : 'project', 'plugins');
      }
      if (names.has('SKILL.md')) skillRoots.push({ path: p, provider: 'Custom', scope: custom ? 'custom' : 'project', discovered: true });
      if (names.has('.codex-plugin') || names.has('.claude-plugin') || custom && names.has('plugin.json')) source(p, names.has('.codex-plugin') ? 'Codex' : names.has('.claude-plugin') ? 'Claude' : 'Custom', custom ? 'custom' : 'project', 'plugins');
      if (depth >= 12) { if (entries.some(e => e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.'))) truncated = true; return; }
      for (const e of entries) if (e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.')) await discover(path.join(p, e.name), depth + 1, custom);
    };
    for (const root of [...this.discoverRoots, ...extra]) await discover(root, 0, extra.includes(root));
    // Read only manifests and public skill metadata; never index agent sessions or credentials.
    for (const entries of Object.values(claudeRegistry.plugins || {})) for (const entry of Array.isArray(entries) ? entries : []) if (typeof entry.installPath === 'string') source(entry.installPath, 'Claude', entry.scope || 'user', 'plugins');
    for (const entry of codexConfig.skills?.config || []) if (typeof entry.path === 'string') source(entry.path.endsWith('SKILL.md') ? path.dirname(entry.path) : entry.path, 'Codex', 'custom');
    const walked = new Set();
    const pluginWalk = async (p, src, depth = 0) => {
      if (depth > 6 || walked.has(p)) return; walked.add(p);
      const es = await readDir(p), names = new Set(es.map(e => e.name));
      let mf = src.provider === 'Claude' ? '.claude-plugin/plugin.json' : '.codex-plugin/plugin.json';
      if (!await exists(path.join(p, mf))) mf = names.has('plugin.json') ? 'plugin.json' : names.has('.codex-plugin') ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json';
      if (await exists(path.join(p, mf))) {
        const manifest = await json(path.join(p, mf));
        if (!manifest.name || typeof manifest.name !== 'string') return;
        const rel = path.relative(src.path, p).split(path.sep), market = src.scope === 'cache' ? rel[0] : null;
        const selector = market ? `${manifest.name}@${market}` : null;
        const registrations = Object.entries(claudeRegistry.plugins || {}).flatMap(([key, vals]) => (Array.isArray(vals) ? vals : []).filter(v => v.installPath && path.resolve(v.installPath) === path.resolve(p)).map(v => ({ ...v, selector: key })));
        const setting = selector && codexConfig.plugins?.[selector];
        let status = 'local';
        if (src.provider === 'Claude') status = registrations.length ? (claudeSettings.enabledPlugins?.[registrations[0].selector] === false ? 'disabled' : 'registered') : (src.scope === 'cache' ? 'cached' : 'local');
        if (src.provider === 'Codex') status = setting ? (setting.enabled === false ? 'disabled' : 'enabled') : (src.scope === 'cache' ? 'cached' : 'local');
        const canonical = await fs.realpath(p).catch(() => p);
        if (plugins.some(v => v.realPath === canonical && v.provider === src.provider)) return;
        const item = { id: idFor(`plugin:${src.provider}:${canonical}`), kind: 'plugin', name: manifest.interface?.displayName || manifest.name, slug: manifest.name, description: String(manifest.description || ''), version: manifest.version || (src.scope === 'cache' ? rel.at(-1) : ''), provider: src.provider, providers: [src.provider], scope: src.scope, status, path: p, realPath: canonical, manifest: mf, selector, registrations, locations: [{ id: idFor(p), path: p, provider: src.provider, scope: src.scope }], managed: true };
        if (!plugins.some(v => v.id === item.id)) plugins.push(item);
        const dirs = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills || './skills'];
        for (const dir of dirs) if (typeof dir === 'string' && inside(p, path.resolve(p, dir))) skillRoots.push({ path: path.resolve(p, dir), provider: src.provider, scope: 'plugin', owner: item });
        return;
      }
      for (const e of es) if (e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.')) await pluginWalk(path.join(p, e.name), src, depth + 1);
    };
    // Do not recursively catalogue marketplace source checkouts as installed plugins.
    for (const src of sources.filter(s => s.mode === 'plugins')) {
      src.exists = await exists(src.path);
      if (src.path === path.join(this.codex, 'plugins') || src.path === path.join(this.claude, 'plugins')) continue;
      await pluginWalk(src.path, src);
    }
    // Stale registrations still need a visible entry so the user can repair or uninstall them.
    const missingPlugin = (provider, selector, p, registrations = []) => ({ id: idFor(`plugin:${provider}:${p}`), kind: 'plugin', name: selector.split('@')[0], slug: selector.split('@')[0], description: '配置或注册记录仍在，但未找到本地插件清单。可通过 CLI 重新安装或卸载。', version: '', provider, providers: [provider], scope: registrations[0]?.scope || 'user', status: 'missing', path: p, realPath: p, selector, registrations, locations: [{id: idFor(p), path: p, provider, scope: registrations[0]?.scope || 'user'}], managed: true });
    for (const [selector, config] of Object.entries(codexConfig.plugins || {})) if (selector.includes('@') && config && !plugins.some(i => i.provider === 'Codex' && i.selector === selector)) {
      const split = selector.lastIndexOf('@'), slug = selector.slice(0, split), marketplace = selector.slice(split + 1);
      if (slug && marketplace && !/[\\/]/.test(slug + marketplace) && ![slug, marketplace].includes('..')) plugins.push(missingPlugin('Codex', selector, path.join(this.codex, 'plugins/cache', marketplace, slug)));
    }
    for (const [selector, entries] of Object.entries(claudeRegistry.plugins || {})) for (const registration of Array.isArray(entries) ? entries : []) if (typeof registration.installPath === 'string') {
      const p = path.resolve(registration.installPath);
      if (!plugins.some(i => i.provider === 'Claude' && path.resolve(i.path) === p)) plugins.push(missingPlugin('Claude', selector, p, entries.filter(r => r.installPath && path.resolve(r.installPath) === p).map(r => ({...r, selector}))));
    }
    for (const src of sources.filter(s => s.mode === 'skills')) { src.exists = await exists(src.path); skillRoots.push(src); }
    const skillWalk = async (p, src, depth = 0, ancestors = new Set()) => {
      if (depth > 7 || locations.has(p)) return;
      let stat; try { stat = await fs.lstat(p); } catch { return; }
      if (!stat.isDirectory() && !stat.isSymbolicLink()) return;
      const real = await fs.realpath(p).catch(() => null);
      if (!real) {
        locations.set(p, { id: idFor(`broken:${p}`), kind: 'skill', name: path.basename(p), slug: path.basename(p), description: '符号链接的目标已不存在，可移除失效入口。', status: 'broken', path: p, realPath: p, provider: src.provider, providers: [src.provider], scope: src.scope, locations: [{ id: idFor(p), path: p, provider: src.provider, scope: src.scope, symlink: true }], owners: [] }); return;
      }
      if (ancestors.has(real)) return;
      const next = new Set([...ancestors, real]);
      if (await exists(path.join(p, 'SKILL.md'))) {
        let text; try { const st = await fs.stat(path.join(p, 'SKILL.md')); if (st.size > 2 * 1024 * 1024) throw new Error('文件大于 2 MB'); text = await fs.readFile(path.join(p, 'SKILL.md'), 'utf8'); } catch (e) { errors.push({ path: p, message: e.message }); return; }
        const meta = frontmatter(text), name = typeof meta.name === 'string' ? meta.name : path.basename(p);
        const owner = src.owner || plugins.filter(o => inside(o.realPath, real)).sort((a,b) => b.realPath.length-a.realPath.length)[0];
        locations.set(p, { id: idFor(`skill:${real}`), kind: 'skill', name, slug: name, description: typeof meta.description === 'string' ? meta.description : '', status: owner?.status || (src.discovered ? 'local' : 'available'), path: p, realPath: real, provider: owner?.provider || src.provider, providers: [owner?.provider || src.provider], scope: owner ? 'plugin' : p.includes(`${path.sep}.system${path.sep}`) ? 'system' : src.scope, locations: [{ id: idFor(p), path: p, provider: src.provider, scope: src.scope, symlink: stat.isSymbolicLink() }], owners: owner ? [owner.id] : [] }); return;
      }
      for (const e of await readDir(p)) if ((e.isDirectory() || e.isSymbolicLink()) && !skip.has(e.name) && (!e.name.startsWith('.') || e.name === '.system')) await skillWalk(path.join(p, e.name), src, depth + 1, next);
    };
    for (const src of skillRoots) await skillWalk(src.path, src);
    const merged = new Map();
    for (const item of locations.values()) {
      const prev = merged.get(item.id);
      if (!prev) merged.set(item.id, item); else { prev.locations.push(...item.locations); prev.providers = [...new Set([...prev.providers, ...item.providers])]; prev.owners = [...new Set([...prev.owners, ...item.owners])]; }
    }
    this.items = [...plugins, ...merged.values()].sort((a,b) => a.name.localeCompare(b.name));
    this.result = { items: this.items, sources, errors, truncated, discoveryRoots: [...this.discoverRoots, ...extra], maxDepth: 12, directoriesVisited: visited, scannedAt: new Date().toISOString(), durationMs: Date.now() - start };
    return this.result;
  }
  get(id) { const item = this.items.find(i => i.id === id); if (!item) throw Object.assign(new Error('项目已不存在，请重新扫描。'), { status: 404 }); return item; }
  async documents(id) {
    const item = this.get(id); if (['broken', 'missing'].includes(item.status)) return [];
    const root = item.realPath, docs = [];
    const walk = async (dir, depth = 0) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isFile() && (/\.md$/i.test(e.name) || p === path.join(root, item.manifest || 'SKILL.md'))) docs.push(path.relative(root, p));
        else if (e.isDirectory() && depth < 4 && !skip.has(e.name) && !e.name.startsWith('.')) await walk(p, depth + 1);
        if (docs.length >= 200) return;
      }
    };
    await walk(root); if (item.manifest && !docs.includes(item.manifest)) docs.unshift(item.manifest);
    return docs.sort((a,b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : /readme\.md$/i.test(a) ? -1 : /readme\.md$/i.test(b) ? 1 : a.localeCompare(b)));
  }
  async document(id, file) {
    const item = this.get(id), docs = await this.documents(id);
    if (!docs.includes(file)) throw Object.assign(new Error('只能打开此项目内已列出的文档。'), { status: 403 });
    const p = await fs.realpath(path.join(item.realPath, file)); if (!inside(item.realPath, p)) throw Object.assign(new Error('文档路径越界。'), { status: 403 });
    const stat = await fs.stat(p); if (stat.size > 2 * 1024 * 1024) throw new Error('文档超过 2 MB，请在本地编辑器打开。');
    return { file, content: await fs.readFile(p, 'utf8') };
  }
}
