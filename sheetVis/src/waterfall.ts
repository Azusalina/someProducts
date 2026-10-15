import type { Score } from './score';
import { noteName } from './score';

type Key = { midi: number; black: boolean; x: number; width: number };
const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export const defaultColors = { left: '#99b585', right: '#86afc0', leftActive: '#c2ddab', rightActive: '#bedbea', background: '#111714' };
export type WaterfallColors = typeof defaultColors;
export function validColors(value: unknown): Partial<WaterfallColors> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([key, color]) => key in defaultColors && typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color)));
}

export class Waterfall {
  private context: CanvasRenderingContext2D;
  private keys: Key[] = [];
  private observer: ResizeObserver;
  private width = 900;
  private height = 440;
  score: Score | null = null;
  lookAhead = 7;
  keyboardHeight = 90;
  colors: WaterfallColors = { ...defaultColors };
  private previews = new Map<number, number>();

  setKeyboardHeight(height: number) {
    this.keyboardHeight = Math.round(Math.max(40, Math.min(Math.min(260, this.height - 100), height)));
    return this.keyboardHeight;
  }

  noteAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const line = this.height - this.keyboardHeight;
    if (y < line + 2 || y >= this.height || x < 0 || x > this.width) return null;
    const black = this.keys.find(k => k.black && y <= line + this.keyboardHeight * .62 && x >= k.x && x < k.x + k.width);
    return black?.midi ?? this.keys.find(k => !k.black && x >= k.x && x < k.x + k.width)?.midi ?? null;
  }

  flashNote(midi: number) { this.previews.set(midi, performance.now() + 800); }

  constructor(private canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas); this.resize();
  }

  private resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const scale = window.devicePixelRatio || 1;
    this.canvas.width = this.width * scale; this.canvas.height = this.height * scale;
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    const whiteWidth = this.width / 52;
    let white = 0;
    this.keys = [];
    for (let midi = 21; midi <= 108; midi++) {
      const black = isBlack(midi);
      this.keys.push({ midi, black, x: black ? white * whiteWidth - whiteWidth * .31 : white * whiteWidth, width: black ? whiteWidth * .62 : whiteWidth });
      if (!black) white++;
    }
  }

  draw(position: number, hands: { left: boolean; right: boolean }, timeScale = 1) {
    const c = this.context, w = this.width, h = this.height;
    const keyboard = this.setKeyboardHeight(this.keyboardHeight), line = h - keyboard, pps = (line - 26) / (this.lookAhead * timeScale);
    c.fillStyle = this.colors.background; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.rect(0, 0, w, line); c.clip();
    for (const key of this.keys) if (!key.black) {
      c.strokeStyle = key.midi % 12 === 0 ? '#3b433d' : '#2c332e';
      c.beginPath(); c.moveTo(key.x, 0); c.lineTo(key.x, line); c.stroke();
    }
    c.font = '10px monospace';
    for (let second = Math.ceil(position / timeScale); second <= position / timeScale + this.lookAhead + 1; second++) {
      const y = line - (second * timeScale - position) * pps;
      c.strokeStyle = '#39413b'; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      c.fillStyle = '#919c93'; c.fillText(`${second}s`, 7, y - 5);
    }
    for (const measure of this.score?.measures ?? []) {
      const y = line - (measure.start - position) * pps;
      if (y < 0 || y > line) continue;
      c.strokeStyle = '#59665c'; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#c2ccc3'; c.fillText(`m.${measure.number}`, w - 55, y - 5);
    }
    const active = new Map<number, 'left' | 'right'>();
    for (const note of this.score?.notes ?? []) {
      const end = note.start + note.duration;
      if (note.start > position + (this.lookAhead + 1) * timeScale || end < position - .5 * timeScale) continue;
      const key = this.keys.find(k => k.midi === Math.round(note.midi));
      if (!key) continue;
      const bottom = line - (note.start - position) * pps;
      const top = line - (end - position) * pps;
      const playing = note.start <= position && end > position;
      if (playing && hands[note.hand]) active.set(key.midi, note.hand);
      c.globalAlpha = hands[note.hand] ? 1 : .18;
      c.fillStyle = note.hand === 'left' ? (playing ? this.colors.leftActive : this.colors.left) : (playing ? this.colors.rightActive : this.colors.right);
      c.beginPath(); c.roundRect(key.x + 1.5, top, Math.max(2, key.width - 3), Math.max(4, bottom - top - 1), 3); c.fill();
      if (key.width > 19 && bottom - top > 19) {
        c.fillStyle = '#26342a'; c.font = '10px monospace'; c.textAlign = 'center';
        c.fillText(noteName(note.midi), key.x + key.width / 2, Math.min(bottom - 7, top + 14)); c.textAlign = 'start';
      }
      c.globalAlpha = 1;
    }
    c.restore();
    c.fillStyle = '#697b6c'; c.fillRect(0, line - 1, w, 2);
    for (const [midi, until] of this.previews) if (performance.now() > until) this.previews.delete(midi);
    for (const black of [false, true]) for (const key of this.keys.filter(k => k.black === black)) {
      const hand = active.get(key.midi);
      const keyHeight = black ? keyboard * .62 : keyboard;
      c.fillStyle = this.previews.has(key.midi) ? '#cbd9b2' : hand ? (hand === 'left' ? this.colors.leftActive : this.colors.rightActive) : black ? '#0c100e' : '#c6cbc2';
      c.fillRect(key.x + .5, line + 2, key.width - 1, keyHeight - 2);
      if (!black && (key.midi % 12 === 0 || key.midi === 21)) {
        c.font = '10px monospace'; c.fillStyle = '#797f74'; c.textAlign = 'center'; c.fillText(noteName(key.midi), key.x + key.width / 2, h - 9); c.textAlign = 'start';
      }
    }
  }
}
