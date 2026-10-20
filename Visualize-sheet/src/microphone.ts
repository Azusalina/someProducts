import {PitchDetector} from 'pitchy';
import type {PitchReading} from './teaching';

export const inputSize = 8192;
export function measurePitch(input: Float32Array, sampleRate: number, detector = PitchDetector.forFloat32Array(input.length)): PitchReading {
  let sum = 0, energy = 0;
  for (const value of input) sum += value;
  const mean = sum / input.length;
  for (let i = 0; i < input.length; i++) {input[i] -= mean; energy += input[i] ** 2;}
  const rms = Math.sqrt(energy / input.length);
  if (rms < .001) return {midi: null, cents: 0, clarity: 0, rms};
  const [frequency, clarity] = detector.findPitch(input, sampleRate);
  const pitch = 69 + 12 * Math.log2(frequency / 440), midi = Math.round(pitch);
  if (!Number.isFinite(pitch) || frequency <= 0) return {midi: null, cents: 0, clarity, rms};
  if (midi < 21 || midi > 108) return {midi: null, cents: 0, clarity, rms, frequency};
  return {midi, cents: (pitch - midi) * 100, clarity, rms, frequency};
}

// Capture has its own muted audio graph. No samples leave this object and no
// recording, network request or audible microphone monitoring is created.
export class MicrophoneInput {
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mute: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  async start(onReading: (reading: PitchReading, now: number) => void, onEnded: (message: string) => void): Promise<boolean> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('此浏览器无法使用麦克风；请通过 localhost／127.0.0.1 或 HTTPS 打开。');
    const generation = this.generation, context = new AudioContext();
    this.context = context;
    // Called in the button's gesture, before waiting for the permission dialog.
    const resumed = context.resume();
    void resumed.catch(() => {});
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
      if (generation !== this.generation) {stream.getTracks().forEach(t => t.stop()); return false;}
      this.stream = stream;
      await resumed;
      if (generation !== this.generation) return false;
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser(); this.analyser.fftSize = inputSize;
      this.mute = context.createGain(); this.mute.gain.value = 0;
      this.source.connect(this.analyser); this.analyser.connect(this.mute); this.mute.connect(context.destination);
      const input = new Float32Array(inputSize), detector = PitchDetector.forFloat32Array(inputSize);
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (generation === this.generation) {this.stop(); onEnded('麦克风已断开');}
      });
      context.addEventListener('statechange', () => {
        if (generation === this.generation && context.state !== 'running') {this.stop(); onEnded('麦克风音频已暂停，请重新启用');}
      });
      this.timer = setInterval(() => {
        if (generation !== this.generation || !this.analyser) return;
        this.analyser.getFloatTimeDomainData(input);
        onReading(measurePitch(input, context.sampleRate, detector), performance.now());
      }, 35);
      return true;
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      if (generation !== this.generation) return false;
      this.stop();
      const name = error instanceof DOMException ? error.name : '';
      throw new Error(name === 'NotAllowedError' ? '未获得麦克风权限；教学模式未启动。'
        : name === 'NotFoundError' ? '未找到麦克风。' : `麦克风启动失败：${String(error)}`);
    } finally {void resumed.catch(() => {});}
  }
  stop() {
    this.generation++;
    clearInterval(this.timer); this.timer = undefined;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.source?.disconnect(); this.analyser?.disconnect(); this.mute?.disconnect();
    this.source = null; this.analyser = null; this.mute = null;
    const context = this.context; this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
