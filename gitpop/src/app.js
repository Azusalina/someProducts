import { categories, repos, filterRepos, makeBag } from './repos.js';
import { VisualStudy } from './visuals.js';

const $ = id => document.getElementById(id);
let category = categories[0];
let current = repos[0];
let bag = makeBag(repos.filter(repo => repo.id !== current.id));
let discoveries = 1;
let miniVisuals = [];
let toastTimer;
let transitionTimer;
const storageKey = 'gitpop:saved:v1';
const saved = new Set();
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(stored)) for (const id of stored) if (repos.some(repo => repo.id === id)) saved.add(id);
} catch { /* A blocked or malformed store must not stop discovery. */ }

const study = new VisualStudy($('feature-canvas'), current, { animated: true });
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message; $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify([...saved])); }
  catch { toast('Saved for this visit. Browser storage is unavailable.'); return false; }
  return true;
}
function updateSave() {
  $('saved-count').textContent = saved.size;
  $('save-button').setAttribute('aria-pressed', String(saved.has(current.id)));
  $('save-button').setAttribute('aria-label', saved.has(current.id) ? 'Remove saved repository' : 'Save repository');
  $('save-button').title = saved.has(current.id) ? 'Remove from saved sparks' : 'Save for later';
}
function showRepo(repo, { animate = true, announce = true } = {}) {
  current = repo;
  const [owner, name] = repo.id.split('/');
  $('repo-owner').replaceChildren(document.createTextNode(owner), Object.assign(document.createElement('span'), { textContent: '/' }), document.createTextNode(name));
  $('repo-title').textContent = repo.title;
  $('repo-description').textContent = repo.description;
  $('repo-tags').replaceChildren(...repo.tags.map(tag => Object.assign(document.createElement('span'), { className: 'tag', textContent: tag })));
  $('repo-language').textContent = repo.language;
  $('language-dot').style.background = repo.language === 'TypeScript' ? '#79add3' : repo.language === 'HTML' ? '#e18b71' : '#e4d078';
  $('repo-inspiration').textContent = repo.spark;
  $('repo-link').href = $('source-link').href = `https://github.com/${repo.id}`;
  $('visual-caption').textContent = repo.caption;
  $('figure-number').textContent = String(repos.indexOf(repo) + 1).padStart(3, '0');
  $('discovery-number').textContent = String(discoveries).padStart(2, '0');
  $('feature-canvas').setAttribute('aria-label', `Original ${repo.visual} visual sketch inspired by ${repo.name}`);
  study.setRepo(repo);
  updateSave();
  if (animate) {
    clearTimeout(transitionTimer); $('feature-card').classList.remove('popping');
    void $('feature-card').offsetWidth; $('feature-card').classList.add('popping');
    transitionTimer = setTimeout(() => $('feature-card').classList.remove('popping'), 600);
  }
  if (announce) $('discovery-announcement').textContent = `Discovery ${discoveries}: ${repo.title} ${repo.description}`;
}
function pop() {
  const pool = filterRepos(category);
  if (!bag.length) bag = makeBag(pool, current.id);
  discoveries++;
  showRepo(bag.pop());
  renderMore();
}
function renderFilters() {
  $('filters').replaceChildren(...categories.map(label => {
    const button = document.createElement('button');
    button.className = 'filter-button' + (label === category ? ' active' : '');
    button.textContent = label; button.setAttribute('aria-pressed', String(label === category));
    button.addEventListener('click', () => {
      if (category === label) return;
      category = label; bag = makeBag(filterRepos(category), current.id);
      renderFilters(); pop();
      $('filters').querySelector('[aria-pressed="true"]').focus();
    });
    return button;
  }));
  const count = filterRepos(category).length;
  $('pool-count').textContent = `${count} possibilities, and counting`;
}
function renderMore() {
  miniVisuals.forEach(visual => visual.destroy()); miniVisuals = [];
  const pool = filterRepos(category).filter(repo => repo.id !== current.id);
  const options = makeBag(pool).slice(0, 3);
  $('more-grid').replaceChildren(...options.map(repo => {
    const button = document.createElement('button'); button.className = 'mini-card';
    button.setAttribute('aria-label', `Discover ${repo.name}: ${repo.title}`);
    const visual = document.createElement('div'); visual.className = 'mini-visual';
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    const categoryTag = Object.assign(document.createElement('span'), { className: 'mini-category', textContent: repo.category });
    visual.append(canvas, categoryTag);
    const info = document.createElement('div'); info.className = 'mini-info';
    const owner = Object.assign(document.createElement('span'), { className: 'mini-owner', textContent: repo.id.split('/')[0] + ' /' });
    const arrow = Object.assign(document.createElement('span'), { className: 'mini-arrow', textContent: '↗' }); arrow.setAttribute('aria-hidden', 'true');
    const title = Object.assign(document.createElement('h3'), { textContent: repo.title });
    const description = Object.assign(document.createElement('p'), { textContent: repo.spark.split('. ')[0] + '.' });
    const meta = Object.assign(document.createElement('div'), { className: 'mini-meta', textContent: repo.tags.join(' · ') });
    info.append(owner, arrow, title, description, meta); button.append(visual, info);
    button.addEventListener('click', () => {
      discoveries++; showRepo(repo);
      bag = bag.filter(candidate => candidate.id !== repo.id);
      renderMore();
      $('feature-card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      $('repo-link').focus({ preventScroll: true });
    });
    return button;
  }));
  // Measure only after the cards are in the document.
  [...$('more-grid').children].forEach((card, index) => miniVisuals.push(new VisualStudy(card.querySelector('canvas'), options[index])));
}
function renderSaved() {
  const list = $('saved-list');
  if (!saved.size) {
    list.innerHTML = '<div class="empty-saved"><span aria-hidden="true">✧</span><h3>Your next spark is out there.</h3><p>Tap the bookmark on a discovery to keep it here.<br>A little collection of things you might build next.</p></div>';
    return;
  }
  list.replaceChildren(...[...saved].reverse().map(id => {
    const repo = repos.find(item => item.id === id);
    const row = document.createElement('article'); row.className = 'saved-item';
    const info = document.createElement('div'); info.className = 'saved-item-info';
    info.append(Object.assign(document.createElement('small'), { textContent: repo.category }), Object.assign(document.createElement('h3'), { textContent: repo.title }));
    const actions = document.createElement('div'); actions.className = 'saved-item-actions';
    const view = Object.assign(document.createElement('button'), { textContent: 'Explore' });
    view.addEventListener('click', () => {
      $('saved-dialog').close();
      category = categories[0]; renderFilters();
      bag = makeBag(repos.filter(item => item.id !== repo.id));
      discoveries++; showRepo(repo); renderMore();
      $('feature-card').scrollIntoView({ behavior: 'instant', block: 'center' }); $('repo-link').focus({ preventScroll: true });
    });
    const open = Object.assign(document.createElement('a'), { href: `https://github.com/${repo.id}`, target: '_blank', rel: 'noopener noreferrer', textContent: 'GitHub ↗' });
    const remove = Object.assign(document.createElement('button'), { className: 'remove-saved', textContent: '×' });
    remove.setAttribute('aria-label', `Remove ${repo.name} from saved repositories`);
    remove.addEventListener('click', () => { saved.delete(id); persist(); updateSave(); renderSaved(); $('saved-dialog').querySelector('button').focus(); });
    actions.append(view, open, remove); row.append(info, actions); return row;
  }));
}
$('pop-button').addEventListener('click', pop);
$('next-button').addEventListener('click', pop);
$('shuffle-cards').addEventListener('click', () => { renderMore(); toast('Fresh rabbit holes, coming right up.'); });
$('save-button').addEventListener('click', () => {
  const removing = saved.has(current.id);
  removing ? saved.delete(current.id) : saved.add(current.id);
  const persisted = persist(); updateSave();
  if (persisted) toast(removing ? 'Spark removed from your collection.' : 'A spark saved for your next build.');
});
$('pause-preview').textContent = study.paused ? '▷' : 'Ⅱ';
function updatePause() {
  $('pause-preview').textContent = study.paused ? '▷' : 'Ⅱ';
  $('pause-preview').setAttribute('aria-label', study.paused ? 'Play animation' : 'Pause animation');
  $('pause-preview').title = study.paused ? 'Play animation' : 'Pause animation';
}
$('pause-preview').addEventListener('click', () => { study.paused = !study.paused; updatePause(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { study.paused = event.matches; updatePause(); });
updatePause();
$('saved-nav').addEventListener('click', () => { renderSaved(); $('saved-dialog').showModal(); });
for (const id of ['about-nav', 'footer-about']) $(id).addEventListener('click', () => $('about-dialog').showModal());
$('explore-nav').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
}
window.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !document.querySelector('dialog[open]') && !event.target.closest('button,a,input,textarea,select,[contenteditable]')) {
    event.preventDefault(); pop();
  }
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  try {
    const values = JSON.parse(event.newValue || '[]');
    if (!Array.isArray(values)) return;
    saved.clear(); values.forEach(id => { if (repos.some(repo => repo.id === id)) saved.add(id); });
    updateSave(); if ($('saved-dialog').open) renderSaved();
  } catch { /* Ignore malformed changes from another tab. */ }
});
renderFilters(); showRepo(current, { animate: false, announce: false }); renderMore();
