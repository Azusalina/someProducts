import type {PianoPlayer} from './audio';
import {MicrophoneInput} from './microphone';
import {noteName, PitchGate, targetAt, teachingTargets, type PitchReading, type TeachingTarget} from './teaching';
import {applyTuning, centsBetween, equalFrequency, ScaleCalibration, standardTuning, validateTuning, type PianoTuning} from './tuning';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class TeachingMode {
  active = false;
  calibrating = false;
  private listening = false;
  private session = 0;
  private input = new MicrophoneInput();
  private targets: TeachingTarget[] = [];
  private index = 0;
  private correct = 0;
  private skipped = 0;
  private gate = new PitchGate();
  private tuning = standardTuning();
  private calibration?: ScaleCalibration;
  private pendingTuning?: PianoTuning;
  get awaitingCalibration() {return !!this.pendingTuning;}
  private teachAfterCalibration = false;
  private captureTimer?: ReturnType<typeof setTimeout>;
  constructor(private player: PianoPlayer, private changed: () => void,
    private report: (message: string, error?: boolean) => void) {
    element('teaching-start').addEventListener('click', () => {
      if (this.active) this.stop();
      else if (element<HTMLInputElement>('tuning-before').checked) void this.startCalibration(true);
      else void this.start();
    });
    element('teaching-stop').addEventListener('click', () => this.stop());
    element('teaching-skip').addEventListener('click', () => {if (this.listening && !this.calibrating) this.advance(false);});
    element('tuning-start').addEventListener('click', () => this.calibrating ? this.stop() : void this.startCalibration(false));
    for (const id of ['tuning-accept', 'tuning-panel-accept']) element(id).addEventListener('click', () => {
      if (!this.pendingTuning) return;
      const teach = this.teachAfterCalibration;
      if (this.saveTuning(this.pendingTuning)) {this.clearPending(); if (teach) void this.start();}
    });
    element('tuning-discard').addEventListener('click', () => this.stop());
    element('tuning-manual').addEventListener('click', () => {
      this.saveTuning({...this.tuning, a4: Number(element<HTMLInputElement>('tuning-a4').value)});
    });
    element('tuning-reset').addEventListener('click', () => this.saveTuning(standardTuning()));
    const before = element<HTMLInputElement>('tuning-before');
    try {
      const saved = localStorage.getItem('sheetvis.tuning.v1');
      if (saved !== null) this.tuning = validateTuning(JSON.parse(saved));
      before.checked = localStorage.getItem('sheetvis.tuning-before') !== 'false';
    } catch {element('tuning-status').textContent = '保存的校准无效，已使用 A4=440 Hz';}
    before.addEventListener('change', () => {
      try {localStorage.setItem('sheetvis.tuning-before', String(before.checked));} catch {}
    });
    element('tuning-octave').addEventListener('change', () => {if (this.calibrating) this.stop(); this.clearPending();});
    window.addEventListener('pagehide', () => this.stop());
    document.addEventListener('visibilitychange', () => {if (document.hidden && this.active) this.stop('页面已隐藏，麦克风已关闭');});
    for (const id of ['teaching-hold', 'teaching-floor']) {
      const input = element<HTMLInputElement>(id);
      try {const saved = localStorage.getItem(`sheetvis.${id}`); if (saved !== null && Number.isFinite(Number(saved))) input.value = saved;} catch {}
      input.addEventListener('change', () => {
        if (this.calibrating) this.stop('输入条件已更改，请重新采集音阶');
        this.configure(); this.gate.reset();
        try {localStorage.setItem(`sheetvis.${id}`, input.value);} catch {}
      });
    }
    this.configure();
    this.showTuning();
  }
  refresh(disabled: boolean, unavailable = disabled) {
    const start = element<HTMLButtonElement>('teaching-start');
    start.disabled = !this.active && (disabled || !this.player.hands.left && !this.player.hands.right);
    start.textContent = this.active ? (this.calibrating ? '停止校准 · 关闭麦克风' : '停止教学 · 关闭麦克风') : '开始教学 · 麦克风';
    start.setAttribute('aria-pressed', String(this.active));
    element<HTMLButtonElement>('tuning-start').disabled = !this.calibrating && (this.active || unavailable);
    element('tuning-start').textContent = this.calibrating ? '停止采集 · 关闭麦克风' : '采集音阶 · 麦克风';
    for (const id of ['tuning-a4', 'tuning-manual', 'tuning-reset', 'tuning-octave', 'tuning-accept', 'tuning-panel-accept'])
      element<HTMLInputElement>(id).disabled = this.active || unavailable;
    for (const button of element('tuning-notes').querySelectorAll('button')) button.disabled = this.active || unavailable;
  }
  private clearPending() {
    if (this.pendingTuning) element('tuning-status').textContent = '待采用结果已取消，原校准保留';
    this.pendingTuning = undefined; this.teachAfterCalibration = false;
    element('tuning-accept').hidden = true;
    element('tuning-result-panel').hidden = true;
  }
  private showTuning() {
    const count = Object.keys(this.tuning.notes).length;
    element('tuning-profile').textContent = `A4 = ${this.tuning.a4.toFixed(2)} Hz · 已测 ${count} 键`;
    element<HTMLInputElement>('tuning-a4').value = this.tuning.a4.toFixed(2);
    const items = Object.entries(this.tuning.notes).sort(([a], [b]) => Number(a) - Number(b)).map(([key, frequency]) => {
      const li = document.createElement('li'), button = document.createElement('button');
      li.append(`${noteName(Number(key))} · ${frequency.toFixed(2)} Hz `);
      button.textContent = '删除'; button.setAttribute('aria-label', `删除 ${noteName(Number(key))} 校准`);
      button.addEventListener('click', () => {
        const notes = {...this.tuning.notes}; delete notes[key]; this.saveTuning({...this.tuning, notes});
      });
      li.append(button); return li;
    });
    element('tuning-notes').replaceChildren(...items);
  }
  private saveTuning(value: PianoTuning) {
    try {
      const tuning = validateTuning(value);
      this.stop(); this.tuning = tuning; this.clearPending(); this.showTuning();
      let message = '校准已保存在本机，教学按此基准识别';
      try {localStorage.setItem('sheetvis.tuning.v1', JSON.stringify(tuning));} catch {message = '校准仅在本次页面有效：浏览器未允许保存';}
      element('tuning-status').textContent = message;
      this.report('');
      this.changed(); return true;
    } catch (error) {element('tuning-status').textContent = String(error instanceof Error ? error.message : error); return false;}
  }
  private armCaptureTimeout() {
    clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => this.stop('20 秒未采集到稳定单音，麦克风已关闭；请核对琴键、音量后重试'), 20_000);
  }
  async startCalibration(teachAfter: boolean) {
    if (this.active) return;
    this.clearPending(); this.teachAfterCalibration = teachAfter;
    this.player.pause(); this.configure(); this.gate.reset();
    this.calibration = new ScaleCalibration(Number(element<HTMLSelectElement>('tuning-octave').value), this.tuning, this.gate.noiseFloor);
    this.active = true; this.calibrating = true; this.listening = false;
    const session = ++this.session;
    element<HTMLDetailsElement>('tuning-settings').open = true;
    element('teaching-panel').hidden = false; element('teaching-skip').hidden = true;
    element('teaching-status').textContent = '等待麦克风权限…';
    element('teaching-heard').textContent = '—'; element('teaching-level').textContent = '−∞ dBFS';
    element('tuning-status').textContent = '先弹 A4 确定基准，再按提示弹音阶';
    this.showCalibration(0, '等待单音'); this.report(''); this.changed();
    try {
      const started = await this.input.start((reading, now) => this.read(reading, now), message => this.stop(message));
      if (session !== this.session || !this.active || !started) return;
      this.listening = true; this.armCaptureTimeout();
      element('teaching-status').textContent = '麦克风开启 · 音阶校准';
    } catch (error) {
      if (session !== this.session) return;
      this.stop(); const message = error instanceof Error ? error.message : String(error);
      element('tuning-status').textContent = message; this.report(message, true);
    }
  }
  private showCalibration(progress: number, reason: string) {
    const calibration = this.calibration; if (!calibration) return;
    element('teaching-target').textContent = `请弹 ${noteName(calibration.midi)} · 单音保持约 1.2 秒`;
    delete element('teaching-target').dataset.index;
    element('teaching-result').textContent = `${reason} · ${Math.round(progress * 100)}%`;
    element('teaching-count').textContent = `校准 ${calibration.results.length + 1}/${calibration.sequence.length}`;
    element<HTMLProgressElement>('tuning-progress').value = 100 * (calibration.results.length + progress) / calibration.sequence.length;
  }
  private configure() {
    const hold = element<HTMLInputElement>('teaching-hold'), floor = element<HTMLInputElement>('teaching-floor');
    hold.value = String(Math.max(100, Math.min(600, Number(hold.value) || 140)));
    floor.value = String(Math.max(-60, Math.min(-20, Number(floor.value) || -42)));
    this.gate.holdMs = Number(hold.value); this.gate.noiseFloor = 10 ** (Number(floor.value) / 20);
  }
  async start() {
    if (!this.player.score || this.active || !this.player.hands.left && !this.player.hands.right) return;
    this.clearPending(); this.player.pause(); this.configure(); this.gate.reset();
    this.targets = teachingTargets(this.player.score, this.player.hands);
    this.index = targetAt(this.targets, this.player.position);
    if (this.index < 0) {this.report('当前位置后没有可练习的音符，请先回退。'); return;}
    this.correct = 0; this.skipped = 0; this.active = true; this.listening = false;
    this.report('');
    const session = ++this.session;
    element('teaching-panel').hidden = false;
    element('teaching-skip').hidden = false;
    element('teaching-status').textContent = '等待麦克风权限…';
    element('teaching-heard').textContent = '—'; this.showTarget(); this.changed();
    element('teaching-level').textContent = '−∞ dBFS';
    // seek() executes synchronously when paused. Start capture in this gesture.
    void this.player.seek(this.targets[this.index].start);
    try {
      const started = await this.input.start((reading, now) => this.read(reading, now), message => this.stop(message));
      if (session !== this.session || !this.active || !started) return;
      this.listening = true;
      element('teaching-status').textContent = '麦克风开启 · 本机判定';
      element('teaching-summary').textContent = `按实琴基准 A4=${this.tuning.a4.toFixed(2)} Hz 判单音；不判节奏、指法或力度。`;
      this.showTarget();
    } catch (error) {
      if (session !== this.session) return;
      this.stop(); this.report(error instanceof Error ? error.message : String(error), true);
    }
  }
  stop(message = '') {
    const wasActive = this.active, wasCalibrating = this.calibrating;
    clearTimeout(this.captureTimer); this.captureTimer = undefined;
    this.calibrating = false; this.calibration = undefined; this.clearPending();
    this.session++; this.input.stop(); this.active = false; this.listening = false; this.gate.reset();
    element('teaching-panel').hidden = true;
    if (wasActive) element('teaching-summary').textContent = '麦克风已关闭';
    if (message) {element('teaching-summary').textContent = message; this.report(message);}
    if (wasCalibrating) element('tuning-status').textContent = message || '采集已停止，原校准保留';
    this.changed();
  }
  // Manual navigation keeps the explicitly enabled microphone, but invalidates
  // the previous match. No navigation path may start normal piano playback.
  reposition(position: number) {
    if (!this.active || this.calibrating) return;
    this.gate.reset(); this.index = targetAt(this.targets, position);
    if (this.index < 0) {this.stop('已到练习结尾，麦克风已关闭'); return;}
    void this.player.seek(this.targets[this.index].start); this.showTarget();
  }
  private showTarget() {
    const target = this.targets[this.index]; if (!target) return;
    const measure = this.player.score?.measures[target.measure]?.number ?? String(target.measure + 1);
    element('teaching-target').textContent = `第 ${measure} 小节 · ${target.midis.map(noteName).join(' + ')}`;
    element('teaching-target').dataset.index = String(this.index);
    element('teaching-result').textContent = target.unsupported ?? '等待正确音高（±35 cents）';
    element('teaching-count').textContent = `${this.index + 1}/${this.targets.length} · 通过 ${this.correct} · 跳过 ${this.skipped}`;
    element<HTMLButtonElement>('teaching-skip').disabled = !this.listening;
  }
  private read(reading: PitchReading, now: number) {
    if (!this.listening || !this.active) return;
    element('teaching-level').textContent = `${reading.rms > 0 ? Math.round(20 * Math.log10(reading.rms)) : '−∞'} dBFS`;
    if (this.calibrating && this.calibration) {
      element('teaching-heard').textContent = reading.frequency && reading.rms >= this.gate.noiseFloor && reading.clarity >= .95
        ? `${reading.frequency.toFixed(2)} Hz` : '—';
      const result = this.calibration.observe(reading, now);
      if (result.complete) {
        const calibration = this.calibration, teach = this.teachAfterCalibration;
        try {
          const proposal = calibration.proposal();
          const measurements = calibration.results.map(r => {
            const cents = centsBetween(r.frequency, equalFrequency(r.midi));
            return `${noteName(r.midi)} ${cents >= 0 ? '+' : ''}${cents.toFixed(1)}¢`;
          }).join(' · ');
          this.stop(); this.pendingTuning = proposal; this.teachAfterCalibration = teach;
          element<HTMLProgressElement>('tuning-progress').value = 100;
          element('tuning-status').textContent = `采集完成，尚未采用。A4≈${proposal.a4.toFixed(2)} Hz；相对 440 Hz：${measurements}`;
          element('tuning-accept').hidden = false;
          element('tuning-accept').textContent = teach ? '采用并开始教学' : '采用校准';
          element('tuning-result-panel').hidden = false;
          element('tuning-result-summary').textContent = `尚未采用 · A4≈${proposal.a4.toFixed(2)} Hz · ${measurements}`;
          element('tuning-panel-accept').textContent = element('tuning-accept').textContent;
        } catch (error) {
          this.stop(); element('tuning-status').textContent = `未采用：${error instanceof Error ? error.message : String(error)}`;
        }
      } else {
        if (result.advanced) this.armCaptureTimeout();
        this.showCalibration(result.advanced ? 0 : result.progress, result.advanced ? '等待下一个音' : result.reason);
      }
      return;
    }
    reading = applyTuning(reading, this.tuning);
    const target = this.targets[this.index]; if (!target) return;
    const audible = reading.rms >= this.gate.noiseFloor;
    element('teaching-heard').textContent = audible && reading.midi !== null && reading.clarity >= .9
      ? `${noteName(reading.midi)} · ${reading.cents >= 0 ? '+' : ''}${Math.round(reading.cents)} cents${reading.frequency ? ` · ${reading.frequency.toFixed(1)} Hz` : ''}`
      : audible ? '音高不稳定' : '—';
    if (this.gate.observe(reading, target, now)) this.advance(true);
  }
  private advance(correct: boolean) {
    if (correct) this.correct++; else {this.skipped++; this.gate.reset();}
    if (++this.index >= this.targets.length) {
      void this.player.seek(this.player.score?.duration ?? this.player.position);
      this.stop(`本次练习结束：通过 ${this.correct}，手动跳过 ${this.skipped}。麦克风已关闭。`);
      return;
    }
    void this.player.seek(this.targets[this.index].start); this.showTarget(); this.changed();
  }
}
