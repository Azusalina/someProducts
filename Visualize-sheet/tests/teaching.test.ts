import {describe, expect, test} from 'vitest';
import {noteName, PitchGate, targetAt, teachingTargets, type PitchReading, type TeachingTarget} from '../src/teaching';
import {inputSize, measurePitch} from '../src/microphone';
import type {NoteEvent, Score} from '../src/score';

const note = (midi: number, start: number, hand: 'left'|'right' = 'right', extra: Partial<NoteEvent> = {}): NoteEvent =>
  ({id: `${midi}:${start}`, midi, start, duration: .5, soundDuration: .6, velocity: .7, hand, measure: 0, ...extra});
const score = (notes: NoteEvent[]) => ({notes, duration: 10, measures: [], bpm: 120, title: '', warnings: []}) as Score;
const single: TeachingTarget = {start: 0, end: 1, midis: [60], measure: 0, unsupported: null};
const pitch = (midi: number | null, extra: Partial<PitchReading> = {}): PitchReading => ({midi, cents: 0, clarity: .99, rms: midi === null ? 0 : .1, ...extra});
const observe = (gate: PitchGate, reading: PitchReading, from: number, to: number, target = single) => {
  let passes = 0;
  for (let time = from; time <= to; time += 35) if (gate.observe(reading, target, time)) passes++;
  return passes;
};

describe('teaching targets', () => {
  test('filters hands and keeps a tie with multiple printed heads as one attack', () => {
    const tied = note(60, 0, 'right', {duration: 2, sources: [{id:'a',start:0,duration:1},{id:'b',start:1,duration:1}]});
    const targets = teachingTargets(score([note(48,0,'left'), tied, note(62,2)]), {left:false,right:true});
    expect(targets.map(t => t.midis)).toEqual([[60],[62]]);
    expect(targetAt(targets,1.5)).toBe(0); expect(targetAt(targets,2)).toBe(1); expect(targetAt(targets,5)).toBe(-1);
    expect(teachingTargets(score([tied]), {left:false,right:false})).toEqual([]);
  });
  test('blocks chords and staggered polyphony, but not sample legato tails', () => {
    const targets = teachingTargets(score([note(60,0),note(64,0),note(67,.25),note(69,1)]), {left:true,right:true});
    expect(targets[0].unsupported).toContain('和弦'); expect(targets[1].midis).toEqual([60,64,67]);
    expect(targets[2].unsupported).toBeNull();
  });
  test('groups generated ornaments without conflating separate repeat occurrences', () => {
    const targets = teachingTargets(score([
      note(60,0,'right',{decoration:'ornament',sources:[{id:'a',start:0,duration:.1}]}),
      note(62,.1,'right',{decoration:'ornament',sources:[{id:'a',start:.1,duration:.1}]}),
      note(60,3,'right',{measure:2,decoration:'ornament',sources:[{id:'a',start:3,duration:.1}]})
    ]),{left:true,right:true});
    expect(targets).toHaveLength(2); expect(targets.every(t => !!t.unsupported)).toBe(true);
  });
});

describe('pitch gate', () => {
  test('stable correct pitch advances once, never repeatedly from a held tone', () => {
    const gate = new PitchGate();
    expect(observe(gate,pitch(60),0,2000)).toBe(1);
    expect(observe(gate,pitch(null),2030,2170)).toBe(0);
    expect(observe(gate,pitch(60),2200,2700)).toBe(1);
  });
  test.each([
    ['wrong note',pitch(61)],['wrong octave',pitch(72)],['quiet',pitch(60,{rms:.001})],
    ['unclear',pitch(60,{clarity:.8})],['out of tune',pitch(60,{cents:40})],['silence',pitch(null)]
  ])('%s does not advance', (_label, reading) => {
    expect(observe(new PitchGate(),reading,0,1500)).toBe(0);
  });
  test('a short transient cannot count as a stable note, and errors reset stability', () => {
    const gate = new PitchGate();
    expect(observe(gate,pitch(60),0,105)).toBe(0);
    gate.observe(pitch(61),single,110);
    expect(observe(gate,pitch(60),120,225)).toBe(0);
    expect(gate.observe(pitch(60),single,280)).toBe(true);
  });
  test('a changed pitch allows legato; harmonic jitter does not unlock a repeated pitch', () => {
    const gate = new PitchGate(); expect(observe(gate,pitch(60),0,140)).toBe(1);
    expect(observe(gate,pitch(72),175,210)).toBe(0);
    expect(observe(gate,pitch(60),245,560)).toBe(0);
    const next = {...single,midis:[62]};
    expect(observe(gate,pitch(62),600,1100,next)).toBe(1);
  });
  test('chords cannot pass from hearing only one chord tone', () => {
    expect(observe(new PitchGate(),pitch(60),0,2000,{...single,midis:[60,64],unsupported:'和弦'})).toBe(0);
  });
  test('explicit navigation resets the held-pitch lock', () => {
    const gate = new PitchGate(); expect(observe(gate,pitch(60),0,140)).toBe(1);
    gate.reset(); expect(observe(gate,pitch(60),200,500)).toBe(1);
  });
});

describe('actual pitch detector with generated audio, not a mocked pitch result', () => {
  test.each([36,48,60,69,84,96])('recognizes MIDI %i at 44.1 and 48 kHz with piano-like harmonics', midi => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    for (const sampleRate of [44100,48000]) {
      const input = Float32Array.from({length:inputSize}, (_, i) => {
        const phase = 2*Math.PI*frequency*i/sampleRate;
        return .15*Math.sin(phase)+.08*Math.sin(phase*2)+.04*Math.sin(phase*3)+.02;
      });
      const result = measurePitch(input,sampleRate);
      expect(result.midi).toBe(midi); expect(Math.abs(result.cents)).toBeLessThan(10); expect(result.clarity).toBeGreaterThan(.9);
    }
  });
  test('silence and constant DC have no pitch', () => {
    expect(measurePitch(new Float32Array(inputSize),48000).midi).toBeNull();
    expect(measurePitch(new Float32Array(inputSize).fill(.3),48000).midi).toBeNull();
    expect(noteName(60)).toBe('C4'); expect(noteName(21)).toBe('A0');
  });
});
