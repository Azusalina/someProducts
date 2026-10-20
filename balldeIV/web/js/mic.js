// Microphone front-end: getUserMedia -> AudioWorklet -> (MessagePort) -> analysis worker.
const PROFILE_KEY = 'ballade4.pianoProfile';

/** C-major scales used for calibration: 2, 3 or 5 octaves */
export function calibrationScale(octaves) {
  const start = { 2: 48, 3: 36, 5: 36, 6: 24 }[octaves] ?? 24;
  const end = { 2: 72, 3: 72, 5: 96, 6: 96 }[octaves] ?? 96;
  const major = [0, 2, 4, 5, 7, 9, 11];
  const out = [];
  for (let m = start; m <= end; m++) if (major.includes(m % 12)) out.push(m);
  return out;
}

export class Ear {
  constructor() {
    this.running = false;
    this.heard = new Set();
    this.profile = null;
    try { this.profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { /* ignore */ }
    this.onOnset = () => {}; this.onHeard = () => {}; this.onLevel = () => {}; this.onState = () => {};
    this.calCb = null;
    this.onState(this.profile ? 'Mic off · calibrated' : 'Mic off');
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access (needs https or localhost).');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('js/worklet.js');
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.worker = new Worker('js/analysis-worker.js', { type: 'module' });
    const ch = new MessageChannel();
    this.node.port.postMessage({ port: ch.port1 }, [ch.port1]);
    this.worker.postMessage({ type: 'init', port: ch.port2, sampleRate: this.ctx.sampleRate, profile: this.profile }, [ch.port2]);
    this.worker.onmessage = e => this.onMsg(e.data);
    this.src.connect(this.node);
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.running = true;
    this.onState(this.profile ? 'Listening · calibrated' : 'Listening');
  }

  onMsg(m) {
    if (m.type === 'level') this.onLevel(m.db);
    else if (m.type === 'heard') { this.heard = new Set(m.notes); this.onHeard(this.heard); }
    else if (m.type === 'onset') this.onOnset(m.midi, m);
    else if (m.type === 'cal' && this.calCb) {
      const { onProgress } = this.calCb;
      if (m.status === 'waiting') onProgress(m.index, 'waiting');
      else if (m.status === 'captured') onProgress(m.index, 'captured', { cents: m.cents });
      else if (m.status === 'retry') onProgress(m.index, 'waiting');
    } else if (m.type === 'profile') {
      this.profile = m.profile;
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(m.profile)); } catch { /* quota/private mode */ }
      this.onState('Listening · calibrated');
      this.calCb?.onDone({ count: m.profile.count, tuning: m.profile.tuning });
      this.calCb = null;
    }
  }

  /** tell the analyser which notes the player should be producing now (enables the sensitive, joint matching) */
  expect(midis) { this.worker?.postMessage({ type: 'expect', notes: midis }); }

  calibrate(scale, cbs) {
    this.calCb = cbs;
    this.worker.postMessage({ type: 'calibrate', scale });
  }
  cancelCalibration() { this.calCb = null; this.worker?.postMessage({ type: 'cancelCal' }); }

  stop() {
    this.running = false;
    this.worker?.terminate();
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
    this.heard = new Set();
    this.onState(this.profile ? 'Mic off · calibrated' : 'Mic off');
  }
}
