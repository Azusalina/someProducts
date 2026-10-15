import {parseXML, notationDuration, type Score} from './score';

export interface StaffAnchor { measure: number; beat: number }
export function staffAnchors(xml: string): Map<string, StaffAnchor> {
  const doc = parseXML(xml), result = new Map<string, StaffAnchor>();
  for (const part of doc.querySelectorAll('score-partwise > part')) {
    let divisions = 1;
    [...part.children].filter(e => e.localName === 'measure').forEach((measure,index) => {
      let beat = 0, chord = 0, ordinal = -1;
      for (const el of measure.children) {
        const written = el.querySelector(':scope > duration');
        const duration = written ? Number(written.textContent)/divisions : notationDuration(el);
        if (el.localName === 'attributes') {
          const next = Number(el.querySelector('divisions')?.textContent);
          if (next > 0) divisions = next;
        } else if (el.localName === 'backup') beat = Math.max(0,beat-duration);
        else if (el.localName === 'forward') beat += duration;
        else if (el.localName === 'note') {
          ordinal++;
          const isChord = Boolean(el.querySelector(':scope > chord'));
          if (!isChord) chord = beat;
          result.set(`${part.getAttribute('id')}:${index}:${ordinal}`,{measure:index,beat:(isChord ? chord : beat)/4});
          if (!isChord && !el.querySelector('grace')) beat += duration;
        }
      }
    });
  }
  return result;
}

export function currentStaffAnchor(score: Score, anchors: Map<string,StaffAnchor>, time: number, hands: {left:boolean;right:boolean}) {
  let latest = -Infinity, anchor: StaffAnchor | undefined;
  for (const note of score.notes) {
    if (!hands[note.hand]) continue;
    for (const source of note.sources ?? []) {
      if (source.start <= time+.001 && source.start+source.duration > time+.001 && source.start > latest) {
        const next = anchors.get(source.id);
        if (next) {latest=source.start; anchor=next;}
      }
    }
  }
  return anchor;
}

interface StaffCursor {
  Iterator: {EndReached:boolean; CurrentMeasureIndex:number; CurrentRelativeInMeasureTimestamp:{RealValue:number}};
  cursorElement: HTMLElement;
  reset():void; next():void; show():void; hide():void;
}
export function followStaff(cursor: StaffCursor, anchor: StaffAnchor | undefined, pane: HTMLElement) {
  if (!anchor) {cursor.hide();return;}
  const compare = () => cursor.Iterator.CurrentMeasureIndex-anchor.measure || cursor.Iterator.CurrentRelativeInMeasureTimestamp.RealValue-anchor.beat;
  if (cursor.Iterator.EndReached || compare()>1e-7) cursor.reset();
  let steps=0;
  while (!cursor.Iterator.EndReached && compare() < -1e-7 && steps++ < 20000) cursor.next();
  if (cursor.Iterator.EndReached || Math.abs(compare()) > 1e-6) {cursor.hide();return;}
  cursor.show();
  const rect=cursor.cursorElement.getBoundingClientRect(), bounds=pane.getBoundingClientRect();
  // Scroll only the score pane, never the entire app or the waterfall.
  if (rect.top < bounds.top+20 || rect.bottom > bounds.bottom-20)
    pane.scrollTop += rect.top-bounds.top-pane.clientHeight*.3;
  if (rect.left < bounds.left || rect.right > bounds.right)
    pane.scrollLeft += rect.left-bounds.left-pane.clientWidth*.3;
}
