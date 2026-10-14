import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PianoPlayer } from '../src/audio';
import type { Score } from '../src/score';

class Parameter { value = 1; setValueAtTime = vi.fn(); linearRampToValueAtTime = vi.fn(); exponentialRampToValueAtTime = vi.fn(); setTargetAtTime = vi.fn(); cancelScheduledValues = vi.fn(); }
class Gain { gain = new Parameter(); connect = vi.fn(); disconnect = vi.fn(); }
class Source { buffer = null; playbackRate = new Parameter(); connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn(); onended = null; }
class Context {
  static instance: Context;
  currentTime = 0;
  destination = {};
  sources: Source[] = [];
  constructor() { Context.instance = this; }
  resume = vi.fn(async () => {});
  createGain() { return new Gain(); }
  createDynamicsCompressor() { return { connect: vi.fn(), threshold: new Parameter(), ratio: new Parameter() }; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  decodeAudioData = vi.fn(async () => ({ duration: 30 }));
}
const score: Score = { title: 'Timing', duration: 5, bpm: 120, measures: [], warnings: [], notes: [
  { id: '0', midi: 60, start: 0, duration: 3, soundDuration: 4, hand: 'right', velocity: .8, measure: 0 },
  { id: '1', midi: 48, start: 2, duration: 1, soundDuration: 1, hand: 'left', velocity: .8, measure: 0 },
] };

describe('audio transport correctness', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('manifest') ? { ok: true, json: async () => ({ samples: [{ note: 'C4', file: 'C4.mp3' }] }) } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  test('pause freezes score position and stops queued sources', async () => {
    const player = new PianoPlayer(); player.load(score); await player.play();
    Context.instance.currentTime = 1; player.pause();
    const position = player.position; Context.instance.currentTime = 10;
    expect(player.position).toBe(position); expect(Context.instance.sources[0].stop).toHaveBeenCalled();
  });
  test('speed changes preserve pitch and position', async () => {
    const player = new PianoPlayer(); player.load(score); await player.play();
    Context.instance.currentTime = 1;
    const position = player.position; await player.setSpeed(.5);
    expect(player.position).toBeCloseTo(position);
    expect(Context.instance.sources.at(-1)!.playbackRate.value).toBe(1);
    Context.instance.currentTime += 1;
    expect(player.position - position).toBeCloseTo(.4825);
    player.pause();
  });
  test('seeking restores a sustained note using a sample offset', async () => {
    const player = new PianoPlayer(); player.load(score); await player.play();
    await player.seek(1.5);
    expect(Context.instance.sources.at(-1)!.start.mock.calls[0][1]).toBe(1.5);
    expect(player.position).toBe(1.5); player.pause();
  });
  test('muting a hand suppresses its restored notes', async () => {
    const player = new PianoPlayer(); player.load(score); await player.setHand('right', false); await player.seek(1); await player.play();
    expect(Context.instance.sources).toHaveLength(0); player.pause();
  });
  test('audition plays the selected pitch even with both hands muted, without starting transport', async () => {
    const player = new PianoPlayer(); player.load(score); player.hands = { left: false, right: false };
    await player.audition(69);
    expect(Context.instance.sources).toHaveLength(1);
    expect(Context.instance.sources[0].playbackRate.value).toBeCloseTo(2 ** (9 / 12));
    expect(player.playing).toBe(false); expect(player.position).toBe(0);
  });
  test('pause invalidates pending sample-loading play', async () => {
    let resolve!: () => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('manifest')) { await new Promise<void>(r => { resolve = r; }); return { ok: true, json: async () => ({ samples: [{ note: 'C4', file: 'C4.mp3' }] }) }; }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }));
    const player = new PianoPlayer(); player.load(score);
    const pending = player.play(); await Promise.resolve(); await Promise.resolve();
    player.pause(); resolve(); await pending;
    expect(player.playing).toBe(false); expect(Context.instance.sources).toHaveLength(0);
  });
  test('end of score stops transport and reports completion', async () => {
    const player = new PianoPlayer(); player.onEnd = vi.fn(); player.load(score); await player.play();
    Context.instance.currentTime = 6; await vi.advanceTimersByTimeAsync(25);
    expect(player.playing).toBe(false); expect(player.onEnd).toHaveBeenCalledOnce();
  });
});
