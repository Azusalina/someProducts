import type { Score, NoteEvent } from './score';

type Sample = { midi: number; buffer: AudioBuffer };
type Voice = { source: AudioBufferSourceNode; gain: GainNode };

export class PianoPlayer {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private samples: Sample[] = [];
  private voices = new Set<Voice>();
  private loadPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private next = 0;
  private anchorTime = 0;
  private anchorPosition = 0;
  private generation = 0;
  score: Score | null = null;
  playing = false;
  speed = 1;
  hands = { left: true, right: true };
  volume = .6;
  onEnd: () => void = () => {};

  async ready(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18; compressor.ratio.value = 4;
      this.master.connect(compressor); compressor.connect(this.context.destination);
      this.master.gain.value = this.volume;
    }
    // Resume immediately inside the user gesture, before fetching samples.
    await this.context.resume();
    if (!this.loadPromise) this.loadPromise = this.loadSamples().catch(error => { this.loadPromise = null; throw error; });
    await this.loadPromise;
  }

  private async loadSamples() {
    const response = await fetch('/samples/manifest.json');
    if (!response.ok) throw new Error('钢琴音色尚未准备好，请运行 npm run setup，再重新构建。');
    const manifest = await response.json() as { samples: { note: string; file: string }[] };
    const semitones: Record<string, number> = { C: 0, 'D#': 3, 'F#': 6, A: 9 };
    const samples = await Promise.all(manifest.samples.map(async s => {
      const match = /^([A-G]#?)(\d)$/.exec(s.note)!;
      const file = await fetch(`/samples/${s.file}`);
      if (!file.ok) throw new Error(`无法载入本地音色 ${s.note}`);
      const buffer = await this.context!.decodeAudioData(await file.arrayBuffer());
      return { midi: (Number(match[2]) + 1) * 12 + semitones[match[1]], buffer };
    }));
    this.samples = samples.sort((a, b) => a.midi - b.midi);
  }

  get position(): number {
    if (!this.playing || !this.context) return this.anchorPosition;
    return Math.min(this.score?.duration ?? 0, this.anchorPosition + Math.max(0, this.context.currentTime - this.anchorTime) * this.speed);
  }

  load(score: Score) { this.pause(); this.score = score; this.anchorPosition = 0; }

  async play() {
    const generation = ++this.generation;
    await this.ready();
    if (generation !== this.generation || !this.score || this.playing) return;
    if (this.anchorPosition >= this.score.duration) this.anchorPosition = 0;
    this.playing = true;
    this.anchorTime = this.context!.currentTime + .035;
    this.next = this.score.notes.findIndex(n => n.start >= this.anchorPosition);
    if (this.next < 0) this.next = this.score.notes.length;
    // Restore notes already held at the seek/pause position, using their sample offset.
    for (const note of this.score.notes) if (note.start < this.anchorPosition && note.start + note.soundDuration > this.anchorPosition) this.trigger(note, this.anchorTime, (note.start + note.soundDuration - this.anchorPosition) / this.speed, this.anchorPosition - note.start);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  pause() {
    this.generation++;
    this.anchorPosition = this.position;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopVoices();
  }

  private stopVoices() {
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, .006);
      try { voice.source.stop(now + .03); } catch { /* already stopped */ }
    }
    this.voices.clear();
  }

  async seek(position: number) {
    const resume = this.playing;
    this.pause();
    this.anchorPosition = Math.max(0, Math.min(this.score?.duration ?? 0, position));
    if (resume) await this.play();
  }

  async setSpeed(speed: number) {
    const resume = this.playing;
    this.pause(); this.speed = Number.isFinite(speed) ? Math.max(.01, Math.min(30, speed)) : 1;
    if (resume) await this.play();
  }

  async setHand(hand: 'left' | 'right', enabled: boolean) {
    const resume = this.playing;
    this.pause(); this.hands[hand] = enabled;
    if (resume) await this.play();
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.master && this.context) this.master.gain.setTargetAtTime(volume, this.context.currentTime, .02);
  }

  async audition(midi: number) {
    await this.ready();
    this.trigger({ id: 'preview', midi, start: 0, duration: .8, soundDuration: .8, velocity: .8, hand: 'right', measure: 0 }, this.context!.currentTime + .005, .8, 0, true);
  }

  private schedule() {
    if (!this.playing || !this.context || !this.score) return;
    if (this.position >= this.score.duration) { this.pause(); this.onEnd(); return; }
    const horizon = this.context.currentTime + .12;
    while (this.next < this.score.notes.length) {
      const note = this.score.notes[this.next];
      const when = this.anchorTime + (note.start - this.anchorPosition) / this.speed;
      if (when > horizon) break;
      // If the tab was suspended, resume from current position instead of bursting overdue notes.
      const offset = Math.max(0, this.context.currentTime - when) * this.speed;
      if (offset < note.soundDuration) this.trigger(note, Math.max(this.context.currentTime, when), (note.soundDuration - offset) / this.speed, offset);
      this.next++;
    }
  }

  private trigger(note: NoteEvent, when: number, duration: number, offset = 0, audition = false) {
    if (!this.context || !this.master || (!audition && !this.hands[note.hand])) return;
    const sample = this.samples.reduce((best, s) => Math.abs(s.midi - note.midi) < Math.abs(best.midi - note.midi) ? s : best, this.samples[0]);
    if (!sample) return;
    const source = this.context.createBufferSource(); source.buffer = sample.buffer;
    const pitchRate = 2 ** ((note.midi - sample.midi) / 12);
    source.playbackRate.value = pitchRate; // Tempo never changes this pitch rate.
    const sampleOffset = Math.min(offset * pitchRate, Math.max(0, sample.buffer.duration - .05));
    const available = (sample.buffer.duration - sampleOffset) / pitchRate;
    const held = Math.min(duration, available);
    const gain = this.context.createGain();
    const level = Math.max(.01, note.velocity) * .48 * Math.exp(-offset * .35);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + .004);
    gain.gain.setValueAtTime(level, when + Math.max(.005, held));
    gain.gain.exponentialRampToValueAtTime(.0001, when + held + .16);
    source.connect(gain); gain.connect(this.master);
    const voice = { source, gain }; this.voices.add(voice);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    source.start(when, sampleOffset); source.stop(when + held + .17);
  }
}
