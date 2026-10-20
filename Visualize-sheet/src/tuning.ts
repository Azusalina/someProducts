import {noteName, type PitchReading} from './teaching';

export interface PianoTuning {version: 1; a4: number; notes: Record<string, number>}
export const standardTuning = (): PianoTuning => ({version: 1, a4: 440, notes: {}});
export const equalFrequency = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
export const centsBetween = (frequency: number, reference: number) => 1200 * Math.log2(frequency / reference);
export const tunedFrequency = (midi: number, tuning: PianoTuning) => tuning.notes[String(midi)] ?? equalFrequency(midi, tuning.a4);

export function validateTuning(value: unknown): PianoTuning {
  if (!value || typeof value !== 'object') throw new Error('音准配置无效');
  const input = value as Partial<PianoTuning>;
  if (input.version !== 1 || typeof input.a4 !== 'number' || !Number.isFinite(input.a4) || input.a4 < 420 || input.a4 > 460)
    throw new Error('A4 基准须在 420–460 Hz 之间');
  if (!input.notes || typeof input.notes !== 'object' || Array.isArray(input.notes)) throw new Error('逐键校准数据无效');
  const notes: Record<string, number> = {};
  for (const [key, frequency] of Object.entries(input.notes)) {
    const midi = Number(key);
    if (!Number.isInteger(midi) || midi < 21 || midi > 108 || String(midi) !== key || typeof frequency !== 'number' || !Number.isFinite(frequency) || frequency <= 0)
      throw new Error('逐键校准数据无效');
    if (Math.abs(centsBetween(frequency, equalFrequency(midi, input.a4))) > 45)
      throw new Error(`${noteName(midi)} 偏离当前基准超过 45 cents；请核对琴键或先删除此键校准`);
    notes[key] = frequency;
  }
  const tuning: PianoTuning = {version: 1, a4: input.a4, notes};
  for (let midi = 22; midi <= 108; midi++) {
    if (centsBetween(tunedFrequency(midi, tuning), tunedFrequency(midi - 1, tuning)) < 70 - 1e-7)
      throw new Error(`${noteName(midi - 1)} 与 ${noteName(midi)} 的校准频率过近；请核对或删除冲突琴键`);
  }
  return tuning;
}

export function applyTuning(reading: PitchReading, tuning: PianoTuning): PitchReading {
  const frequency = reading.frequency ?? (reading.midi === null ? NaN : equalFrequency(reading.midi) * 2 ** (reading.cents / 1200));
  if (!Number.isFinite(frequency) || frequency <= 0) return {...reading, midi: null, cents: 0};
  let best = 21, deviation = Infinity;
  for (let midi = 21; midi <= 108; midi++) {
    const cents = centsBetween(frequency, tunedFrequency(midi, tuning));
    if (Math.abs(cents) < Math.abs(deviation)) {best = midi; deviation = cents;}
  }
  return {...reading, frequency, midi: Math.abs(deviation) <= 65 ? best : null, cents: deviation};
}

export interface CalibrationResult {midi: number; frequency: number; scope: 'global' | 'key'; spread: number; frames: number}
export class TuningCollector {
  private samples: {time: number; cents: number}[] = [];
  constructor(readonly midi: number, readonly scope: 'global' | 'key', readonly tuning: PianoTuning,
    readonly noiseFloor: number, readonly holdMs = 1500) {}
  observe(reading: PitchReading, now: number): {progress: number; reason: string; result?: CalibrationResult} {
    const frequency = reading.frequency;
    const expected = equalFrequency(this.midi, this.tuning.a4);
    const deviation = frequency ? centsBetween(frequency, expected) : NaN;
    const wrong = !Number.isFinite(deviation) || (this.scope === 'global'
      ? !frequency || frequency < 420 || frequency > 460 : Math.abs(deviation) > 45);
    if (!(reading.rms >= this.noiseFloor) || !(reading.clarity >= .95) || wrong) {
      this.samples = [];
      return {progress: 0, reason: !(reading.rms >= this.noiseFloor) ? '等待单音'
        : !(reading.clarity >= .95) ? '音高不稳定' : `请核对并单独弹奏 ${noteName(this.midi)}`};
    }
    const last = this.samples.at(-1);
    if (last && (now - last.time > 250 || now < last.time)) this.samples = [];
    this.samples.push({time: now, cents: deviation});
    const values = this.samples.map(s => s.cents).sort((a, b) => a - b);
    const spread = values[Math.floor((values.length - 1) * .9)] - values[Math.floor((values.length - 1) * .1)];
    if (spread > 12) {this.samples = [this.samples.at(-1)!]; return {progress: 0, reason: '音高波动过大，重新采集'};}
    const elapsed = now - this.samples[0].time;
    const progress = Math.min(1, elapsed / this.holdMs);
    if (elapsed < this.holdMs || this.samples.length < 30) return {progress, reason: '采集中'};
    const median = values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
    return {progress: 1, reason: '采集完成', result: {midi: this.midi, frequency: expected * 2 ** (median / 1200),
      scope: this.scope, spread, frames: this.samples.length}};
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Known notes are prompted explicitly: unconstrained pitch detection cannot
// distinguish a tuning offset from a player choosing the wrong piano key.
export class ScaleCalibration {
  readonly sequence: number[];
  readonly results: CalibrationResult[] = [];
  private collector: TuningCollector;
  get midi() {return this.sequence[this.results.length];}
  constructor(octave: number, private tuning: PianoTuning, private noiseFloor: number) {
    if (!Number.isInteger(octave) || octave < 2 || octave > 6) throw new Error('校准音阶须在 C2–C7 范围内');
    const c = (octave + 1) * 12;
    this.sequence = [69, ...[0, 2, 4, 5, 7, 9, 11, 12].map(offset => c + offset)];
    this.collector = this.makeCollector();
  }
  private makeCollector() {
    const a4 = this.results[0]?.frequency ?? this.tuning.a4;
    return new TuningCollector(this.midi, this.results.length ? 'key' : 'global',
      {...this.tuning, a4}, this.noiseFloor, 1100);
  }
  observe(reading: PitchReading, now: number) {
    if (this.results.length === this.sequence.length) return {progress: 1, reason: '采集完成', advanced: false, complete: true};
    const observed = this.collector.observe(reading, now);
    if (!observed.result) return {...observed, advanced: false, complete: false};
    this.results.push(observed.result);
    const complete = this.results.length === this.sequence.length;
    if (!complete) this.collector = this.makeCollector();
    return {...observed, advanced: true, complete};
  }
  proposal(): PianoTuning {
    if (this.results.length !== this.sequence.length) throw new Error('音阶尚未采集完整');
    const a4 = median(this.results.map(r => r.frequency / 2 ** ((r.midi - 69) / 12)));
    const notes = {...this.tuning.notes};
    for (const midi of new Set(this.results.map(r => r.midi)))
      notes[String(midi)] = median(this.results.filter(r => r.midi === midi).map(r => r.frequency));
    return validateTuning({version: 1, a4, notes});
  }
}
