// @vitest-environment jsdom
import {test,expect} from 'vitest';
import {musicXMLToScore} from '../src/score';
const note=(step:string,mark='',chord=false,staff=1)=>`<note>${chord?'<chord/>':''}<pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>${staff}</staff><notations>${mark}</notations></note>`;
const wrap=(body:string)=>`<score-partwise><part id="P1"><measure number="1" implicit="yes"><attributes><divisions>4</divisions></attributes>${body}</measure></part></score-partwise>`;
test('ascending arpeggio rolls chord attacks without extending the bar',()=>{
 const s=musicXMLToScore(wrap(note('C','<arpeggiate/>')+note('E','',true)+note('G','<arpeggiate/>',true)));
 expect(s.notes.map(n=>n.midi)).toEqual([60,64,67]);expect(s.notes.map(n=>n.start)).toEqual([0,.035,.07]);
 expect(s.duration).toBe(.5);for(const n of s.notes){expect(n.start+n.duration).toBeCloseTo(.5);expect(n.sources![0].start).toBe(n.start);}
});
test('descending arpeggio retains separate attacks and direction',()=>{
 const s=musicXMLToScore(wrap(note('C','<arpeggiate direction="down"/>')+note('E','',true)+note('G','<arpeggiate direction="down"/>',true)));
 expect(s.notes.map(n=>n.midi)).toEqual([67,64,60]);expect(s.notes.every(n=>n.duration>0)).toBe(true);
});
test('ordinary and non-arpeggiated chords stay simultaneous',()=>{
 const s=musicXMLToScore(wrap(note('C')+note('E','<non-arpeggiate type="top"/>',true)));
 expect(s.notes.map(n=>n.start)).toEqual([0,0]);
});
test('arpeggio numbering joins marked staves but leaves unrelated chord separate',()=>{
 const mark='<arpeggiate number="1"/>';
 const s=musicXMLToScore(wrap(note('C',mark)+note('E',mark,true)+'<backup><duration>4</duration></backup>'+note('G',mark,false,2)));
 expect(s.notes.map(n=>n.start)).toEqual([0,.035,.07]);expect(s.notes.at(-1)!.hand).toBe('left');
});
test('short arpeggios remain within their written duration and preserve rests',()=>{
 const s=musicXMLToScore(wrap((note('C','<arpeggiate/>')+note('E','',true)+note('G','<arpeggiate/>',true)).replaceAll('<duration>4','<duration>0.1')+'<note><rest/><duration>4</duration></note>'+note('D')));
 expect(s.notes.slice(0,3).every(n=>n.duration>0&&n.start+n.duration<.013)).toBe(true);
 expect(s.notes.at(-1)!.start).toBeCloseTo(.5125);
});
