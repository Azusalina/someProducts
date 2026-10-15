// @vitest-environment jsdom
import {test,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {extractMusicXML,musicXMLToScore} from '../src/score';
import {qualityFeedback} from '../src/quality';

// Opt-in regression against the retained local Chopin OMR checkpoint. No PDF
// re-recognition or engine process is started by this test.
test.skipIf(!process.env.SHEETVIS_REFERENCE_MXL)('retained Chopin export keeps notes and timing with notation support', () => {
  const bytes = readFileSync(process.env.SHEETVIS_REFERENCE_MXL!);
  const xml = extractMusicXML(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const score = musicXMLToScore(xml);
  expect(score.notes).toHaveLength(4909); // Four principal attacks become 30 ornament attacks.
  expect(score.notes.filter(n => n.decoration === 'ornament')).toHaveLength(30);
  const plain = musicXMLToScore(xml.replace(/<ornaments\b[^>]*>[\s\S]*?<\/ornaments>/g,''));
  expect(plain.notes).toHaveLength(4883);
  const decorated = new Set(score.notes.filter(n => n.decoration).flatMap(n => n.sources?.map(s => s.id) ?? []));
  expect(score.notes.filter(n => !n.decoration)).toEqual(plain.notes.filter(n => !n.sources?.some(s => decorated.has(s.id))).map(n => n));
  expect(score.measures).toHaveLength(262);
  expect(score.duration).toBeCloseTo(750.9583333333333);
  expect(score.notes.every(n => Number.isFinite(n.midi+n.start+n.duration+n.soundDuration))).toBe(true);
  expect(score.notes.some(n => n.soundDuration > n.duration+.001)).toBe(true);
  expect(score.warnings.join(' ')).toContain('八度线缺少配对');
  writeFileSync('test-results/notation-reference.json',JSON.stringify({
    notes:score.notes.length, measures:score.measures.length,duration:score.duration,
    extendedNotes:score.notes.filter(n => n.soundDuration > n.duration+.001).length,
    ...qualityFeedback(score)
  },null,2));
},30000);
