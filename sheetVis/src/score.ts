import { Midi } from '@tonejs/midi';
import { unzipSync, strFromU8 } from 'fflate';

export interface NoteEvent {
  id: string; midi: number; start: number; duration: number; soundDuration: number;
  velocity: number; hand: 'left' | 'right'; measure: number;
}
export interface MeasureEvent { number: string; index: number; start: number; duration: number; sourceBeat: number }
export interface Score { title: string; notes: NoteEvent[]; measures: MeasureEvent[]; duration: number; bpm: number; warnings: string[]; xml?: string }
type RawNote = { midi: number; beat: number; duration: number; staff: number; voice: string; velocity: number; tieStart: boolean; tieStop: boolean };
type RawMeasure = { number: string; sourceBeat: number; duration: number; notes: RawNote[]; tempos: { beat: number; bpm: number }[]; pedals: { beat: number; down: boolean }[]; forward: boolean; backward: number; endings: number[] };
const children = (e: Element, tag: string) => Array.from(e.children).filter(c => c.localName === tag);
const child = (e: Element, tag: string) => children(e, tag)[0];
const value = (e: Element, tag: string, fallback = '') => child(e, tag)?.textContent?.trim() ?? fallback;
const numeric = (e: Element, tag: string, fallback: number) => { const s = value(e, tag); const n = Number(s); return s && Number.isFinite(n) ? n : fallback; };
const pitchClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const typeDurations: Record<string, number> = { maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: .5, '16th': .25, '32nd': .125, '64th': .0625 };

export function parseXML(text: string): Document {
  // External entities are never resolved by the browser parser. Reject entity declarations.
  if (/<!ENTITY/i.test(text)) throw new Error('不支持包含自定义实体的 MusicXML 文件。');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 文件格式损坏，无法解析。');
  return doc;
}

export function expandMeasures(measures: RawMeasure[]): number[] {
  const output: number[] = [];
  const pairs = new Map<number, number>();
  let start = 0;
  for (let i = 0; i < measures.length; i++) {
    if (measures[i].forward) start = i;
    if (measures[i].backward) { pairs.set(i, start); start = i + 1; }
  }
  const counts = new Map<number, number>();
  let pass = 1, i = 0, steps = 0;
  while (i < measures.length && steps++ < 10000) {
    const m = measures[i];
    if (m.forward) {
      const end = [...pairs].find(([end, begin]) => begin === i && end >= i)?.[0];
      pass = end === undefined ? 1 : (counts.get(end) ?? 1);
    }
    if (!m.endings.length || m.endings.includes(pass)) output.push(i);
    if (m.backward) {
      const iteration = counts.get(i) ?? 1;
      if (iteration < m.backward) { counts.set(i, iteration + 1); pass = iteration + 1; i = pairs.get(i) ?? 0; continue; }
      pass = iteration;
    }
    i++;
  }
  if (steps >= 10000) throw new Error('反复结构过于复杂，无法安全展开。');
  return output;
}

export function musicXMLToScore(xml: string, filename = '钢琴乐谱'): Score {
  const doc = parseXML(xml);
  if (doc.documentElement.localName !== 'score-partwise') throw new Error('目前支持 score-partwise MusicXML；请先用乐谱软件重新导出。');
  const warnings = new Set<string>();
  const parts = children(doc.documentElement, 'part');
  if (!parts.length) throw new Error('乐谱没有可播放的声部。');
  const descriptions = Array.from(doc.querySelectorAll('score-part'));
  const pianoId = descriptions.find(p => /piano|grand|钢琴/i.test(p.textContent ?? '') || Array.from(p.querySelectorAll('midi-program')).some(e => Number(e.textContent) >= 1 && Number(e.textContent) <= 8))?.getAttribute('id');
  const part = parts.find(p => p.getAttribute('id') === pianoId) ?? parts[0];
  if (parts.length > 1) warnings.add('检测到多个乐器声部，目前只播放选中的钢琴声部（未找到钢琴标记时使用第一声部）。');
  const raw: RawMeasure[] = [];
  let divisions = 1, beatsPerMeasure = 4, sourceBeat = 0, activeEndings: number[] = [], velocity = .72;
  for (const measure of children(part, 'measure')) {
    const attributes = child(measure, 'attributes');
    if (attributes) {
      divisions = numeric(attributes, 'divisions', divisions);
      if (!(divisions > 0)) throw new Error('乐谱的 divisions 必须大于 0。');
      const time = child(attributes, 'time');
      if (time) beatsPerMeasure = value(time, 'beats', '4').split('+').reduce((a, b) => a + Number(b), 0) * 4 / numeric(time, 'beat-type', 4);
    }
    const m: RawMeasure = { number: measure.getAttribute('number') ?? String(raw.length + 1), sourceBeat, duration: 0, notes: [], tempos: [], pedals: [], forward: false, backward: 0, endings: [...activeEndings] };
    let beat = 0, extent = 0, chordBeat = 0;
    for (const el of Array.from(measure.children)) {
      if (el.localName === 'backup') beat = Math.max(0, beat - numeric(el, 'duration', 0) / divisions);
      if (el.localName === 'forward') { beat += numeric(el, 'duration', 0) / divisions; extent = Math.max(extent, beat); }
      if (el.localName === 'direction') {
        const offset = numeric(el, 'offset', 0) / divisions;
        const sound = el.querySelector('sound');
        const metronome = el.querySelector('metronome');
        const tempo = Number(sound?.getAttribute('tempo')) || (metronome ? numeric(metronome, 'per-minute', 0) * (typeDurations[value(metronome, 'beat-unit', 'quarter')] ?? 1) * (metronome.querySelector('beat-unit-dot') ? 1.5 : 1) : 0);
        if (tempo > 0) m.tempos.push({ beat: Math.max(0, beat + offset), bpm: tempo });
        const dynamics = Number(sound?.getAttribute('dynamics'));
        if (dynamics > 0) velocity = Math.min(1, dynamics / 100);
        const pedal = el.querySelector('pedal');
        if (pedal) {
          const type = pedal.getAttribute('type');
          if (type === 'change') m.pedals.push({ beat: beat + offset, down: false }, { beat: beat + offset, down: true });
          else if (['start', 'resume', 'sostenuto'].includes(type ?? '')) m.pedals.push({ beat: beat + offset, down: true });
          else if (['stop', 'discontinue'].includes(type ?? '')) m.pedals.push({ beat: beat + offset, down: false });
        }
      }
      if (el.localName === 'note') {
        if (child(el, 'grace')) { warnings.add('装饰音暂不参与播放。'); continue; }
        const duration = numeric(el, 'duration', 0) / divisions;
        const isChord = Boolean(child(el, 'chord'));
        const onset = isChord ? chordBeat : beat;
        if (!isChord) chordBeat = beat;
        const pitch = child(el, 'pitch');
        if (pitch && duration > 0) {
          const step = value(pitch, 'step');
          const midi = (numeric(pitch, 'octave', 4) + 1) * 12 + (pitchClasses[step] ?? NaN) + numeric(pitch, 'alter', 0);
          if (!Number.isFinite(midi)) throw new Error('遇到无效音高。');
          if (midi < 21 || midi > 108) warnings.add('部分音符超出标准 88 键钢琴范围，仍会播放，但不显示在键盘范围内。');
          if (!Number.isInteger(midi)) warnings.add('微分音在瀑布中按最近的钢琴键显示。');
          const ties = [...children(el, 'tie'), ...Array.from(el.querySelectorAll('notations > tied'))];
          m.notes.push({ midi, beat: onset, duration, staff: numeric(el, 'staff', 1), voice: value(el, 'voice', '1'), velocity, tieStart: ties.some(t => t.getAttribute('type') === 'start'), tieStop: ties.some(t => t.getAttribute('type') === 'stop') });
        }
        if (!isChord) beat += duration;
        extent = Math.max(extent, onset + duration, beat);
      }
      if (el.localName === 'barline') {
        const repeat = child(el, 'repeat');
        if (repeat?.getAttribute('direction') === 'forward') m.forward = true;
        if (repeat?.getAttribute('direction') === 'backward') m.backward = Math.max(2, Math.min(8, Number(repeat.getAttribute('times')) || 2));
        const ending = child(el, 'ending');
        if (ending) {
          const numbers = (ending.getAttribute('number') ?? '').split(/[, ]+/).map(Number).filter(n => n > 0);
          if (ending.getAttribute('type') === 'start') { activeEndings = numbers; m.endings = numbers; }
          else { if (!m.endings.length) m.endings = numbers; activeEndings = []; }
        }
      }
    }
    const implicit = measure.getAttribute('implicit') === 'yes' || measure.getAttribute('number') === '0';
    const pickup = raw.length === 0 && extent > 0 && extent < beatsPerMeasure;
    m.duration = implicit || pickup ? extent || beatsPerMeasure : Math.max(extent, beatsPerMeasure);
    if (!implicit && !pickup && extent > 0 && Math.abs(extent - beatsPerMeasure) > 1e-5) warnings.add('部分小节的音符时值与拍号不一致；不足的部分保留为静默，超出的部分按实际时值播放。');
    sourceBeat += m.duration;
    raw.push(m);
  }
  if (doc.querySelector('segno, coda') || Array.from(doc.querySelectorAll('sound')).some(e => ['dacapo', 'dalsegno', 'tocoda', 'fine'].some(a => e.hasAttribute(a)))) warnings.add('D.C.／D.S.／Coda 跳转暂不展开；普通反复和不同结尾会展开。');
  if (doc.querySelector('ornaments')) warnings.add('颤音等装饰奏法暂按主音播放。');
  if (!raw.some(m => m.tempos.length)) warnings.add('未识别速度标记，默认 120 BPM。');
  const order = expandMeasures(raw);
  const tempos: { beat: number; bpm: number }[] = [{ beat: 0, bpm: 120 }];
  const pedals: { beat: number; down: boolean }[] = [];
  const expanded: { m: RawMeasure; source: number; beat: number }[] = [];
  let cursor = 0;
  for (const source of order) {
    const m = raw[source]; expanded.push({ m, source, beat: cursor });
    tempos.push(...m.tempos.map(t => ({ ...t, beat: cursor + t.beat })));
    pedals.push(...m.pedals.map(p => ({ ...p, beat: cursor + p.beat })));
    cursor += m.duration;
  }
  tempos.sort((a, b) => a.beat - b.beat);
  function secondsAt(beat: number): number {
    let seconds = 0, previous = 0, bpm = 120;
    for (const tempo of tempos) {
      if (tempo.beat > beat) break;
      seconds += (tempo.beat - previous) * 60 / bpm; previous = tempo.beat; bpm = tempo.bpm;
    }
    return seconds + (beat - previous) * 60 / bpm;
  }
  const notes: NoteEvent[] = [], measures: MeasureEvent[] = [];
  const ties = new Map<string, { note: NoteEvent; endBeat: number }>();
  const beatEnds = new Map<NoteEvent, number>();
  for (const { m, source, beat } of expanded) {
    measures.push({ number: m.number, index: source, start: secondsAt(beat), duration: secondsAt(beat + m.duration) - secondsAt(beat), sourceBeat: m.sourceBeat });
    for (const n of m.notes) {
      const onset = beat + n.beat, endBeat = onset + n.duration;
      const key = `${n.staff}:${n.voice}:${n.midi}`;
      const previous = ties.get(key);
      if (n.tieStop && previous && Math.abs(previous.endBeat - onset) < 1e-5) {
        previous.note.duration = secondsAt(endBeat) - previous.note.start;
        previous.note.soundDuration = previous.note.duration;
        previous.endBeat = endBeat; beatEnds.set(previous.note, endBeat);
        if (!n.tieStart) ties.delete(key);
        continue;
      }
      if (n.tieStop) warnings.add('部分延音线缺少连续的起始音，已作为独立音符播放。');
      const note: NoteEvent = { id: String(notes.length), midi: n.midi, start: secondsAt(onset), duration: secondsAt(endBeat) - secondsAt(onset), soundDuration: secondsAt(endBeat) - secondsAt(onset), velocity: n.velocity, hand: n.staff >= 2 ? 'left' : 'right', measure: measures.length - 1 };
      notes.push(note); beatEnds.set(note, endBeat);
      if (n.tieStart) ties.set(key, { note, endBeat }); else ties.delete(key);
    }
  }
  pedals.sort((a, b) => a.beat - b.beat);
  for (const note of notes) {
    const end = beatEnds.get(note)!;
    const previous = pedals.filter(p => p.beat <= end).at(-1);
    if (previous?.down) {
      const release = pedals.find(p => p.beat > end && !p.down)?.beat ?? cursor;
      const retrigger = notes.find(n => n.midi === note.midi && n.start > note.start + 1e-6);
      note.soundDuration = Math.max(note.duration, Math.min(secondsAt(release), retrigger?.start ?? Infinity) - note.start);
    }
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  if (!notes.length) throw new Error('没有识别到可播放的音符，请换一份清晰乐谱或导入 MusicXML／MIDI。');
  const title = doc.querySelector('work-title')?.textContent?.trim() || doc.querySelector('movement-title')?.textContent?.trim() || filename.replace(/\.[^.]+$/, '');
  return { title, notes, measures, duration: Math.max(secondsAt(cursor), ...notes.map(n => n.start + n.soundDuration)), bpm: tempos.filter(t => t.beat === 0).at(-1)?.bpm ?? 120, warnings: [...warnings], xml };
}

export function midiToScore(buffer: ArrayBuffer, filename: string): Score {
  const midi = new Midi(buffer);
  const warnings: string[] = [];
  const melodic = midi.tracks.filter(t => !t.instrument.percussion && t.notes.length);
  const piano = melodic.filter(t => t.instrument.number >= 0 && t.instrument.number <= 7);
  const tracks = piano.length ? piano : melodic;
  if (!piano.length) warnings.push('MIDI 未标记钢琴音色，当前将非打击乐声部用钢琴播放。');
  warnings.push('MIDI 的左右手按音轨／音域估计，无法保证对应原谱分手。');
  const notes: NoteEvent[] = [];
  tracks.forEach((track, index) => {
    const average = track.notes.reduce((sum, n) => sum + n.midi, 0) / track.notes.length;
    const hand = tracks.length > 1 ? (average < 60 ? 'left' : 'right') : undefined;
    const pedal = Object.values(track.controlChanges[64] ?? []);
    for (const n of track.notes) {
      let end = n.time + n.duration;
      if (pedal.filter(p => p.time <= end).at(-1)?.value! >= .5) end = pedal.find(p => p.time > end && p.value < .5)?.time ?? midi.duration;
      const retrigger = track.notes.find(next => next.midi === n.midi && next.time > n.time + 1e-6);
      end = Math.min(end, retrigger?.time ?? Infinity);
      notes.push({ id: `${index}-${notes.length}`, midi: n.midi, start: n.time, duration: n.duration, soundDuration: Math.max(n.duration, end - n.time), velocity: n.velocity, hand: hand ?? (n.midi < 60 ? 'left' : 'right'), measure: 0 });
    }
  });
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  if (!notes.length) throw new Error('MIDI 文件没有可播放的音符。');
  const duration = Math.max(midi.duration, ...notes.map(n => n.start + n.soundDuration));
  return { title: midi.name || filename.replace(/\.[^.]+$/, ''), notes, measures: [{ number: 'MIDI', index: 0, start: 0, duration, sourceBeat: 0 }], duration, bpm: midi.header.tempos[0]?.bpm ?? 120, warnings };
}

export function extractMusicXML(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer), { filter: file => file.originalSize <= 20 * 1024 * 1024 });
  const container = files['META-INF/container.xml'];
  let path = container ? parseXML(strFromU8(container)).querySelector('rootfile')?.getAttribute('full-path') : undefined;
  if (!path) path = Object.keys(files).find(p => /\.(xml|musicxml)$/i.test(p) && !p.startsWith('META-INF/'));
  if (!path || !files[path]) throw new Error('压缩乐谱中没有 MusicXML 文件，或文件超过 20 MB。');
  return strFromU8(files[path]);
}

export const noteName = (midi: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][Math.round(midi) % 12]}${Math.floor(midi / 12) - 1}`;
