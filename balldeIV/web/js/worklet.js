// AudioWorklet: forwards mono microphone blocks straight to the analysis worker through a MessagePort,
// so the main thread is never involved in the audio path.
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = e => { if (e.data && e.data.port) this.out = e.data.port; };
    this.buf = new Float32Array(512);
    this.n = 0;
    this.out = null;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const take = Math.min(ch.length - i, this.buf.length - this.n);
      this.buf.set(ch.subarray(i, i + take), this.n);
      this.n += take; i += take;
      if (this.n === this.buf.length) {
        if (this.out) this.out.postMessage(this.buf.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('tap', Tap);
