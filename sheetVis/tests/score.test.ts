// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { Midi } from '@tonejs/midi';
import { strToU8, zipSync } from 'fflate';
import { musicXMLToScore, extractMusicXML, midiToScore } from '../src/score';

const attrs = '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>';
const note = (step = 'C', duration = 4, other = '') => `<note>${other}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><staff>1</staff></note>`;
const wrap = (measures: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
const measure = (body: string, number = 1) => `<measure number="${number}" implicit="yes">${number === 1 ? attrs : ''}${body}</measure>`;

describe('musical timing and structure', () => {
  test('demo has two staves and expected real duration', () => {
    const s = musicXMLToScore(readFileSync('public/demo.musicxml', 'utf8'));
    expect(s.notes).toHaveLength(56); expect(s.measures).toHaveLength(8);
    expect(s.duration).toBeCloseTo(20); expect(s.bpm).toBe(96);
    expect(s.notes.filter(n => n.hand === 'left')).toHaveLength(24);
  });
  test('chords and backup keep both staves aligned', () => {
    const xml = wrap(measure(note() + note('E', 4, '<chord/>') + '<backup><duration>4</duration></backup>' + note('G', 4).replace('<staff>1', '<staff>2')));
    const s = musicXMLToScore(xml);
    expect(s.notes.map(n => n.start)).toEqual([0, 0, 0]); expect(s.duration).toBe(.5);
    expect(s.notes[2].hand).toBe('left');
  });
  test('rests and forward retain silence in the timeline', () => {
    const s = musicXMLToScore(wrap(measure('<note><rest/><duration>4</duration></note><forward><duration>4</duration></forward>' + note())));
    expect(s.notes[0].start).toBe(1); expect(s.duration).toBe(1.5);
  });
  test('tempo changes apply across a sustained note', () => {
    const tempo = '<direction><offset>4</offset><sound tempo="60"/></direction>';
    const s = musicXMLToScore(wrap(measure(tempo + note('C', 8))));
    expect(s.notes[0].duration).toBe(1.5);
  });
  test('ties merge across measures without a second attack', () => {
    const xml = wrap(measure(note('C', 4, '<tie type="start"/>')) + measure(note('C', 4, '<tie type="stop"/>'), 2));
    const s = musicXMLToScore(xml);
    expect(s.notes).toHaveLength(1); expect(s.notes[0].duration).toBe(1);
  });
  test('tuplets use actual divisions duration, not drawn note type', () => {
    const s = musicXMLToScore(wrap(measure(note('C', 4) + note('D', 4) + note('E', 4))).replace('>4</divisions>', '>12</divisions>'));
    expect(s.duration).toBeCloseTo(.5); expect(s.notes[1].start).toBeCloseTo(1 / 6);
  });
  test('ordinary repeat is unfolded', () => {
    const repeat = '<barline><repeat direction="backward"/></barline>';
    const s = musicXMLToScore(wrap(measure(note()) + measure(note('D') + repeat, 2)));
    expect(s.measures.map(m => m.number)).toEqual(['1', '2', '1', '2']); expect(s.duration).toBe(2);
  });
  test('first and second endings choose the correct pass', () => {
    const start = '<barline location="left"><repeat direction="forward"/></barline>';
    const first = '<barline location="left"><ending number="1" type="start"/></barline>';
    const end = '<barline><ending number="1" type="stop"/><repeat direction="backward"/></barline>';
    const second = '<barline location="left"><ending number="2" type="start"/></barline>';
    const s = musicXMLToScore(wrap(measure(start + note()) + measure(first + note('D') + end, 2) + measure(second + note('E') + '<barline><ending number="2" type="stop"/></barline>', 3)));
    expect(s.measures.map(m => m.number)).toEqual(['1', '2', '1', '3']);
  });
  test('pedal extends sound while key duration stays unchanged', () => {
    const xml = wrap(measure('<direction><direction-type><pedal type="start"/></direction-type></direction>' + note() + '<forward><duration>4</duration></forward><direction><direction-type><pedal type="stop"/></direction-type></direction>'));
    const s = musicXMLToScore(xml); expect(s.notes[0].duration).toBe(.5); expect(s.notes[0].soundDuration).toBe(1);
  });
  test('pitch alter overrides key signature for sound', () => {
    const s = musicXMLToScore(wrap(measure(note('F').replace('<step>F</step>', '<step>F</step><alter>1</alter>'))));
    expect(s.notes[0].midi).toBe(66);
  });
  test('pickup keeps its actual duration', () => {
    const s = musicXMLToScore(wrap(measure(note()) + measure(note('E', 16), 2)));
    expect(s.measures[1].start).toBe(.5);
  });
  test('incomplete later measures retain meter spacing and warn', () => {
    const xml = wrap(measure(note('C', 16)) + measure(note('D'), 2).replace(' implicit="yes"', '') + measure(note('E', 16), 3));
    const s = musicXMLToScore(xml);
    expect(s.measures[1].duration).toBe(2); expect(s.measures[2].start).toBe(4);
    expect(s.warnings.some(w => w.includes('拍号不一致'))).toBe(true);
  });
  test('piano part is chosen when preceded by another instrument', () => {
    const s = musicXMLToScore('<score-partwise><part-list><score-part id="F"><part-name>Flute</part-name></score-part><score-part id="P"><part-name>Piano</part-name></score-part></part-list><part id="F">'+measure(note('D'))+'</part><part id="P">'+measure(note('C'))+'</part></score-partwise>');
    expect(s.notes[0].midi).toBe(60); expect(s.warnings.some(w => w.includes('多个乐器'))).toBe(true);
  });
  test('invalid or empty scores fail clearly', () => {
    expect(() => musicXMLToScore('<broken')).toThrow();
    expect(() => musicXMLToScore(wrap(measure('')))).toThrow('没有识别');
    expect(() => musicXMLToScore('<!DOCTYPE a [<!ENTITY b "c">]><a/>')).toThrow('自定义实体');
  });
  test('compressed MusicXML follows the container rootfile', () => {
    const xml = wrap(measure(note()));
    const compressed = zipSync({ 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="nested/score.xml"/></rootfiles></container>'), 'nested/score.xml': strToU8(xml) });
    expect(extractMusicXML(compressed.buffer as ArrayBuffer)).toBe(xml);
  });
  test('MIDI preserves its tempo timeline and filters drums', () => {
    const midi = new Midi(); midi.header.setTempo(90);
    midi.addTrack().addNote({ midi: 60, time: 1, duration: .5, velocity: .8 });
    const drums = midi.addTrack(); drums.channel = 9; drums.addNote({ midi: 36, time: 0, duration: .2 });
    const bytes = midi.toArray(); const s = midiToScore(bytes.buffer as ArrayBuffer, 'test.mid');
    expect(s.notes).toHaveLength(1); expect(s.notes[0].start).toBeCloseTo(1); expect(s.bpm).toBeCloseTo(90);
  });
});
