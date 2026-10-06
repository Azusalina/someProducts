const $ = selector => document.querySelector(selector);
const container = $('#services');
const template = $('#service-template');
let services = [];
let filter = 'all';
let loading = false;
let lastScan;
const expanded = new Set();
const dialog = $('#terminate-dialog');
let pendingTermination = null;
let terminationBusy = false;

function actionStatus(message, error = false) {
  $('#action-status').hidden = !message;
  $('#action-status').textContent = message;
  $('#action-status').classList.toggle('error', error);
}

async function terminationRequest(path, payload) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mediator-Action': 'terminate' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Termination failed.');
  return result;
}

async function prepareTermination(service, button) {
  if (terminationBusy || dialog.open) return;
  terminationBusy = true;
  button.disabled = true;
  actionStatus('Checking process ownership…');
  try {
    pendingTermination = await terminationRequest('/api/terminate/preview', { port: service.port, protocol: service.protocol });
    $('#terminate-title').textContent = `Terminate ${service.protocol.toUpperCase()} port ${service.port}?`;
    $('#terminate-processes').replaceChildren(...pendingTermination.processes.map(process => {
      const item = document.createElement('li'); item.textContent = `${process.name} · PID ${process.pid}`; return item;
    }));
    const otherPorts = pendingTermination.related.filter(target => target.port !== service.port || target.protocol !== service.protocol);
    $('#terminate-related').textContent = otherPorts.length ? `The same processes also use: ${otherPorts.map(target => `${target.protocol.toUpperCase()} ${target.port}`).join(', ')}. These services will stop too.` : '';
    $('#terminate-related').hidden = !otherPorts.length;
    $('#terminate-error').hidden = true;
    $('#terminate-confirm').disabled = false;
    $('#terminate-cancel').disabled = false;
    actionStatus('');
    dialog.showModal();
  } catch (error) { pendingTermination = null; actionStatus(error.message, true); }
  finally { terminationBusy = false; button.disabled = false; }
}

$('#terminate-cancel').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (terminationBusy) event.preventDefault(); });
dialog.addEventListener('close', () => { pendingTermination = null; });
$('#terminate-confirm').addEventListener('click', async () => {
  if (!pendingTermination || terminationBusy) return;
  terminationBusy = true;
  $('#terminate-confirm').disabled = true;
  $('#terminate-cancel').disabled = true;
  try {
    const result = await terminationRequest('/api/terminate', { token: pendingTermination.token });
    dialog.close();
    actionStatus(result.message);
    await refresh({ fresh: true });
  } catch (error) {
    // The server consumes confirmations once. Review current ownership again before retrying.
    $('#terminate-error').textContent = error.message;
    $('#terminate-error').hidden = false;
    $('#terminate-cancel').disabled = false;
    pendingTermination = null;
  } finally { terminationBusy = false; }
});

function isWeb(service) { return Boolean(service.web && service.local && !service.self); }
function addDetail(list, term, description) {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = term; dd.textContent = description;
  list.append(dt, dd);
}
function render() {
  const query = $('#search').value.trim().toLowerCase();
  const visible = services.filter(service => {
    const matching = filter === 'all' || (filter === 'web' ? isWeb(service) : !isWeb(service));
    return matching && [service.port, service.name, service.description, service.protocol, ...service.processes.map(p => `${p.name} ${p.project || ''}`)].join(' ').toLowerCase().includes(query);
  });
  const fragment = document.createDocumentFragment();
  for (const service of visible) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector('.port-number').textContent = service.port;
    row.querySelector('.protocol').textContent = service.protocol.toUpperCase();
    row.querySelector('h3').textContent = service.name;
    row.querySelector('.description').textContent = service.description;
    const badge = row.querySelector('.connection-badge');
    badge.textContent = service.self ? 'Directory' : isWeb(service) ? service.web.scheme.toUpperCase() : !service.local ? 'Network only' : service.protocol.toUpperCase();
    badge.classList.toggle('web', isWeb(service) || service.self);
    row.querySelector('.connection-description').textContent = service.self ? '' : !service.local ? 'Other interface' : service.web ? `HTTP ${service.web.status}` : 'No web page detected';
    const open = row.querySelector('.open-button');
    open.hidden = !isWeb(service);
    if (service.web) { open.href = service.web.url; open.setAttribute('aria-label', `Open ${service.name} on port ${service.port}`); }
    const copy = row.querySelector('.copy-button');
    copy.setAttribute('aria-label', `Copy port ${service.port}`);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(String(service.port)); copy.textContent = 'Copied!'; }
      catch { copy.textContent = String(service.port); }
      setTimeout(() => { copy.textContent = 'Copy port'; }, 1600);
    });
    const terminate = row.querySelector('.terminate-button');
    terminate.hidden = service.self;
    terminate.disabled = !service.termination?.allowed;
    terminate.title = service.termination?.reason || '';
    terminate.setAttribute('aria-label', `Terminate ${service.name} on ${service.protocol.toUpperCase()} port ${service.port}`);
    terminate.addEventListener('click', () => prepareTermination(service, terminate));
    const details = row.querySelector('.service-details');
    details.id = `details-${service.id.replace(':', '-')}`;
    details.hidden = !expanded.has(service.id);
    const toggle = row.querySelector('.details-toggle');
    toggle.setAttribute('aria-controls', details.id);
    toggle.setAttribute('aria-expanded', String(!details.hidden));
    toggle.textContent = details.hidden ? 'Details' : 'Hide details';
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      details.hidden ? expanded.delete(service.id) : expanded.add(service.id);
      toggle.setAttribute('aria-expanded', String(!details.hidden));
      toggle.textContent = details.hidden ? 'Details' : 'Hide details';
    });
    const list = details.querySelector('dl');
    addDetail(list, 'State', service.protocol === 'tcp' ? 'Listening' : 'Bound UDP socket');
    addDetail(list, 'Addresses', service.addresses.map(address => `${address.includes(':') ? `[${address}]` : address}:${service.port}`).join(', '));
    addDetail(list, 'Processes', service.processes.length ? service.processes.map(p => `${p.name} (PID ${p.pid})${p.script ? ` · ${p.script}` : ''}`).join(', ') : 'Not visible to your user');
    const projects = [...new Set(service.processes.map(p => p.project).filter(Boolean))];
    if (projects.length) addDetail(list, 'Project', projects.join(', '));
    addDetail(list, 'Name source', service.source);
    if (service.web) {
      addDetail(list, 'URL', service.web.url);
      if (service.web.contentType) addDetail(list, 'Response', `${service.web.status} · ${service.web.contentType}`);
      if (!service.web.certificateTrusted) addDetail(list, 'TLS certificate', 'Self-signed or untrusted; your browser may ask you to review it.');
    }
    fragment.append(row);
  }
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = query ? `No services match “${$('#search').value.trim()}”.` : 'No services in this view.';
    fragment.append(empty);
  }
  // Avoid replacing a focused control during background refreshes.
  const active = container.contains(document.activeElement) ? document.activeElement : null;
  const focusedService = active?.closest('.service')?.querySelector('.port-number')?.textContent;
  const focusedClass = active?.className;
  container.replaceChildren(fragment);
  if (focusedService && focusedClass) {
    const replacement = [...container.querySelectorAll('.service')].find(row => row.querySelector('.port-number').textContent === focusedService)?.getElementsByClassName(focusedClass)?.[0];
    replacement?.focus({ preventScroll: true });
  }
  container.setAttribute('aria-busy', 'false');
  $('#visible-count').textContent = `${visible.length} of ${services.length} ports shown`;
}

async function refresh({ fresh = false } = {}) {
  if (loading) return;
  loading = true;
  $('#refresh').disabled = true;
  $('#scan-status').textContent = 'Scanning ports…';
  try {
    const response = await fetch(fresh ? '/api/ports?fresh=1' : '/api/ports', { signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load ports.');
    services = data.services;
    lastScan = data.scannedAt;
    const webs = services.filter(isWeb).length;
    for (const [id, count] of [['all-badge', services.length], ['web-badge', webs], ['other-badge', services.length - webs]]) $(`#${id}`).textContent = count;
    $('#notice').hidden = !data.warning;
    $('#notice').textContent = data.warning || '';
    $('#scan-status').textContent = 'Updated just now';
    render();
  } catch (error) {
    $('#notice').hidden = false;
    $('#notice').textContent = `${error.message} ${lastScan ? 'The last successful scan is still shown.' : 'Use refresh to try again.'}`;
    $('#scan-status').textContent = lastScan ? 'Showing previous scan' : 'Scan unavailable';
    container.setAttribute('aria-busy', 'false');
    if (!lastScan) { container.replaceChildren(); const message = document.createElement('div'); message.className = 'empty'; message.textContent = 'Waiting for a successful scan.'; container.append(message); }
  } finally { loading = false; $('#refresh').disabled = false; }
}

$('#refresh').addEventListener('click', () => refresh({ fresh: true }));
$('#search').addEventListener('input', render);
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.filter').forEach(item => { const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected)); });
  render();
}));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); }
  if (event.key === 'Escape' && document.activeElement === $('#search')) { $('#search').value = ''; render(); $('#search').blur(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dialog.open && !terminationBusy) refresh(); });
setInterval(() => { if (!document.hidden && !dialog.open && !terminationBusy) refresh(); }, 10000);
refresh();
