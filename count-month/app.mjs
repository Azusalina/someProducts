import { MONTHS, TROPHIES, STORAGE_KEY, makeQuestion, expectedParts, checkAnswer, dateLabel, fiscalLabel, readProgress, calculate } from './model.mjs';

const $ = id => document.getElementById(id);
let storageAvailable = true;
function load() {
  try { return readProgress(localStorage.getItem(STORAGE_KEY)); }
  catch { storageAvailable = false; return null; }
}
let state = load() ?? { credits: 0, question: makeQuestion(), solved: false, settings: { fiscalStart: 'random', max: 60 } };
let answer = '';
let developer = false;
let resetArmed = false;
let calc = '';
let calcResult = false;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { storageAvailable = false; }
  $('storage-warning').hidden = storageAvailable;
}
function feedback(message = '', kind = '') {
  $('feedback').textContent = message;
  $('feedback').dataset.kind = kind;
}
function renderEntry() {
  $('answer').value = answer;
  $('submit').disabled = !state.solved && !answer;
  $('submit').innerHTML = state.solved ? 'Next question <span aria-hidden="true">→</span>' : 'Submit <span aria-hidden="true">↵</span>';
  for (const button of $('keypad').querySelectorAll('button')) button.disabled = state.solved;
  $('clear').disabled = state.solved || !answer;
}
function render() {
  const q = state.question;
  $('credits').textContent = state.credits.toLocaleString('en');
  $('trophy-count').textContent = `${TROPHIES.filter(t => state.credits >= t.at).length} / ${TROPHIES.length}`;
  $('fiscal-range').textContent = fiscalLabel(q.fiscalStart);
  $('date-start').textContent = dateLabel(q.start);
  $('date-end').textContent = dateLabel(q.start + q.length - 1, true);
  for (const [id, month, end] of [['date-start', q.start, false], ['date-end', q.start + q.length - 1, true]]) {
    const day = end ? new Date(Date.UTC(Math.floor(month / 12), month % 12 + 1, 0)).getUTCDate() : 1;
    $(id).dateTime = `${Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  $('answer-label').textContent = q.length > 12 ? 'Months by financial year' : 'Total months';
  $('answer-hint').textContent = q.length > 12 ? 'One term per FY · e.g. 6+12+4' : 'Count both months.';
  renderEntry();
}
function input(key) {
  if (state.solved) return;
  if (key === 'backspace') answer = answer.slice(0, -1);
  else if (key === 'clear') answer = '';
  else if (key === '+' && /\d$/.test(answer) && answer.split('+').length < 6) answer += '+';
  else if (/^\d$/.test(key) && answer.length < 17 && answer.split('+').at(-1).length < 2) answer += key;
  feedback();
  renderEntry();
}
function next() {
  state.question = makeQuestion(state.settings);
  state.solved = false;
  answer = '';
  feedback();
  persist();
  render();
}
function submit() {
  // Reconcile another tab before awarding a point.
  const latest = load();
  if (latest && JSON.stringify(latest) !== JSON.stringify(state)) {
    state = latest;
    answer = '';
    feedback('Progress updated in another tab.');
    render();
    return;
  }
  if (state.solved) { next(); return; }
  if (!answer) return;
  if (!checkAnswer(answer, state.question)) {
    feedback(state.question.length > 12 ? 'Try again. Split at each financial year end.' : 'Try again. Count both months.', 'wrong');
    return;
  }
  state.credits += 1;
  state.solved = true;
  const trophy = TROPHIES.find(t => t.at === state.credits);
  feedback(trophy ? `+1 credit · Trophy earned: ${trophy.name}` : '+1 credit · Correct', 'correct');
  persist();
  render();
}
$('keypad').addEventListener('click', event => { const key = event.target.closest('[data-key]')?.dataset.key; if (key) input(key); });
$('clear').addEventListener('click', () => input('clear'));
$('submit').addEventListener('click', submit);

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
}
$('trophies-open').addEventListener('click', () => {
  const nextTrophy = TROPHIES.find(t => state.credits < t.at);
  $('trophy-progress').textContent = nextTrophy ? `${state.credits} credits · ${nextTrophy.at - state.credits} to ${nextTrophy.name}` : `${state.credits} credits · All trophies earned`;
  $('trophy-list').replaceChildren(...TROPHIES.map((t, i) => {
    const earned = state.credits >= t.at;
    const item = document.createElement('li');
    item.className = earned ? 'earned' : '';
    item.innerHTML = `<span class="medal" aria-hidden="true">${earned ? '✦' : i + 1}</span><span class="trophy-name">${t.name}</span><span class="trophy-milestone">${t.at} ${earned ? '✓' : ''}</span>`;
    item.setAttribute('aria-label', `${t.name}, ${t.at} credits, ${earned ? 'earned' : 'locked'}`);
    return item;
  }));
  $('trophies-dialog').showModal();
});
for (const [i, month] of MONTHS.entries()) $('fiscal-select').add(new Option(`01 ${month}`, i));
$('settings-open').addEventListener('click', () => {
  $('fiscal-select').value = state.settings.fiscalStart;
  $('duration-select').value = state.settings.max;
  $('settings-dialog').showModal();
});
$('apply-settings').addEventListener('click', () => {
  state = load() ?? state;
  state.settings = { fiscalStart: $('fiscal-select').value === 'random' ? 'random' : Number($('fiscal-select').value), max: Number($('duration-select').value) };
  next();
  $('settings-dialog').close();
});
$('developer-form').addEventListener('submit', event => {
  event.preventDefault();
  developer = $('developer-password').value === '0000';
  $('developer-password').value = '';
  $('developer-controls').hidden = !developer;
  $('developer-feedback').textContent = developer ? 'Developer mode unlocked.' : 'Incorrect password.';
  resetArmed = false;
});
$('reset-credits').addEventListener('click', () => {
  if (!developer) return;
  if (!resetArmed) { resetArmed = true; $('reset-credits').textContent = 'Confirm reset'; return; }
  state = load() ?? state;
  state.credits = 0;
  next();
  $('settings-dialog').close();
});
$('settings-dialog').addEventListener('close', () => {
  developer = false;
  resetArmed = false;
  $('developer-controls').hidden = true;
  $('developer-password').value = '';
  $('developer-feedback').textContent = '';
  $('reset-credits').textContent = 'Reset credits & trophies';
  $('settings-dialog').querySelector('details').open = false;
});

function calculatorInput(key) {
  $('calculator-error').textContent = '';
  if (key === 'clear') { calc = ''; calcResult = false; }
  else if (key === 'backspace') { calc = calc.slice(0, -1); calcResult = false; }
  else if (key === '=') {
    try { calc = String(calculate(calc)); calcResult = true; }
    catch (error) { $('calculator-error').textContent = error.message; }
  } else if (/^[\d.+\-*/]$/.test(key) && calc.length < 80) {
    if (calcResult && /^[\d.]$/.test(key)) calc = '';
    calcResult = false;
    calc += key;
  }
  $('calculator-display').textContent = calc.replaceAll('*', '×').replaceAll('/', '÷') || '0';
}
$('calculator-open').addEventListener('click', () => $('calculator-dialog').showModal());
$('calculator-keypad').addEventListener('click', event => { const key = event.target.closest('[data-calc]')?.dataset.calc; if (key) calculatorInput(key); });
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if ($('calculator-dialog').open) {
    const key = event.key === 'Enter' || event.key === '=' ? '=' : event.key === 'Backspace' ? 'backspace' : event.key === 'Delete' ? 'clear' : event.key;
    if (/^[\d.+\-*/=]$/.test(key) || ['backspace', 'clear'].includes(key)) { event.preventDefault(); calculatorInput(key); }
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Enter' && (event.target === document.body || event.target === $('answer') || event.target === $('submit') || event.target.closest('#keypad'))) { event.preventDefault(); submit(); }
  else if (/^[\d+]$/.test(event.key)) { event.preventDefault(); input(event.key); }
  else if (event.key === 'Backspace') { event.preventDefault(); input('backspace'); }
  else if (event.key === 'Delete') { event.preventDefault(); input('clear'); }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  const latest = readProgress(event.newValue);
  if (latest) { state = latest; answer = state.solved ? expectedParts(state.question).join('+') : ''; feedback('Progress updated in another tab.'); render(); }
});
if (state.solved) { answer = expectedParts(state.question).join('+'); feedback('Correct · Credit already saved', 'correct'); }
persist();
render();
