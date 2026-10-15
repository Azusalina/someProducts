// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('pdfjs-dist', () => ({ getDocument:vi.fn(), GlobalWorkerOptions:{}, AnnotationMode:{DISABLE:0} }));
import { currentPositions, type SourceMap } from '../src/pdf-view';
import { musicXMLToScore } from '../src/score';

const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><staff>1</staff></note><backup><duration>1</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><staff>2</staff></note></measure><measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><staff>1</staff></note></measure></part></score-partwise>`;
const box = {page:1,x:.2,y:.3,w:.01,h:.01,head:'1',grade:.9};
const mapping: SourceMap = {version:1,mapped:3,total:3,positions:{'P1:0:0':box,'P1:0:1':{...box,head:'2',y:.5},'P1:1:0':{...box,page:2,head:'3'}}};

describe('original PDF note highlighting',()=>{
  it('highlights simultaneous right/left notes by note identity',()=>{
    const positions=currentPositions(musicXMLToScore(xml),mapping,.1);
    expect(positions.map(p=>p.id)).toEqual(['P1:0:1','P1:0:0']);
    expect(positions.every(p=>p.page===1)).toBe(true);
  });
  it('moves a tied sounding note to its next printed head/page',()=>{
    const score=musicXMLToScore(xml);
    expect(score.notes.find(n=>n.midi===60)?.sources).toHaveLength(2);
    expect(currentPositions(score,mapping,.6).map(p=>p.id)).toEqual(['P1:1:0']);
    expect(currentPositions(score,mapping,.6)[0].page).toBe(2);
  });
  it('does not invent a position for an unmatched note or muted hand',()=>{
    const score=musicXMLToScore(xml);
    expect(currentPositions(score,mapping,.1,{left:false,right:true}).map(p=>p.id)).toEqual(['P1:0:0']);
    expect(currentPositions(score,{...mapping,positions:{}},.1)).toEqual([]);
    expect(currentPositions(score,mapping,2)).toEqual([]);
  });
});
