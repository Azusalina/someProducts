import {Pitch, type OpenSheetMusicDisplay, type VexFlowGraphicalNote} from 'opensheetmusicdisplay';
import type {Score} from './score';
import type {StaffAnchor} from './staff-follow';

/** Bind actual rendered noteheads, not approximate clicks in a whole measure. */
export function bindStaffNotes(display:OpenSheetMusicDisplay,score:Score,anchors:Map<string,StaffAnchor>) {
  const sources=new Map<string,string>();
  const key=(part:string,measure:number,beat:number,midi:number)=>`${part}:${measure}:${beat.toFixed(6)}:${midi}`;
  for(const n of score.notes) for(const s of n.sources ?? []) {
    const anchor=anchors.get(s.id),part=/^(.*):\d+:\d+$/.exec(s.id)?.[1];
    if(anchor && part) sources.set(key(part,anchor.measure,anchor.beat,n.midi),s.id);
  }
  for(const [index,measure] of display.Sheet.SourceMeasures.entries()) {
    for(const container of measure.VerticalSourceStaffEntryContainers) for(const staff of container.StaffEntries) {
      if(!staff)continue;
      for(const voice of staff.VoiceEntries) for(const note of voice.Notes) {
        if(!note.Pitch)continue;
        const midi=(note.Pitch.Octave+Pitch.OctaveXmlDifference+1)*12+note.Pitch.FundamentalNote+note.Pitch.AccidentalHalfTones;
        const source=sources.get(key(note.ParentStaff.ParentInstrument.IdString,index,voice.Timestamp.RealValue,midi));
        if(!source)continue;
        const graphical=display.EngravingRules.GNote(note) as VexFlowGraphicalNote;
        if(!graphical)continue;
        const heads=graphical.getNoteheadSVGs?.() ?? [];
        const head=heads[graphical.vfnoteIndex] ?? (heads.length===1 ? heads[0] : undefined);
        if(!head)continue;
        head.dataset.source=source;head.classList.add('seek-note');
        head.setAttribute('role','button');head.setAttribute('tabindex','0');head.setAttribute('aria-label','从此音符继续播放');
      }
    }
  }
}
