export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const TROPHIES = [
  { at: 10, name: 'First ledger' }, { at: 25, name: 'Bookkeeper' },
  { at: 50, name: 'Year closer' }, { at: 100, name: 'Accountant' },
  { at: 250, name: 'Controller' }, { at: 500, name: 'Month master' }
];
export const STORAGE_KEY = 'count-month:progress:v1';

export function splitMonths(start, length, fiscalStart) {
  if (!Number.isInteger(start) || !Number.isInteger(length) || length < 1 || length > 60 || !Number.isInteger(fiscalStart) || fiscalStart < 0 || fiscalStart > 11) throw new Error('Invalid month range');
  const parts = [];
  let cursor = start;
  let remaining = length;
  while (remaining > 0) {
    const offset = ((cursor - fiscalStart) % 12 + 12) % 12;
    const months = Math.min(12 - offset, remaining);
    parts.push(months);
    cursor += months;
    remaining -= months;
  }
  return parts;
}

export function makeQuestion(settings = {}, random = Math.random) {
  const max = [12, 24, 36, 60].includes(settings.max) ? settings.max : 60;
  const integer = n => Math.min(n - 1, Math.floor(random() * n));
  const start = (2000 + integer(31)) * 12 + integer(12);
  return {
    start, length: 1 + integer(max),
    fiscalStart: Number.isInteger(settings.fiscalStart) && settings.fiscalStart >= 0 && settings.fiscalStart <= 11 ? settings.fiscalStart : integer(12)
  };
}

export function expectedParts(question) {
  return question.length > 12 ? splitMonths(question.start, question.length, question.fiscalStart) : [question.length];
}

export function checkAnswer(input, question) {
  if (!/^\d{1,2}(\+\d{1,2}){0,5}$/.test(input)) return false;
  const parts = input.split('+');
  const expected = expectedParts(question);
  return parts.length === expected.length && parts.every((part, i) => String(expected[i]) === part);
}

export function dateLabel(monthIndex, end = false) {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const day = end ? new Date(Date.UTC(year, month + 1, 0)).getUTCDate() : 1;
  return `${String(day).padStart(2, '0')} ${MONTHS[month]} ${year}`;
}

export function fiscalLabel(start) {
  const end = (start + 11) % 12;
  const day = new Date(Date.UTC(2001, end + 1, 0)).getUTCDate();
  return `01 ${MONTHS[start]} – ${end === 1 ? '28/29' : day} ${MONTHS[end]}`;
}

export function timelineData(question) {
  const start = Math.floor(question.start / 12) * 12 - 12;
  const end = Math.ceil((question.start + question.length) / 12) * 12 + 12;
  const calendar = [];
  const financial = [];
  for (let month = start; month < end; month += 12) calendar.push({ start: month, end: month + 11 });
  for (let month = start + question.fiscalStart - 12; month < end; month += 12) financial.push({ start: month, end: month + 11 });
  return { start, end, calendar, financial };
}

export function readProgress(raw) {
  try {
    const state = JSON.parse(raw);
    const q = state.question;
    if (!Number.isSafeInteger(state.credits) || state.credits < 0 || state.credits >= Number.MAX_SAFE_INTEGER) return null;
    if (!q || !Number.isInteger(q.start) || q.start < 2000 * 12 || q.start > 2031 * 12 || !Number.isInteger(q.length) || q.length < 1 || q.length > 60) return null;
    splitMonths(q.start, q.length, q.fiscalStart);
    return { credits: state.credits, question: q, solved: state.solved === true, settings: {
      max: [12, 24, 36, 60].includes(state.settings?.max) ? state.settings.max : 60,
      fiscalStart: Number.isInteger(state.settings?.fiscalStart) && state.settings.fiscalStart >= 0 && state.settings.fiscalStart <= 11 ? state.settings.fiscalStart : 'random'
    }};
  } catch { return null; }
}

// Small arithmetic parser: ordinary precedence; no eval or executable input.
export function calculate(expression) {
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+\-*/]/g);
  if (!tokens || tokens.join('') !== expression || tokens.length > 100) throw new Error('Invalid expression');
  let cursor = 0;
  const number = () => {
    let sign = 1;
    if (tokens[cursor] === '+' || tokens[cursor] === '-') sign = tokens[cursor++] === '-' ? -1 : 1;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(tokens[cursor] ?? '')) throw new Error('Enter a number');
    return sign * Number(tokens[cursor++]);
  };
  const term = () => {
    let value = number();
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const op = tokens[cursor++];
      const next = number();
      if (op === '/' && next === 0) throw new Error('Cannot divide by zero');
      value = op === '*' ? value * next : value / next;
    }
    return value;
  };
  let value = term();
  while (cursor < tokens.length) {
    const op = tokens[cursor++];
    if (op !== '+' && op !== '-') throw new Error('Invalid expression');
    const next = term();
    value = op === '+' ? value + next : value - next;
  }
  if (!Number.isFinite(value)) throw new Error('Result too large');
  return Number(value.toPrecision(12));
}
