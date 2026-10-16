"""Reconnect short broken stems inside an otherwise established beam group."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile
from symbol_repair import box


def repair_beam_links(project):
    repairs=[];changed={}
    with zipfile.ZipFile(project)as archive:
        for name in archive.namelist():
            if not re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name):continue
            sheet=ET.fromstring(archive.read(name));scale=sheet.find('scale/interline')
            if scale is None:continue
            il=float(scale.get('main'));dirty=False;page=int(name.split('/')[0][6:])
            for system in sheet.findall('page/system'):
                entities={e.get('id'):e for e in system.findall('sig/inters/*')};rels=system.find('sig/relations')
                if rels is None:continue
                stem_chords={r.get('target'):r.get('source')for r in rels if r.find('chord-stem')is not None}
                members={cid:[entities[r.get('target')]for r in rels if r.get('source')==cid and r.find('containment')is not None and r.get('target')in entities]for cid in stem_chords.values()}
                def staff(stem):
                    heads=members.get(stem_chords.get(stem),[]);ids={h.get('staff')for h in heads}
                    return next(iter(ids))if len(ids)==1 else None
                linked={r.get('target')for r in rels if r.find('beam-stem')is not None}
                voiced={entry.find('value').get('chord')for entry in system.findall('part/measure/voice/slots/entry')if entry.find('value')is not None and entry.find('value').get('status')=='BEGIN'}
                for stem_id,cid in stem_chords.items():
                    stem=entities.get(stem_id);heads=members.get(cid,[])
                    if cid in voiced or stem_id in linked or stem is None or not heads or any(h.tag!='head'or h.get('shape')!='NOTEHEAD_BLACK'for h in heads):continue
                    b=box(stem)
                    if b is None or staff(stem_id)is None:continue
                    x=b[0]+b[2]/2;hy=sum(box(h)[1]+box(h)[3]/2 for h in heads)/len(heads);options=[]
                    for beam in (e for e in entities.values()if e.tag=='beam'):
                        p1=beam.find('median/p1');p2=beam.find('median/p2')
                        if p1 is None or p2 is None:continue
                        ax,ay=float(p1.get('x')),float(p1.get('y'));bx,by=float(p2.get('x')),float(p2.get('y'))
                        if not ax+.5*il<x<bx-.5*il:continue
                        y=ay+(by-ay)*(x-ax)/(bx-ax);up=hy>y;tail=b[1]if up else b[1]+b[3];half=float(beam.get('height','0'))/2
                        gap=max(0,abs(tail-y)-half)
                        if gap>.65*il or (up and tail>hy-il)or(not up and tail<hy+il):continue
                        anchors=[r.get('target')for r in rels if r.get('source')==beam.get('id')and r.find('beam-stem')is not None]
                        xs=[box(entities[s])[0]+box(entities[s])[2]/2 for s in anchors if s in entities and box(entities[s])and staff(s)==staff(stem_id)]
                        left=[a for a in xs if 0<x-a<6*il];right=[a for a in xs if 0<a-x<6*il]
                        if left and right:options.append((gap,beam,y))
                    # Multiple beam levels would change the duration differently;
                    # defer that ambiguity rather than pick an arbitrary level.
                    if len(options)!=1:continue
                    gap,beam,y=options[0];r=ET.SubElement(rels,'relation',{'source':beam.get('id'),'target':stem_id});link=ET.SubElement(r,'beam-stem',{'beam-portion':'CENTER','dx':'0','dy':str(round(gap/il,3)),'grade':'0.8'})
                    ET.SubElement(link,'extension-point',{'x':str(round(x,2)),'y':str(round(y,2))});linked.add(stem_id);dirty=True
                    repairs.append({'page':page,'system':system.get('id'),'chord':cid,'stem':stem_id,'beam':beam.get('id'),'heads':len(heads),'gap_interline':round(gap/il,3),'reason':'short broken stem between two linked stems on same staff'})
            if dirty:changed[name]=ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
        if changed:
            book=ET.fromstring(archive.read('book.xml'));affected={r['page']for r in repairs}
            for stub in book.findall('sheet'):
                if int(stub.get('number'))not in affected:continue
                steps=stub.find('steps')
                if steps is not None:steps.text=' '.join(v for v in steps.text.split()if v not in ('RHYTHMS','PAGE'))
            changed['book.xml']=ET.tostring(book,encoding='utf-8',xml_declaration=True);temp=Path(project).with_suffix('.omr.part')
            with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED)as output:
                for entry in archive.infolist():output.writestr(entry,changed.get(entry.filename,archive.read(entry)))
    if changed:temp.replace(project)
    return repairs


def repair_repeated_tuplets(project):
    """Continue explicitly established 6:4 eighth-note patterns, not arbitrary ratios.

    Requires complete six-chord single-beam groups covering exactly the staff's
    measure, a previously printed six-tuplet on that staff/part, and agreement
    between corrected duration and the independently recognized meter.
    """
    from fractions import Fraction
    repairs=[];changed={};evidence={};meters={}
    with zipfile.ZipFile(project)as archive:
        names=sorted((n for n in archive.namelist()if re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',n)),key=lambda n:int(n.split('#')[1].split('/')[0]))
        for name in names:
            sheet=ET.fromstring(archive.read(name));dirty=False;page=int(name.split('#')[1].split('/')[0]);scale=sheet.find('scale/interline')
            if scale is None:continue
            il=float(scale.get('main'))
            for system in sheet.findall('page/system'):
                inters=system.find('sig/inters');relations=system.find('sig/relations')
                if inters is None or relations is None:continue
                entities={e.get('id'):e for e in inters};rels=list(relations)
                members={}
                for r in rels:
                    if r.find('containment')is not None and r.get('target')in entities:members.setdefault(r.get('source'),[]).append(entities[r.get('target')])
                stem_chord={r.get('target'):r.get('source')for r in rels if r.find('chord-stem')is not None}
                chord_stem={c:s for s,c in stem_chord.items()};stem_beams={}
                for r in rels:
                    if r.find('beam-stem')is not None:stem_beams.setdefault(r.get('target'),[]).append(r.get('source'))
                tupled={r.get('source'):r.get('target')for r in rels if r.find('chord-tuplet')is not None}
                altered={v for r in rels if len(r)and any(t in r[0].tag for t in ('augmentation','flag','tremolo')) for v in (r.get('source'),r.get('target'))}
                def staff(cid):
                    hs=members.get(cid,[]);staves={h.get('staff')for h in hs if h.tag=='head'}
                    return next(iter(staves))if len(staves)==1 else None
                for part in system.findall('part'):
                    pid=part.get('id');staves=part.findall('staff');ordinal={s.get('id'):i for i,s in enumerate(staves)}
                    for measure in part.findall('measure'):
                        stack=next((s for s in system.findall('stack')if s.get('id')==measure.get('id')),None)
                        time=entities.get(measure.findtext('time',''))
                        if time is not None and time.get('time-rational'):
                            new=Fraction(time.get('time-rational'))
                            if meters.get(pid)!=new:
                                evidence={k:v for k,v in evidence.items()if k[0]!=pid};meters[pid]=new
                        expected=Fraction(stack.get('expected'))if stack is not None and stack.get('expected')else meters.get(pid)
                        ids=measure.findtext('head-chords','').split()
                        for sid,si in ordinal.items():
                            key=(pid,si);chords=[c for c in ids if staff(c)==sid]
                            explicit=[entities.get(tupled.get(c))for c in chords if c in tupled]
                            if any(t is not None and t.get('shape')=='TUPLET_SIX'and t.get('implicit')!='true'and(t.get('glyph')or t.get('manual')!='true')for t in explicit):evidence[key]=expected
                            if not chords or expected is None or evidence.get(key)!=expected:continue
                            if any(c in tupled for c in chords):continue
                            if any(members.get(c)and any(h.tag!='head'or h.get('shape')!='NOTEHEAD_BLACK'for h in members[c])for c in chords):continue
                            if any(c not in chord_stem or len(stem_beams.get(chord_stem[c],[]))!=1 for c in chords):continue
                            if any(c in altered or chord_stem[c]in altered or any(h.get('id')in altered for h in members[c])for c in chords):continue
                            groups={}
                            for c in chords:groups.setdefault(stem_beams[chord_stem[c]][0],[]).append(c)
                            if any(len(g)!=6 for g in groups.values())or Fraction(len(chords),12)!=expected:continue
                            ranges=sorted((min(box(entities[c])[0]for c in g),max(box(entities[c])[0]for c in g))for g in groups.values())
                            if any(a[1]>=b[0]for a,b in zip(ranges,ranges[1:])):continue
                            # Cross-measure or shared beams cannot authorize a new group.
                            if any({stem_chord[s]for s,bs in stem_beams.items()if beam in bs and s in stem_chord}!=set(g)for beam,g in groups.items()):continue
                            if any(entities.get(c)is not None and entities[c].get('staff')==sid for c in measure.findtext('rest-chords','').split()):continue
                            for beam,group in groups.items():
                                ident=str(int(sheet.get('last-persistent-id','0'))+1);sheet.set('last-persistent-id',ident)
                                b=box(entities[beam]);x=b[0]+b[2]/2;y=b[1]+b[3]+il
                                # The engine deletes all implicit=True tuplets
                                # when restarting RHYTHMS. Preserve these bounded
                                # source-supported groups as frozen relations.
                                tuplet=ET.SubElement(inters,'tuplet',{'id':ident,'shape':'TUPLET_SIX','staff':sid,'manual':'true','frozen':'true','grade':'1'})
                                ET.SubElement(tuplet,'bounds',{'x':str(round(x-.4*il)),'y':str(round(y)),'w':str(round(.8*il)),'h':str(round(il))})
                                for cid in group:
                                    r=ET.SubElement(relations,'relation',{'source':cid,'target':ident});ET.SubElement(r,'chord-tuplet',{'manual':'true','grade':'1'})
                                repairs.append({'page':page,'system':system.get('id'),'stack':measure.get('id'),'staff':sid,'tuplet':ident,'chords':group,'ratio':'6:4','reason':'printed sextuplet context, complete single-beam groups and meter agreement'})
                                dirty=True
            if dirty:changed[name]=ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
        if changed:
            book=ET.fromstring(archive.read('book.xml'));affected={r['page']for r in repairs}
            for stub in book.findall('sheet'):
                if int(stub.get('number'))in affected:
                    steps=stub.find('steps')
                    if steps is not None:steps.text=' '.join(v for v in steps.text.split()if v not in ('RHYTHMS','PAGE'))
            changed['book.xml']=ET.tostring(book,encoding='utf-8',xml_declaration=True);temp=Path(project).with_suffix('.omr.part')
            with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED)as output:
                for entry in archive.infolist():output.writestr(entry,changed.get(entry.filename,archive.read(entry)))
    if changed:temp.replace(project)
    return repairs


def audit_rhythm(files,initial_meter=None):
    """Report exported timing inconsistencies; never erase written rests.

    Durations are quarter-note beats, not seconds or an accuracy percentage.
    """
    from fractions import Fraction as F
    from omr_support import read_musicxml
    overfull=[];gaps=[];missing=[]
    for result,path in enumerate(files):
        xml=read_musicxml(path)
        for part in xml.findall('part'):
            divisions=F(1)
            try:meter=F(initial_meter)*4 if initial_meter else None
            except(ValueError,ZeroDivisionError):meter=None
            for mi,measure in enumerate(part.findall('measure')):
                cursor=F(0);extent=F(0);previous=F(0);sounds=[];rests=[];forwards=[]
                for el in measure:
                    if el.tag=='attributes':
                        if el.find('divisions')is not None:divisions=F(el.findtext('divisions'))
                        time=el.find('time')
                        if time is not None:
                            try:meter=F(time.findtext('beats'))*4/F(time.findtext('beat-type'))
                            except (ValueError,TypeError,ZeroDivisionError):meter=None
                    elif el.tag in ('backup','forward'):
                        duration=F(el.findtext('duration','0'))/divisions
                        if el.tag=='backup':cursor-=duration
                        else:forwards.append((cursor,cursor+duration));cursor+=duration
                        extent=max(extent,cursor)
                    elif el.tag=='note'and el.find('grace')is None:
                        duration=F(el.findtext('duration','0'))/divisions;onset=previous if el.find('chord')is not None else cursor
                        if el.find('chord')is None:previous=onset;cursor+=duration
                        extent=max(extent,cursor,onset+duration)
                        (sounds if el.find('pitch')is not None else rests).append((onset,onset+duration))
                location={'result':result,'part':part.get('id'),'measure_index':mi,'measure':measure.get('number')}
                if meter is None:missing.append(location)
                if meter and extent>meter:overfull.append({**location,'expected_beats':float(meter),'actual_beats':float(extent)})
                if not sounds:continue
                end=F(0)
                for start,finish in sorted(sounds)+[(extent,extent)]:
                    if start-end>=F(1,4):
                        gaps.append({**location,'start_beat':float(end),'duration_beats':float(start-end),'written_rest':any(a<start and b>end for a,b in rests),'forward':any(a<start and b>end for a,b in forwards)})
                    end=max(end,finish)
    return {'overfull_measures':overfull,'silent_gaps':gaps,'missing_meter_measures':missing,'initial_meter':initial_meter,'unit':'quarter-note beats','accuracy':None}
