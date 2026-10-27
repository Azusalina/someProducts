'use strict';
const $ = id => document.getElementById(id);
const money = value => value == null ? '—' : `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} USDC`;
const num = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value);
const pct = value => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const dateTime = value => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never';
const time = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const signClass = n => n == null || n === 0 ? '' : n > 0 ? 'positive' : 'negative';
let state, token, selectedSymbol, chartRange = 'all', currentPage, settingsLoaded = false, pendingConfirm;
let networkError = null, localError = null, polling = false;

function theme(mode) {
  document.documentElement.dataset.theme = mode;
  $('theme').textContent = `Switch to ${mode === 'dark' ? 'light' : 'dark'}`;
  try { localStorage.setItem('autotrade-theme', mode); } catch {}
}
try { theme(localStorage.getItem('autotrade-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); }
catch { theme('light'); }
$('theme').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

function navigate() {
  const page = location.hash.slice(1) || 'overview';
  currentPage = ['overview', 'markets', 'orders', 'settings'].includes(page) ? page : 'overview';
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${currentPage}`; });
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === currentPage);
    if (el.dataset.page === currentPage) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('breadcrumb').textContent = { overview: 'Overview', markets: 'Markets', orders: 'Orders & activity', settings: 'Strategy settings' }[currentPage];
  if (state && currentPage === 'settings' && !settingsLoaded) populateSettings();
}
addEventListener('hashchange', navigate);
navigate();

async function api(path, body) {
  if (!token) {
    const response = await fetch('/api/session', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Session request failed (${response.status})`);
    token = (await response.json()).token;
  }
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Autotrade-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000)
  });
  if (response.status === 403) token = null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function errors() {
  const message = networkError || localError || state?.operation.error;
  $('error').hidden = !message;
  $('error').textContent = message || '';
}

async function action(name, body = {}) {
  localError = null;
  try {
    await api(name, body);
    $('notice').hidden = false;
    $('notice').textContent = name === 'scan' ? 'Scanning crypto prices and reconciling transactions…' : 'Request accepted. Waiting for the local engine…';
    await poll();
  } catch (error) { localError = error.message; errors(); }
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    state = await api('state');
    networkError = null;
    render();
  } catch (error) {
    networkError = `Dashboard disconnected. Displayed values may be stale. ${error.message}`;
    $('connection').textContent = 'Disconnected';
    $('engine-label').textContent = 'Connection lost';
    $('engine-copy').textContent = 'The engine may still be trading. Check the local process or your wallet and block explorer.';
    $('engine-dot').classList.remove('running');
    $('primary-toggle').disabled = true;
  } finally { polling = false; errors(); }
}

function chart(points, label, format = money) {
  if (!points.length) return `<div class="chart-empty">No observations yet<small>The chart starts with your first recorded scan.</small></div>`;
  const values = points.map(p => p.value), min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * .18, max * .0008, .1);
  const low = min - padding, high = max + padding, W = 680, H = 230, L = 66, R = 14, T = 12, B = 34;
  const x = i => L + i / Math.max(1, points.length - 1) * (W - L - R);
  const y = v => T + (high - v) / (high - low) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  let grid = '';
  for (let i = 0; i < 4; i++) {
    const v = low + (high - low) * i / 3;
    grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 9}" y="${y(v) + 3}" text-anchor="end">${esc(format(v).replace(' USDC', ''))}</text>`;
  }
  const last = points.length - 1;
  const area = last ? `<path class="area" d="${line} L${x(last)},${H - B} L${x(0)},${H - B} Z"/>` : '';
  const tickIndices = [...new Set([0, Math.floor(last / 2), last])];
  const ticks = tickIndices.map(i => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === last ? 'end' : 'middle'}">${esc(new Date(points[i].t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</text>`).join('');
  const dots = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 100)) === 0 || i === last).map(p => {
    const i = points.indexOf(p);
    return `<circle cx="${x(i)}" cy="${y(p.value)}" r="6" fill="transparent"><title>${esc(dateTime(p.t))} · ${esc(format(p.value))}</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${esc(label)}"><title>${esc(label)}</title>${grid}${area}<path class="line" d="${line}"/><circle class="dot" cx="${x(last)}" cy="${y(points[last].value)}" r="4"/>${ticks}${dots}</svg>`;
}

function spark(history) {
  if (!history?.length) return '';
  const values = history.map(p => p.value), min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${i / Math.max(1, values.length - 1) * 88},${28 - (v - min) / span * 25}`).join(' ');
  return `<svg class="spark" viewBox="0 0 88 30" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

function decision(q) { return `<span class="decision ${esc((q.signal || 'WAIT').toLowerCase())}">${esc(q.signal || 'WAIT')}</span>`; }
function empty(cols, title, subtitle) { return `<tr class="empty-row"><td colspan="${cols}"><strong>${esc(title)}</strong>${esc(subtitle)}</td></tr>`; }
function rows(object) { return Object.entries(object).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join(''); }

function render() {
  const s = state, c = s.config, busy = s.operation.busy, demo = s.mode === 'demo', live = s.mode === 'live';
  $('mode').textContent = { demo: 'DEMO · SYNTHETIC', paper: 'PAPER · LIVE PRICES', live: 'BASE · LIVE WALLET' }[s.mode];
  $('mode').classList.toggle('live', s.mode === 'live');
  $('connection').textContent = busy ? `${busy === 'scan' ? 'Scanning' : 'Working'}…` : s.connected ? '24/7 crypto markets' : 'Wallet not configured';
  $('engine-dot').classList.toggle('running', s.running);
  $('engine-label').textContent = s.halt ? 'Risk stop active' : s.closing ? 'Closing to USDC' : s.running ? 'Automation running' : 'Automation paused';
  $('engine-copy').textContent = s.running || s.closing ? `Scanning every ${c.interval}s. Entries and exits follow your saved rules.` : 'Monitoring continues. Start automation to authorize entries and exits.';
  $('primary-toggle').textContent = s.running || s.closing ? 'Pause automation Ⅱ' : 'Start automation ↗';
  $('primary-toggle').disabled = (!!busy && !s.running && !s.closing) || (live && (!s.connected || !s.account));
  document.querySelectorAll('[data-action="scan"]').forEach(b => { b.disabled = !!busy; });
  const pending = s.orders.some(o => !['filled', 'canceled', 'expired', 'rejected', 'replaced'].includes(o.status));
  let notice = s.halt ? `${s.halt}. Automation has stopped; open holdings remain exposed. Review positions and the engine journal.` :
    busy ? `Engine operation in progress: ${busy}. Stop requests will be honored before the next submission.` :
    pending ? 'An order is pending or its status is unknown. New orders are blocked until reconciliation resolves it.' : null;
  $('notice').hidden = !notice;
  $('notice').textContent = notice || '';
  $('source-note').textContent = demo ? 'DEMO ENVIRONMENT · Synthetic crypto prices and simulated swaps. No wallet access or real funds.' :
    `${live ? 'LIVE BASE WALLET · On-chain swaps' : 'PAPER ENVIRONMENT · Live reference prices, simulated USDC'} · 24/7 · Coinbase ETH/USD and BTC/USD reference · Equity excludes native ETH gas`;
  $('equity').textContent = money(s.equity);
  $('total-return').textContent = `${s.pnl >= 0 ? '+' : '−'}${money(Math.abs(s.pnl))} (${pct(s.pnl / c.capital * 100)}) since allocation`;
  $('total-return').className = signClass(s.pnl);
  $('cash').textContent = money(s.cash);
  $('cash-detail').textContent = s.account ? `Wallet USDC ${money(s.account.cash)}` : 'Uninvested simulated capital';
  $('position-count').textContent = String(s.positions.length).padStart(2, '0');
  const invested = s.positions.reduce((total, p) => total + (p.value ?? p.qty * p.avg), 0);
  const exposure = s.equity > 0 ? invested / s.equity * 100 : 0;
  $('exposure').textContent = `${exposure.toFixed(1)}% of allocation invested`;
  $('drawdown').textContent = `${s.drawdown.toFixed(2)}%`;
  $('drawdown-limit').textContent = `Pause at ${c.drawdown_pct}% from peak`;
  $('mandate-capital').textContent = money(c.capital);
  $('allocation-fill').style.width = `${Math.min(100, Math.max(0, exposure))}%`;
  $('invested-label').textContent = `Invested ${exposure.toFixed(1)}%`;
  $('available-label').textContent = `Cash ${Math.max(0, 100 - exposure).toFixed(1)}%`;
  $('entry-rule').textContent = `SMA ${c.fast} / ${c.slow}`;
  $('position-rule').textContent = `Up to ${c.position_pct}% each`;
  $('exit-rule').textContent = `−${c.stop_pct}% / +${c.take_pct}%`;
  $('next-scan').textContent = busy ? 'In progress' : s.last_scan ? `Every ${c.interval}s` : 'Awaiting first scan';
  const points = chartRange === 'day' ? s.history.filter(p => new Date(p.t).toDateString() === new Date().toDateString()) : s.history;
  $('equity-chart').innerHTML = chart(points, 'Allocated crypto portfolio equity in USDC, excludes native gas');
  $('chart-count').textContent = `${points.length.toLocaleString()} recorded observation${points.length === 1 ? '' : 's'}`;
  $('holdings').innerHTML = s.positions.length ? s.positions.map(p => `<tr><td><span class="asset-square">${esc(p.symbol.slice(0, 2))}</span><span class="asset-name">${esc(p.symbol)}</span></td><td>${num(p.qty)}</td><td>${money(p.avg)}</td><td>${money(p.price)}</td><td>${money(p.value)}</td><td class="${signClass(p.pnl)}">${money(p.pnl)} <small>${pct(p.pnl_pct)}</small></td></tr>`).join('') : empty(6, 'No open holdings', 'Token balances will appear after an authorized swap fills.');
  $('flatten').disabled = !s.positions.length || !!busy;
  const quotes = Object.values(s.quotes);
  $('radar').innerHTML = quotes.slice(0, 6).map(q => `<button class="radar-card" data-symbol="${esc(q.symbol)}"><div class="radar-top"><span class="asset-name">${esc(q.symbol)}</span>${decision(q)}</div><div class="radar-bottom"><div class="radar-price">${money(q.price)}<small class="${signClass(q.change)}">${pct(q.change)}</small></div>${spark(q.history)}</div></button>`).join('') || '<p class="footnote">Scan public crypto prices to load your watchlist.</p>';
  if (!selectedSymbol || !s.quotes[selectedSymbol]) selectedSymbol = quotes[0]?.symbol;
  $('watchlist').innerHTML = quotes.map(q => `<tr class="market-row ${q.symbol === selectedSymbol ? 'selected' : ''}" data-symbol="${esc(q.symbol)}"><td><button class="text-button asset-name" data-symbol="${esc(q.symbol)}">${esc(q.symbol)}</button></td><td>${money(q.price)}</td><td class="${signClass(q.change)}">${pct(q.change)}</td><td>${decision(q)}</td></tr>`).join('') || empty(4, 'No quotes yet', 'Run a scan to load crypto prices.');
  renderSelected();
  $('realized').textContent = money(s.realized);
  $('realized').className = signClass(s.realized);
  $('orders-today').textContent = `${s.orders_today} / ${c.max_orders_day}`;
  $('fees-title').textContent = live ? 'Native ETH gas spent' : 'Modeled pool fees';
  $('fees').textContent = live ? `${s.gas_eth.toFixed(8)} ETH` : money(s.fees);
  $('orders').innerHTML = s.orders.map(o => `<tr><td>${esc(dateTime(o.time))}</td><td class="asset-name">${esc(o.symbol)}</td><td class="${o.side === 'buy' ? 'positive' : ''}">${esc(o.side.toUpperCase())}</td><td>${num(o.filled_qty)}</td><td>${money(o.fill_price)}</td><td><span class="decision ${esc(o.status)}">${esc(o.status)}</span></td><td>${esc(o.reason)}${/^0x[0-9a-fA-F]{64}$/.test(o.tx_hash || '') ? `<br><a class="text-link" href="https://base.blockscout.com/tx/${o.tx_hash}" target="_blank" rel="noreferrer">${o.tx_hash.slice(0, 10)}… ↗</a>` : ''}</td></tr>`).join('') || empty(7, 'Your ledger is ready', 'Orders will appear after automation starts and an entry condition is met.');
  $('events').innerHTML = s.events.map(e => `<div class="event ${esc(e.level)}-level"><time datetime="${esc(e.time)}">${esc(dateTime(e.time))}</time><span class="level">${esc(e.level)}</span><span>${esc(e.message)}</span></div>`).join('');
  if (!settingsLoaded) populateSettings();
  const canEdit = !s.running && !s.closing && !busy && !pending;
  for (const input of $('settings-form').elements) input.disabled = !canEdit || input.name === 'capital' && s.initialized;
  $('settings-status').textContent = canEdit ? 'READY TO EDIT' : busy ? 'ENGINE BUSY' : 'PAUSE TO EDIT';
  $('settings-hint').textContent = canEdit ? 'Changes apply on the next scan after you save.' : 'Pause automation and resolve pending orders before editing.';
  $('broker-heading').textContent = demo ? 'Offline crypto simulation' : live ? 'Dedicated Base trading wallet' : 'Public crypto price feed';
  $('broker-detail').textContent = demo ? 'Offline simulation. Use --mode paper for public crypto prices and simulated swaps, or --mode live for a dedicated Base wallet. No signup, analytics, or identity fields.' : live ?
    `${s.connected ? 'Wallet key and RPC configured on the local server.' : 'Set AUTOTRADE_RPC_URL and AUTOTRADE_WALLET_KEY on the server, then restart.'} Fund only the intended USDC allocation plus native Base ETH for gas. Live signing also requires AUTOTRADE_ALLOW_LIVE=YES. Public-chain trades are traceable; this app does not provide anonymity.` :
    'Coinbase public ETH/USD and BTC/USD prices, with simulated WETH and cbBTC trades. No exchange account or wallet key is used. The USDC budget is simulated.';
  $('wallet-address').textContent = s.wallet_address || '';
  $('copy-wallet').hidden = !s.wallet_address;
  $('broker-meta').textContent = demo ? 'SYNTHETIC PRICES / SIMULATED FILLS' : live ? `BASE / 8453 · ${s.account?.gas_eth?.toFixed(6) || '0.000000'} ETH for gas` : 'LIVE REFERENCE PRICES / SIMULATED SWAPS';
  $('last-scan').textContent = `Last scan · ${dateTime(s.last_scan)}`;
  errors();
}

function renderSelected() {
  const q = state.quotes[selectedSymbol];
  if (!q) return;
  $('selected-symbol').textContent = q.symbol;
  $('selected-source').textContent = q.source || 'NO DATA';
  $('selected-price').textContent = money(q.price);
  $('price-chart').innerHTML = chart(q.history || [], `${q.symbol} completed hourly reference closes`);
  $('signal-detail').innerHTML = rows({ 'Decision': q.signal || 'WAIT', 'Reason': q.reason,
    [`${state.config.fast}-hour average`]: money(q.fast), [`${state.config.slow}-hour average`]: money(q.slow),
    'Last trade': dateTime(q.time), 'Fresh for execution': q.fresh ? 'Yes' : 'No' });
}

function populateSettings() {
  for (const [key, value] of Object.entries(state.config)) {
    const input = $('settings-form').elements.namedItem(key);
    if (input) input.value = Array.isArray(value) ? value.join(', ') : value;
  }
  settingsLoaded = true;
}

$('settings-form').onsubmit = async event => {
  event.preventDefault();
  const config = Object.fromEntries(new FormData(event.target));
  for (const key of Object.keys(config)) if (key !== 'symbols') config[key] = Number(config[key]);
  await action('settings', config);
};

function confirmAction(actionName, title, copy, phrase, summary) {
  pendingConfirm = { actionName, phrase, config: JSON.parse(JSON.stringify(state.config)) };
  $('confirm-dialog').returnValue = 'cancel';
  $('dialog-title').textContent = title;
  $('dialog-copy').textContent = copy;
  $('dialog-summary').innerHTML = rows(summary || {});
  $('confirmation-label').hidden = !phrase;
  $('confirmation-label').firstChild.textContent = phrase ? `Type ${phrase} to continue` : '';
  $('confirmation-input').value = '';
  $('confirmation-input').placeholder = phrase || '';
  $('confirm-button').textContent = title;
  $('confirm-button').disabled = !!phrase;
  $('confirm-dialog').showModal();
}
$('confirmation-input').oninput = event => { $('confirm-button').disabled = pendingConfirm.phrase !== event.target.value; };
$('confirm-dialog').addEventListener('close', () => {
  if ($('confirm-dialog').returnValue === 'confirm' && pendingConfirm) action(pendingConfirm.actionName, { confirmation: pendingConfirm.phrase || '', ...(pendingConfirm.actionName === 'start' ? { config: pendingConfirm.config } : {}) });
  pendingConfirm = null;
});
$('primary-toggle').onclick = () => {
  if (state.running || state.closing) return action('pause');
  const c = state.config;
  confirmAction('start', 'Start automation', state.mode === 'live' ? 'This authorizes real on-chain swaps without approval for each order. Review the wallet, USDC budget, gas limits, and rules below.' :
    'The engine will place simulated buys and sells automatically under these rules. It begins at the next scan, or when you choose Scan now.', state.mode === 'live' ? 'START LIVE CRYPTO TRADING' : null,
    { 'Environment': state.mode.toUpperCase(), 'Initial allocation': money(c.capital), 'Wallet USDC': state.account ? money(state.account.cash) : 'Simulated',
      'Universe': c.symbols.join(', '), 'Entry rule': `SMA ${c.fast} / ${c.slow}`, 'Investment / position cap': `${c.invested_pct}% / ${c.position_pct}%`, 'Slippage / gas cap': `${c.slippage_bps} bps / ${c.max_gas_eth} ETH`,
      'Stop / take profit': `−${c.stop_pct}% / +${c.take_pct}%`, 'Daily loss / drawdown pause': `${c.daily_loss_pct}% / ${c.drawdown_pct}%` });
};
$('flatten').onclick = () => confirmAction('flatten', 'Close app positions', 'Convert every app holding to USDC. This can require token approvals followed by swaps over multiple scans. Ordinary entries stay paused. Slippage limits apply; already broadcast transactions cannot be undone.', 'CLOSE ALL APP POSITIONS', { 'Holdings': state.positions.map(p => p.symbol).join(', '), 'Environment': state.mode.toUpperCase() });
$('reset-risk').onclick = () => confirmAction('reset-risk', 'Reset risk baseline', 'This acknowledges the current loss stop and resets the daily-loss and peak-drawdown reference to current equity. It does not recover losses.', 'RESET RISK BASELINE', { 'Current stop': state.halt || 'None', 'New reference equity': money(state.equity) });
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (button) action(button.dataset.action);
  const symbol = event.target.closest('[data-symbol]');
  if (symbol) { selectedSymbol = symbol.dataset.symbol; location.hash = 'markets'; render(); }
  const range = event.target.closest('[data-range]');
  if (range) { chartRange = range.dataset.range; document.querySelectorAll('[data-range]').forEach(el => el.classList.toggle('selected', el === range)); render(); }
});
$('export').onclick = async () => {
  try {
    if (!token) await api('state');
    const response = await fetch('/api/export', { headers: { 'X-Autotrade-Token': token } });
    if (!response.ok) throw new Error('Export failed. Refresh the dashboard and retry.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'autotrade-orders.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) { localError = error.message; errors(); }
};
poll();
setInterval(poll, 2000);

$('copy-wallet').onclick = async () => {
  try { await navigator.clipboard.writeText(state.wallet_address); $('copy-wallet').textContent = 'Address copied'; }
  catch { localError = 'Clipboard access unavailable. Select and copy the displayed address.'; errors(); }
};
