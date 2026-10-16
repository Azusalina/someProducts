import { Midi } from '@tonejs/midi';
import { unzipSync, strFromU8 } from 'fflate';
import {realizeArpeggios} from './arpeggios';
import { realizeOrnaments } from './ornaments';

export interface NoteEvent {
  id: string; midi: number; start: number; duration: number; soundDuration: number;
  velocity: number; hand: 'left' | 'right'; measure: number;
  sources?: { id: string; start: number; duration: number }[];
  decoration?: 'grace' | 'ornament' | 'arpeggio';
}
export interface MeasureEvent { number: string; index: number; start: number; duration: number; sourceBeat: number }
export interface Score { title: string; notes: NoteEvent[]; measures: MeasureEvent[]; duration: number; bpm: number; warnings: string[]; xml?: string }
type SlurMark = { number: string; type: string };
type RawNote = { slurs: SlurMark[]; midi: number; beat: number; duration: number; staff: number; voice: string; velocity: number; tieStart: boolean; tieStop: boolean; source: string };
type RawMeasure = { number: string; sourceBeat: number; duration: number; notes: RawNote[]; tempos: { beat: number; bpm: number }[]; pedals: { beat: number; down: boolean }[]; forward: boolean; backward: number; endings: number[] };
const children = (e: Element, tag: string) => Array.from(e.children).filter(c => c.localName === tag);
const child = (e: Element, tag: string) => children(e, tag)[0];
const value = (e: Element, tag: string, fallback = '') => child(e, tag)?.textContent?.trim() ?? fallback;
const numeric = (e: Element, tag: string, fallback: number) => { const s = value(e, tag); const n = Number(s); return s && Number.isFinite(n) ? n : fallback; };
const pitchClasses: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const typeDurations: Record<string, number> = { maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: .5, '16th': .25, '32nd': .125, '64th': .0625, '128th': .03125, '256th': .015625 };

export function notationDuration(el: Element): number {
  const base = typeDurations[value(el, 'type')];
  const dots = children(el, 'dot').length;
  const modification = child(el, 'time-modification');
  const actual = modification ? numeric(modification, 'actual-notes', NaN) : 1;
  const normal = modification ? numeric(modification, 'normal-notes', NaN) : 1;
  return base && actual > 0 && normal > 0 ? base * (2 - 2 ** -dots) * normal / actual : 0;
}

export function parseXML(text: string): Document {
  // External entities are never resolved by the browser parser. Reject entity declarations.
  if (/<!ENTITY/i.test(text)) throw new Error('不支持包含自定义实体的 MusicXML 文件。');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 文件格式损坏，无法解析。');
  return doc;
}

export function expandMeasures(measures: RawMeasure[]): number[] {
  // OMR can mistake unrelated marks for voltas. Without a repeat there is no
  // second pass; filtering by those marks would silently discard the rest.
  if (!measures.some(m => m.backward)) return measures.map((_, i) => i);
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

export function musicXMLToScore(xml: string, filename = '钢琴乐谱', options: {trimMeasurePadding?:boolean} = {}): Score {
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
  let divisions = 1, beatsPerMeasure = 0, sourceBeat = 0, activeEndings: number[] = [], velocity = .72;
  for (const measure of children(part, 'measure')) {
    const m: RawMeasure = { number: measure.getAttribute('number') ?? String(raw.length + 1), sourceBeat, duration: 0, notes: [], tempos: [], pedals: [], forward: false, backward: 0, endings: [...activeEndings] };
    let beat = 0, extent = 0, chordBeat = 0, noteIndex = -1;
    for (const el of Array.from(measure.children)) {
      if (el.localName === 'attributes') {
        const attributes = el;
        divisions = numeric(attributes, 'divisions', divisions);
        if (!(divisions > 0)) throw new Error('乐谱的 divisions 必须大于 0。');
        const time = child(attributes, 'time');
        if (time) beatsPerMeasure = value(time, 'beats', '4').split('+').reduce((a, b) => a + Number(b), 0) * 4 / numeric(time, 'beat-type', 4);
      }
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
        noteIndex++;
        if (child(el, 'grace')) continue; // Zero written beats; realized from an adjacent attack below.
        // Explicit duration is already scaled for tuplets. Only reconstruct it
        // from notation when an exporter omitted duration altogether.
        let duration = numeric(el, 'duration', 0) / divisions;
        if (!child(el, 'duration')) {
          duration = notationDuration(el);
          if (duration > 0) {
            warnings.add('部分音符缺少实际时值，已依据音符类型、附点及连音比例恢复；需核对原谱。');
          } else warnings.add('部分音符缺少有效时值或连音比例，无法恢复，未参与播放。');
        }
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
          m.notes.push({ slurs: Array.from(el.querySelectorAll('notations > slur')).map(t => ({number:t.getAttribute('number') ?? '1', type:t.getAttribute('type') ?? ''})), midi, beat: onset, duration, staff: numeric(el, 'staff', 1), voice: value(el, 'voice', '1'), velocity, tieStart: ties.some(t => ['start', 'continue'].includes(t.getAttribute('type') ?? '')), tieStop: ties.some(t => ['stop', 'continue'].includes(t.getAttribute('type') ?? '')), source: `${part.getAttribute('id')}:${raw.length}:${noteIndex}` });
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
    // A cropped score often has no inherited signature. Inventing 4/4 here
    // inserts a silent tail into every shorter measure and misaligns playback.
    m.duration = implicit || pickup || !beatsPerMeasure || (options.trimMeasurePadding && extent > 0) ? extent || beatsPerMeasure || 4 : Math.max(extent, beatsPerMeasure);
    if(options.trimMeasurePadding && beatsPerMeasure && !implicit && !pickup && extent>0 && extent<beatsPerMeasure-1e-5)warnings.add('已省略识别不足小节末尾由拍号补齐的空拍；写出的休止符、延长音和内部空隙仍保留。');
    if (!beatsPerMeasure) warnings.add('乐谱片段缺少拍号，按导出音符的实际时值连接小节，未假定 4/4；原有节奏识别错误仍需核对。');
    if (beatsPerMeasure && !implicit && !pickup && extent > 0 && Math.abs(extent - beatsPerMeasure) > 1e-5) warnings.add(options.trimMeasurePadding?'部分小节时值与拍号不一致，按导出音符与写出休止符的实际时值连接，未额外补齐。':'部分小节的音符时值与拍号不一致；不足的部分保留为静默，超出的部分按实际时值播放。');
    sourceBeat += m.duration;
    raw.push(m);
  }
  if (doc.querySelector('segno, coda') || Array.from(doc.querySelectorAll('sound')).some(e => ['dacapo', 'dalsegno', 'tocoda', 'fine'].some(a => e.hasAttribute(a)))) warnings.add('D.C.／D.S.／Coda 跳转暂不展开；普通反复和不同结尾会展开。');
  if (raw.some(m => m.endings.length) && !raw.some(m => m.backward)) warnings.add('检测到不同结尾标记，但没有反复记号；按谱面顺序播放所有小节，避免遗漏后续乐谱。');
  if (!raw.some(m => m.tempos.length)) warnings.add('未识别速度标记，默认 120 BPM。');
  // An incomplete visual ottava span must never silently transpose all
  // following notes. MusicXML pitch remains authoritative for sound.
  const octaveSpans = new Set<string>(); let incompleteOctaves = 0;
  for (const direction of part.querySelectorAll('measure > direction')) {
    for (const mark of direction.querySelectorAll('octave-shift')) {
      const key = `${value(direction, 'staff', '1')}:${mark.getAttribute('number') ?? '1'}`;
      const type = mark.getAttribute('type');
      if (type === 'up' || type === 'down') {
        if (octaveSpans.has(key)) incompleteOctaves++;
        octaveSpans.add(key);
      } else if (type === 'stop') {
        if (!octaveSpans.delete(key)) incompleteOctaves++;
      }
    }
  }
  incompleteOctaves += octaveSpans.size;
  if (incompleteOctaves) warnings.add(`${incompleteOctaves} 处八度线缺少配对起点或终点，作用范围需核对原 PDF；播放使用导出的实际音高，不推测移调。`);
  type Anchor={n:RawNote;at:number};
  const slurStarts = new Map<string,Anchor>(), pendingStops=new Map<string,Anchor>();
  const slurRanges:{id:string;start:number;end:number;first:RawNote;last:RawNote}[]=[];
  const addSlur=(number:string,first:Anchor,last:Anchor)=>{
    if(last.at<first.at-1e-7){warnings.add('部分连奏线端点的时间顺序异常，未连接。');return;}
    slurRanges.push({id:`${number}:${first.n.source}:${last.n.source}`,start:first.at,end:last.at,first:first.n,last:last.n});
  };
  // Slur numbers distinguish overlap in XML document order. Sorting all voices
  // by time first incorrectly pairs independent phrases that reuse a number.
  for(const m of raw)for(const n of m.notes){
    const anchor={n,at:m.sourceBeat+n.beat};
    for(const mark of n.slurs){
      if(mark.type==='stop'){
        const first=slurStarts.get(mark.number);
        if(first){addSlur(mark.number,first,anchor);slurStarts.delete(mark.number);}
        else pendingStops.set(mark.number,anchor);
      }else if(mark.type==='start'){
        const last=pendingStops.get(mark.number);
        if(last && last.at>=anchor.at){addSlur(mark.number,anchor,last);pendingStops.delete(mark.number);}
        else {
          const previous=slurStarts.get(mark.number);
          if(previous && !(previous.at===anchor.at && previous.n.voice===n.voice && previous.n.staff===n.staff))warnings.add('部分连奏线起点重复，需核对其编号或范围。');
          slurStarts.set(mark.number,anchor);
        }
      }else if(mark.type==='continue' && !slurStarts.has(mark.number)){
        warnings.add('部分跨行连奏线只有延续标记，缺少可靠起点，未推测完整范围。');
      }
    }
  }
  if(pendingStops.size)warnings.add('部分连奏线缺少起点，未推测其作用范围。');
  if(slurStarts.size)warnings.add('部分连奏线缺少终点，未推测其作用范围。');
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
  const articulation = new Map<NoteEvent, {voice:string; staff:number; sourceOnset:number; slurs:string[]}>();
  const slursFor=(n:RawNote,sourceOnset:number)=>slurRanges.filter(r => sourceOnset>=r.start-1e-7 && sourceOnset<=r.end+1e-7 && (n.source===r.first.source || n.source===r.last.source || (n.voice===r.first.voice && (n.staff===r.first.staff || (r.first.voice===r.last.voice && n.staff===r.last.staff))) || (Math.abs(sourceOnset-r.end)<1e-7 && n.voice===r.last.voice && n.staff===r.last.staff))).map(r=>r.id);
  for (const { m, source, beat } of expanded) {
    measures.push({ number: m.number, index: source, start: secondsAt(beat), duration: secondsAt(beat + m.duration) - secondsAt(beat), sourceBeat: m.sourceBeat });
    for (const n of m.notes) {
      const onset = beat + n.beat, endBeat = onset + n.duration;
      const key = `${n.staff}:${n.voice}:${n.midi}`;
      let previousKey = key, previous = ties.get(key);
      if (n.tieStop && (!previous || Math.abs(previous.endBeat-onset) >= 1e-5)) {
        const compatible=[...ties].filter(([k,t])=>Number(k.split(':').at(-1))===n.midi && Math.abs(t.endBeat-onset)<1e-5);
        const sameVoice=compatible.filter(([k])=>k.split(':')[1]===n.voice);
        const candidates=sameVoice.length?sameVoice:compatible;
        // Cross-staff ties are valid; simultaneous unisons remain ambiguous.
        if (candidates.length === 1) [previousKey,previous] = candidates[0];
      }
      if (n.tieStop && previous && Math.abs(previous.endBeat - onset) < 1e-5) {
        previous.note.sources!.push({ id: n.source, start: secondsAt(onset), duration: secondsAt(endBeat) - secondsAt(onset) });
        previous.note.duration = secondsAt(endBeat) - previous.note.start;
        previous.note.soundDuration = previous.note.duration;
        previous.endBeat = endBeat; beatEnds.set(previous.note, endBeat);
        const art=articulation.get(previous.note);if(art){art.slurs=[...new Set([...art.slurs,...slursFor(n,m.sourceBeat+n.beat)])];art.sourceOnset=m.sourceBeat+n.beat;}
        ties.delete(previousKey);
        if (n.tieStart) ties.set(key, previous);
        continue;
      }
      if (n.tieStop) warnings.add('部分延音线缺少连续的起始音，已作为独立音符播放。');
      const note: NoteEvent = { id: String(notes.length), midi: n.midi, start: secondsAt(onset), duration: secondsAt(endBeat) - secondsAt(onset), soundDuration: secondsAt(endBeat) - secondsAt(onset), velocity: n.velocity, hand: n.staff >= 2 ? 'left' : 'right', measure: measures.length - 1, sources: [{ id:n.source, start:secondsAt(onset), duration:secondsAt(endBeat)-secondsAt(onset) }] };
      notes.push(note); beatEnds.set(note, endBeat);
      const sourceOnset = m.sourceBeat + n.beat;
      articulation.set(note, {voice:n.voice, staff:n.staff, sourceOnset, slurs:slursFor(n,sourceOnset)});
      if (n.tieStart) ties.set(key, { note, endBeat }); else ties.delete(key);
    }
  }
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  pedals.sort((a, b) => a.beat - b.beat);
  for (const note of notes) {
    const end = beatEnds.get(note)!;
    const previous = pedals.filter(p => p.beat <= end).at(-1);
    if (previous?.down) {
      const release = pedals.find(p => p.beat > end && !p.down)?.beat ?? cursor;
      const retrigger = notes.find(n => n.midi === note.midi && n.start > note.start + 1e-6);
      note.soundDuration = Math.max(note.soundDuration, Math.min(secondsAt(release), retrigger?.start ?? Infinity) - note.start);
    }
  }
  realizeArpeggios(part, notes, measures, warnings);
  realizeOrnaments(part, notes, measures, warnings);
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const bySource=new Map<string,{voice:string;staff:number;sourceOnset:number;slurs:string[]}>();
  for(const [n,art]of articulation)for(const source of n.sources??[])bySource.set(`${n.measure}:${source.id}`,art);
  for(const n of notes)if(!articulation.has(n)){
    const art=(n.sources??[]).map(source=>bySource.get(`${n.measure}:${source.id}`)).find(Boolean);
    if(art)articulation.set(n,art);
  }
  // A slur connects attacks, never merges them. Keep silence and repeats intact;
  // the small overlap is a playback interpretation, not an extra written value.
  for (const note of notes) {
    const current = articulation.get(note)!;
    if (!current?.slurs.length) continue;
    const next = notes.find(n => n.start > note.start+1e-6 && articulation.get(n)?.slurs.some(id=>current.slurs.includes(id)));
    if (!next) continue;
    const following = articulation.get(next)!;
    if(current.voice!==following.voice && current.staff===following.staff)continue;
    if (!following.slurs.some(id => current.slurs.includes(id))) continue;
    if (Math.abs(next.start-note.start-note.duration) > 1e-5) continue;
    if (following.sourceOnset <= current.sourceOnset) continue;
    const retrigger = notes.find(n => n.midi === note.midi && n.start > note.start+1e-6);
    note.soundDuration = Math.max(note.duration, Math.min(next.start+Math.min(.03,next.duration*.1), retrigger?.start ?? Infinity)-note.start);
  }
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
