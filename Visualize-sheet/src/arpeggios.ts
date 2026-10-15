import type {NoteEvent, MeasureEvent} from './score';

/** Interpret the wavy arpeggiation sign; never infer it from ordinary chords. */
export function realizeArpeggios(part: Element, notes: NoteEvent[], measures: MeasureEvent[], warnings: Set<string>) {
  if (!part.querySelector('arpeggiate')) return;
  const written=[...part.children].filter(e=>e.localName==='measure');
  for (const [occurrence, measure] of measures.entries()) {
    const bySource=new Map<string,NoteEvent>();
    for (const event of notes.filter(n=>n.measure===occurrence)) for (const source of event.sources ?? []) bySource.set(source.id,event);
    const groups=new Map<string,{notes:Set<NoteEvent>; directions:Set<string>; invalid:boolean}>();
    const blocks:Element[][]=[];
    for (const n of written[measure.index]?.querySelectorAll(':scope > note') ?? []) {
      if (!n.querySelector(':scope > chord') || !blocks.length) blocks.push([]);
      blocks.at(-1)!.push(n);
    }
    let ordinal=0;
    for (const block of blocks) {
      const ids=block.map((_,i)=>`${part.getAttribute('id')}:${measure.index}:${ordinal+i}`);ordinal+=block.length;
      const marks=block.flatMap(n=>[...n.querySelectorAll('notations > arpeggiate')]);
      if (!marks.length) continue;
      const events=ids.map(id=>bySource.get(id)).filter((n):n is NoteEvent=>!!n);
      if (!events.length) continue;
      const start=events[0].start, mark=marks[0];
      const key=`${start}:${mark.hasAttribute('number') ? `number:${mark.getAttribute('number')}` : `staff:${block[0].querySelector('staff')?.textContent ?? '1'}:voice:${block[0].querySelector('voice')?.textContent ?? '1'}`}`;
      const group=groups.get(key) ?? {notes:new Set<NoteEvent>(),directions:new Set<string>(),invalid:false};
      group.invalid ||= block.some(n=>!!n.querySelector('non-arpeggiate, grace')) || events.some(n=>!ids.includes(n.sources?.[0]?.id ?? ''));
      for(const event of events) group.notes.add(event);
      for(const m of marks) if(m.hasAttribute('direction')) group.directions.add(m.getAttribute('direction')!);
      groups.set(key,group);
    }
    for (const group of groups.values()) {
      if (group.invalid || group.directions.size>1 || [...group.directions].some(d=>!['up','down'].includes(d))) {
        warnings.add('部分琶音涉及延音续音、冲突方向或非琶音标记，保留原起奏，需核对原谱。');continue;
      }
      const events=[...group.notes].sort((a,b)=>a.midi-b.midi);
      if (events.length<2) continue;
      if (group.directions.has('down')) events.reverse();
      const minimum=Math.min(...events.map(n=>n.duration));
      const step=Math.min(.035,.18/(events.length-1),minimum*.45/(events.length-1));
      for(const [index,n] of events.entries()) {
        const delay=index*step;n.start+=delay;n.duration-=delay;n.soundDuration=Math.max(n.duration,n.soundDuration-delay);n.decoration='arpeggio';
        if(n.sources?.length) {n.sources[0].start+=delay;n.sources[0].duration-=delay;}
      }
      warnings.add('琶音按标记方向分散起奏，保持和弦原结束位置；展开速度为近似奏法。');
    }
  }
}
