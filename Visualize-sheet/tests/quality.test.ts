// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { qualityFeedback, type RecognitionJob } from '../src/quality';
import type { Score } from '../src/score';
import { validColors } from '../src/waterfall';

const score: Score = { title: 'test', duration: 2, bpm: 120, warnings: [],
  measures: [{ number: '1', index: 0, start: 0, duration: 2, sourceBeat: 0 }],
  notes: [{ id: '0', midi: 60, start: 0, duration: 1, soundDuration: 1, velocity: .8, hand: 'right', measure: 0 },
    { id: '1', midi: 48, start: 0, duration: 1, soundDuration: 1, velocity: .8, hand: 'left', measure: 0 }] };

describe('read feedback', () => {
  it('distinguishes a playable timeline from unverified transcription accuracy', () => {
    const report = qualityFeedback(score, { id: 'a', state: 'done', results: [] });
    expect(report.summary).toContain('结构检查通过');
    expect(report.limit).toContain('准确率未知');
    expect(report.issues).toEqual([]);
  });
  it('exposes notation counts as XML facts rather than accuracy claims', () => {
    const xml = '<score-partwise><part id="P1"><measure><attributes><clef><sign>G</sign><line>2</line></clef></attributes><direction><octave-shift type="down"/></direction><note><time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification><notations><slur type="start"/></notations></note><attributes><clef><sign>F</sign><line>4</line></clef></attributes></measure></part></score-partwise>';
    const report = qualityFeedback({...score,xml});
    expect(report.facts.join(' ')).toContain('八度线 1 · 谱号变更 1 · 连奏线 1');
    expect(report.facts.join(' ')).toContain('五连音 1');
    expect(report.limit).toContain('不等于原谱准确率');
  });
  it('reports engine rhythm and onset diagnostics with source pages', () => {
    const job: RecognitionJob = { id: 'a', state: 'done', results: [], quality: {
      rhythm_issues: [{ page: 3, system: 1, stack: 2 }, { page: 3, system: 2, stack: 5 }], missing_offsets: 4, accuracy: null } };
    const report = qualityFeedback(score, job);
    expect(report.issues.join(' ')).toContain('2 处小节节奏');
    expect(report.issues.join(' ')).toContain('第 3 页');
    expect(report.issues.join(' ')).toContain('4 个和弦');
    expect(report.summary).toContain('待检查');
  });
  it('flags a missing hand, out-of-range notes, and invalid durations', () => {
    const report = qualityFeedback({ ...score, notes: [{ ...score.notes[0], midi: 110, duration: -1 }] });
    expect(report.issues.join(' ')).toContain('播放数据异常');
    expect(report.issues.join(' ')).toContain('超出 88 键');
    expect(report.issues.join(' ')).toContain('单手');
  });
  it('accepts only supported hex colors from configuration and saved settings', () => {
    expect(validColors({ left: '#aabbcc', background: '#123456', right: 'red', unknown: '#ffffff' })).toEqual({ left: '#aabbcc', background: '#123456' });
    expect(validColors(null)).toEqual({});
    expect(validColors({ left: 'url(https://external)' })).toEqual({});
  });
});
