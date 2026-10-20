import type {NoteEvent, Score} from './score';

export interface PitchReading {midi: number | null; cents: number; clarity: number; rms: number; frequency?: number}
export interface TeachingTarget {
  start: number; end: number; midis: number[]; measure: number;
  unsupported: string | null;
}

// A tied note is already one NoteEvent in the playback model. Never turn its
// printed continuation heads back into additional attacks.
export function teachingTargets(score: Score, hands: {left: boolean; right: boolean}): TeachingTarget[] {
  const notes = score.notes.filter(n => hands[n.hand] && n.duration > 0)
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
  const groups: NoteEvent[][] = [];
  for (const note of notes) {
    const previous = groups.at(-1), first = previous?.[0], last = previous?.at(-1);
    const sameOrnament = note.decoration === 'ornament' && first?.decoration === 'ornament'
      && note.measure === first.measure && note.sources?.[0]?.id
      && note.sources[0].id === first.sources?.[0]?.id;
    const rolledChord = note.decoration === 'arpeggio' && last?.decoration === 'arpeggio'
      && note.measure === last.measure && note.start - last.start <= .2;
    if (previous && (Math.abs(note.start - first!.start) < .0001 || sameOrnament || rolledChord)) previous.push(note);
    else groups.push([note]);
  }
  let cursor = 0, active: NoteEvent[] = [];
  return groups.map(group => {
    const start = group[0].start;
    // Staggered polyphony is also outside a monophonic detector's scope.
    while (cursor < notes.length && notes[cursor].start < start - .0001) active.push(notes[cursor++]);
    active = active.filter(n => n.start + n.duration > start + .02);
    const held = active;
    const midis = [...new Set([...group, ...held].map(n => n.midi))].sort((a, b) => a - b);
    return {start, end: Math.max(...group.map(n => n.start + n.duration)), midis, measure: group[0].measure,
      unsupported: group.some(n => n.decoration) ? '装饰音／琶音：手动跳过'
        : midis.length > 1 ? '和弦／多声部：手动跳过' : null};
  });
}

export function targetAt(targets: TeachingTarget[], position: number): number {
  return targets.findIndex(t => t.end > position + .0001 || t.start >= position - .0001);
}
export function noteName(midi: number): string {
  return `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export class PitchGate {
  private candidateSince: number | null = null;
  private frames = 0;
  private lockedMidi: number | null = null;
  private releaseSince: number | null = null;
  private changedSince: number | null = null;
  private changedMidi: number | null = null;
  constructor(public holdMs = 140, public noiseFloor = .008, public tolerance = 35) {}
  reset() {
    this.lockedMidi = null; this.releaseSince = null;
    this.changedSince = null; this.changedMidi = null; this.clearCandidate();
  }
  private clearCandidate() {this.candidateSince = null; this.frames = 0;}
  observe(reading: PitchReading, target: TeachingTarget, now: number): boolean {
    const voiced = reading.midi !== null && reading.rms >= this.noiseFloor && reading.clarity >= .9;
    if (this.lockedMidi !== null) {
      if (reading.rms < this.noiseFloor) {
        this.releaseSince ??= now;
        if (now - this.releaseSince >= 80) this.lockedMidi = null;
      } else this.releaseSince = null;
      // A stable pitch change permits melodic legato. Repeating the same pitch
      // still requires a release; harmonic jitter must not re-arm the gate.
      if (voiced && reading.midi !== this.lockedMidi && Math.abs(reading.cents) <= this.tolerance) {
        if (this.changedMidi !== reading.midi) {this.changedMidi = reading.midi; this.changedSince = now;}
        if (now - this.changedSince! >= 80) this.lockedMidi = null;
      } else {this.changedSince = null; this.changedMidi = null;}
    }
    const correct = !target.unsupported && target.midis.length === 1 && voiced
      && reading.midi === target.midis[0] && Math.abs(reading.cents) <= this.tolerance;
    if (!correct || this.lockedMidi !== null) {this.clearCandidate(); return false;}
    this.candidateSince ??= now; this.frames++;
    if (now - this.candidateSince < this.holdMs || this.frames < 3) return false;
    this.lockedMidi = reading.midi; this.releaseSince = null;
    this.changedSince = null; this.changedMidi = null; this.clearCandidate();
    return true;
  }
}
