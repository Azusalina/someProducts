// @vitest-environment jsdom
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { musicXMLToScore } from '../src/score';
import { qualityFeedback } from '../src/quality';
const note = (step = 'C', extra = '', duration = 4) => `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><staff>1</staff></note>`;
const grace = (step = 'D', attrs = 'slash="yes"', extra = '') => note(step, `<grace ${attrs}/>${extra}`).replace('<duration>4</duration>', '');
const wrap = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1" implicit="yes"><attributes><divisions>4</divisions></attributes>${body}</measure></part></score-partwise>`;
const ornament = (mark: string, step = 'C') => note(step, `<notations><ornaments>${mark}</ornaments></notations>`);

test('graces borrow time without changing meter and retain individual PDF IDs', () => {
  const score = musicXMLToScore(wrap(grace('D') + grace('E') + note('C') + note('G')));
  expect(score.duration).toBe(1);
  expect(score.notes.map(n => n.midi)).toEqual([62,64,60,67]);
  expect(score.notes.map(n => n.sources?.[0].id)).toEqual(['P1:0:0','P1:0:1','P1:0:2','P1:0:3']);
  expect(score.notes[2].start).toBeCloseTo(.1);
  expect(score.notes[3].start).toBe(.5);
  expect(score.notes.every(n => n.duration > 0 && n.soundDuration >= n.duration)).toBe(true);
  expect(qualityFeedback(score).facts.join(' ')).toContain('倚音 2');
});
test('explicit following steal percentage delays the whole chord, not another voice', () => {
  const score = musicXMLToScore(wrap(grace('D','steal-time-following="30"')+note()+note('E','<chord/>')+'<backup><duration>4</duration></backup>'+note('G').replace('<voice>1','<voice>2')));
  expect(score.notes.filter(n => [60,64].includes(n.midi)).map(n => n.start)).toEqual([.15,.15]);
  expect(score.notes.find(n => n.midi === 67)?.start).toBe(0);
  expect(score.duration).toBe(.5);
});
test('grace chords are simultaneous and previous-note stealing keeps following attack', () => {
  const score = musicXMLToScore(wrap(note()+grace('D','steal-time-previous="20"')+grace('F','steal-time-previous="20"','<chord/>')+note('G')));
  const graces = score.notes.filter(n => n.decoration === 'grace');
  expect(graces.map(n => n.start)).toEqual([.4,.4]);
  expect(score.notes.find(n => n.midi === 60)?.duration).toBe(.4);
  expect(score.notes.find(n => n.midi === 67)?.start).toBe(.5);
});
test('graces repeat with source measure, with unique playback IDs', () => {
  const score = musicXMLToScore(wrap(grace()+note()+'<barline><repeat direction="backward"/></barline>'));
  expect(score.notes.filter(n => n.decoration === 'grace').map(n => n.start)).toEqual([0,.5]);
  expect(new Set(score.notes.map(n => n.id)).size).toBe(4);
});
test('unsupported make-time and orphan grace are reported without inventing timing', () => {
  const score = musicXMLToScore(wrap(grace('D','make-time="2"')+note()+grace('E')));
  expect(score.notes).toHaveLength(1); expect(score.warnings.join(' ')).toContain('make-time');
});
test('graces do not skip a written rest to steal from a later principal', () => {
  const score = musicXMLToScore(wrap(grace()+'<note><rest/><duration>4</duration><voice>1</voice></note>'+note()));
  expect(score.notes).toHaveLength(1); expect(score.notes[0].start).toBe(.5);
  expect(score.warnings.join(' ')).toContain('缺少同小节');
});
test.each([['mordent',[60,59,60]], ['inverted-mordent',[60,62,60]], ['turn',[62,60,59,60]], ['inverted-turn',[59,60,62,60]]])('%s has the expected neighbor pitches and original source', (type, pitches) => {
  const score = musicXMLToScore(wrap(ornament(`<${type}/>`)));
  expect(score.notes.map(n => n.midi)).toEqual(pitches);
  expect(score.duration).toBe(.5);
  expect(score.notes.every(n => n.decoration === 'ornament' && n.sources?.[0].id === 'P1:0:0')).toBe(true);
  expect(score.notes.at(-1)!.start + score.notes.at(-1)!.duration).toBeCloseTo(.5);
});
test('neighbors follow key, local accidental and ornament accidental, including octave boundary', () => {
  const key = '<attributes><key><fifths>1</fifths></key></attributes>';
  expect(musicXMLToScore(wrap(key+ornament('<inverted-mordent/>','E'))).notes.map(n => n.midi)).toEqual([64,66,64]);
  const naturalF = note('F','<accidental>natural</accidental>');
  expect(musicXMLToScore(wrap(key+naturalF+ornament('<inverted-mordent/>','E'))).notes.slice(1).map(n => n.midi)).toEqual([64,65,64]);
  expect(musicXMLToScore(wrap(ornament('<turn/><accidental-mark placement="above">flat</accidental-mark>'))).notes.map(n => n.midi)).toEqual([61,60,59,60]);
});
test('trill starts on specified neighbor, bounded attack count and delayed turn retains main', () => {
  const score = musicXMLToScore(wrap(ornament('<trill-mark beats="4" start-note="upper" trill-step="half"/>')));
  expect(score.notes.map(n => n.midi)).toEqual([61,60,61,60]);
  expect(musicXMLToScore(wrap(ornament('<trill-mark beats="9999999"/>'))).notes).toHaveLength(64);
  const delayed = musicXMLToScore(wrap(ornament('<delayed-turn/>')));
  expect(delayed.notes.map(n => n.midi)).toEqual([60,62,60,59,60]);
  expect(delayed.notes[0].duration).toBe(.25);
});
test('tied and unsupported compound ornaments keep one principal attack with feedback', () => {
  const tied = ornament('<trill-mark/>').replace('<voice>', '<tie type="start"/><voice>')+note('C','<tie type="stop"/>');
  expect(musicXMLToScore(wrap(tied)).notes).toHaveLength(1);
  const unsupported = musicXMLToScore(wrap(ornament('<tremolo>3</tremolo>')));
  expect(unsupported.notes).toHaveLength(1); expect(unsupported.warnings.join(' ')).toContain('tremolo');
});
test('fixture includes all supported ornament families and positive finite playback', () => {
  const score = musicXMLToScore(readFileSync('tests/fixtures/ornaments.musicxml','utf8'));
  expect(score.duration).toBe(4);
  expect(score.notes.every(n => Number.isFinite(n.start+n.midi+n.duration) && n.start >= 0 && n.duration > 0)).toBe(true);
  expect(qualityFeedback(score).facts.join(' ')).toContain('倚音 3 · 颤音 1 · 波音 2 · 回音 3');
});

test('long mordents alternate with the correct lower neighbor and finish on the principal',()=>{
  const score=musicXMLToScore(wrap(ornament('<mordent long="yes"/>')));
  expect(score.notes.length).toBeGreaterThanOrEqual(5);
  expect(new Set(score.notes.map(n=>n.midi))).toEqual(new Set([60,59]));
  expect(score.notes.at(-1)!.midi).toBe(60);expect(score.duration).toBe(.5);
});
