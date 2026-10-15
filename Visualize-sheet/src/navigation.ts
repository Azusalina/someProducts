import type {Score} from './score';
import type {SourceMap} from './pdf-view';

/** Repeats share a printed source. Pick the closest played occurrence. */
export function sourceTime(score:Score,id:string,position:number) {
  const occurrences=new Map<number,number>();
  for(const n of score.notes) for(const s of n.sources ?? []) if(s.id===id)
    occurrences.set(n.measure,Math.min(occurrences.get(n.measure) ?? Infinity,s.start));
  return [...occurrences.values()].sort((a,b)=>Math.abs(a-position)-Math.abs(b-position)||b-a)[0];
}
export function pdfSourceAt(mapping:SourceMap|null,page:number,x:number,y:number,width:number,height:number) {
  if(!mapping || width<=0 || height<=0)return undefined;
  const hits=Object.entries(mapping.positions).filter(([,p])=>p.page===page &&
    x>=p.x*width-6 && x<=(p.x+p.w)*width+6 && y>=p.y*height-6 && y<=(p.y+p.h)*height+6);
  hits.sort(([,a],[,b])=>Math.hypot(x-(a.x+a.w/2)*width,y-(a.y+a.h/2)*height)-Math.hypot(x-(b.x+b.w/2)*width,y-(b.y+b.h/2)*height));
  return hits[0]?.[0];
}
export function wheelSeconds(delta:number,mode:number,height:number) {
  const pixels=delta*(mode===1 ? 16 : mode===2 ? height : 1);
  return Math.max(-5,Math.min(5,pixels*.005));
}
