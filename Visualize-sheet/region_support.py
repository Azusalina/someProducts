"""Context-preserving local OMR proposals and measure-only MusicXML splicing."""
from copy import deepcopy
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from omr_support import read_musicxml, source_map


def measure_regions(project,xml_path,index=0):
    xml=read_musicxml(xml_path);parts=xml.findall('part')
    if len(parts)!=1:raise ValueError('局部替换目前需要单一钢琴声部的 MusicXML。')
    part=parts[0];lookup={m.get('number'):i for i,m in enumerate(part.findall('measure'))};result=[]
    with zipfile.ZipFile(project)as z:
        book=ET.fromstring(z.read('book.xml'));scores=book.findall('score')
        if not 0<=index<len(scores):raise ValueError('找不到对应乐章的原谱位置。')
        base=0
        for ref in scores[index].findall('page'):
            pn=int(ref.get('sheet-number'));sheet=ET.fromstring(z.read(f'sheet#{pn}/sheet#{pn}.xml'));pic=sheet.find('picture');width=float(pic.get('width'));height=float(pic.get('height'));il=float(sheet.find('scale/interline').get('main'))
            page=next(p for p in sheet.findall('page')if p.get('id')==ref.get('sheet-page-id'));systems=page.findall('system');bands=[]
            for system in systems:
                ys=[float(p.get('y'))for p in system.findall('part/staff/lines/line/point')];bands.append((min(ys),max(ys)))
            for si,system in enumerate(systems):
                top,bottom=bands[si];crop_top=max(0,(bands[si-1][1]+top)/2 if si else top-8*il);crop_bottom=min(height,(bottom+bands[si+1][0])/2 if si+1<len(bands)else bottom+6*il)
                for physical in system.findall('part'):
                    if physical.get('id')!=re.sub('^P','',part.get('id','')):continue
                    for measure in physical.findall('measure'):
                        if not measure.get('id','').isdigit():continue
                        number=str(base+int(measure.get('id')));mi=lookup.get(number)
                        stack=next((st for st in system.findall('stack')if st.get('id')==measure.get('id')),None)
                        if mi is None or stack is None:continue
                        result.append({'index':mi,'number':number,'page':pn,'system':system.get('id'),'x':float(stack.get('left'))/width,'y':max(0,top-2*il)/height,'w':(float(stack.get('right'))-float(stack.get('left')))/width,'h':(bottom-top+4*il)/height,'crop_y':crop_top/height,'crop_h':(crop_bottom-crop_top)/height})
            stub=next(s for s in book.findall('sheet')if int(s.get('number'))==pn);page_stub=next(p for p in stub.findall('page')if p.get('id')==ref.get('sheet-page-id'));base+=int(page_stub.get('delta-measure-id','0'))
    return sorted(result,key=lambda m:m['index'])


def selection(regions,start,end):
    if isinstance(start,bool)or isinstance(end,bool)or not isinstance(start,int)or not isinstance(end,int)or not 0<=start<=end or end-start>=16:raise ValueError('每次选择连续的 1–16 个小节。')
    selected=[r for r in regions if start<=r['index']<=end]
    if len(selected)!=end-start+1:raise ValueError('所选小节缺少可靠原谱边界，无法安全替换。')
    if len({r['page']for r in selected})!=1:raise ValueError('一次局部识别请选择同一 PDF 页内的小节。')
    top=min(r['crop_y']for r in selected);bottom=max(r['crop_y']+r['crop_h']for r in selected)
    return {'start':start,'end':end,'page':selected[0]['page'],'crop':{'x':0,'y':top,'w':1,'h':bottom-top},'measures':selected}


def context_at(part,index):
    """Effective attributes at measure entry; restore after the replacement."""
    state={}
    for measure in part.findall('measure')[:index]:
        for attrs in measure.findall('attributes'):
            for item in attrs:
                if item.tag in ('divisions','key','time','clef','staves','transpose'):
                    state[(item.tag,item.get('number','1'))]=deepcopy(item)
    attrs=ET.Element('attributes')
    for (tag,_),item in sorted(state.items(),key=lambda pair:['divisions','key','time','staves','clef','transpose'].index(pair[0][0])):attrs.append(deepcopy(item))
    return attrs


def write_mxl(xml,path):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED)as z:
        z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>');z.writestr('score.xml',ET.tostring(xml,encoding='utf-8',xml_declaration=True))


def counts(measures):
    return {'notes':sum(len(m.findall('note/pitch'))for m in measures),'chords':sum(n.find('pitch')is not None and n.find('chord')is None for m in measures for n in m.findall('note')),'clefs':sum(len(m.findall('.//clef'))for m in measures),'slurs':sum(len(m.findall('.//slur'))for m in measures)}


def merge_region(parent_xml,parent_map,candidate_xml,candidate_map,candidate_regions,region,target):
    """Match measure boundaries geometrically, never by changed note counts."""
    xml=read_musicxml(parent_xml);new=read_musicxml(candidate_xml);part=xml.find('part');fresh=new.find('part')
    if part is None or fresh is None or len(xml.findall('part'))!=1 or len(new.findall('part'))!=1:raise ValueError('局部替换需要单一钢琴声部。')
    original=part.findall('measure');incoming=fresh.findall('measure');crop=region['crop'];pairs=[];used=set()
    for wanted in region['measures']:
        choices=[]
        for r in candidate_regions:
            x=crop['x']+r['x']*crop['w'];y=crop['y']+(r['y']+r['h']/2)*crop['h'];w=r['w']*crop['w']
            if not wanted['y']-.015<=y<=wanted['y']+wanted['h']+.015:continue
            overlap=max(0,min(x+w,wanted['x']+wanted['w'])-max(x,wanted['x']))
            similarity=overlap/max(w,wanted['w'])
            if similarity>.72:choices.append((similarity,r['index']))
        choices.sort(reverse=True)
        if not choices or (len(choices)>1 and choices[0][0]-choices[1][0]<.1)or choices[0][1]in used:raise ValueError(f"小节 {wanted['number']} 的重新识别边界不一致；保留原结果，未替换。")
        used.add(choices[0][1]);pairs.append((wanted['index'],choices[0][1]))
    mapping=deepcopy(parent_map);positions=mapping['positions'];pid=part.get('id');fid=fresh.get('id');warnings=[]
    after=context_at(part,region['end']+1)
    # Candidate slurs get a separate namespace; only original boundary marks
    # with matching source coordinates are stitched to outside measures.
    selected_indices=set(range(region['start'],region['end']+1));external={}
    for mi,m in enumerate(original):
        for n in m.findall('note'):
            for mark in n.findall('notations/slur'):
                if mi not in selected_indices:external.setdefault(mark.get('number','1'),set()).add(mark.get('type'))
    boundary_slurs={};open_slurs={};pending_stops={}
    def stitch(a,b):
        if (a[0]in selected_indices)!=(b[0]in selected_indices):
            endpoint=a if a[0]in selected_indices else b
            boundary_slurs.setdefault(endpoint[:2],[]).append(endpoint[2])
    for mi,m in enumerate(original):
        for ni,n in enumerate(m.findall('note')):
            for mark in n.findall('notations/slur'):
                number=mark.get('number','1');endpoint=(mi,ni,mark)
                if mark.get('type')=='start':
                    if number in pending_stops:stitch(endpoint,pending_stops.pop(number))
                    else:open_slurs[number]=endpoint
                elif mark.get('type')=='stop':
                    if number in open_slurs:stitch(open_slurs.pop(number),endpoint)
                    else:pending_stops[number]=endpoint
    incoming_numbers=sorted({m.get('number','1')for _,src in pairs for m in incoming[src].findall('.//slur')})
    available=[str(n)for n in range(1,17)if str(n)not in external]
    if len(incoming_numbers)>len(available):raise ValueError('选区连奏线编号与外部段落冲突，未替换。')
    renumber=dict(zip(incoming_numbers,available))
    semitones={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
    def pitch(note):
        p=note.find('pitch')
        return None if p is None else int(p.findtext('octave'))*12+semitones[p.findtext('step')]+float(p.findtext('alter','0'))
    before_counts=counts([original[a]for a,_ in pairs]);after_counts=counts([incoming[b]for _,b in pairs])
    for dest,src in pairs:
        old=original[dest];replacement=deepcopy(incoming[src]);replacement.set('number',old.get('number',str(dest+1)))
        if old.get('implicit'):replacement.set('implicit',old.get('implicit'))
        # Materialize the candidate's inherited divisions/key/clefs so inserting
        # one middle measure cannot accidentally inherit the parent's old key.
        inherited=context_at(fresh,src);replacement.insert(0,inherited)
        old_notes=old.findall('note');new_notes=replacement.findall('note')
        old_pos={f'{pid}:{dest}:{ni}':positions.get(f'{pid}:{dest}:{ni}')for ni in range(len(old_notes))}
        for n in replacement.findall('.//slur'):
            n.set('number',renumber[n.get('number','1')])
        for ni,note in enumerate(new_notes):
            found=candidate_map['positions'].get(f'{fid}:{src}:{ni}')
            key=f'{pid}:{dest}:{ni}'
            if found:
                p=deepcopy(found);p.update(page=region['page'],x=crop['x']+p['x']*crop['w'],y=crop['y']+p['y']*crop['h'],w=p['w']*crop['w'],h=p['h']*crop['h'],head=f"region:{target.parent.name}:{target.name}:{p['head']}")
                near=sorted((abs(p['x']-v['x'])+abs(p['y']-v['y']),k)for k,v in old_pos.items()if v and abs(p['x']-v['x'])<.008 and abs(p['y']-v['y'])<.005)
                if near and (len(near)==1 or near[1][0]-near[0][0]>.002):
                    oi=int(near[0][1].split(':')[-1]);old_note=old_notes[oi]
                    boundary=[]
                    for mark in old_note.findall('tie')+old_note.findall('notations/tied'):
                        kind=mark.get('type');neighbor=dest-1 if kind=='stop'else dest+1
                        at_boundary=(kind=='stop'and dest==region['start'])or(kind=='start'and dest==region['end'])
                        opposite='start'if kind=='stop'else 'stop'
                        if at_boundary and 0<=neighbor<len(original)and any(pitch(n)==pitch(old_note)and any(t.get('type')==opposite for t in n.findall('tie')+n.findall('notations/tied'))for n in original[neighbor].findall('note')):boundary.append(mark)
                    if boundary and pitch(note)!=pitch(old_note):warnings.append('边界延音线涉及改动后的不同音高，未强行合并。')
                    elif boundary:
                        for mark in boundary:
                            container=note if mark.tag=='tie'else note.find('notations')
                            if container is None:container=ET.SubElement(note,'notations')
                            for same in list(container.findall(mark.tag)):
                                if same.get('type')==mark.get('type'):container.remove(same)
                            if mark.tag=='tie':
                                duration=note.find('duration');container.insert(list(note).index(duration)+1 if duration is not None else 1,deepcopy(mark))
                            else:container.append(deepcopy(mark))
                    for mark in boundary_slurs.get((dest,oi),[]):
                        nt=note.find('notations')
                        if nt is None:nt=ET.SubElement(note,'notations')
                        for same in list(nt.findall('slur')):
                            if same.get('type')==mark.get('type'):nt.remove(same)
                        nt.append(deepcopy(mark))
                positions[key]=p
            else:positions.pop(key,None)
        for ni in range(len(new_notes),len(old_notes)):positions.pop(f'{pid}:{dest}:{ni}',None)
        part.remove(old);part.insert(list(part).index(original[dest+1])if dest+1<len(original)and original[dest+1]in list(part)else len(part),replacement)
    if region['end']+1<len(original):original[region['end']+1].insert(0,after)
    mapping['mapped']=len(positions);mapping['total']=sum(len(m.findall('note/pitch'))for m in part.findall('measure'));mapping['version']=4
    write_mxl(xml,target)
    return mapping,{'before':before_counts,'after':after_counts,'measures':[r['number']for r in region['measures']],'warnings':warnings+['局部识别保留整行上下文；音符数量增加不代表更准确，请对照原 PDF 并试听。','跨选区边界的延音线与连奏线仍需核对。']}
