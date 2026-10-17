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
  test('cropped scores without meter do not acquire invented 4/4 silent tails', () => {
    const s=musicXMLToScore(wrap(`<measure number="120"><attributes><divisions>4</divisions></attributes>${note('C',12)}</measure><measure number="121">${note('D',12)}</measure>`));
    expect(s.notes.map(n=>n.start)).toEqual([0,1.5]);
    expect(s.duration).toBe(3);expect(s.warnings.join(' ')).toContain('缺少拍号');
  });
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
  test('notation fixture retains expected pitches, attacks and duration', () => {
    const s = musicXMLToScore(readFileSync('tests/fixtures/notations.musicxml','utf8'));
    expect(s.notes).toHaveLength(11); expect(s.duration).toBeCloseTo(3);
    expect(s.notes.slice(0,3).map(n => n.midi)).toEqual([72,50,52]);
    expect(s.notes[2].duration).toBe(1); expect(s.notes[2].sources).toHaveLength(2);
    expect(s.notes[3].duration).toBeCloseTo(1/6); expect(s.notes[6].duration).toBeCloseTo(.1);
  });
  test('divisions change exactly at a mid-measure attribute', () => {
    const s = musicXMLToScore(wrap(measure(note() + '<attributes><divisions>8</divisions></attributes>' + note('D', 8))));
    expect(s.notes.map(n => n.duration)).toEqual([.5,.5]); expect(s.duration).toBe(1);
  });
  test.each([3,5])('%i-tuplet fallback restores missing duration without double scaling explicit duration', actual => {
    const ratio = `<type>eighth</type><time-modification><actual-notes>${actual}</actual-notes><normal-notes>2</normal-notes></time-modification>`;
    const missing = note('C',4,ratio).replace('<duration>4</duration>','');
    const s = musicXMLToScore(wrap(measure(missing.repeat(actual))));
    expect(s.duration).toBeCloseTo(.5); expect(s.notes[1].start).toBeCloseTo(.5/actual);
    const explicit = musicXMLToScore(wrap(measure(note('C',4,ratio))));
    expect(explicit.duration).toBe(.5);
  });
  test('dotted tuplet fallback and malformed ratios are handled explicitly', () => {
    const n = note('C',4,'<type>eighth</type><dot/><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>').replace('<duration>4</duration>','');
    expect(musicXMLToScore(wrap(measure(n))).duration).toBeCloseTo(.25);
    const bad = musicXMLToScore(wrap(measure(n.replace('<actual-notes>3','<actual-notes>0')+note())));
    expect(bad.notes).toHaveLength(1); expect(bad.warnings.join(' ')).toContain('连音比例');
  });
  test('8va, 8vb and inline clef changes preserve sounding MusicXML pitch', () => {
    const shift = (type:string) => `<direction><direction-type><octave-shift type="${type}" size="8"/></direction-type></direction>`;
    const clef = '<attributes><clef><sign>F</sign><line>4</line></clef></attributes>';
    const s = musicXMLToScore(wrap(measure(shift('down')+note('C').replace('<octave>4','<octave>5')+shift('stop')+clef+note('D').replace('<octave>4','<octave>3')+shift('up')+note('E').replace('<octave>4','<octave>2')+shift('stop'))));
    expect(s.notes.map(n => n.midi)).toEqual([72,50,40]);
    expect(s.notes.every(n => n.hand === 'right')).toBe(true);
  });
  test('unpaired ottava is reported without guessing an octave correction', () => {
    const s = musicXMLToScore(wrap(measure('<direction><direction-type><octave-shift type="down"/></direction-type></direction>'+note())));
    expect(s.notes[0].midi).toBe(60); expect(s.warnings.join(' ')).toContain('八度线缺少配对');
  });
  test('unambiguous cross-staff tie keeps one attack and source locations', () => {
    const s = musicXMLToScore(wrap(measure(note('C',4,'<tie type="start"/>')+note('C',4,'<tie type="stop"/>').replace('<staff>1','<staff>2'))));
    expect(s.notes).toHaveLength(1); expect(s.notes[0].duration).toBe(1); expect(s.notes[0].sources).toHaveLength(2);
  });
  test('three-part tied continuation keeps one attack and all PDF source segments', () => {
    const tied = (type:string) => `<notations><tied type="${type}"/></notations>`;
    const s = musicXMLToScore(wrap(measure(note('C',4,tied('start'))) + measure(note('C',4,tied('continue')),2)+measure(note('C',4,tied('stop')),3)));
    expect(s.notes).toHaveLength(1); expect(s.notes[0].duration).toBe(1.5);
    expect(s.notes[0].sources?.map(n => n.start)).toEqual([0,.5,1]);
  });
  test('slur retains attacks and adds a bounded legato overlap across measures', () => {
    const slur = (type:string) => `<notations><slur type="${type}" number="1"/></notations>`;
    const s = musicXMLToScore(wrap(measure(note('C',4,slur('start'))) + measure(note('D')+note('E',4,slur('stop')),2)));
    expect(s.notes).toHaveLength(3); expect(s.notes.map(n => n.start)).toEqual([0,.5,1]);
    expect(s.notes[0].soundDuration).toBeCloseTo(.53); expect(s.notes[1].soundDuration).toBeCloseTo(.53);
    expect(s.notes[2].soundDuration).toBe(.5);
  });
  test('slurs never bridge rests, retrigger the same pitch late, or connect unrelated voices', () => {
    const start = '<notations><slur type="start"/></notations>', stop = '<notations><slur type="stop"/></notations>';
    const same = musicXMLToScore(wrap(measure(note('C',4,start)+note('C',4,stop))));
    expect(same.notes).toHaveLength(2); expect(same.notes[0].soundDuration).toBe(.5);
    const rest = musicXMLToScore(wrap(measure(note('C',4,start)+'<note><rest/><duration>4</duration></note>'+note('D',4,stop))));
    expect(rest.notes[0].soundDuration).toBe(.5);
    const other = musicXMLToScore(wrap(measure(note('C',4,start)+note('D',4,stop).replace('<voice>1','<voice>2'))));
    expect(other.notes[0].soundDuration).toBe(.5);
  });
  test('unclosed slurs report uncertainty and do not extend sound', () => {
    const s = musicXMLToScore(wrap(measure(note('C',4,'<notations><slur type="start"/></notations>')+note('D'))));
    expect(s.notes[0].soundDuration).toBe(.5); expect(s.warnings.join(' ')).toContain('连奏线缺少终点');
  });
  test('ordinary repeat is unfolded', () => {
    const repeat = '<barline><repeat direction="backward"/></barline>';
    const s = musicXMLToScore(wrap(measure(note()) + measure(note('D') + repeat, 2)));
    expect(s.measures.map(m => m.number)).toEqual(['1', '2', '1', '2']); expect(s.duration).toBe(2);
  });
  test('orphan ending marks without repeats do not discard subsequent music', () => {
    const second = '<barline location="left"><ending number="2" type="start"/></barline>';
    const s = musicXMLToScore(wrap(measure(note()) + measure(second + note('D'), 2) + measure(note('E'), 3)));
    expect(s.measures.map(m => m.number)).toEqual(['1', '2', '3']);
    expect(s.notes).toHaveLength(3);
    expect(s.warnings.join(' ')).toContain('没有反复记号');
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

test('chromatic pitches, cancellation and inline clefs do not stop either backed-up voice', () => {
  const n=(step:string,octave:number,alter:number,sign='')=>`<note><pitch><step>${step}</step>${alter?`<alter>${alter}</alter>`:''}<octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff>${sign?`<accidental>${sign}</accidental>`:''}</note>`;
  const clef=(sign:string,line:number)=>`<attributes><clef number="1"><sign>${sign}</sign><line>${line}</line></clef></attributes>`;
  const xml=wrap(measure('<attributes><key><fifths>1</fifths></key></attributes>'+n('F',4,1,'sharp')+n('F',4,1)+n('F',4,0,'natural')+clef('F',4)+n('B',2,-1,'flat')+'<backup><duration>16</duration></backup>'+n('C',3,0).replace('<voice>1','<voice>2').replace('<staff>1','<staff>2'))+measure(clef('G',2)+n('F',4,1)+n('C',5,2,'double-sharp')+n('B',4,-2,'flat-flat'),2));
  const s=musicXMLToScore(xml);
  expect(s.notes.filter(n=>n.hand==='right').map(n=>n.midi)).toEqual([66,66,65,46,66,74,69]);
  expect(s.notes.find(n=>n.hand==='left')?.start).toBe(0);expect(s.notes.at(-1)?.start).toBe(3);
});

test('compact OMR bars remove only invented meter padding and retain written rests',()=>{
  const m=(body:string,n:number)=>`<measure number="${n}">${n===1?attrs:''}${body}</measure>`;
  const xml=wrap(m(note('C',16),1)+m(note('D',4)+'<note><rest/><duration>4</duration></note>',2)+m(note('E',16),3));
  const strict=musicXMLToScore(xml),compact=musicXMLToScore(xml,'test',{trimMeasurePadding:true});
  expect(strict.notes.at(-1)?.start).toBe(4);expect(compact.notes.at(-1)?.start).toBe(3);
  expect(compact.measures[1].duration).toBe(1);expect(compact.warnings.join(' ')).toContain('已省略');
});

test('independent backed-up voices may reuse a slur number in document order',()=>{
  const slur=(type:string)=>`<notations><slur number="1" type="${type}"/></notations>`;
  const upper=note('C',4,slur('start'))+note('D',4,slur('stop'));
  const lower=(note('E',4,slur('start'))+note('F',4,slur('stop'))).replaceAll('<voice>1','<voice>2').replaceAll('<staff>1','<staff>2');
  const s=musicXMLToScore(wrap(measure(upper+'<backup><duration>8</duration></backup>'+lower)));
  expect(s.notes.filter(n=>n.start===0).every(n=>n.soundDuration>n.duration)).toBe(true);
  expect(s.warnings.join(' ')).not.toMatch(/起点重复|缺少起点|缺少终点/);
});

test('continued cross-system slurs connect chord tones without merging attacks',()=>{
  const mark=(type:string)=>`<notations><slur number="1" type="${type}"/></notations>`;
  const xml=wrap(measure(note('C',4,mark('start'))+note('E',4,'<chord/>'))+measure(note('D',4,mark('continue')),2)+measure(note('F',4,mark('stop')),3));
  const s=musicXMLToScore(xml);expect(s.notes).toHaveLength(4);
  expect(s.notes.slice(0,3).every(n=>n.soundDuration>n.duration)).toBe(true);
  expect(s.notes.every(n=>n.sources?.length===1)).toBe(true);
});

test('a unique explicit tie can survive an exported voice change at the barline',()=>{
  const s=musicXMLToScore(wrap(measure(note('C',4,'<tie type="start"/>'))+measure(note('C',4,'<tie type="stop"/>').replace('<voice>1','<voice>2'),2)));
  expect(s.notes).toHaveLength(1);expect(s.notes[0].sources).toHaveLength(2);expect(s.notes[0].duration).toBe(1);
});

test('ornament release retains its principal slur and the next source mapping',()=>{
  const start='<notations><slur number="1" type="start"/><ornaments><mordent/></ornaments></notations>',stop='<notations><slur number="1" type="stop"/></notations>';
  const s=musicXMLToScore(wrap(measure(note('C',4,start)+note('D',4,stop))));
  const ornament=s.notes.filter(n=>n.decoration==='ornament').at(-1)!;
  expect(ornament.soundDuration).toBeGreaterThan(ornament.duration);
  expect(ornament.sources?.[0].id).toBe('P1:0:0');expect(s.notes.at(-1)?.sources?.[0].id).toBe('P1:0:1');
});

test('two hands reuse slur numbers across multiple system and page breaks',()=>{
  const mark=(type:string)=>`<notations><slur number="1" type="${type}"/></notations>`;
  const lower=(s:string)=>s.replaceAll('<voice>1','<voice>2').replaceAll('<staff>1','<staff>2');
  const row=(upper:string,bass:string)=>upper+'<backup><duration>4</duration></backup>'+lower(bass);
  const xml=wrap(measure(row(note('C',4,mark('start')),note('E',4,mark('start'))))+
    measure('<print new-system="yes"/>'+row(note('D',4,mark('continue')),note('F',4,mark('continue'))),2)+
    measure('<print new-page="yes"/>'+row(note('E',4,mark('stop')),note('G',4,mark('stop'))),3));
  const s=musicXMLToScore(xml);
  expect(s.notes).toHaveLength(6);
  expect(s.notes.filter(n=>n.measure<2).every(n=>n.soundDuration>n.duration)).toBe(true);
  expect(s.warnings.join(' ')).not.toMatch(/起点重复|缺少起点|缺少终点/);
});
