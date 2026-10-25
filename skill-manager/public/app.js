const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const labels = { enabled:'配置已启用', disabled:'配置已禁用', registered:'已注册', cached:'仅缓存', local:'本地目录', available:'可用', broken:'失效链接', missing:'文件缺失', user:'用户级', system:'系统级', project:'项目级', plugin:'插件内', cache:'缓存', custom:'自定义' };
const selectedIds = new Set();
let selectionAnchor, batchPlan, batchChoices = new Map(), batchTask, batchTimer;
const titles = { all:'全部项目', pinned:'我的收藏', skill:'技能', plugin:'插件' };
let token, inventory, settings, selected, currentDoc, documents = [], view = 'all', provider = '', raw = false, docRevision = 0, jobId, jobTimer, toastTimer, removal, preset = 'skill', scanning = false;
const api = async (route, data, method) => { const response = await fetch(`/api/${route}`, { method: method || (data === undefined ? 'GET' : 'POST'), headers: { 'X-Skill-Manager-Token': token, ...(data === undefined ? {} : { 'Content-Type':'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || `请求失败 (${response.status})`); return result; };
function toast(message, error = false) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, error ? 7000 : 3000); }
const safe = fn => async (...args) => { try { return await fn(...args); } catch (e) { toast(e.message, true); } };
function showModal(id) { if (!$(id).open) $(id).showModal(); }
function applyAppearance() {
  const dark = settings.theme === 'dark';
  document.documentElement.style.setProperty('--glass-alpha', settings.opacity / 100);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  $('opacity').value = settings.opacity;
  $('opacity-value').value = `${settings.opacity}%`;
  document.body.classList.toggle('dark', dark);
  const action = dark ? '切换浅色模式' : '切换深色模式';
  $('theme').setAttribute('aria-label', action);
  $('theme').setAttribute('title', action);
  $('theme').setAttribute('aria-pressed', String(dark));
  $('theme-icon').textContent = dark ? '☀' : '☾';
  $('theme-label').textContent = dark ? '浅色模式' : '深色模式';
  $('appearance-theme').value = dark ? 'dark' : 'light';
}

function countUpdate() {
  const items = inventory.items;
  for (const type of ['all', 'skill', 'plugin', 'pinned']) $(`count-${type}`).textContent = items.filter(i => type === 'all' || (type === 'pinned' ? settings.pins.includes(i.id) : i.kind === type)).length;
  for (const p of ['Codex', 'Claude', 'Shared', 'Custom']) $(`count-${p.toLowerCase()}`).textContent = items.filter(i => i.providers.includes(p)).length;
}
function filtered() {
  const words = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean), scope = $('scope').value;
  const items = inventory.items.filter(i => (view === 'all' || (view === 'pinned' ? settings.pins.includes(i.id) : i.kind === view)) && (!provider || i.providers.includes(provider)) && (scope === 'all' || (scope === 'broken' ? i.status === 'broken' : i.scope === scope || i.locations.some(l => l.scope === scope))) && words.every(w => [i.name, i.description, i.version, i.status, i.scope, ...i.providers, ...i.locations.map(l => l.path)].join(' ').toLowerCase().includes(w)));
  const sort = $('sort').value;
  return items.sort((a,b) => sort === 'pinned' ? Number(settings.pins.includes(b.id)) - Number(settings.pins.includes(a.id)) || a.name.localeCompare(b.name) : sort === 'provider' ? a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
}
function renderList() {
  if (!inventory) return;
  countUpdate();
  const list = filtered(); $('view-title').firstChild.textContent = provider || titles[view]; $('view-count').textContent = list.length;
  $('mobile-provider').value = provider;
  $('library-subtitle').textContent = provider ? `${provider} 的本机技能与插件` : view === 'pinned' ? '常用的能力，随时回到手边。' : '把散落的能力，收在一处。';
  $('items').innerHTML = list.length ? list.map(i => `<div class="item-row ${i.id === selected?.id ? 'selected' : ''}" data-id="${i.id}" data-kind="${i.kind}" tabindex="0" role="button" aria-label="打开 ${esc(i.name)}" aria-pressed="${i.id === selected?.id}"><input class="item-selector" type="checkbox" data-select="${i.id}" aria-label="选择 ${esc(i.name)}" ${selectedIds.has(i.id) ? 'checked' : ''}><div class="item-icon" aria-hidden="true">${i.kind === 'plugin' ? '⬡' : i.status === 'broken' ? '↯' : '⌘'}</div><div class="item-content"><div class="item-name" title="${esc(i.name)}">${esc(i.name)}</div><p class="item-description">${esc(i.description || '打开以查看本地文档和安装信息。')}</p><div class="item-meta"><span>${esc(i.providers.join(' + '))}</span><span class="mini-dot"></span><span>${labels[i.scope] || esc(i.scope)}</span>${i.status === 'broken' || i.kind === 'plugin' ? `<span>· ${labels[i.status] || esc(i.status)}</span>` : ''}</div></div><button class="item-pin ${settings.pins.includes(i.id) ? 'pinned' : ''}" data-pin="${i.id}" aria-label="${settings.pins.includes(i.id) ? '取消收藏' : '收藏'} ${esc(i.name)}" aria-pressed="${settings.pins.includes(i.id)}">${settings.pins.includes(i.id) ? '★' : '☆'}</button></div>`).join('') : '<div class="empty-list">没有符合条件的项目。<br>试试其他关键词或扫描位置。</div>';
  renderSelection();
  $('items').setAttribute('aria-busy', 'false');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', !provider && b.dataset.view === view));
  document.querySelectorAll('[data-provider]').forEach(b => b.classList.toggle('active', b.dataset.provider === provider));
  const stamp = new Date(inventory.scannedAt).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
  $('scan-status').textContent = `${stamp} 已扫描${inventory.truncated ? ' · 范围有截断' : ''}`;
}
async function refresh(rescan = false) {
  if (scanning) return;
  scanning = true; $('scan').classList.add('scanning'); $('scan').disabled = true;
  try {
    inventory = await api(rescan ? 'scan' : 'inventory', rescan ? {} : undefined); settings = inventory.settings; for (const id of selectedIds) if (!inventory.items.some(i => i.id === id)) selectedIds.delete(id); renderList();
    if (selected) { const next = inventory.items.find(i => i.id === selected.id); if (!next) { selected = null; $('reader').hidden = true; $('reader-empty').hidden = false; document.querySelector('.workspace').classList.remove('reading'); } else { const moved = selected.path !== next.path; selected = next; if (moved) await selectItem(next.id); } }
    return inventory;
  } finally { scanning = false; $('scan').classList.remove('scanning'); $('scan').disabled = false; }
}
async function togglePin(id) { const focus = document.activeElement?.dataset.pin; settings = await api('pin', { id, pinned: !settings.pins.includes(id) }); renderList(); if (selected) updateDetailPin(); if (focus) document.querySelector(`[data-pin="${focus}"]`)?.focus(); }
function updateDetailPin() { const pinned = settings.pins.includes(selected.id); $('pin-detail').textContent = pinned ? '★' : '☆'; $('pin-detail').classList.toggle('is-pinned', pinned); $('pin-detail').setAttribute('aria-label', pinned ? '取消收藏' : '收藏'); $('pin-detail').setAttribute('aria-pressed', pinned); }
async function selectItem(id) {
  selected = inventory.items.find(i => i.id === id); if (!selected) return;
  const revision = ++docRevision, item = selected;
  raw = false; currentDoc = null; $('document').replaceChildren(); $('document-status').textContent = '正在读取文档…';
  $('reader-empty').hidden = true; $('reader').hidden = false; document.querySelector('.workspace').classList.add('reading');
  $('reader-kind').textContent = item.kind === 'plugin' ? 'PLUGIN / OVERVIEW' : 'SKILL / INSTRUCTIONS'; $('reader-title').textContent = item.name; $('reader-description').textContent = item.description;
  $('reader-badges').innerHTML = [...item.providers.map(p => `<span class="badge">${esc(p)}</span>`), `<span class="badge ${['broken', 'missing'].includes(item.status) ? 'warning' : 'accent'}">${labels[item.status] || esc(item.status)}</span>`, item.version ? `<span class="badge">v${esc(item.version)}</span>` : ''].join('');
  $('reader-path').textContent = item.path.replace(inventory.discoveryRoots[0] || '\0', '~'); $('reader-path').title = item.path;
  $('location-list').innerHTML = item.locations.map(l => `<p>${esc(l.provider)} · ${labels[l.scope] || esc(l.scope)}${l.symlink ? ' · 符号链接' : ''}<br>${esc(l.path)}</p>`).join('') + (item.realPath !== item.path ? `<p>实际位置<br>${esc(item.realPath)}</p>` : '') + (item.owners || []).map(owner => `<p>所属插件：<button data-owner="${owner}">${esc(inventory.items.find(i => i.id === owner)?.name || owner)}</button></p>`).join('');
  $('locations').open = false; updateDetailPin(); renderList(); document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({block:'nearest'}); $('reader-pane').scrollTop = 0;
  const result = await api(`documents?id=${id}`); if (revision !== docRevision) return;
  documents = result.files; $('document-select').innerHTML = documents.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  $('document-select').disabled = !documents.length; $('copy-document').disabled = !documents.length;
  if (!documents.length) { $('document-status').textContent = item.status === 'broken' ? '这个链接的目标已不存在。可移除失效入口，或修复目标目录后重新扫描。' : '此项目没有可读取的 Markdown 文档。'; return; }
  const initial = item.kind === 'skill' ? 'SKILL.md' : documents.find(f => /(^|\/)readme\.md$/i.test(f)) || item.manifest;
  $('document-select').value = documents.includes(initial) ? initial : documents[0]; await loadDocument();
}
async function loadDocument() {
  const rev = ++docRevision; currentDoc = null; $('document-status').textContent = '正在读取文档…'; $('document').replaceChildren();
  const result = await api(`document?id=${selected.id}&file=${encodeURIComponent($('document-select').value)}`); if (rev !== docRevision) return;
  currentDoc = result; $('document-status').textContent = ''; renderDocument();
}
function renderDocument() { if (!currentDoc) return; $('rendered').classList.toggle('active', !raw); $('raw').classList.toggle('active', raw); if (raw) { const pre = document.createElement('pre'); pre.className = 'raw-text'; pre.textContent = currentDoc.content; $('document').replaceChildren(pre); } else $('document').innerHTML = currentDoc.html; }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('已复制'); } catch { toast('浏览器未允许剪贴板访问，可选中文字复制。', true); } }
function openSettings() {
  $('opacity-settings').value = settings.opacity; $('opacity-settings-value').value = settings.opacity + '%';
  $('extra-roots').value = settings.roots.join('\n');
  $('coverage-summary').textContent = `发现 ${inventory.items.length} 项 · ${inventory.directoriesVisited.toLocaleString()} 个目录 · ${(inventory.durationMs/1000).toFixed(1)} 秒`;
  $('source-list').innerHTML = inventory.sources.filter(s => s.mode !== 'discover').map(s => `<div class="source-row ${s.exists ? '' : 'source-missing'}"><span>${s.exists ? '已检查' : '不存在'}</span><code>${esc(s.path)}</code></div>`).join('');
  $('scan-errors-title').textContent = `扫描提示 (${inventory.errors.length}${inventory.truncated ? ' · 有截断' : ''})`;
  $('scan-errors').textContent = `项目发现范围：${inventory.discoveryRoots.join('、')}\n最大深度 ${inventory.maxDepth}，最多 50,000 个项目目录、25 秒；跳过依赖、构建目录及无关隐藏目录。项目符号链接不递归。技能根目录会解析符号链接。\n${inventory.truncated ? '部分扫描触及边界，请将遗漏目录加入额外扫描位置。\n' : ''}${inventory.errors.map(e => e.path + ' · ' + e.message).join('\n') || '没有权限或读取错误。'}\n状态来自本机配置与注册记录，不代表当前 AI 会话已加载。`;
  showModal('settings-dialog');
}
function terminal(command = '', cwd) { if (command) { $('command').value = command; $('command-cwd').value = cwd || $('command-cwd').value; preset = 'custom'; updatePreset(false); } showModal('terminal-dialog'); if (!jobId) $('command').focus(); }
function updatePreset(reset = true) { document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === preset)); $('plugin-label').hidden = !['codex', 'claude'].includes(preset); if (reset) { $('plugin-spec').value = ''; $('command').value = ''; } }
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
function makeCommand() { const s = $('plugin-spec').value.trim(); $('command').value = s ? preset === 'codex' ? `codex plugin add ${quote(s)}` : `claude plugin install ${quote(s)}` : ''; }
async function pollJob() {
  clearTimeout(jobTimer); if (!jobId) return;
  try {
    const job = await api(`jobs/${jobId}`); const out = $('terminal-output'); const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 35;
    out.textContent = (job.truncated ? '[较早输出已截断]\n' : '') + (job.output || '正在运行，等待输出…'); if (atBottom) out.scrollTop = out.scrollHeight;
    const running = job.status === 'running'; $('stop-command').hidden = !running; $('run-command').disabled = running; $('stdin-form').hidden = !running;
    $('job-status').textContent = ({running:'执行中', succeeded:'已完成 · exit 0', failed:`失败 · exit ${job.exitCode ?? '—'}`, cancelled:'已停止', timedout:'超时停止'})[job.status];
    if (running) jobTimer = setTimeout(pollJob, 500); else { jobId = null; await refresh(); }
  } catch(e) { toast(e.message, true); jobTimer = setTimeout(pollJob, 2000); }
}
async function startCommand() {
  const command = $('command').value.trim(); if (!command || command.startsWith('#') && !command.includes('\n')) return toast('请先输入安装或管理命令。', true);
  $('run-command').disabled = true;
  try { const job = await api('jobs', { command, cwd: $('command-cwd').value.trim() }); jobId = job.id; $('terminal-output').textContent = ''; await pollJob(); } catch(e) { $('run-command').disabled = false; throw e; }
}
async function history() { const jobs = await api('jobs'); $('history-list').hidden = !$('history-list').hidden; $('history-list').innerHTML = jobs.length ? jobs.map(j => `<button data-job="${j.id}">${esc(j.status)} · ${esc(j.command)}</button>`).join('') : '<p>本次服务启动后暂无记录。</p>'; }
async function openTrash() { settings = (await api('bootstrap')).settings; $('trash-list').innerHTML = settings.trash.length ? settings.trash.slice().reverse().map(t => `<div class="trash-row"><div><strong>${esc(t.name)}</strong><code>${esc(t.original)}</code><time>${new Date(t.time).toLocaleString('zh-CN')}</time></div><button class="button" data-restore="${t.key}">恢复</button></div>`).join('') : '<div class="empty-list">暂存区是空的。</div>'; showModal('trash-dialog'); }
async function openRemoval() {
  if (!selected) return;
  $('remove-name').textContent = selected.name; $('remove-location-label').hidden = selected.kind === 'plugin' || selected.locations.length === 1;
  $('remove-location').innerHTML = selected.locations.map(l => `<option value="${l.id}">${esc(l.path)}</option>`).join('');
  await loadRemoval(); showModal('remove-dialog');
}
async function loadRemoval() {
  removal = await api(`removal-plan?id=${selected.id}&location=${$('remove-location').value}`);
  $('remove-explanation').textContent = removal.message || '将通过对应 CLI 卸载。先打开终端查看完整命令，再点击运行。';
  $('remove-details').replaceChildren(); $('confirm-remove').textContent = removal.type === 'owner' ? '打开所属插件' : removal.type === 'command' ? '在终端查看卸载命令' : '移至暂存区';
  if (removal.type === 'trash') { $('remove-details').textContent = removal.path + (removal.aliases.length ? '\n其他入口：\n' + removal.aliases.join('\n') : ''); }
  if (removal.type === 'command') $('remove-details').innerHTML = `<label>安装范围<select id="uninstall-scope">${removal.options.map((o,i) => `<option value="${i}">${esc(o.label)}</option>`).join('')}</select></label><pre id="uninstall-preview">${esc(removal.options[0].command)}</pre>`;
}
async function confirmRemoval() {
  if (removal.type === 'owner') { $('remove-dialog').close(); await selectItem(removal.ownerId); return; }
  if (removal.type === 'command') { const option = removal.options[Number($('uninstall-scope').value)]; $('remove-dialog').close(); terminal(option.command, option.cwd); return; }
  const button = $('confirm-remove'); button.disabled = true;
  try { await api('trash', { id: selected.id, locationId: removal.locationId }); $('remove-dialog').close(); await refresh(); toast('已移至暂存区，可从“已移除项目”恢复。'); } finally { button.disabled = false; }
}
$('items').addEventListener('click', safe(async e => { const checkbox = e.target.closest('[data-select]'); if (checkbox) { chooseItem(checkbox.dataset.select, checkbox.checked, e.shiftKey); return; } const pin = e.target.closest('[data-pin]'); if (pin) return togglePin(pin.dataset.pin); const row = e.target.closest('[data-id]'); if (row) await selectItem(row.dataset.id); }));
$('items').addEventListener('keydown', safe(async e => { if (e.target.closest('[data-pin], [data-select]')) return; const row = e.target.closest('[data-id]'); if (row && ['Enter', ' '].includes(e.key)) { e.preventDefault(); await selectItem(row.dataset.id); } if (row && ['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); const rows = [...document.querySelectorAll('.item-row')], index = rows.indexOf(row); rows[Math.min(rows.length-1, Math.max(0,index+(e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); } }));
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; provider = ''; $('scope').value = 'all'; renderList(); document.querySelector('.workspace').classList.remove('reading'); });
document.querySelectorAll('[data-provider]').forEach(b => b.onclick = () => { provider = provider === b.dataset.provider ? '' : b.dataset.provider; view = 'all'; renderList(); document.querySelector('.workspace').classList.remove('reading'); });
for (const id of ['search','scope','sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderList);
$('mobile-provider').onchange = () => { provider = $('mobile-provider').value; view = 'all'; renderList(); };
$('scan').onclick = safe(async () => { await refresh(true); toast('扫描完成'); });
$('pin-detail').onclick = safe(() => togglePin(selected.id)); $('copy-path').onclick = () => copy(selected.path); $('copy-document').onclick = () => currentDoc && copy(currentDoc.content);
$('document-select').onchange = safe(loadDocument); $('raw').onclick = () => { raw = true; renderDocument(); }; $('rendered').onclick = () => { raw = false; renderDocument(); };
$('back').onclick = () => document.querySelector('.workspace').classList.remove('reading');
$('location-list').onclick = safe(e => { const b = e.target.closest('[data-owner]'); if (b) return selectItem(b.dataset.owner); });
$('document').onclick = safe(async e => { const link = e.target.closest('a'); if (!link || !currentDoc) return; const href = link.getAttribute('href'); if (!href || /^(https?:|mailto:)/i.test(href)) return; e.preventDefault(); if (href.startsWith('#')) return; const base = currentDoc.file.split('/').slice(0,-1); for (const segment of decodeURIComponent(href.split('#')[0]).split('/')) { if (segment === '..') base.pop(); else if (segment !== '.' && segment) base.push(segment); } const file = base.join('/'); if (documents.includes(file)) { $('document-select').value = file; await loadDocument(); } else toast('链接目标不在当前项目的可读文档列表中。'); });
$('opacity').oninput = () => { document.documentElement.style.setProperty('--glass-alpha', $('opacity').value / 100); $('opacity-value').value = $('opacity').value + '%'; };
$('opacity').onchange = safe(async () => { settings = await api('settings', { opacity:Number($('opacity').value) }); applyAppearance(); });
$('appearance-theme').onchange = safe(async () => { settings = await api('settings', { theme:$('appearance-theme').value }); applyAppearance(); });
$('theme').onclick = safe(async () => { settings = await api('settings', { theme:settings.theme === 'dark' ? 'light' : 'dark' }); applyAppearance(); });
$('add').onclick = () => terminal(); $('settings').onclick = openSettings; $('coverage').onclick = openSettings;
$('save-roots').onclick = safe(async () => { $('save-roots').disabled = true; try { settings = await api('settings', { roots:$('extra-roots').value.split('\n').map(s => s.trim()).filter(Boolean) }); await refresh(true); openSettings(); toast('扫描位置已更新'); } finally { $('save-roots').disabled = false; } });
$('mobile-settings').onclick = openSettings; $('settings-trash').onclick = safe(() => { $('settings-dialog').close(); return openTrash(); });
$('opacity-settings').oninput = () => { document.documentElement.style.setProperty('--glass-alpha', $('opacity-settings').value / 100); $('opacity-settings-value').value = $('opacity-settings').value + '%'; }; $('opacity-settings').onchange = safe(async () => { settings = await api('settings', {opacity:Number($('opacity-settings').value)}); applyAppearance(); });
$('trash').onclick = safe(openTrash); $('trash-list').onclick = safe(async e => { const b = e.target.closest('[data-restore]'); if (!b) return; b.disabled = true; try { await api('restore', { key:b.dataset.restore }); await refresh(); await openTrash(); toast('已恢复'); } finally { b.disabled = false; } });
$('remove').onclick = safe(openRemoval); $('remove-location').onchange = safe(loadRemoval); $('confirm-remove').onclick = safe(confirmRemoval);
$('remove-details').onchange = () => { if ($('uninstall-scope')) $('uninstall-preview').textContent = removal.options[Number($('uninstall-scope').value)].command; };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { preset = b.dataset.preset; updatePreset(); });
$('plugin-spec').oninput = makeCommand; $('run-command').onclick = safe(startCommand); $('stop-command').onclick = safe(async () => { if (jobId) await api(`jobs/${jobId}/cancel`, {}); await pollJob(); });
$('job-history').onclick = safe(history); $('history-list').onclick = safe(async e => { const b = e.target.closest('[data-job]'); if (!b) return; if (jobId) return toast('请先等待当前命令结束。'); const j = await api(`jobs/${b.dataset.job}`); $('command').value = j.command; $('command-cwd').value = j.cwd; $('terminal-output').textContent = j.output || '(没有输出)'; $('job-status').textContent = j.status; $('history-list').hidden = true; });
$('stdin-form').onsubmit = safe(async e => { e.preventDefault(); if (jobId) await api(`jobs/${jobId}/input`, { text:$('stdin').value }); $('stdin').value = ''; });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { e.preventDefault(); $('search').focus(); } });
window.addEventListener('unhandledrejection', e => { toast(e.reason?.message || '操作失败，请重试。', true); });
async function boot() {
  try { const b = await (await fetch('/api/bootstrap')).json(); token = b.token; settings = b.settings; $('command-cwd').value = b.home; applyAppearance(); await refresh(); if (inventory.items.length) await selectItem(inventory.items.find(i => settings.pins.includes(i.id))?.id || inventory.items.find(i => i.kind === 'skill' && i.providers.includes('Shared'))?.id || inventory.items[0].id); if (b.batch) { batchTask = b.batch; $('batch-progress').hidden = false; if (!batchTask.finishedAt) void pollBatch(); } const job = !b.batch?.finishedAt && b.batch ? null : b.jobs.find(j => j.status === 'running'); if (job) { jobId = job.id; $('command').value = job.command; $('command-cwd').value = job.cwd; await pollJob(); } } catch(e) { $('items').innerHTML = '<div class="empty-list">加载失败，请刷新页面重试。</div>'; toast(e.message, true); }
}

function renderSelection() {
  const visible = filtered(), count = visible.filter(i => selectedIds.has(i.id)).length;
  $('select-all').disabled = !visible.length;
  $('select-all').checked = !!visible.length && count === visible.length;
  $('select-all').indeterminate = count > 0 && count < visible.length;
  $('selection-summary').textContent = selectedIds.size ? `已选 ${selectedIds.size} 项` : '勾选项目以批量操作';
  $('bulk-bar').hidden = !selectedIds.size;
  $('bulk-count').textContent = `已选 ${selectedIds.size} 项${selectedIds.size > count ? ` · ${selectedIds.size - count} 项在其他筛选中` : ''}`;
}
function chooseItem(id, checked, range = false) {
  const visible = filtered().map(i => i.id), a = visible.indexOf(selectionAnchor), b = visible.indexOf(id);
  const ids = range && a >= 0 && b >= 0 ? visible.slice(Math.min(a,b), Math.max(a,b)+1) : [id];
  for (const key of ids) checked ? selectedIds.add(key) : selectedIds.delete(key);
  selectionAnchor = id;
  document.querySelectorAll('[data-select]').forEach(el => el.checked = selectedIds.has(el.dataset.select)); renderSelection();
}
function batchSelection() { return [...selectedIds].map(id => ({id, ...(batchChoices.get(id) || {})})); }
async function pinSelection(pinned) {
  const selections = [...selectedIds].map(id => ({id}));
  settings = await api('batch/pin', {selections, pinned}); renderList(); if (selected) updateDetailPin(); toast(`已${pinned ? '收藏' : '取消收藏'} ${selections.length} 项`);
}
async function openBatchRemoval() {
  if (!selectedIds.size) return;
  if (batchTask && !batchTask.finishedAt) { renderBatchTask(); showModal('batch-dialog'); return; }
  batchChoices = new Map(); batchPlan = null;
  $('batch-title').textContent = '批量移除'; $('batch-description').textContent = '独立目录进入暂存区；插件按下列命令卸载。请核对安装入口与卸载范围，操作将依次执行。';
  $('batch-stop').hidden = true; $('batch-confirm').hidden = false;
  await loadBatchPlan(); showModal('batch-dialog');
}
async function loadBatchPlan() {
  $('batch-confirm').disabled = true;
  try {
    batchPlan = await api('batch/plan', {selections:batchSelection()});
    $('batch-rows').innerHTML = batchPlan.rows.map(row => `<section class="batch-row" data-batch-id="${row.id}"><div class="batch-row-heading"><strong>${esc(row.name)}</strong><span class="badge ${row.disposition === 'blocked' ? 'warning' : ''}">${row.disposition === 'ready' ? row.type === 'trash' ? '暂存移除' : 'CLI 卸载' : row.disposition === 'covered' ? '合并处理' : '跳过'}</span></div><p>${esc(row.message)}</p>${row.type === 'trash' ? `<label>安装入口<select data-batch-location="${row.id}">${row.locations.map(l => `<option value="${l.id}" ${l.id === row.locationId ? 'selected' : ''}>${esc(l.path)}</option>`).join('')}</select></label>${row.aliases.length ? `<details><summary>其他共享入口可能受影响</summary><code>${row.aliases.map(esc).join('<br>')}</code></details>` : ''}` : ''}${row.type === 'command' ? `<label>卸载范围<select data-batch-option="${row.id}">${row.options.map((o,i) => `<option value="${i}" ${row.option === i ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label><div class="batch-cwd">工作目录：${esc(row.cwd)}</div><pre>${esc(row.command)}</pre>` : ''}${row.disposition === 'blocked' && row.ownerId ? `<button class="button" data-batch-owner="${row.ownerId}">一并选择所属插件</button>` : ''}</section>`).join('');
    $('batch-summary').textContent = `${batchPlan.executable} 项将执行 · ${batchPlan.rows.length - batchPlan.executable} 项跳过或合并处理`;
    $('batch-confirm').textContent = `执行 ${batchPlan.executable} 项移除`; $('batch-confirm').disabled = !batchPlan.executable;
  } catch (e) { batchPlan = null; throw e; }
}
function renderBatchTask() {
  if (!batchTask) return;
  $('batch-progress').hidden = false; $('batch-title').textContent = batchTask.finishedAt ? '批量操作结果' : '正在批量处理';
  $('batch-description').textContent = '操作逐项执行。已移至暂存区的项目可恢复；CLI 卸载的插件需要重新安装。';
  const openLogs = new Set([...$('batch-rows').querySelectorAll('details[open]')].map(el => el.dataset.log));
  const status = {pending:'等待', running:'处理中', succeeded:'已完成', failed:'失败', skipped:'跳过 / 合并', cancelled:'已停止'};
  $('batch-rows').innerHTML = batchTask.results.map(r => `<section class="batch-row"><div class="batch-row-heading"><strong>${esc(r.name)}</strong><span class="badge ${['failed', 'cancelled'].includes(r.status) ? 'warning' : ''}">${status[r.status]}</span></div><p>${esc(r.error || r.message || '')}</p>${r.path ? `<code>${esc(r.path)}</code>` : ''}${r.command ? `<pre>${esc(r.command)}</pre>` : ''}${r.output ? `<details data-log="${r.id}" ${openLogs.has(r.id) ? 'open' : ''}><summary>查看命令输出</summary><pre>${esc(r.output)}</pre></details>` : ''}</section>`).join('');
  const count = state => batchTask.results.filter(r => r.status === state).length;
  $('batch-summary').textContent = batchTask.error || `${count('succeeded')} 项完成 · ${count('failed')} 项失败 · ${count('skipped')} 项跳过${batchTask.cancelled ? ' · 已请求停止' : ''}${batchTask.scanError ? ' · 扫描失败：' + batchTask.scanError : ''}`;
  $('batch-confirm').hidden = true; $('batch-stop').hidden = !!batchTask.finishedAt; $('batch-stop').disabled = !!batchTask.cancelled;
}
async function pollBatch() {
  clearTimeout(batchTimer);
  try {
    batchTask = await api('batch'); renderBatchTask();
    if (batchTask && !batchTask.finishedAt) batchTimer = setTimeout(pollBatch, 500);
    else if (batchTask) { for (const row of batchTask.results) if (row.status === 'succeeded') selectedIds.delete(row.id); await refresh(); }
  } catch (e) { toast(e.message, true); batchTimer = setTimeout(pollBatch, 2000); }
}
$('select-all').onchange = () => { for (const item of filtered()) $('select-all').checked ? selectedIds.add(item.id) : selectedIds.delete(item.id); renderList(); };
$('bulk-clear').onclick = () => { selectedIds.clear(); selectionAnchor = null; renderList(); };
$('bulk-pin').onclick = safe(() => pinSelection(true)); $('bulk-unpin').onclick = safe(() => pinSelection(false));
$('bulk-remove').onclick = safe(openBatchRemoval);
$('batch-rows').onchange = safe(async e => { const id = e.target.dataset.batchLocation || e.target.dataset.batchOption; if (!id) return; const choice = batchChoices.get(id) || {}; if (e.target.dataset.batchLocation) choice.locationId = e.target.value; else choice.option = Number(e.target.value); batchChoices.set(id, choice); await loadBatchPlan(); });
$('batch-rows').onclick = safe(async e => { const button = e.target.closest('[data-batch-owner]'); if (!button) return; selectedIds.add(button.dataset.batchOwner); renderList(); await loadBatchPlan(); });
$('batch-confirm').onclick = safe(async () => { if (!batchPlan) return; $('batch-confirm').disabled = true; try { batchTask = await api('batch/remove', {selections:batchSelection(), fingerprint:batchPlan.fingerprint}); renderBatchTask(); await pollBatch(); } catch (e) { await loadBatchPlan(); throw e; } });
$('batch-stop').onclick = safe(async () => { batchTask = await api('batch/cancel', {}); renderBatchTask(); });
$('batch-progress').onclick = () => { renderBatchTask(); showModal('batch-dialog'); };

await boot();
