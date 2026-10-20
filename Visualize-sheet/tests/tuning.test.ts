import {describe, expect, test} from 'vitest';
import {applyTuning, centsBetween, equalFrequency, ScaleCalibration, standardTuning, tunedFrequency, TuningCollector, validateTuning} from '../src/tuning';
import {inputSize, measurePitch} from '../src/microphone';
import {PitchGate, type PitchReading} from '../src/teaching';

const reading = (frequency: number, extra: Partial<PitchReading> = {}): PitchReading =>
  ({frequency, midi: 69, cents: 0, clarity: .99, rms: .1, ...extra});
const offset = (frequency: number, cents: number) => frequency * 2 ** (cents / 1200);
const collect = (collector: TuningCollector, hz: number, from = 0) => {
  let result: ReturnType<TuningCollector['observe']> = {progress: 0, reason: ''};
  for (let t = from; t <= from + 1540; t += 35) result = collector.observe(reading(hz), t);
  return result;
};

describe('actual piano reference profile', () => {
  test.each([420, 430, 432, 440, 442, 460])('recognizes all piano keys at A4=%i without semitone shifts', a4 => {
    const tuning = validateTuning({version: 1, a4, notes: {}});
    for (let midi = 21; midi <= 108; midi++) {
      const raw = reading(equalFrequency(midi, a4));
      const tuned = applyTuning(raw, tuning);
      expect(tuned.midi).toBe(midi); expect(Math.abs(tuned.cents)).toBeLessThan(.0001);
      expect(raw.midi).toBe(69);
    }
  });
  test('per-key deviations apply only to measured notes; unmeasured notes use the global baseline', () => {
    const tuning = validateTuning({version: 1, a4: 432, notes: {60: offset(equalFrequency(60, 432), 15)}});
    expect(tunedFrequency(60, tuning)).toBe(tuning.notes[60]);
    expect(applyTuning(reading(tuning.notes[60]), tuning).cents).toBeCloseTo(0);
    expect(applyTuning(reading(equalFrequency(61, 432)), tuning).cents).toBeCloseTo(0);
    expect(applyTuning(reading(5), tuning).midi).toBeNull();
    expect(applyTuning(reading(NaN), tuning).midi).toBeNull();
  });
  test('supports old pitch frames while leaving confidence and level intact', () => {
    const tuned = applyTuning({midi: 69, cents: centsBetween(432, 440), clarity: .8, rms: .03}, {version: 1, a4: 432, notes: {}});
    expect(tuned.cents).toBeCloseTo(0); expect(tuned.clarity).toBe(.8); expect(tuned.rms).toBe(.03);
    expect(applyTuning({midi:null,cents:0,clarity:0,rms:0}, standardTuning()).midi).toBeNull();
  });
  test.each([null, {}, {version: 2,a4:440,notes:{}}, {version:1,a4:NaN,notes:{}},
    {version:1,a4:419,notes:{}}, {version:1,a4:461,notes:{}}, {version:1,a4:440,notes:[]},
    {version:1,a4:440,notes:{'060':261}}, {version:1,a4:440,notes:{109:440}},
    {version:1,a4:440,notes:{60:NaN}}, {version:1,a4:440,notes:{60:280}},
    {version:1,a4:440,notes:{60:offset(equalFrequency(60),25),61:offset(equalFrequency(61),-25)}}])('rejects invalid or overlapping profile %#', value => {
      expect(()=>validateTuning(value)).toThrow();
    });
  test('validation protects previous absolute key measurements when changing global reference', () => {
    const profile = validateTuning({version:1,a4:440,notes:{60:equalFrequency(60)}});
    expect(()=>validateTuning({...profile,a4:420})).toThrow();
    expect(profile.a4).toBe(440); expect(profile.notes[60]).toBe(equalFrequency(60));
  });
});

describe('known-note scale acquisition', () => {
  test('stable collection uses median Hz and requires enough consecutive frames', () => {
    const collector = new TuningCollector(69,'global',standardTuning(),.01);
    const result = collect(collector,432);
    expect(result.result?.frequency).toBeCloseTo(432); expect(result.result?.spread).toBeCloseTo(0);
    const gap = new TuningCollector(69,'global',standardTuning(),.01);
    gap.observe(reading(432),0);
    expect(gap.observe(reading(432),5000).progress).toBe(0);
  });
  test.each([{frequency:880},{frequency:261.6},{rms:0},{clarity:.8},{clarity:NaN},{rms:NaN}])('wrong pitch, silence or low confidence resets accumulation %#', extra => {
    const collector = new TuningCollector(69,'global',standardTuning(),.01);
    for (let t=0;t<1000;t+=35) collector.observe(reading(432),t);
    expect(collector.observe(reading(432,extra),1015).progress).toBe(0);
    expect(collector.observe(reading(432),1050).progress).toBe(0);
  });
  test('unstable pitch and a wrong octave cannot produce a reference', () => {
    const collector = new TuningCollector(60,'key',standardTuning(),.01);
    for (let t=0;t<2500;t+=35) {
      expect(collector.observe(reading(offset(equalFrequency(60),t%70===0?15:-15)),t).result).toBeUndefined();
    }
    expect(collect(collector,equalFrequency(72),3000).result).toBeUndefined();
  });
  test('the guided scale preserves previous keys, calibrates measured deviations, and does not mutate the old profile', () => {
    const baseline = validateTuning({version:1,a4:432,notes:{48:equalFrequency(48,432)}});
    const scale = new ScaleCalibration(4,baseline,.01);
    expect(scale.sequence).toEqual([69,60,62,64,65,67,69,71,72]);
    expect(()=>scale.proposal()).toThrow();
    let now=0;
    for (let i=0;i<scale.sequence.length;i++) {
      const midi=scale.midi, frequency=offset(equalFrequency(midi,432),midi===60?12:0);
      let state: ReturnType<ScaleCalibration['observe']>;
      do {state=scale.observe(reading(frequency),now);now+=35;} while (!state.advanced);
      expect(state.complete).toBe(i===scale.sequence.length-1);
    }
    const tuning=scale.proposal();
    expect(tuning.a4).toBeCloseTo(432); expect(Object.keys(tuning.notes)).toHaveLength(9);
    expect(applyTuning(reading(offset(equalFrequency(60,432),12)),tuning).cents).toBeCloseTo(0);
    expect(Object.keys(baseline.notes)).toEqual(['48']);
    expect(scale.observe(reading(440),now).complete).toBe(true);
  });
  test('the next scale note still rejects a semitone and octave error after global tuning', () => {
    const scale = new ScaleCalibration(4,standardTuning(),.01);
    let now=0;
    while(scale.midi===69) {scale.observe(reading(430),now);now+=35;}
    expect(scale.midi).toBe(60);
    for (const wrong of [61,72]) {
      for (let i=0;i<60;i++) {expect(scale.observe(reading(equalFrequency(wrong,430)),now).advanced).toBe(false);now+=35;}
    }
  });
  test.each([1,7,4.5,NaN])('rejects unavailable scale range %s', octave => {
    expect(()=>new ScaleCalibration(octave,standardTuning(),.01)).toThrow();
  });
});

test('actual harmonic audio at A4=430 is rejected before calibration and passes only the correct target afterward', () => {
  const midi=60, frequency=equalFrequency(midi,430);
  const input=Float32Array.from({length:inputSize},(_,i)=>{
    const phase=2*Math.PI*frequency*i/48000;
    return .15*Math.sin(phase)+.05*Math.sin(phase*2)+.025*Math.sin(phase*3);
  });
  const raw=measurePitch(input,48000);
  expect(raw.frequency).toBeCloseTo(frequency,0); expect(Math.abs(raw.cents)).toBeGreaterThan(35);
  const tuning=validateTuning({version:1,a4:430,notes:{}}), tuned=applyTuning(raw,tuning);
  const target={start:0,end:1,midis:[60],measure:0,unsupported:null};
  const before=new PitchGate(), after=new PitchGate(), wrong=new PitchGate();
  let rawPassed=false, tunedPassed=false, wrongPassed=false;
  for (let t=0;t<350;t+=35) {
    rawPassed ||= before.observe(raw,target,t);
    tunedPassed ||= after.observe(tuned,target,t);
    wrongPassed ||= wrong.observe(tuned,{...target,midis:[61]},t);
  }
  expect(rawPassed).toBe(false); expect(tunedPassed).toBe(true); expect(wrongPassed).toBe(false);
});
