"""Conservative cross-system curve recovery from OMR physical endpoints.

No note, pitch, duration or onset is created or changed. Missing curves with no
physical evidence remain unresolved. Geometry proposals require unique matches.
"""
from collections import defaultdict
from fractions import Fraction
import re
import xml.etree.ElementTree as ET
import zipfile
from omr_support import read_musicxml, source_map


def write_xml(path, root):
    data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    temp = path.with_suffix(path.suffix+'.part')
    try:
        if path.suffix == '.mxl':
            with zipfile.ZipFile(path) as source, zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as target:
                container=ET.fromstring(source.read('META-INF/container.xml'))
                entry=next(e.get('full-path') for e in container.iter() if e.tag.split('}')[-1]=='rootfile')
                for item in source.infolist():target.writestr(item,data if item.filename==entry else source.read(item))
        else:temp.write_bytes(data)
        temp.replace(path)
    finally:temp.unlink(missing_ok=True)


def recover_curves(project, path, score_index=0):
    root=read_musicxml(path); mapping=source_map(project,path,score_index)
    physical=defaultdict(list); notes={}; timing={}; clock=Fraction(0)
    for part in root.findall('part'):
        clock=Fraction(0);divisions=Fraction(1);meter=Fraction(0)
        for mi,m in enumerate(part.findall('measure')):
            cursor=chord=extent=Fraction(0);ni=0
            for node in m:
                if node.tag=='attributes':
                    divisions=Fraction(node.findtext('divisions',str(divisions)))
                    if divisions<=0:raise ValueError('Invalid divisions in curve timing')
                    time=node.find('time')
                    if time is not None and time.find('beats')is not None:
                        meter=sum(Fraction(v)for v in time.findtext('beats').split('+'))*4/Fraction(time.findtext('beat-type'))
                elif node.tag in ('backup','forward'):
                    cursor+=Fraction(node.findtext('duration','0'))/divisions*(-1 if node.tag=='backup' else 1)
                    extent=max(extent,cursor)
                elif node.tag=='note':
                    key=f"{part.get('id')}:{mi}:{ni}";ni+=1;notes[key]=node
                    p=mapping['positions'].get(key)
                    if p:physical[(p['page'],p['head'])].append(key)
                    duration=Fraction(node.findtext('duration','0'))/divisions if node.find('grace')is None else Fraction(0)
                    onset=chord if node.find('chord')is not None else cursor
                    if node.find('chord')is None:chord=cursor;cursor+=duration
                    timing[key]=(clock+onset,duration);extent=max(extent,onset+duration)
            pickup=mi==0 and 0<extent<meter
            clock+=extent if m.get('implicit')=='yes'or pickup else max(extent,meter)
    systems=[];curves={};findings=[]
    with zipfile.ZipFile(project)as archive:
        names=sorted((n for n in archive.namelist()if re.fullmatch(r'sheet#(\d+)/sheet#\1.xml',n)),key=lambda n:int(n.split('/')[0][6:]))
        for name in names:
            page=int(name.split('/')[0][6:]);sheet=ET.fromstring(archive.read(name));scale=sheet.find('scale/interline')
            if scale is None:continue
            il=float(scale.get('main'))
            for system in sheet.findall('page/system'):
                stacks=system.findall('stack')
                if not stacks:continue
                staves={s.get('id'):(part.get('id'),i)for part in system.findall('part')for i,s in enumerate(part.findall('staff'))}
                entities={e.get('id'):e for e in system.findall('sig/inters/*')};heads=defaultdict(dict)
                for rel in system.findall('sig/relations/relation'):
                    edge=rel.find('slur-head')
                    if edge is not None and entities.get(rel.get('target')) is not None:heads[rel.get('source')][edge.get('side')]=rel.get('target')
                group=[]
                for s in system.findall('sig/inters/slur'):
                    c=s.find('curve')
                    if c is None:continue
                    ends=heads[s.get('id')];linked=[entities[h] for h in ends.values()if h in entities]
                    staffs={staves[h.get('staff')]for h in linked if h.get('staff')in staves}
                    if len(staffs)!=1:continue
                    item={'key':(page,s.get('id')),'page':page,'s':s,'ends':ends,'staff':next(iter(staffs)),
                          'x1':float(c.get('x1')),'x2':float(c.get('x2')),'il':il,
                          'left':float(stacks[0].get('left')),'right':float(stacks[-1].get('right'))}
                    curves[item['key']]=item;group.append(item)
                systems.append(group)
    links={};evidence={}
    for first,second in zip(systems,systems[1:]):
        # Either printed reciprocal engine extensions or two edge fragments
        # with matching staff ordinal, curvature side and explicit tie class.
        proposals=[]
        for a in first:
            if 'LEFT' not in a['ends'] or 'RIGHT'in a['ends']:continue
            for b in second:
                if 'RIGHT'not in b['ends']or 'LEFT'in b['ends']:continue
                same=a['staff']==b['staff']and a['s'].get('above')==b['s'].get('above')and a['s'].get('tie','false')==b['s'].get('tie','false')
                explicit=(a['page']==b['page']and a['s'].get('right-extension')==b['s'].get('id')and b['s'].get('left-extension')==a['s'].get('id'))
                free=not a['s'].get('right-extension')and not b['s'].get('left-extension')
                edge=abs(a['x2']-a['right'])<=1.5*a['il']and abs(b['x1']-b['left'])<=1.5*b['il']
                if same and (explicit or free and edge):proposals.append((a,b,'engine-extension'if explicit else 'unique-edge-fragments'))
        for a,b,why in proposals:
            if sum(x['key']==a['key']for x,_,_ in proposals)!=1 or sum(y['key']==b['key']for _,y,_ in proposals)!=1:
                findings.append({'page':a['page'],'reason':'ambiguous-cross-system-curve'});continue
            links[a['key']]=b['key'];evidence[a['key']]=why
    repairs=[];next_number=max([int(s.get('number','1'))for s in root.findall('.//slur')if s.get('number','1').isdigit()]+[0])+1
    for first,last in links.items():
        a,b=curves[first],curves[last]
        keys=[physical.get((a['page'],a['ends']['LEFT']),[]),physical.get((b['page'],b['ends']['RIGHT']),[])]
        if any(len(k)!=1 for k in keys):findings.append({'page':a['page'],'reason':'unmapped-curve-endpoint'});continue
        ka,kb=keys[0][0],keys[1][0];na,nb=notes[ka],notes[kb]
        if ka.split(':')[0]!=kb.split(':')[0] or timing[kb][0]<=timing[ka][0]:continue
        tie=a['s'].get('tie')=='true'
        if tie:
            def pitch(n):return tuple(n.findtext('pitch/'+k,'0')for k in ('step','alter','octave'))
            if pitch(na)!=pitch(nb)or timing[ka][0]+timing[ka][1]!=timing[kb][0]:
                findings.append({'page':a['page'],'reason':'tie-pitch-or-time-conflict'});continue
            if any(t.get('type')=='start'for t in na.findall('tie'))and any(t.get('type')=='stop'for t in nb.findall('tie')):continue
        else:
            starts={m.get('number','1')for m in na.findall('notations/slur')if m.get('type')=='start'}
            stops={m.get('number','1')for m in nb.findall('notations/slur')if m.get('type')=='stop'}
            if starts&stops:continue
            if starts or stops:
                findings.append({'page':a['page'],'reason':'existing-slur-number-conflict'});continue
        for n,kind in ((na,'start'),(nb,'stop')):
            nt=n.find('notations')
            if nt is None:nt=ET.SubElement(n,'notations')
            if tie:
                if not any(t.get('type')==kind for t in n.findall('tie')):
                    at=list(n).index(n.find('duration'))+1;n.insert(at,ET.Element('tie',{'type':kind}))
                if not any(t.get('type')==kind for t in nt.findall('tied')):ET.SubElement(nt,'tied',{'type':kind})
            else:ET.SubElement(nt,'slur',{'type':kind,'number':str(next_number)})
        next_number+=1
        repairs.append({'page':a['page'],'end_page':b['page'],'kind':'tie'if tie else 'slur','source':evidence[first],'start':ka,'end':kb})
    if repairs:write_xml(path,root)
    return {'repairs':repairs,'findings':findings,'accuracy':None}
