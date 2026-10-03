const TAU = Math.PI * 2;
function seeded(seed) {
  let n = seed;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}

export class VisualStudy {
  constructor(canvas, repo, { animated = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.repo = repo;
    this.animated = animated;
    this.paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.time = 0;
    this.pointer = { x: 0, y: 0 };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.visibility = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; });
    this.visibility.observe(canvas);
    this.move = event => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: (event.clientX - rect.left) / rect.width - .5, y: (event.clientY - rect.top) / rect.height - .5 };
      if (this.paused) this.draw();
    };
    this.leave = () => { this.pointer = { x: 0, y: 0 }; };
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerleave', this.leave);
    this.setRepo(repo);
    if (animated) this.frame = requestAnimationFrame(t => this.loop(t));
  }
  setRepo(repo) {
    this.repo = repo;
    this.time = 0;
    const random = seeded(12345);
    this.points = Array.from({ length: 5400 }, (_, i) => {
      const u = random() * TAU, v = Math.acos(2 * random() - 1);
      const hemi = i % 2 ? 1 : -1;
      const fold = 1 + .065 * Math.sin(u * 11 + Math.sin(v * 6) * 2) + .045 * Math.cos(v * 17 + u * 3);
      const radial = .82 + .18 * random();
      const x = hemi * (.045 + (1 + Math.cos(u)) * .44 * Math.sin(v) * fold);
      const y = Math.cos(v) * .8 * fold + .10 * Math.sin(u);
      const z = Math.sin(u) * Math.sin(v) * .66 * fold * radial;
      return { x, y, z, size: .4 + random() * .8, light: random() };
    });
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  loop(timestamp) {
    if (!this.paused && this.visible && !document.hidden) {
      this.time += Math.min((timestamp - (this.previous || timestamp)) / 1000, .05);
      this.draw();
    }
    this.previous = timestamp;
    this.frame = requestAnimationFrame(t => this.loop(t));
  }
  draw() {
    if (!this.width || !this.height || !this.ctx) return;
    const { ctx: c, width: w, height: h, repo } = this;
    c.clearRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * .5, h * .5, 0, w * .5, h * .5, w * .48);
    glow.addColorStop(0, repo.color + '13'); glow.addColorStop(1, repo.color + '00');
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2);
    if (repo.visual === 'brain') this.brain();
    else if (repo.visual === 'fluid') this.fluid();
    else if (repo.visual === 'orbit') this.orbit();
    else if (repo.visual === 'wave') this.wave();
    else if (repo.visual === 'type') this.type();
    else if (repo.visual === 'flow') this.flow();
    else this.burst();
    c.restore(); c.globalAlpha = 1;
  }
  brain() {
    const { ctx: c, width: w, height: h, time: t } = this;
    const scale = Math.min(w * .35, h * .35);
    const angle = -.38 + Math.sin(t * .13) * .14 + this.pointer.x * .55;
    const tilt = -.16 + this.pointer.y * .2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const points = this.points.map(p => {
      const x = p.x * cos + p.z * sin;
      const z = -p.x * sin + p.z * cos;
      const y = p.y * Math.cos(tilt) - z * Math.sin(tilt);
      return { ...p, x, y, z };
    }).sort((a, b) => a.z - b.z);
    c.fillStyle = this.repo.color;
    for (const p of points) {
      c.globalAlpha = .18 + (p.z + .9) / 2.1 * .65;
      const depth = 1 + p.z * .1;
      c.beginPath(); c.arc(p.x * scale * depth, p.y * scale * depth, p.size * (w < 300 ? .65 : 1), 0, TAU); c.fill();
      if (p.light > .995) { c.globalAlpha = .1; c.beginPath(); c.arc(p.x * scale * depth, p.y * scale * depth, 4, 0, TAU); c.fill(); }
    }
    c.globalAlpha = .12; c.strokeStyle = this.repo.color; c.lineWidth = .6;
    c.beginPath(); c.ellipse(0, scale * 1.0, scale * 1.08, scale * .19, 0, 0, TAU); c.stroke();
    c.globalAlpha = .07; c.beginPath(); c.ellipse(0, scale * 1.0, scale * 1.35, scale * .25, 0, 0, TAU); c.stroke();
  }
  fluid() {
    const { ctx: c, width: w, height: h, time: t } = this;
    c.globalCompositeOperation = 'screen';
    const colors = ['#b798ef', '#6ac6b6', '#b46fc0'];
    for (let j = 0; j < 3; j++) {
      c.strokeStyle = colors[j];
      for (let k = 0; k < 46; k++) {
        c.globalAlpha = .05 + Math.sin(k / 46 * Math.PI) * .3; c.lineWidth = .8; c.beginPath();
        for (let i = 0; i <= 170; i++) {
          const a = i / 170 * TAU;
          const r = (w * .13 + k * w * .0013) * (1 + .38 * Math.sin(a * 3 + j + t * .3));
          const x = Math.cos(a + j * 2) * r * 1.5 + Math.sin(a * 2 + t * .2) * w * .09;
          const y = Math.sin(a + j * 2) * r * .85 + Math.cos(a * 3 + t * .15) * h * .08;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.closePath(); c.stroke();
      }
    }
    c.globalCompositeOperation = 'source-over';
  }
  orbit() {
    const { ctx: c, width: w, height: h, time: t } = this;
    const r = Math.min(w, h) * .27;
    c.strokeStyle = this.repo.color; c.lineWidth = .65;
    for (let j = 0; j < 16; j++) {
      c.globalAlpha = .25 + j * .022;
      c.beginPath(); c.ellipse(0, 0, r, r * (.15 + j * .047), j * .2 + t * .06, 0, TAU); c.stroke();
    }
    for (let j = 0; j < 3; j++) {
      c.globalAlpha = .23; c.beginPath(); c.ellipse(0, 0, r * (1.4 + j * .13), r * .35, -.4 + j * .7, 0, TAU); c.stroke();
      const a = t * .3 + j * 2, x = Math.cos(a) * r * 1.5, y = Math.sin(a) * r * .8;
      c.globalAlpha = .9; c.fillStyle = this.repo.color; c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill();
    }
  }
  wave() {
    const { ctx: c, width: w, height: h, time: t } = this;
    c.strokeStyle = this.repo.color; c.lineWidth = 1;
    for (let j = 0; j < 38; j++) {
      c.globalAlpha = .15 + Math.sin(j / 38 * Math.PI) * .6; c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const x = (i / 100 - .5) * w * .78;
        const y = Math.sin(i * .065 + t * .4 + j * .085) * h * .13 + (j - 19) * h * .009;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  }
  flow() {
    const { ctx: c, width: w, height: h, time: t } = this;
    c.strokeStyle = this.repo.color; c.lineWidth = .75;
    for (let j = 0; j < 95; j++) {
      c.globalAlpha = .2 + (j % 7) * .06; c.beginPath();
      for (let i = 0; i < 80; i++) {
        const a = i * .06 + j * .065 + t * .12;
        const r = (i / 80) * Math.min(w, h) * .42;
        const x = Math.cos(a + Math.sin(a * 2) * .4) * r * 1.3;
        const y = Math.sin(a) * r;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  }
  burst() {
    const { ctx: c, width: w, height: h, time: t } = this;
    const random = seeded(91); c.fillStyle = this.repo.color;
    for (let i = 0; i < 270; i++) {
      const a = random() * TAU;
      const r = (.12 + random() * .28) * Math.min(w, h) * (1 + Math.sin(t + i * .2) * .07);
      const x = Math.cos(a) * r * 1.5, y = Math.sin(a) * r;
      c.globalAlpha = .2 + random() * .7;
      c.save(); c.translate(x, y); c.rotate(a + t * .1); c.fillRect(0, 0, 1 + random() * 3, 1 + random() * 5); c.restore();
    }
    c.globalAlpha = 1; c.font = `500 ${Math.min(w, h) * .22}px "Space Grotesk", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✦', 0, 0);
  }
  type() {
    const { ctx: c, width: w, height: h, time: t } = this;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${Math.min(w * .24, h * .45)}px "Space Grotesk", sans-serif`;
    for (let j = 12; j > 0; j--) { c.globalAlpha = .03 + j * .015; c.fillStyle = this.repo.color; c.fillText('what if?', Math.sin(t * .5 + j * .15) * 5 + j * 1.5, j * 2); }
    c.globalAlpha = 1; c.fillStyle = this.repo.color; c.fillText('what if?', Math.sin(t * .5) * 5, 0);
  }
  destroy() {
    cancelAnimationFrame(this.frame); this.observer.disconnect(); this.visibility.disconnect();
    this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerleave', this.leave);
  }
}
