import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMonths, expectedParts, checkAnswer, dateLabel, fiscalLabel, makeQuestion, readProgress, calculate, TROPHIES } from '../model.mjs';

test('inclusive month counts and strict fiscal-year answers', () => {
  assert.equal(dateLabel(2000 * 12 + 3), '01 Apr 2000');
  assert.equal(dateLabel(2000 * 12 + 6, true), '31 Jul 2000');
  const q = { start: 2000 * 12 + 9, length: 22, fiscalStart: 3 };
  assert.deepEqual(expectedParts(q), [6, 12, 4]);
  assert.equal(checkAnswer('6+12+4', q), true);
  for (const wrong of ['22', '4+12+6', '6+16', '06+12+4', '6++12+4', '6+12+4+', '6+12+4+0', '6+12+4.0']) assert.equal(checkAnswer(wrong, q), false, wrong);
  assert.deepEqual(expectedParts({ ...q, length: 12 }), [12]);
  assert.deepEqual(expectedParts({ ...q, length: 1 }), [1]);
});

test('all fiscal starts, all start months and every duration through five years', () => {
  // Independent reference: group individual months by their fiscal-year label.
  for (let fiscalStart = 0; fiscalStart < 12; fiscalStart++) {
    for (let startMonth = 0; startMonth < 12; startMonth++) {
      for (let length = 1; length <= 60; length++) {
        const start = 2024 * 12 + startMonth;
        const groups = new Map();
        for (let i = 0; i < length; i++) {
          const date = new Date(Date.UTC(2024, startMonth + i, 1));
          const fy = date.getUTCFullYear() - (date.getUTCMonth() < fiscalStart ? 1 : 0);
          groups.set(fy, (groups.get(fy) ?? 0) + 1);
        }
        assert.deepEqual(splitMonths(start, length, fiscalStart), [...groups.values()]);
      }
    }
  }
});

test('leap-year month ends and fiscal-year labels', () => {
  assert.equal(dateLabel(2000 * 12 + 1, true), '29 Feb 2000');
  assert.equal(dateLabel(2001 * 12 + 1, true), '28 Feb 2001');
  assert.equal(fiscalLabel(3), '01 Apr – 31 Mar');
  assert.equal(fiscalLabel(0), '01 Jan – 31 Dec');
  assert.equal(fiscalLabel(2), '01 Mar – 28/29 Feb');
});

test('five-year spans can need six fiscal-year terms', () => {
  const q = { start: 2020 * 12 + 9, length: 60, fiscalStart: 3 };
  assert.deepEqual(expectedParts(q), [6, 12, 12, 12, 12, 6]);
  assert.equal(checkAnswer('6+12+12+12+12+6', q), true);
});

test('random questions respect chosen month, duration and boundaries', () => {
  assert.deepEqual(makeQuestion({}, () => 0), { start: 24000, length: 1, fiscalStart: 0 });
  assert.deepEqual(makeQuestion({}, () => .999999), { start: 2030 * 12 + 11, length: 60, fiscalStart: 11 });
  assert.equal(makeQuestion({ max: 24, fiscalStart: 3 }, () => .99999).length, 24);
  assert.equal(makeQuestion({ max: 24, fiscalStart: 3 }).fiscalStart, 3);
});

test('stored progress preserves credits, solved status and settings', () => {
  const state = { credits: 250, solved: true, question: makeQuestion(), settings: { max: 60, fiscalStart: 3 } };
  assert.deepEqual(readProgress(JSON.stringify(state)), state);
  for (const raw of ['null', '{}', '{', JSON.stringify({ ...state, credits: -1 }), JSON.stringify({ ...state, credits: 1.1 }), JSON.stringify({ ...state, question: { ...state.question, length: 61 } })]) assert.equal(readProgress(raw), null);
  assert.deepEqual(TROPHIES.map(t => t.at), [10, 25, 50, 100, 250, 500]);
});

test('calculator supports four operations, precedence, decimals and negatives', () => {
  for (const [expression, result] of [['6+12+12+4', 34], ['2+3*4', 14], ['24/6-1', 3], ['-2*4+10', 2], ['0.1+0.2', .3], ['.5*8', 4], ['12/-3', -4], ['5--2', 7]]) assert.equal(calculate(expression), result);
  for (const invalid of ['', '1/0', '2**3', '2+', 'alert(1)', '1;2', '1 2', '1..2']) assert.throws(() => calculate(invalid));
});
