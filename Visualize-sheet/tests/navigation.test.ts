import {test,expect} from 'vitest';
import {sourceTime,pdfSourceAt,wheelSeconds} from '../src/navigation';
import type {Score} from '../src/score';
const score={notes:[{measure:0,sources:[{id:'a',start:1,duration:.1}]},{measure:0,sources:[{id:'a',start:1.1,duration:.1}]},{measure:3,sources:[{id:'a',start:8,duration:.1}]}]} as Score;
test('source seeks use the nearest repeat occurrence and the start of an ornament',()=>{
 expect(sourceTime(score,'a',1.15)).toBe(1);expect(sourceTime(score,'a',7)).toBe(8);expect(sourceTime(score,'missing',0)).toBeUndefined();
});
test('PDF clicks require a nearby physical head on the shown page',()=>{
 const map={version:4,mapped:1,total:1,positions:{a:{page:2,x:.2,y:.3,w:.02,h:.01,head:'1',grade:1}}};
 expect(pdfSourceAt(map,2,210,305,1000,1000)).toBe('a');expect(pdfSourceAt(map,1,210,305,1000,1000)).toBeUndefined();expect(pdfSourceAt(map,2,900,900,1000,1000)).toBeUndefined();
});
test('wheel normalizes pixel/line/page units and bounds large changes',()=>{
 expect(wheelSeconds(100,0,700)).toBe(.5);expect(wheelSeconds(-3,1,700)).toBe(-.24);expect(wheelSeconds(1,2,700)).toBe(3.5);expect(wheelSeconds(99999,0,700)).toBe(5);
});
