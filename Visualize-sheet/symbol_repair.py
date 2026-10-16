"""Conservative, document-local image checks for clefs and accidentals.

Templates come from already linked symbols in this same score. No pitch/rhythm is
inferred from musical plausibility. Audiveris re-exports the edited symbol graph.
"""
import io
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile


def box(el):
    b=el.find('bounds')
    return tuple(float(b.get(k)) for k in ('x','y','w','h')) if b is not None else None


def staff_y(staff,x):
    """Interpolate each curved staff line at x (not its page-wide bounding box)."""
    values=[]
    for line in staff.findall('lines/line'):
        points=sorted((float(p.get('x','0')),float(p.get('y'))) for p in line.findall('point'))
        if not points:continue
        y=points[0][1]
        for (ax,ay),(bx,by) in zip(points,points[1:]):
            if x>=ax:y=ay+(by-ay)*min(1,max(0,(x-ax)/(bx-ax))) if bx!=ax else ay
        values.append(y)
    return values


def correlation(image,template):
    import numpy as np
    from scipy.signal import correlate
    if any(a<b for a,b in zip(image.shape,template.shape)):return None
    t=template.astype(float); kernel=t-t.mean(); energy=(kernel*kernel).sum()
    if energy<1:return None
    area=correlate(image,np.ones(t.shape),mode='valid',method='fft')
    variance=area-area*area/t.size
    return correlate(image,kernel,mode='valid',method='fft')/np.sqrt(np.maximum(1e-8,variance*energy))


def repair_symbols(project, progress=None, template_project=None):
    try:
        import numpy as np
        from scipy import ndimage
        from PIL import Image
    except ImportError:
        return {'available':False,'repairs':[],'findings':[],'reason':'Pillow, NumPy and SciPy are required'}
    report={'available':True,'repairs':[],'findings':[]};templates=[];sheets=[]
    def collect(archive,keep):
        for name in archive.namelist():
            if not re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name):continue
            sheet=ET.fromstring(archive.read(name));png=name.rsplit('/',1)[0]+'/BINARY.png'
            if png not in archive.namelist():continue
            il=float(sheet.find('scale/interline').get('main'));scale=12/il
            with Image.open(io.BytesIO(archive.read(png)))as im:
                pixels=np.asarray(im.convert('L').resize((round(im.width*scale),round(im.height*scale))))<128
            clean=pixels & ~ndimage.binary_opening(pixels,structure=np.ones((1,60)))
            if keep:sheets.append((name,sheet,clean,il,scale))
            for system in sheet.findall('page/system'):
                staves={st.get('id'):st for st in system.findall('part/staff')};ents={e.get('id'):e for e in system.findall('sig/inters/*')}
                anchors={r.get('source'):ents.get(r.get('target')) for r in system.findall('sig/relations/relation')if r.find('alter-head')is not None}
                for el in ents.values():
                    b=box(el);st=staves.get(el.get('staff'))
                    if b is None or st is None:continue
                    x,y,w,h=b;shape=el.get('shape');kind=el.get('kind')
                    if el.tag=='clef' and kind in ('TREBLE','BASS'):
                        # Smaller in-line clefs have a distinct design. Do not
                        # use huge composite classifier mistakes as templates.
                        if x<float(st.get('left','0'))+5*il or not 1.3<w/il<3.3 or not 2<h/il<7:continue
                        lines=staff_y(st,x+w/2)
                        if len(lines)!=5:continue
                        anchor=(lines[2]+(1 if kind=='TREBLE' else -1)*il-y)*scale
                        category=kind
                    elif el.tag=='alter' and shape in ('NATURAL','SHARP','FLAT','DOUBLE_FLAT','DOUBLE_SHARP'):
                        head=anchors.get(el.get('id'))
                        if head is None or box(head)is None or float(el.get('grade','0'))<.65:continue
                        hb=box(head);anchor=(hb[1]+hb[3]/2-y)*scale;category=shape
                        if not .3<w/il<2 or not 1<h/il<4:continue
                    else:continue
                    px,py,pw,ph=[round(v*scale) for v in b]
                    crop=clean[py:py+ph,px:px+pw].copy()
                    if crop.size:templates.append((category,crop,anchor,float(el.get('ctx-grade',el.get('grade','0')))))
    with zipfile.ZipFile(project) as archive:
        if template_project:
            with zipfile.ZipFile(template_project)as context:collect(context,False)
        collect(archive,True)
        # Bounded pool, retain different widths/heights rather than dozens of
        # identical instances. No external font is assumed to match this PDF.
        pool=[];seen=set()
        for kind,t,anchor,grade in sorted(templates,key=lambda item:-item[3]):
            key=(kind,t.shape,round(anchor/2))
            if key in seen or sum(a[0]==kind for a in pool)>=8:continue
            seen.add(key);pool.append((kind,t,anchor,grade))
        changed={}
        for name,sheet,clean,il,scale in sheets:
            page=int(name.split('/')[0][6:]);dirty=False
            if progress:progress(page)
            def new_id():
                value=int(sheet.get('last-persistent-id','0'))+1;sheet.set('last-persistent-id',str(value));return str(value)
            for system in sheet.findall('page/system'):
                if progress:progress(page)
                inters=system.find('sig/inters');relations=system.find('sig/relations')
                if inters is None or relations is None:continue
                ents={e.get('id'):e for e in inters};heads=[e for e in inters if e.tag=='head'and box(e)]
                linked={r.get('target') for r in relations if r.find('alter-head')is not None}
                originals=[e for e in inters if e.tag=='clef'];recovered=[]
                for part in system.findall('part'):
                    for staff in part.findall('staff'):
                        sid=staff.get('id');left=float(staff.get('left','0'));right=float(staff.get('right',clean.shape[1]/scale))
                        ys=[float(p.get('y'))for p in staff.findall('lines/line/point')]
                        if len(staff.findall('lines/line'))!=5 or not ys:continue
                        top=max(0,round((min(ys)-3*il)*scale));bottom=min(clean.shape[0],round((max(ys)+4*il)*scale));image=clean[top:bottom].astype(float)
                        candidates=[]
                        for kind,t,anchor,_ in pool:
                            if kind not in ('TREBLE','BASS'):continue
                            for factor in (1,):
                                resized=np.asarray(Image.fromarray(t).resize((round(t.shape[1]*factor),round(t.shape[0]*factor))))
                                scores=correlation(image,resized)
                                if scores is None:continue
                                peaks=(scores==ndimage.maximum_filter(scores,size=(7,15)))&(scores>=.72)
                                for py,px in zip(*np.where(peaks)):
                                    x=px/scale;y=(py+top)/scale;w=resized.shape[1]/scale;h=resized.shape[0]/scale
                                    if not left+5*il<x<right-il:continue
                                    lines=staff_y(staff,x+w/2)
                                    if abs(y+anchor*factor/scale-(lines[2]+(il if kind=='TREBLE'else -il)))>.45*il:continue
                                    if any(c.get('staff')==sid and abs(box(c)[0]-x)<il for c in originals):continue
                                    candidates.append((float(scores[py,px]),kind,x,y,w,h))
                        selected=[]
                        for score,kind,x,y,w,h in sorted(candidates,reverse=True):
                            if any(abs(x-b[2])<2*il for b in selected):continue
                            # A true clef is separated from noteheads, rather
                            # than a shape made by several notes/stems together.
                            overlap=[hd for hd in heads if hd.get('staff')==sid and x+.1*w<box(hd)[0]+box(hd)[2]/2<x+.9*w and y<box(hd)[1]+box(hd)[3]/2<y+h]
                            if any(hd.get('shape')!='NOTEHEAD_VOID' or float(hd.get('grade','1'))>=.5 for hd in overlap):continue
                            # Clef loops sometimes become low-grade hollow heads.
                            # Remove only those fully enclosed in a verified clef.
                            for hd in overlap:
                                inters.remove(hd);heads.remove(hd)
                                empty=[]
                                for rel in list(relations):
                                    if hd.get('id')in(rel.get('source'),rel.get('target')):
                                        if rel.find('containment')is not None:empty.append(rel.get('source'))
                                        relations.remove(rel)
                                for cid in empty:
                                    if any(r.get('source')==cid and r.find('containment')is not None for r in relations):continue
                                    chord=ents.get(cid)
                                    if chord is not None and chord in list(inters):inters.remove(chord)
                                    for rel in list(relations):
                                        if cid in(rel.get('source'),rel.get('target')):relations.remove(rel)
                                    for refs in system.findall('part/measure/head-chords'):refs.text=' '.join(v for v in (refs.text or '').split()if v!=cid)
                                    for voice in system.findall('part/measure/voice'):
                                        slots=voice.find('slots')
                                        if slots is not None:
                                            for entry in list(slots):
                                                if entry.find('value')is not None and entry.find('value').get('chord')==cid:slots.remove(entry)
                                report['repairs'].append({'page':page,'system':system.get('id'),'kind':'clef-loop-head','head':hd.get('id'),'reason':'low-grade hollow head enclosed in verified clef'})
                            selected.append((score,kind,x,y,w,h))
                            stack=next((st for st in system.findall('stack')if float(st.get('left'))<=x+w/2<float(st.get('right'))),None)
                            measure=next((m for m in part.findall('measure')if stack is not None and m.get('id')==stack.get('id')),None)
                            if measure is None:continue
                            ident=new_id();clef=ET.SubElement(inters,'clef',{'id':ident,'staff':sid,'kind':kind,'pitch':'2'if kind=='TREBLE'else '-2','shape':'G_CLEF_SMALL'if kind=='TREBLE'else 'F_CLEF_SMALL','grade':str(round(score,3)),'manual':'true','frozen':'true'})
                            ET.SubElement(clef,'bounds',dict(zip(('x','y','w','h'),map(lambda v:str(round(v)),(x,y,w,h)))))
                            refs=measure.find('clefs')
                            if refs is None:refs=ET.SubElement(measure,'clefs')
                            refs.text=((refs.text or '')+' '+ident).strip();originals.append(clef);dirty=True
                            report['repairs'].append({'page':page,'system':system.get('id'),'staff':sid,'stack':stack.get('id'),'kind':kind,'x':round(x),'score':round(score,3),'reason':'document-local inline clef image match'})
                        # Search only immediately left of unmarked noteheads.
                        # This excludes text, key headers and most unrelated ink.
                        for head in (hd for hd in heads if hd.get('staff')==sid and hd.get('id')not in linked):
                            hx,hy,hw,hh=box(head);cy=hy+hh/2
                            if hx<left+7*il:continue
                            matches=[]
                            for kind,t,anchor,_ in pool:
                                if kind in ('TREBLE','BASS'):continue
                                x0=max(0,round((hx-2.2*il)*scale));x1=round((hx+.12*il)*scale)
                                y0=max(0,round(cy*scale-anchor-3));y1=min(clean.shape[0],round(cy*scale-anchor+t.shape[0]+3))
                                scores=correlation(clean[y0:y1,x0:x1].astype(float),t)
                                if scores is None:continue
                                py,px=np.unravel_index(scores.argmax(),scores.shape);score=float(scores[py,px]);x=(x0+px)/scale;y=(y0+py)/scale;w=t.shape[1]/scale;h=t.shape[0]/scale
                                if score<.82 or not -.1*il<hx-x-w<1.3*il or abs((y*scale+anchor)/scale-cy)>.28*il:continue
                                # An existing symbol with an assigned head is
                                # never stolen by a neighbouring chord tone.
                                if any(a.tag in ('alter','key-alter')and box(a)and abs(box(a)[0]-x)<.6*il and abs(box(a)[1]-y)<il for a in inters):continue
                                matches.append((score,kind,x,y,w,h))
                            matches.sort(reverse=True)
                            if not matches:continue
                            score,kind,x,y,w,h=matches[0]
                            if any(other[1]!=kind and score-other[0]<.06 for other in matches[1:]):continue
                            if any(abs(x-a[2])<.7*il and abs(y-a[3])<il for a in recovered):continue
                            ident=new_id();alter=ET.SubElement(inters,'alter',{'id':ident,'staff':sid,'pitch':head.get('pitch','0'),'shape':kind,'grade':str(round(score,3)),'manual':'true','frozen':'true'})
                            ET.SubElement(alter,'bounds',dict(zip(('x','y','w','h'),map(lambda v:str(round(v)),(x,y,w,h)))))
                            rel=ET.SubElement(relations,'relation',{'source':ident,'target':head.get('id')});ET.SubElement(rel,'alter-head',{'grade':str(round(score,3))})
                            linked.add(head.get('id'));recovered.append((score,kind,x,y,w,h));dirty=True
                            report['repairs'].append({'page':page,'system':system.get('id'),'staff':sid,'head':head.get('id'),'kind':kind,'x':round(x),'y':round(y),'score':round(score,3),'reason':'document-local accidental image match'})
                for clef in list(originals):
                    b=box(clef)
                    if clef.get('kind')not in ('BARITONE','BASS')or not b or b[3]<7*il or clef.get('manual')=='true':continue
                    # A composite F-clef mistake can have swallowed its heads,
                    # so verify the two natural glyphs directly in the image.
                    matches=[]
                    bx,by,bw,bh=[round(v*scale)for v in b]
                    pad=round(.5*il*scale)
                    image=clean[max(0,by-pad):by+bh+pad,max(0,bx-pad):bx+bw+pad].astype(float)
                    for kind,t,anchor,_ in pool:
                        if kind!='NATURAL':continue
                        scores=correlation(image,t)
                        if scores is None:continue
                        peaks=(scores==ndimage.maximum_filter(scores,size=(15,9)))&(scores>=.79)
                        for py,px in zip(*np.where(peaks)):
                            point=(px/scale,py/scale)
                            if not any(abs(point[1]-p[1])<il for p in matches):matches.append(point)
                    if len(matches)<2 or max(p[0]for p in matches)-min(p[0]for p in matches)>.6*il:continue
                    report['findings'].append({'page':page,'system':system.get('id'),'staff':clef.get('staff'),'x':round(b[0]),'reason':'natural signs in false clef; associated chord may have been lost before export'})
                    inters.remove(clef)
                    for refs in system.findall('part/measure/clefs'):refs.text=' '.join(v for v in (refs.text or '').split()if v!=clef.get('id'))
                    for rel in list(relations):
                        if clef.get('id')in(rel.get('source'),rel.get('target')):relations.remove(rel)
                    report['repairs'].append({'page':page,'system':system.get('id'),'kind':'false-clef','x':round(b[0]),'reason':'oversized F-clef composite contains two independently matched natural signs'})
                    dirty=True
            if dirty:
                for system in sheet.findall('page/system'):
                    by_id={e.get('id'):e for e in system.findall('sig/inters/*')}
                    for refs in system.findall('part/measure/clefs'):
                        refs.text=' '.join(sorted((refs.text or '').split(),key=lambda i:box(by_id[i])[0]))
                    for measure in system.findall('part/measure'):
                        for voice in list(measure.findall('voice')):
                            if voice.find('slots')is not None and not any(e.find('value')is not None and e.find('value').get('status')=='BEGIN'for e in voice.findall('slots/entry')):measure.remove(voice)
                changed[name]=ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
        if changed:
            temp=Path(project).with_suffix('.omr.part')
            with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED)as output:
                for entry in archive.infolist():output.writestr(entry,changed.get(entry.filename,archive.read(entry)))
    if changed:temp.replace(project)
    return report


def audit_export(project,files):
    """Expose physical heads missing from export, without inventing their time."""
    from omr_support import source_map
    mapped=set()
    for index,path in enumerate(files):
        mapping=source_map(project,path,index)
        mapped.update((p['page'],p['head'])for p in mapping['positions'].values())
    findings=[];accidentals=[];total=0
    with zipfile.ZipFile(project)as archive:
        for name in archive.namelist():
            if not re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name):continue
            sheet=ET.fromstring(archive.read(name));page=int(name.split('/')[0][6:])
            for system in sheet.findall('page/system'):
                il=float(sheet.find('scale/interline').get('main'))
                for alter in system.findall('sig/inters/alter'):
                    b=box(alter)
                    if not b:continue
                    if b[3]>4.2*il or float(alter.get('grade','1'))<.6:
                        accidentals.append({'page':page,'system':system.get('id'),'staff':alter.get('staff'),'symbol':alter.get('id'),'shape':alter.get('shape'),'x':round(b[0]),'y':round(b[1]),'reason':'oversized_accidental'if b[3]>4.2*il else 'weak_classifier_match'})
                chords={r.get('target'):r.get('source')for r in system.findall('sig/relations/relation')if r.find('containment')is not None}
                measures={cid:measure.get('id')for measure in system.findall('part/measure')for cid in measure.findtext('head-chords','').split()}
                for head in system.findall('sig/inters/head'):
                    if head.get('shape','').endswith('_SMALL'):continue
                    total+=1
                    if (page,head.get('id'))in mapped:continue
                    b=box(head)
                    findings.append({'page':page,'system':system.get('id'),'stack':measures.get(chords.get(head.get('id'))),'head':head.get('id'),'staff':head.get('staff'),'x':round(b[0])if b else None,'y':round(b[1])if b else None,'reason':'recognized_head_not_located_in_export'})
    return {'physical_heads':total,'mapped_heads':len(mapped),'unexported_heads':findings,'ambiguous_accidentals':accidentals}
