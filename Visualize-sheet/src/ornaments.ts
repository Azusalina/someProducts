import type { NoteEvent, MeasureEvent } from './score';

const text = (e: Element, name: string, fallback = '') => e.querySelector(name)?.textContent?.trim() ?? fallback;
const steps = 'CDEFGAB', semitones = [0, 2, 4, 5, 7, 9, 11];
const accidental: Record<string, number> = { sharp: 1, flat: -1, natural: 0, 'double-sharp': 2, 'sharp-sharp': 2, 'flat-flat': -2 };
const supported = new Set(['trill-mark', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn', 'delayed-turn', 'delayed-inverted-turn']);
type Written = { el: Element; id: string; voice: string; staff: string; midi: number; upper: number; lower: number; grace: boolean };

/** Playback interpretation only: never rewrite the source XML or written meter. */
export function realizeOrnaments(part: Element, notes: NoteEvent[], measures: MeasureEvent[], warnings: Set<string>) {
  if (!part.querySelector('grace, ornaments')) return;
  const written: Written[][] = [];
  let fifths = 0;
  for (const [mi, measure] of [...part.children].filter(e => e.localName === 'measure').entries()) {
    const local = new Map<string, number>(), row: Written[] = [];
    let ni = -1;
    for (const el of measure.children) {
      if (el.localName === 'attributes' && el.querySelector('key > fifths')) fifths = Number(text(el, 'key > fifths'));
      if (el.localName !== 'note') continue;
      ni++;
      const step = steps.indexOf(text(el, 'pitch > step')), octave = Number(text(el, 'pitch > octave'));
      const staff = text(el, 'staff', '1'), voice = text(el, 'voice', '1');
      if (step < 0) {
        // Rests are anchor barriers; a grace must never steal across silence.
        row.push({ el, id: `${part.getAttribute('id')}:${mi}:${ni}`, voice, staff, midi: NaN, upper: NaN, lower: NaN, grace: false });
        continue;
      }
      const alter = Number(text(el, 'pitch > alter', '0'));
      // A written accidental carries to the same staff / octave within this bar.
      if (el.querySelector('accidental')) local.set(`${staff}:${octave}:${step}`, alter);
      const adjacent = (delta: number) => {
        const index = step + delta, s = (index + 7) % 7, o = octave + Math.floor(index / 7);
        const key = fifths > 0 ? 'FCGDAEB'.slice(0, Math.min(7, fifths)) : 'BEADGCF'.slice(0, Math.min(7, -fifths));
        let a = local.get(`${staff}:${o}:${s}`) ?? (key.includes(steps[s]) ? Math.sign(fifths) : 0);
        const mark = [...el.querySelectorAll('ornaments > accidental-mark')].find(m => (m.getAttribute('placement') ?? 'above') === (delta > 0 ? 'above' : 'below'));
        if (mark) {
          const specified = accidental[mark.textContent?.trim() ?? ''];
          if (specified === undefined) { warnings.add('部分装饰音变音记号不支持，保留主音，需人工核对。'); return NaN; }
          a = specified;
        }
        return (o + 1) * 12 + semitones[s] + a;
      };
      row.push({ el, id: `${part.getAttribute('id')}:${mi}:${ni}`, voice, staff,
        midi: (octave + 1) * 12 + semitones[step] + alter, upper: adjacent(1), lower: adjacent(-1), grace: !!el.querySelector('grace') });
    }
    written.push(row);
  }
  const added: NoteEvent[] = [];
  const change = (n: NoteEvent, start: number, duration: number) => {
    n.start = start; n.duration = duration; n.soundDuration = duration;
    if (n.sources?.length === 1) Object.assign(n.sources[0], { start, duration });
  };
  const emit = (base: NoteEvent, midi: number, start: number, duration: number, id: string, decoration: 'grace' | 'ornament') => {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127 || !(duration > 0)) return;
    added.push({ ...base, id: `${base.id}-${decoration}-${added.length}`, midi, start, duration, soundDuration: duration, decoration,
      sources: [{ id, start, duration }] });
  };
  // The measure occurrence, not merely its XML index, keeps repeated ornaments distinct.
  for (const [occurrence, measure] of measures.entries()) {
    const row = written[measure.index] ?? [];
    const events = notes.filter(n => n.measure === occurrence);
    const bySource = new Map<string, NoteEvent>();
    for (const n of events) for (const source of n.sources ?? []) bySource.set(source.id, n);
    const voices = new Set(row.map(n => `${n.staff}:${n.voice}`));
    for (const voice of voices) {
      const stream = row.filter(n => `${n.staff}:${n.voice}` === voice);
      for (let i = 0; i < stream.length; i++) {
        if (!stream[i].grace) continue;
        const group: Written[][] = [];
        while (i < stream.length && stream[i].grace) {
          const g = stream[i++];
          if (!g.el.querySelector('chord') || !group.length) group.push([]);
          group.at(-1)!.push(g);
        }
        const following = stream[i], previous = stream.slice(0, i - group.flat().length).findLast(n => !n.grace);
        const grace = group[0][0].el.querySelector('grace')!;
        const usePrevious = grace.hasAttribute('steal-time-previous');
        const anchor = usePrevious ? previous : following;
        const base = anchor && bySource.get(anchor.id);
        i--;
        if (!base || (base.sources?.length ?? 0) > 1 || grace.hasAttribute('make-time')) {
          warnings.add('部分倚音缺少同小节的可靠主音、涉及延音线或 make-time，保留谱面但未猜测播放。'); continue;
        }
        const chord = stream.filter(n => !n.grace).map(n => bySource.get(n.id)).filter((n): n is NoteEvent => !!n && Math.abs(n.start - base.start) < 1e-7);
        if (chord.some(n => (n.sources?.length ?? 0) > 1)) { warnings.add('和弦倚音涉及延音线，保留谱面但未猜测播放。'); continue; }
        const minimum = Math.min(...chord.map(n => n.duration));
        const percentage = Number(grace.getAttribute(usePrevious ? 'steal-time-previous' : 'steal-time-following'));
        const fraction = Number.isFinite(percentage) && percentage > 0 ? Math.min(.8, percentage / 100) : grace.getAttribute('slash') === 'yes' ? .2 : .5;
        const span = Number.isFinite(percentage) && percentage > 0 ? minimum * fraction : Math.min(minimum * fraction, .08 * group.length + (grace.getAttribute('slash') === 'yes' ? 0 : minimum * .25));
        const start = usePrevious ? base.start + minimum - span : base.start;
        for (const n of chord) change(n, usePrevious ? n.start : n.start + span, n.duration - span);
        group.forEach((members, index) => members.forEach(g => emit(base, g.midi, start + index * span / group.length, span / group.length, g.id, 'grace')));
        warnings.add('倚音按常见奏法近似播放：从相邻主音借时，不增加小节拍长。');
      }
    }
    for (const w of row.filter(n => !n.grace)) {
      const marks = [...w.el.querySelectorAll('ornaments > *')].filter(e => e.localName !== 'accidental-mark' && !(e.localName === 'wavy-line' && e.getAttribute('type') !== 'start'));
      if (!marks.length) continue;
      // Trill wavy-line is a visual continuation, not a second ornament attack.
      const playable = marks.filter(m => supported.has(m.localName));
      const unknown = marks.filter(m => !supported.has(m.localName) && !(m.localName === 'wavy-line' && playable.some(p => p.localName === 'trill-mark')));
      if (unknown.length) warnings.add(`装饰记号 ${[...new Set(unknown.map(m => m.localName))].join('、')} 已保留显示，暂按主音播放。`);
      const base = bySource.get(w.id);
      if (!base || !playable.length) continue;
      if (playable.length !== 1 || unknown.length || (base.sources?.length ?? 0) > 1) { warnings.add('复合或延音线上的装饰音保留主音，需人工核对奏法。'); continue; }
      const mark = playable[0], kind = mark.localName, main = base.midi;
      const explicitStep = mark.getAttribute('trill-step');
      const upper = explicitStep === 'half' ? main + 1 : explicitStep === 'whole' ? main + 2 : w.upper;
      const lower = w.lower;
      if (![upper, lower].every(n => Number.isInteger(n) && n >= 0 && n <= 127)) continue;
      const start = base.start, duration = base.duration;
      const delayed = kind.startsWith('delayed-');
      let pattern: number[], span = duration, offset = 0;
      if (kind === 'trill-mark') {
        const beats = Number(mark.getAttribute('beats'));
        const count = Math.min(64, Math.max(3, Math.round(beats > 0 ? beats : duration * 12)));
        const first = mark.getAttribute('start-note');
        pattern = Array.from({ length: count }, (_, i) => first === 'lower' ? (i % 2 ? main : lower) : (i % 2 === (first === 'upper' ? 0 : 1) ? upper : main));
      } else if (kind.includes('mordent')) {
        pattern = [main, kind === 'mordent' ? lower : upper, main]; span = Math.min(duration * .45, .24);
      } else {
        pattern = kind.includes('inverted') ? [lower, main, upper, main] : [upper, main, lower, main];
        if (delayed) { offset = duration / 2; span = duration / 2; }
      }
      if (offset) emit(base, main, start, offset, w.id, 'ornament');
      const unit = span / pattern.length;
      pattern.forEach((pitch, index) => emit(base, pitch, start + offset + index * unit,
        index === pattern.length - 1 ? duration - offset - index * unit : unit, w.id, 'ornament'));
      base.duration = 0; // Removed after processing; no duplicate principal attack.
      warnings.add('颤音、波音与回音按常见奏法近似播放；速度、起音和分配并非唯一演奏解释。');
    }
  }
  notes.splice(0, notes.length, ...notes.filter(n => n.duration > 0), ...added);
}
