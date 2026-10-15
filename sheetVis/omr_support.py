"""Source-backed OMR corrections and original-page note coordinates."""
from collections import defaultdict
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def read_musicxml(path):
    if Path(path).suffix == '.mxl':
        with zipfile.ZipFile(path) as archive:
            container = ET.fromstring(archive.read('META-INF/container.xml'))
            entry = next(e.get('full-path') for e in container.iter() if e.tag.split('}')[-1] == 'rootfile')
            return ET.fromstring(archive.read(entry))
    return ET.parse(path).getroot()


def native_meters(pdf):
    """Read explicit stacked digits; never infer meter from noisy note durations."""
    try:
        fonts = subprocess.run(['pdffonts', str(pdf)], capture_output=True, text=True, timeout=20, check=True).stdout
        if not re.search(r'\bOpus\b', fonts):
            return []  # PUA encoding is font-specific: do not apply it to arbitrary fonts.
        data = subprocess.run(['pdftotext', '-bbox', str(pdf), '-'], capture_output=True, timeout=30, check=True).stdout
        root = ET.fromstring(data)
    except (OSError, subprocess.SubprocessError, ET.ParseError):
        return []
    result = []
    for page_number, page in enumerate((e for e in root.iter() if e.tag.endswith('}page')), 1):
        words = []
        for word in page.iter():
            if not word.tag.endswith('}word') or not word.text:
                continue
            text = ''.join(chr(ord(c) - 0xf000) for c in word.text if 0xf030 <= ord(c) <= 0xf039)
            if len(text) != len(word.text) or not text.isdigit():
                continue
            words.append({'value': int(text), **{k: float(v) for k, v in word.attrib.items()}})
        for numerator in words:
            for denominator in words:
                dy = denominator['yMin'] - numerator['yMin']
                if denominator['value'] not in (2, 4, 8, 16) or not 1 <= numerator['value'] <= 16:
                    continue
                if abs(numerator['xMin'] - denominator['xMin']) > 1.5 or not 5 < dy < 18:
                    continue
                result.append({'page': page_number, 'num': numerator['value'], 'den': denominator['value'],
                               'x': numerator['xMin'] / float(page.get('width')),
                               'y': (numerator['yMin'] + denominator['yMax']) / 2 / float(page.get('height'))})
    return result


def repair_meters(project, pdf):
    """Apply only unanimous, explicitly printed, two-staff piano signatures."""
    candidates = native_meters(pdf)
    if not candidates:
        return []
    with zipfile.ZipFile(project) as archive:
        entries = {n: archive.read(n) for n in archive.namelist()}
    repairs = []
    for name in list(entries):
        match = re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml', name)
        if not match:
            continue
        page_number = int(match.group(1))
        if not any(c['page'] == page_number for c in candidates):
            continue
        sheet = ET.fromstring(entries[name])
        if sheet.find('scale/interline') is None:
            continue
        picture = sheet.find('picture'); width = float(picture.get('width')); height = float(picture.get('height'))
        interline = float(sheet.find('scale/interline').get('main'))
        for system in sheet.findall('page/system'):
            for part in system.findall('part'):
                staves = part.findall('staff')
                if len(staves) != 2:
                    continue
                agreed = defaultdict(list)
                for candidate in (c for c in candidates if c['page'] == page_number):
                    x = candidate['x'] * width; y = candidate['y'] * height
                    for staff in staves:
                        lines = [float(line.find('point').get('y')) for line in staff.findall('lines/line')]
                        if len(lines) != 5 or not lines[0] - interline <= y <= lines[-1] + interline:
                            continue
                        stacks = [s for s in system.findall('stack') if float(s.get('left')) <= x < float(s.get('right'))]
                        if len(stacks) != 1 or x - float(stacks[0].get('left')) > interline * 4:
                            continue
                        agreed[(stacks[0].get('id'), candidate['num'], candidate['den'])].append((staff, x, lines))
                for (stack_id, num, den), locations in agreed.items():
                    if len({s.get('id') for s, _, _ in locations}) != 2:
                        continue
                    measure = next((m for m in part.findall('measure') if m.get('id') == stack_id), None)
                    if measure is None or measure.findtext('times'):
                        continue  # Never override an existing recognized signature automatically.
                    shape = {(6,4): 'TIME_SIX_FOUR', (4,4): 'TIME_FOUR_FOUR', (2,2): 'TIME_TWO_TWO', (3,4): 'TIME_THREE_FOUR', (2,4): 'TIME_TWO_FOUR', (6,8): 'TIME_SIX_EIGHT', (3,8): 'TIME_THREE_EIGHT', (12,8): 'TIME_TWELVE_EIGHT'}.get((num,den))
                    if not shape:
                        continue
                    ids = []
                    for staff, x, lines in locations:
                        identifier = int(sheet.get('last-persistent-id')) + 1
                        sheet.set('last-persistent-id', str(identifier)); ids.append(str(identifier))
                        inter = ET.SubElement(system.find('sig/inters'), 'time-whole', {'id':str(identifier),'staff':staff.get('id'),'time-rational':f'{num}/{den}','shape':shape,'grade':'1','ctx-grade':'1','frozen':'true','manual':'true'})
                        ET.SubElement(inter, 'bounds', {'x':str(round(x)), 'y':str(round(lines[0])), 'w':str(round(interline*1.8)), 'h':str(round(lines[-1]-lines[0]))})
                    ET.SubElement(measure, 'times').text = ' '.join(ids)
                    repairs.append({'page':page_number,'stack':stack_id,'meter':f'{num}/{den}','source':'embedded Opus digits on both piano staves'})
        entries[name] = ET.tostring(sheet, encoding='utf-8', xml_declaration=True)
    if not repairs:
        return []
    book = ET.fromstring(entries['book.xml'])
    for stub in book.findall('sheet'):
        if int(stub.get('number')) < min(r['page'] for r in repairs):
            continue
        steps = stub.find('steps')
        if steps is not None:
            steps.text = ' '.join(s for s in (steps.text or '').split() if s not in ('RHYTHMS','PAGE'))
        for page in stub.findall('page'):
            for last in page.findall('last-time-rational'):
                page.remove(last)
    entries['book.xml'] = ET.tostring(book, encoding='utf-8', xml_declaration=True)
    temp = Path(project).with_suffix('.omr.part')
    with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as output:
        for name, content in entries.items(): output.writestr(name, content)
    temp.replace(project)
    return repairs


def source_map(project, xml_path, score_index=0):
    """Match exported notes to physical noteheads, using voice + geometry + pitch."""
    xml = read_musicxml(xml_path)
    positions = {}; pages = {}; source_measures = {}
    with zipfile.ZipFile(project) as archive:
        book = ET.fromstring(archive.read('book.xml')); scores = book.findall('score')
        if score_index >= len(scores):
            return {'version':3,'positions':{},'pages':{},'mapped':0,'total':0}
        base = 0
        for reference in scores[score_index].findall('page'):
            page_number = int(reference.get('sheet-number')); page_id = reference.get('sheet-page-id')
            sheet = ET.fromstring(archive.read(f'sheet#{page_number}/sheet#{page_number}.xml'))
            picture = sheet.find('picture'); pages[str(page_number)] = {'width':int(picture.get('width')), 'height':int(picture.get('height'))}
            interline = float(sheet.find('scale/interline').get('main'))
            page = next(p for p in sheet.findall('page') if p.get('id') == page_id)
            for system in page.findall('system'):
                entities = {e.get('id'):e for e in system.findall('sig/inters/*')}
                heads = defaultdict(list)
                for relation in system.findall('sig/relations/relation'):
                    head = entities.get(relation.get('target'))
                    if relation.find('containment') is not None and head is not None and head.tag == 'head':
                        heads[relation.get('source')].append(head)
                for part in system.findall('part'):
                    staff_ids = [s.get('id') for s in part.findall('staff')]
                    for measure in part.findall('measure'):
                        stack = next((s for s in system.findall('stack') if s.get('id') == measure.get('id')), None)
                        if stack is None or not re.fullmatch(r'\d+', stack.get('id','')):
                            continue
                        voice_heads = defaultdict(list); voice_chords = defaultdict(list)
                        for voice in measure.findall('voice'):
                            for entry in voice.findall('slots/entry'):
                                value = entry.find('value')
                                if value is not None and value.get('status') == 'BEGIN':
                                    voice_heads[voice.get('id')].extend(heads[value.get('chord')])
                                    voice_chords[voice.get('id')].append(heads[value.get('chord')])
                        source_measures[(part.get('id'), str(base + int(stack.get('id'))))] = (page_number, float(stack.get('left')), interline, staff_ids, voice_heads, voice_chords)
            stub = next(s for s in book.findall('sheet') if s.get('number') == str(page_number))
            page_stub = next(p for p in stub.findall('page') if p.get('id') == page_id)
            base += int(page_stub.get('delta-measure-id', '0'))
    total = 0
    for part in xml.findall('part'):
        physical_part = re.sub(r'^P', '', part.get('id',''))
        clefs = {1:'G', 2:'F'}
        shifts = {}; divisions = 1
        for measure_index, measure in enumerate(part.findall('measure')):
            for clef in measure.findall('attributes/clef'):
                clefs[int(clef.get('number','1'))] = clef.findtext('sign','G')
            source = source_measures.get((physical_part, measure.get('number')))
            if measure.find('attributes/divisions') is not None:
                divisions = max(1,float(measure.findtext('attributes/divisions')))
            # XML pitch is sounding pitch. Match the written notehead after
            # applying the time-local octave display shift, including backups.
            changes = []; note_data = []; beat = 0; chord_beat = 0
            for element in measure:
                if element.tag == 'backup': beat = max(0,beat-float(element.findtext('duration','0'))/divisions)
                elif element.tag == 'forward': beat += float(element.findtext('duration','0'))/divisions
                elif element.tag == 'direction':
                    for shift in element.findall('direction-type/octave-shift'):
                        kind = shift.get('type')
                        if kind not in ('up','down','stop'): continue
                        delta = 0 if kind=='stop' else (int(shift.get('size','8'))-1) * (1 if kind=='up' else -1)
                        changes.append((beat+float(element.findtext('offset','0'))/divisions,int(element.findtext('staff','1')),delta))
                elif element.tag == 'note':
                    is_chord = element.find('chord') is not None
                    onset = chord_beat if is_chord else beat
                    if not is_chord: chord_beat = beat
                    note_data.append((element,onset))
                    if not is_chord:beat += float(element.findtext('duration','0'))/divisions
            changes.sort(key=lambda event:event[0])
            group_heads = {}
            if source:
                page_number, left, interline, staff_ids, _, voice_chords = source
                groups = []
                for index,(note,_) in enumerate(note_data):
                    if note.find('chord') is None or not groups:groups.append([])
                    if note.find('pitch') is not None:groups[-1].append((index,note))
                for group in groups:
                    if not group or any(n.get('default-x') is None for _,n in group):continue
                    matches = []
                    for physical in voice_chords[group[0][1].findtext('voice','1')]:
                        if len(physical) != len(group):continue
                        pairs = []; valid = True
                        for staff in {int(n.findtext('staff','1')) for _,n in group}:
                            if not 1 <= staff <= len(staff_ids):valid=False;break
                            printed = sorted([(i,n) for i,n in group if int(n.findtext('staff','1'))==staff],key=lambda pair:int(pair[1].findtext('pitch/octave'))*7+'CDEFGAB'.index(pair[1].findtext('pitch/step')))
                            observed = sorted([h for h in physical if h.get('staff')==staff_ids[staff-1] and h.find('bounds') is not None],key=lambda h:-float(h.find('bounds').get('y')))
                            if len(printed)!=len(observed):valid=False;break
                            if any(abs(float(a.find('bounds').get('y'))-float(b.find('bounds').get('y')))<1 for a,b in zip(observed,observed[1:])):valid=False;break
                            for (index,note),head in zip(printed,observed):
                                distance=abs(left+float(note.get('default-x'))*interline/10-float(head.find('bounds').get('x')))
                                if distance >= interline*.7:valid=False;break
                                pairs.append((index,head,distance))
                        if valid:matches.append((sum(p[2] for p in pairs),pairs))
                    matches.sort(key=lambda item:item[0])
                    if matches and (len(matches)==1 or matches[1][0]-matches[0][0]>1):
                        group_heads.update({index:head for index,head,_ in matches[0][1]})
            for note_index, (note,onset) in enumerate(note_data):
                pitch = note.find('pitch')
                if pitch is None: continue
                total += 1
                if source is None or note.get('default-x') is None: continue
                page_number, left, interline, staff_ids, voice_heads, _ = source
                staff = int(note.findtext('staff','1'))
                if not 1 <= staff <= len(staff_ids): continue
                x = left + float(note.get('default-x')) * interline / 10
                pitch_index = int(pitch.findtext('octave')) * 7 + 'CDEFGAB'.index(pitch.findtext('step'))
                delta = shifts.get(staff,0)
                for at, target, shift in changes:
                    if target == staff and at <= onset + 1e-7: delta = shift
                pitch_index += delta
                middle = {'G':34,'F':22,'C':28}.get(clefs.get(staff))
                if middle is None: continue
                candidates = []
                for head in voice_heads[note.findtext('voice','1')]:
                    bounds = head.find('bounds')
                    if bounds is None or head.get('staff') != staff_ids[staff-1]: continue
                    difference = abs(float(bounds.get('x')) - x)
                    written_index = middle - round(float(head.get('pitch','999')))
                    if difference < interline * .7 and pitch_index == written_index:
                        candidates.append((abs(pitch_index-written_index), difference, head))
                if note_index in group_heads:
                    # Audiveris exports each physical chord's heads in pitch
                    # order. Cardinality + voice + exact x-layout links the
                    # originating head even when the exported octave is wrong.
                    candidates = [(0,0,group_heads[note_index])]
                if not candidates: continue
                candidates.sort(key=lambda c:(c[0],c[1]))
                if len(candidates)>1 and candidates[0][0] == candidates[1][0] and abs(candidates[0][1]-candidates[1][1]) < 1:
                    continue # Ambiguous heads are not replaced by a guessed cursor.
                head = candidates[0][2]; bounds = head.find('bounds'); dimensions = pages[str(page_number)]
                positions[f'{part.get("id")}:{measure_index}:{note_index}'] = {'page':page_number,
                    'x':float(bounds.get('x'))/dimensions['width'], 'y':float(bounds.get('y'))/dimensions['height'],
                    'w':float(bounds.get('w'))/dimensions['width'], 'h':float(bounds.get('h'))/dimensions['height'],
                    'head':head.get('id'), 'grade':float(head.get('ctx-grade',head.get('grade','0')))}
            for _,staff,delta in changes:shifts[staff]=delta
    return {'version':3,'positions':positions,'pages':pages,'mapped':len(positions),'total':total}


def repair_dynamics(project):
    """Remove only wedges tied to chords that have no resolved onset slot.

    Audiveris otherwise throws from WedgeIterators and drops the entire measure
    during export. No note/chord or its rhythm is removed or changed here.
    """
    with zipfile.ZipFile(project) as archive:
        entries = {n:archive.read(n) for n in archive.namelist()}
    repairs = []
    for name in list(entries):
        match = re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml', name)
        if not match: continue
        sheet = ET.fromstring(entries[name]); changed = False
        for system in sheet.findall('page/system'):
            timed_slots = {stack.get('id'):{slot.get('id') for slot in stack.findall('slot') if slot.get('time-offset') is not None} for stack in system.findall('stack')}
            valid = {entry.find('value').get('chord') for measure in system.findall('part/measure') for entry in measure.findall('voice/slots/entry') if entry.findtext('key') in timed_slots.get(measure.get('id'),set()) and entry.find('value') is not None and entry.find('value').get('status')=='BEGIN'}
            relations = system.find('sig/relations'); inters = system.find('sig/inters')
            if relations is None or inters is None: continue
            for wedge in list(inters.findall('wedge')):
                identifier = wedge.get('id')
                anchors = [r for r in relations if r.find('chord-wedge') is not None and r.get('target') == identifier]
                if not anchors or not any(r.get('source') not in valid for r in anchors): continue
                inters.remove(wedge)
                for relation in list(relations):
                    if identifier in (relation.get('source'),relation.get('target')):relations.remove(relation)
                repairs.append({'page':int(match.group(1)),'system':system.get('id'),'wedge':identifier,'reason':'unresolved chord onset; omit dynamic mark, retain notes'})
                changed = True
        if changed: entries[name] = ET.tostring(sheet,encoding='utf-8',xml_declaration=True)
    if repairs:
        temp = Path(project).with_suffix('.omr.part')
        with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as output:
            for name,content in entries.items():output.writestr(name,content)
        temp.replace(project)
    return repairs
