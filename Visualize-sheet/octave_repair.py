"""Recover printed ottava dotted spans from the original OMR binary image.

No pitch is guessed from register. A span needs a repeated-dot chain, a matching
8 glyph, and an unambiguous neighbouring staff with physical noteheads.
"""
import io
from pathlib import Path
import re
from statistics import median
import xml.etree.ElementTree as ET
import zipfile


def components(image):
    """8-connected black components, using row runs rather than pixel objects."""
    data = image.convert('L').tobytes()
    width, height = image.size
    previous = []; parents = []; boxes = []

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for y in range(height):
        row = []; j = 0
        for match in re.finditer(b'\x00+', data[y*width:(y+1)*width]):
            x, end = match.span(); index = len(parents)
            parents.append(index); boxes.append([x, y, end, y+1, end-x])
            row.append((x, end, index))
            while j < len(previous) and previous[j][1] < x: j += 1
            k = j
            while k < len(previous) and previous[k][0] <= end:
                a, b = root(previous[k][2]), root(index)
                if a != b:
                    parents[a] = b
                    old, target = boxes[a], boxes[b]
                    target[:4] = [min(target[0],old[0]), min(target[1],old[1]),
                                  max(target[2],old[2]), max(target[3],old[3])]
                    target[4] += old[4]
                k += 1
        previous = row
    return [box for index, box in enumerate(boxes) if parents[index] == index]


def dotted_lines(boxes, interline):
    dots = [b for b in boxes if .07*interline <= b[2]-b[0] <= .7*interline
            and .07*interline <= b[3]-b[1] <= .48*interline]
    groups = []
    for box in sorted(dots, key=lambda b:b[0]):
        x, y = (box[0]+box[2])/2, (box[1]+box[3])/2
        matches = [g for g in groups if abs(g[-1][1]-y) < .25*interline
                   and 0 < x-g[-1][0] < 4*interline
                   and abs(g[0][1]-y) < .8*interline]
        if matches: max(matches,key=lambda g:g[-1][0]).append((x,y,box))
        else: groups.append([(x,y,box)])
    return [g for g in groups if len(g) >= 5 and g[-1][0]-g[0][0] >= 2*interline
            and median(b[0]-a[0] for a,b in zip(g,g[1:])) < 1.1*interline]


def _box(element):
    b = element.find('bounds')
    if b is None: return None
    return (float(b.get('x')),float(b.get('y')),float(b.get('x'))+float(b.get('w')),float(b.get('y'))+float(b.get('h')))


def image_spans(sheet, image, templates):
    from PIL import ImageChops, ImageStat
    interline = float(sheet.find('scale/interline').get('main'))
    boxes = components(image)
    marks = [(mark,_box(mark)) for mark in sheet.findall('.//octave-shift') if mark.get('shape') == 'OTTAVA']
    staves = []
    for system in sheet.findall('page/system'):
        entities = {e.get('id'):e for e in system.findall('sig/inters/*')}
        chord_heads = {}
        for relation in system.findall('sig/relations/relation'):
            if relation.find('containment') is not None and entities.get(relation.get('target')) is not None:
                head = entities[relation.get('target')]
                if head.tag == 'head': chord_heads.setdefault(relation.get('source'),[]).append(head)
        for staff in system.findall('part/staff'):
            ys = [float(p.get('y')) for p in staff.findall('lines/line/point')]
            if len(staff.findall('lines/line')) != 5 or not ys: continue
            heads = [(head, _box(head), chord) for chord, hs in chord_heads.items()
                     for head in hs if head.get('staff') == staff.get('id') and _box(head)]
            staves.append((system,staff,min(ys),max(ys),heads))
    result = []
    for chain in dotted_lines(boxes,interline):
        x0, y0 = chain[0][:2]; x1, y1 = chain[-1][:2]
        known = [(mark,b) for mark,b in marks if b and 0 < x0-(b[0]+b[2])/2 < 3*interline
                 and abs((b[1]+b[3])/2-y0) < interline]
        label = min(known,key=lambda t:abs(t[1][2]-x0))[1] if known else None
        if label is None:
            candidates = [b for b in boxes if 0 < x0-b[2] < 2*interline
                          and abs((b[1]+b[3])/2-y0) < interline
                          and .7*interline < b[2]-b[0] < 2.3*interline
                          and 1.2*interline < b[3]-b[1] < 3*interline]
            matches = []
            for b in candidates:
                glyph = image.crop(b[:4]).convert('L').resize((20,28))
                error = min((ImageStat.Stat(ImageChops.difference(glyph,t)).mean[0]/255 for t in templates),default=1)
                if error < .23: matches.append((error,b))
            if matches: label = min(matches,key=lambda t:t[0])[1][:4]
        if label is None: continue
        start = (label[0]+label[2])/2
        options = []
        for system,staff,top,bottom,heads in staves:
            if top <= y0 <= bottom: continue
            kind = 'ALTA' if y0 < top else 'BASSA'
            inside = [(head,b,chord) for head,b,chord in heads
                      if start-.5*interline <= (b[0]+b[2])/2 <= x1+.5*interline
                      and (b[1] > y0 if kind == 'ALTA' else b[3] < y0)]
            if not inside: continue
            distance = min(abs((b[1]+b[3])/2-y0) for _,b,_ in inside)
            if distance > 8*interline: continue
            options.append((distance,system,staff,kind,inside))
        options.sort(key=lambda t:t[0])
        if not options or (len(options)>1 and options[1][0]-options[0][0] < .65*interline): continue
        _,system,staff,kind,heads = options[0]
        # Match the printed hook, when present. A clipped line is accepted only
        # at the actual right edge of this system, never extended across a gap.
        end_boxes = [b for b in boxes if abs((b[0]+b[2])/2-x1) < .7*interline
                     and (0 < b[1]-y1 < 1.5*interline if kind=='ALTA' else 0 < y1-b[3] < 1.5*interline)
                     and b[2]-b[0] < .7*interline and b[3]-b[1] < .8*interline]
        right = max(float(stack.get('right')) for stack in system.findall('stack'))
        reaches_edge = abs(x1-right) < 1.5*interline
        if not end_boxes and not reaches_edge: continue
        if end_boxes:
            x1 = max(x1,max((b[0]+b[2])/2 for b in end_boxes))
        first = min(heads,key=lambda item:(item[1][0],item[1][1]))[2]
        last = max(heads,key=lambda item:(item[1][0],-item[1][1]))[2]
        result.append({'system':system,'staff':staff.get('id'),'kind':kind,'label':label,
                       'x0':start,'y0':y0,'x1':x1,'y1':y1,'first':first,'last':last,
                       'dots':len(chain),'edge':reaches_edge})
    return result


def repair_octaves(project):
    """Edit geometry/links; Audiveris then exports sounding pitches itself."""
    try:
        from PIL import Image
    except ImportError:
        return {'repairs':[],'available':False,'reason':'Pillow is required for image octave recovery'}
    repairs = []; changed = {}; templates = []
    with zipfile.ZipFile(project) as archive:
        names = [name for name in archive.namelist() if re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml',name)]
        for name in names:
            sheet = ET.fromstring(archive.read(name)); png = name.rsplit('/',1)[0]+'/BINARY.png'
            if png not in archive.namelist(): continue
            with Image.open(io.BytesIO(archive.read(png))) as image:
                for mark in sheet.findall('.//octave-shift'):
                    b = _box(mark)
                    if mark.get('shape') == 'OTTAVA' and b:
                        templates.append(image.crop(b).convert('L').resize((20,28)))
        if not templates: return {'repairs':[],'available':True}
        for name in names:
            sheet = ET.fromstring(archive.read(name)); png = name.rsplit('/',1)[0]+'/BINARY.png'
            if png not in archive.namelist() or sheet.find('scale/interline') is None: continue
            with Image.open(io.BytesIO(archive.read(png))) as image:
                spans = image_spans(sheet,image,templates)
            if not spans: continue
            # Only replace candidate octave values corroborated by image lines.
            # Uncorroborated values stay visible in the audit as unresolved.
            for span in spans:
                label = span['label']; system = span['system']
                replaced = []
                for old_system in sheet.findall('page/system'):
                    for mark in list(old_system.findall('sig/inters/octave-shift')):
                        b = _box(mark)
                        if b and abs(b[0]-label[0])<10 and abs(b[1]-label[1])<10:
                            replaced.append(mark.get('id'));old_system.find('sig/inters').remove(mark)
                    for relation in list(old_system.findall('sig/relations/relation')):
                        if relation.get('source') in replaced or relation.get('target') in replaced:
                            old_system.find('sig/relations').remove(relation)
                identifier = str(int(sheet.get('last-persistent-id','0'))+1)
                sheet.set('last-persistent-id',identifier)
                mark = ET.SubElement(system.find('sig/inters'),'octave-shift',
                    {'id':identifier,'shape':'OTTAVA','kind':span['kind'],'staff':span['staff'],'grade':'1','ctx-grade':'1'})
                ET.SubElement(mark,'bounds',{'x':str(round(label[0])),'y':str(round(label[1])),
                    'w':str(round(label[2]-label[0])),'h':str(round(label[3]-label[1]))})
                line = ET.SubElement(mark,'line')
                for point,x,y in [('p1',span['x0'],span['y0']),('p2',span['x1'],span['y1'])]:
                    ET.SubElement(line,point,{'x':str(round(x)),'y':str(round(y))})
                if not span['edge']:
                    hook_y=span['y1']+(1 if span['kind']=='ALTA' else -1)*float(sheet.find('scale/interline').get('main'))
                    ET.SubElement(mark,'hook',{'x':str(round(span['x1'])),'y':str(round(hook_y))})
                for side,chord in [('LEFT',span['first']),('RIGHT',span['last'])]:
                    relation = ET.SubElement(system.find('sig/relations'),'relation',{'source':identifier,'target':chord})
                    ET.SubElement(relation,'octave-shift-chord',{'side':side,'grade':'1'})
                repairs.append({'page':int(name.split('#')[1].split('/')[0]),'system':system.get('id'),
                                'staff':span['staff'],'kind':span['kind'],'dots':span['dots'],
                                'source':'binary dotted line and matching 8 glyph','replaced':replaced})
            changed[name] = ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
        if changed:
            temp = Path(project).with_suffix('.omr.part')
            try:
                with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as output:
                    for entry in archive.infolist():
                        if entry.filename in changed: output.writestr(entry,changed[entry.filename])
                        else:
                            import shutil
                            with archive.open(entry) as source,output.open(entry,'w') as target: shutil.copyfileobj(source,target)
            except BaseException:
                temp.unlink(missing_ok=True);raise
    if changed: temp.replace(project)
    return {'repairs':repairs,'available':True}
