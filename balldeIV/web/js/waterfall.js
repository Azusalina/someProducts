// Canvas waterfall: falling notes above a piano keyboard. Time is in beats (quarter notes); bar lines come from the
// score's measures (a pickup or a free-time cadenza is not a full bar).
import { layoutKeyboard, isBlack } from './piano.js';
import { lowerBound, measureIndexAt } from './score.js';

const rr = (ctx, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export class Waterfall {
  constructor(canvas, score) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.score = score;
    this.range = [21, 108];
    this.kbHeight = 130;
    this.pxPerBeat = 110;
    this.colors = { R: '#ff8a3d', L: '#2fc9b0' };
    this.hands = new Set(['R', 'L']);
    this.t = 0;
    this.targets = new Set();      // note ids the learner must play now
    this.heard = new Set();        // midi numbers currently detected by the microphone
    this.wrong = new Map();        // midi -> expiry time (performance.now) of a red flash
    this.sounding = new Set();     // midi currently sounding (display mode)
    this.learn = false;
    this.resize();
  }

  setRange(lo, hi) { this.range = [lo, hi]; this.resize(); }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(200, r.width);
    this.h = Math.max(200, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.kb = layoutKeyboard(this.range[0], this.range[1], this.w);
  }

  get nowY() { return this.h - this.kbHeight; }

  yOf(t) { return this.nowY - (t - this.t) * this.pxPerBeat; }

  draw() {
    const { ctx, w, h } = this;
    const nowY = this.nowY;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);
    this.drawLanes(nowY);
    this.drawGrid(nowY);
    this.drawNotes(nowY);
    this.drawKeyboard(nowY);
  }

  drawLanes(nowY) {
    const { ctx } = this;
    for (const k of this.kb.keys) {
      if (k.black) continue;
      if ((k.midi % 12) === 0) {                      // C lanes get a faint marker
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(k.x, 0, k.w, nowY);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const k of this.kb.keys) if (k.black) ctx.fillRect(k.x, 0, k.w, nowY);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const k of this.kb.keys) {
      if (k.black) continue;
      const nextBlackless = ((k.midi % 12) === 4 || (k.midi % 12) === 11);
      if (nextBlackless || (k.midi % 12) === 0 || true) { ctx.moveTo(Math.round(k.x) + .5, 0); ctx.lineTo(Math.round(k.x) + .5, nowY); }
    }
    ctx.stroke();
  }

  drawGrid(nowY) {
    const { ctx, score } = this;
    const tTop = this.t + nowY / this.pxPerBeat;
    const ms = score.measures;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const line = (t, strong, label) => {
      const y = Math.round(this.yOf(t)) + .5;
      if (y > nowY || y < 0) return;
      ctx.strokeStyle = strong ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
      if (label) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(label, 6, y + 3); }
    };
    for (let i = Math.max(0, measureIndexAt(score, this.t - 0.5) - 1); i < ms.length && ms[i].start <= tTop; i++) {
      const m = ms[i];
      line(m.start, true, 'm.' + m.label);
      if (m.kind === 'free') continue;                       // no metre inside a cadenza
      for (let b = 1; b < m.length - 1e-6; b++) line(m.start + b, false);
    }
  }

  drawNotes(nowY) {
    const { ctx, score } = this;
    const tTop = this.t + nowY / this.pxPerBeat + 0.2;
    const tBottom = this.t - 0.1;
    let i = lowerBound(score.notes, tBottom - score.maxDur);
    for (; i < score.notes.length; i++) {
      const n = score.notes[i];
      if (n.t > tTop) break;
      if (n.end < tBottom) continue;
      const k = this.kb.byMidi.get(n.midi);
      if (!k) continue;
      const enabled = this.hands.has(n.hand);
      const yTop = this.yOf(n.end);
      const yBot = this.yOf(n.t);
      const x = k.x + (k.black ? 1 : 1.5);
      const wd = k.w - (k.black ? 2 : 3);
      const hh = Math.max(4, yBot - yTop);
      const base = this.colors[n.hand];
      const target = this.targets.has(n.id);
      const active = this.t >= n.t - 1e-6 && this.t < n.end;
      ctx.save();
      ctx.globalAlpha = enabled ? 1 : 0.16;
      // clip the part below the keyboard line
      ctx.beginPath(); ctx.rect(0, 0, this.w, nowY); ctx.clip();
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, shade(base, -0.18));
      g.addColorStop(1, shade(base, 0.12));
      ctx.fillStyle = g;
      rr(ctx, x, yTop, wd, hh, Math.min(5, wd / 2));
      ctx.fill();
      if (n.grace) { ctx.strokeStyle = '#fff'; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
      if (target || active) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = target ? '#ffffff' : 'rgba(255,255,255,0.7)';
        rr(ctx, x, yTop, wd, hh, Math.min(5, wd / 2));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawKeyboard(nowY) {
    const { ctx } = this;
    const kbH = this.kbHeight;
    const now = performance.now();
    // hit line glow
    const glow = ctx.createLinearGradient(0, nowY - 14, 0, nowY);
    glow.addColorStop(0, 'rgba(255,255,255,0)');
    glow.addColorStop(1, this.learn ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.10)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, nowY - 14, this.w, 14);
    // key colour for a midi note: expected (hand colour), heard (green), wrong (red)
    const targetHands = new Map();
    for (const id of this.targets) {
      const n = this.score.notes[id];
      if (n) targetHands.set(n.midi, n.hand);
    }
    const activeHands = new Map();
    for (const m of this.sounding) activeHands.set(m.midi, m.hand);
    // white keys
    for (const k of this.kb.keys) {
      if (k.black) continue;
      this.keyFill(k, nowY, kbH, targetHands, activeHands, now, false);
    }
    for (const k of this.kb.keys) {
      if (!k.black) continue;
      this.keyFill(k, nowY, kbH, targetHands, activeHands, now, true);
    }
    // c labels
    ctx.fillStyle = '#6b7280';
    ctx.font = `${Math.max(9, Math.min(12, this.kb.whiteW * 0.55))}px system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    for (const k of this.kb.keys) {
      if (!k.black && k.midi % 12 === 0) ctx.fillText('C' + (Math.floor(k.midi / 12) - 1), k.x + 2, this.h - 4);
    }
  }

  keyFill(k, nowY, kbH, targetHands, activeHands, now, black) {
    const { ctx } = this;
    const hKey = black ? kbH * 0.62 : kbH;
    let fill = black ? '#14171c' : '#f3f4f6';
    let accent = null;
    const th = targetHands.get(k.midi);
    const ah = activeHands.get(k.midi);
    if (ah) accent = this.colors[ah];
    if (th) accent = this.colors[th];
    if (this.heard.has(k.midi)) accent = '#4ade80';
    const wr = this.wrong.get(k.midi);
    if (wr && wr > now) accent = '#ef4444';
    if (accent) fill = accent;
    ctx.fillStyle = fill;
    const x = k.x, y = nowY, w = k.w;
    if (black) {
      rr(ctx, x, y - 1, w, hKey, 3);
      ctx.fill();
      if (!accent) {
        const g = ctx.createLinearGradient(x, y, x + w, y);
        g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.3, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillRect(x + 0.5, y, w - 1, hKey);
      if (!accent) {
        const g = ctx.createLinearGradient(0, y, 0, y + hKey);
        g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
        ctx.fillStyle = g; ctx.fillRect(x + 0.5, y, w - 1, hKey);
      }
      ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hKey - 1);
    }
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}
