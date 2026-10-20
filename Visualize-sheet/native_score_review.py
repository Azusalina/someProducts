"""Optional, source-backed review of digital Opus PDFs. Never supplies training truth.

Native font identity, ToUnicode, glyph IDs and embedded outlines are checked
before interpreting a character. Raster PDFs and ambiguous font subsets are
reported, not guessed. This module does not modify the PDF or the OMR project.
"""
from collections import Counter, defaultdict
from hashlib import sha256
from io import BytesIO
import json
import logging
from pathlib import Path
import re
import statistics
import xml.etree.ElementTree as ET
import zipfile

from omr_support import read_musicxml
from symbol_repair import staff_y

PROFILE = {
    ('OpusStd', 'œ'): 'head', ('OpusStd', '˙'): 'head',
    ('OpusSpecialStd', 'e'): 'small-head',
    ('OpusStd', 'n'): 'natural', ('OpusStd', 'b'): 'flat', ('OpusStd', '#'): 'sharp',
    ('OpusStd', '&'): 'treble', ('OpusStd', '?'): 'bass',
    ('OpusSpecialStd', '“'): '8va',
}


def cmap_unicode(text):
    """Read bfchar/bfrange mappings, including arrays and UTF-16 destinations."""
    result = {}
    def decode(value):
        try:
            return bytes.fromhex(value).decode('utf-16-be')
        except (ValueError, UnicodeError):
            return None
    for block in re.findall(r'beginbfchar(.*?)endbfchar', text, re.S):
        for source, destination in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>', block):
            value = decode(destination)
            if value: result[int(source, 16)] = value
    for block in re.findall(r'beginbfrange(.*?)endbfrange', text, re.S):
        for first, last, destination in re.findall(r'<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^]]*\]|<[0-9a-fA-F]+>)', block):
            start, end = int(first, 16), int(last, 16)
            if end < start or end-start > 65535: continue
            if destination.startswith('['):
                values = re.findall(r'<([0-9a-fA-F]+)>', destination)
            else:
                base = destination[1:-1]
                values = [f'{int(base,16)+offset:0{len(base)}x}' for offset in range(end-start+1)]
            for cid, encoded in zip(range(start, end+1), values):
                value = decode(encoded)
                if value: result[cid] = value
    return result


def native_evidence(pdf):
    import pymupdf
    from fontTools.ttLib import TTFont
    logging.getLogger('fontTools.ttLib.tables._h_e_a_d').setLevel(logging.ERROR)
    glyphs, lines, diagnostics = [], [], []
    fonts = {}
    with pymupdf.open(pdf) as document:
        for page_number, page in enumerate(document, 1):
            references = defaultdict(list)
            for xref, extension, subtype, name, *_ in page.get_fonts():
                name = re.sub(r'^[A-Z]{6}\+', '', name)
                if name not in {'OpusStd', 'OpusSpecialStd'}: continue
                if xref not in fonts:
                    try:
                        unicode_ref = document.xref_get_key(xref, 'ToUnicode')
                        descendants = document.xref_get_key(xref, 'DescendantFonts')
                        descendant = int(re.search(r'(\d+)\s+0\s+R', descendants[1]).group(1))
                        if document.xref_get_key(descendant, 'CIDToGIDMap') != ('name', '/Identity'):
                            raise ValueError('non-identity CIDToGIDMap is not supported')
                        if unicode_ref[0] != 'xref': raise ValueError('missing ToUnicode')
                        mapping = cmap_unicode(document.xref_stream(int(unicode_ref[1].split()[0])).decode('ascii'))
                        data = document.extract_font(xref)[3]
                        font = TTFont(BytesIO(data))
                        fonts[xref] = (mapping, font, sha256(data).hexdigest())
                    except (ValueError, AttributeError, KeyError, IndexError) as error:
                        fonts[xref] = None
                        diagnostics.append({'page':page_number, 'font':name, 'xref':xref, 'reason':str(error)})
                if fonts[xref]: references[name].append(xref)
            for span in page.get_texttrace():
                name = re.sub(r'^[A-Z]{6}\+', '', span['font'])
                if name not in references: continue
                if not any((name,chr(c[0]))in PROFILE for c in span['chars']):continue
                if abs(span['dir'][0]-1) > .00001 or abs(span['dir'][1]) > .00001:
                    diagnostics.append({'page':page_number, 'reason':'rotated text not decoded'}); continue
                for unicode_value, gid, origin, _ in span['chars']:
                    character = chr(unicode_value); kind = PROFILE.get((name, character))
                    if not kind: continue
                    choices = []
                    for xref in references[name]:
                        mapping, font, digest = fonts[xref]
                        if mapping.get(gid) != character or gid >= len(font.getGlyphOrder()): continue
                        glyph = font['glyf'][font.getGlyphOrder()[gid]]
                        if not hasattr(glyph, 'xMin'): continue
                        scale = span['size']/font['head'].unitsPerEm
                        x, y = origin
                        bounds = [x+glyph.xMin*scale, y-glyph.yMax*scale, x+glyph.xMax*scale, y-glyph.yMin*scale]
                        choices.append((xref, digest, bounds))
                    if not choices or len({tuple(round(v,5) for v in choice[2]) for choice in choices}) != 1:
                        diagnostics.append({'page':page_number, 'font':name, 'text':character, 'reason':'ambiguous_or_missing_font_subset'}); continue
                    xref, digest, bounds = choices[0]
                    glyphs.append({'id':f'g{len(glyphs)}', 'page':page_number, 'kind':kind, 'text':character,
                        'font':name, 'font_xref':xref, 'font_sha256':digest, 'gid':gid, 'size':span['size'],
                        'origin':list(origin), 'bounds':bounds, 'width':page.rect.width, 'height':page.rect.height})
            for drawing in page.get_drawings():
                dashed = bool(re.search(r'\[\s*[^\s\]]', drawing['dashes'] or ''))
                for item in drawing['items']:
                    if item[0] != 'l': continue
                    a, b = item[1:]
                    lines.append({'page':page_number,'x0':a.x,'y0':a.y,'x1':b.x,'y1':b.y,'dashed':dashed})
        pages = len(document)
    grouped=Counter(json.dumps(d,sort_keys=True)for d in diagnostics)
    return {'pages':pages, 'glyphs':glyphs, 'lines':lines,
        'diagnostics':[{**json.loads(key),'count':count}for key,count in grouped.items()]}


def project_geometry(project):
    staves, heads = [], {}
    with zipfile.ZipFile(project) as archive:
        for filename in archive.namelist():
            match = re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml', filename)
            if not match: continue
            page = int(match.group(1)); sheet = ET.fromstring(archive.read(filename))
            picture = sheet.find('picture')
            width, height = float(picture.get('width')), float(picture.get('height'))
            for system in sheet.findall('page/system'):
                for part in system.findall('part'):
                    for ordinal, staff in enumerate(part.findall('staff'), 1):
                        ys = staff_y(staff, float(staff.get('left','0')))
                        if len(ys) != 5: continue
                        staves.append({'page':page, 'system':system.get('id'), 'part':part.get('id'), 'staff':staff.get('id'),
                            'ordinal':ordinal,'width':width,'height':height,'element':staff})
                for head in system.findall('sig/inters/head'):
                    bounds = head.find('bounds')
                    if bounds is None: continue
                    heads[page,head.get('id')] = {'staff':head.get('staff'), 'system':system.get('id')}
    return staves, heads


def staff_points(staff, x, width, height):
    return [y/staff['height']*height for y in staff_y(staff['element'],x/width*staff['width'])]


def assign_clefs(glyphs, staves):
    clefs = defaultdict(list)
    for glyph in glyphs:
        if glyph['kind'] not in ('treble','bass'): continue
        x,y = glyph['origin']; choices = []
        for staff in staves:
            if staff['page'] != glyph['page']: continue
            left = float(staff['element'].get('left'))/staff['width']*glyph['width']
            right = float(staff['element'].get('right'))/staff['width']*glyph['width']
            if not left-3 <= x <= right: continue
            ys = staff_points(staff,x,glyph['width'],glyph['height']); space = (ys[-1]-ys[0])/4
            expected = ys[-1]-space if glyph['kind']=='treble' else ys[0]+space
            error = abs(y-expected)/space
            if error < .5: choices.append((error,staff))
        if len(choices) == 1:
            staff = choices[0][1]
            clefs[glyph['page'],staff['staff']].append(glyph)
    for values in clefs.values(): values.sort(key=lambda g:g['origin'][0])
    return clefs


def written_step(glyph, staff, clefs):
    x,y = glyph['origin']
    previous = [c for c in clefs.get((glyph['page'],staff['staff']),[]) if c['origin'][0] <= x]
    if not previous: return None
    ys = staff_points(staff,x,glyph['width'],glyph['height']); half_space=(ys[-1]-ys[0])/8
    position=(ys[-1]-y)/half_space
    if abs(position-round(position)) > .22: return None
    bottom = 30 if previous[-1]['kind']=='treble' else 18  # E4 / G2
    diatonic=bottom+round(position)
    return 'CDEFGAB'[diatonic%7], diatonic//7


def octave_ranges(glyphs, lines, staves):
    ranges=[]
    for glyph in glyphs:
        if glyph['kind'] != '8va': continue
        x,y=glyph['origin']; space=glyph['size']/4
        choices=[line for line in lines if line['page']==glyph['page'] and line['dashed']
            and abs(line['y0']-line['y1'])<.2 and line['x1']-line['x0']>space*.75
            and 0<line['x0']-x<space*4 and abs(line['y0']-(y-space*1.25))<space*.35]
        if len(choices)!=1:
            ranges.append({'page':glyph['page'],'label':glyph['id'],'resolved':False,'reason':'missing_or_ambiguous_native_dashed_line'});continue
        line=choices[0]
        hooks=[l for l in lines if l['page']==glyph['page'] and not l['dashed'] and abs(l['x0']-line['x1'])<1
            and abs(l['x1']-l['x0'])<.3 and min(abs(l['y0']-line['y0']),abs(l['y1']-line['y0']))<1
            and space*.4<abs(l['y1']-l['y0'])<space*2]
        choices=[]
        for staff in staves:
            if staff['page']!=glyph['page']:continue
            top=staff_points(staff,x,glyph['width'],glyph['height'])[0]
            distance=top-line['y0']
            if space*.5<distance<space*12:choices.append((distance,staff))
        choices.sort(key=lambda c:c[0])
        staff=choices[0][1]if choices else None
        ranges.append({'page':glyph['page'],'label':glyph['id'],'kind':'8va','x0':x,'x1':line['x1'],'y':line['y0'],
            'staff':staff['staff']if staff else None,'system':staff['system']if staff else None,
            'terminal_hook':len(hooks)==1,'resolved':len(hooks)==1 and staff is not None,
            'reason':'bounded_native_line'if len(hooks)==1 else 'continuation_requires_review'})
    ordered=sorted(staves,key=lambda s:(s['page'],int(s['system']),s['ordinal']))
    for item in ranges:
        if item.get('terminal_hook')or 'staff'not in item:continue
        staff=next((s for s in ordered if s['page']==item['page']and s['staff']==item['staff']),None)
        if not staff:continue
        glyph=next(g for g in glyphs if g['id']==item['label'])
        right=float(staff['element'].get('right'))/staff['width']*glyph['width']
        if abs(item['x1']-right)>3:continue
        following=next((s for s in ordered[ordered.index(staff)+1:]if s['part']==staff['part']and s['ordinal']==staff['ordinal']),None)
        if not following:continue
        continuations=[r for r in ranges if r.get('staff')==following['staff']and r['page']==following['page']]
        if len(continuations)!=1:continue
        continuation=continuations[0];next_glyph=next(g for g in glyphs if g['id']==continuation['label'])
        left=float(following['element'].get('left'))/following['width']*next_glyph['width']
        if continuation['x0']-left<next_glyph['size']*3:
            item['continues_to']=continuation['label']
    by_label={r['label']:r for r in ranges}
    for item in ranges:
        chain=[];current=item
        while current.get('continues_to')and current['label']not in chain:
            chain.append(current['label']);current=by_label[current['continues_to']]
        if chain and current.get('terminal_hook'):
            item['resolved']=True;item['reason']='native_labelled_continuation_to_terminal_hook'
    return ranges


def protect_tied_pitches(xml, proposals):
    """Keep originally valid adjacent tied endpoints at the corrected pitch.

    Only existing equal-pitch links, same voice/staff, and adjacent measures
    authorize propagation. Missing links or pre-existing pitch conflicts are not
    invented. Conflicting source-backed anchors leave the entire chain pending.
    """
    notes={};links=defaultdict(set);opened={}
    for part in xml.findall('part'):
        for mi,measure in enumerate(part.findall('measure')):
            for ni,note in enumerate(measure.findall('note')):
                pitch=note.find('pitch')
                if pitch is None:continue
                source=f"{part.get('id')}:{mi}:{ni}";notes[source]=note
                key=(part.get('id'),note.findtext('voice','1'),note.findtext('staff','1'),pitch.findtext('step'),
                    float(pitch.findtext('alter','0')),int(pitch.findtext('octave')))
                marks={t.get('type')for t in note.findall('tie')};previous=opened.get(key)
                if 'stop'in marks and previous and 0<=mi-previous[0]<=1:
                    links[source].add(previous[1]);links[previous[1]].add(source)
                if 'start'in marks:opened[key]=(mi,source)
                else:opened.pop(key,None)
    result=[dict(p)for p in proposals];findings=[];seen=set()
    for first in links:
        if first in seen:continue
        todo=[first];component=set()
        while todo:
            current=todo.pop()
            if current in component:continue
            component.add(current);todo.extend(links[current])
        seen.update(component);anchors=[p for p in proposals if p['source']in component]
        if not anchors:continue
        fields=defaultdict(set)
        for anchor in anchors:fields['octave'if anchor['kind']=='native_octave'else anchor.get('field','alter')].add(anchor['after'])
        if any(len(values)>1 for values in fields.values()):
            result=[p for p in result if p['source']not in component]
            findings.append({'kind':'conflicting_native_tie_anchors','sources':sorted(component)});continue
        for field,values in fields.items():
            value=next(iter(values));anchor=next(p for p in anchors if ('octave'if p['kind']=='native_octave'else p.get('field','alter'))==field)
            for source in sorted(component):
                if any(p['source']==source and ('octave'if p['kind']=='native_octave'else p.get('field','alter'))==field for p in result):continue
                before=float(notes[source].findtext(f'pitch/{field}','0'))
                if before==value:continue
                result.append({'kind':'tie_pitch_carry','field':field,'source':source,'page':anchor['page'],'glyph':anchor['glyph'],
                    'anchor':anchor['source'],'before':int(before)if field=='octave'else before,'after':value,
                    'evidence':'preserve an existing equal-pitch tie after a source-backed pitch correction',
                    'reviewed':False,'human_label':None})
        group='|'.join(sorted(component))
        for proposal in result:
            if proposal['source']in component:proposal['tie_group']=group
    return result,findings


def review(pdf, project, baseline, mapping):
    evidence=native_evidence(pdf);glyphs=evidence['glyphs'];staves,heads=project_geometry(project)
    clefs=assign_clefs(glyphs,staves);xml=read_musicxml(baseline)
    notes={f"{part.get('id')}:{mi}:{ni}":note for part in xml.findall('part')for mi,m in enumerate(part.findall('measure'))for ni,note in enumerate(m.findall('note'))if note.find('pitch')is not None}
    native_heads=[g for g in glyphs if g['kind']in ('head','small-head')]
    by_page=defaultdict(list); signs_by_page=defaultdict(list)
    for glyph in native_heads:by_page[glyph['page']].append(glyph)
    for glyph in glyphs:
        if glyph['kind']in ('natural','flat','sharp'):signs_by_page[glyph['page']].append(glyph)
    proposals=[];findings=[];matches={};used=set();contexts=[]
    ranges=octave_ranges(glyphs,evidence['lines'],staves)
    for source,position in mapping['positions'].items():
        note=notes.get(source)
        if note is None:continue
        choices=[]
        for glyph in by_page[position['page']]:
            x0,y0,x1,y1=glyph['bounds']
            dx=abs((x0+x1)/2-(position['x']+position['w']/2)*glyph['width'])
            dy=abs((y0+y1)/2-(position['y']+position['h']/2)*glyph['height'])
            if dx<2 and dy<1.1:choices.append((dx+dy*2,glyph))
        choices.sort(key=lambda pair:pair[0])
        if len(choices)!=1:continue
        glyph=choices[0][1]
        if glyph['id']in used:continue
        used.add(glyph['id']);matches[source]=glyph['id']
        physical=heads.get((position['page'],position['head']))
        staff=next((s for s in staves if physical and s['page']==position['page']and s['staff']==physical['staff']),None)
        if staff is None:continue
        spelling=written_step(glyph,staff,clefs)
        if not spelling:continue
        current_step=note.findtext('pitch/step');current_octave=int(note.findtext('pitch/octave'))
        if spelling[0]!=current_step:
            findings.append({'kind':'clef_or_pitch_conflict','source':source,'page':glyph['page'],'glyph':glyph['id'],
                'native_written':list(spelling),'exported':[current_step,current_octave]});continue
        scoped=[r for r in ranges if r.get('resolved')and r['page']==glyph['page']and r['staff']==staff['staff']
            and r['x0']-.5<=glyph['origin'][0]<=r['x1']+.5]
        if len(scoped)==1 and abs(current_octave-(spelling[1]+1))==1:
            proposals.append({'kind':'native_octave','source':source,'page':glyph['page'],'glyph':glyph['id'],
                'range':scoped[0]['label'],'before':current_octave,'after':spelling[1]+1,
                'evidence':'native 8va glyph and dashed line bounded by hook or uniquely labelled continuation',
                'reviewed':False,'human_label':None})
        # Only an explicit, unambiguously adjacent native accidental authorizes
        # an alteration proposal. Neither key defaults nor OMR guesses do.
        signs=[]
        for sign in signs_by_page[glyph['page']]:
            if abs(sign['origin'][1]-glyph['origin'][1])>.3:continue
            gap=glyph['bounds'][0]-sign['bounds'][2]
            if -.3<=gap<=glyph['size']*.45:signs.append((gap,sign))
        signs.sort(key=lambda pair:pair[0])
        context={'source':source,'glyph':glyph,'staff':staff['staff'],'spelling':spelling,'note':note,'ambiguous':len(signs)>1}
        contexts.append(context)
        if len(signs)!=1:continue
        sign=signs[0][1]
        # A sign belonging to another intervening/adjacent head is ambiguous.
        competing=[h for h in by_page[glyph['page']]if h['id']!=glyph['id']
            and abs(h['origin'][1]-sign['origin'][1])<.3 and sign['bounds'][2]-.3<=h['bounds'][0]<=glyph['bounds'][0]+.3]
        if competing:context['ambiguous']=True;continue
        context['sign']=sign
        alter={'natural':0,'flat':-1,'sharp':1}[sign['kind']];current=float(note.findtext('pitch/alter','0'))
        if current!=alter:
            proposals.append({'kind':'explicit_accidental','source':source,'page':glyph['page'],'glyph':glyph['id'],
                'sign':sign['id'],'before':current,'after':alter,'evidence':'embedded Opus glyph, exact staff position and unique adjacent head',
                'reviewed':False,'human_label':None})
    # Propagate only source-verified explicit signs, at the same written pitch
    # and octave, within the same measure and staff. Never cross a barline.
    states={}
    for context in sorted(contexts,key=lambda c:(c['glyph']['page'],int(c['source'].split(':')[-2]),c['staff'],c['glyph']['origin'][0])):
        source=context['source'];glyph=context['glyph'];note=context['note'];spelling=context['spelling']
        key=(source.rsplit(':',1)[0],context['staff'],spelling)
        if context['ambiguous']:states.pop(key,None);continue
        sign=context.get('sign')
        if sign:
            states[key]=({'natural':0,'flat':-1,'sharp':1}[sign['kind']],sign['id']);continue
        if key not in states or note.find('tie[@type="stop"]')is not None:continue
        alter,sign_id=states[key];current=float(note.findtext('pitch/alter','0'))
        if current!=alter:
            proposals.append({'kind':'accidental_carry','source':source,'page':glyph['page'],'glyph':glyph['id'],
                'sign':sign_id,'before':current,'after':alter,'evidence':'same-measure, same-staff, same-written-pitch native accidental carry',
                'reviewed':False,'human_label':None})
    unmatched=[g for g in native_heads if g['id']not in used]
    proposals,tie_findings=protect_tied_pitches(xml,proposals)
    findings.extend(tie_findings)
    # Locate propagated endpoints from their own source coordinates, rather than
    # displaying the anchor's page/box as if it were the continuation.
    by_id={g['id']:g for g in glyphs}
    for proposal in proposals:
        if proposal['kind']=='tie_pitch_carry'and proposal['source']in matches:
            proposal['glyph']=matches[proposal['source']];proposal['page']=by_id[proposal['glyph']]['page']
    return {'version':1,'source_sha256':sha256(Path(pdf).read_bytes()).hexdigest(),
        'baseline_sha256':sha256(Path(baseline).read_bytes()).hexdigest(),'trained':False,'accuracy':None,
        'pages':evidence['pages'],'exported_notes':len(notes),'native_head_candidates':len(native_heads),
        'matched_native_heads':len(used),'native_unmatched_heads':unmatched,'matches':matches,
        'glyph_counts':dict(Counter(g['kind']for g in glyphs)), 'glyphs':glyphs,
        'octave_ranges':ranges,
        'pitch_findings':findings,'proposals':proposals,'diagnostics':evidence['diagnostics'],
        'limitations':['Native glyph counts and engine agreement are not transcription accuracy.',
            'Unmatched heads can include grace notes, mapping failure and genuine omissions; no rhythm is invented.',
            'Only OpusStd/OpusSpecialStd profile is supported; a native font character is not a full musical interpretation.',
            'All labels are unreviewed for training; no model weights are changed.']}


def write_pitch_candidate(baseline, report, target):
    target=Path(target)
    if target.exists()or target.resolve()==Path(baseline).resolve():raise ValueError('Candidate must be a new file.')
    if sha256(Path(baseline).read_bytes()).hexdigest()!=report['baseline_sha256']:raise ValueError('Baseline hash changed.')
    xml=read_musicxml(baseline)
    notes={f"{part.get('id')}:{mi}:{ni}":note for part in xml.findall('part')for mi,m in enumerate(part.findall('measure'))for ni,note in enumerate(m.findall('note'))}
    for proposal in report['proposals']:
        if proposal['kind']not in ('explicit_accidental','accidental_carry','native_octave','tie_pitch_carry'):raise ValueError('Unsupported pitch proposal.')
        note=notes[proposal['source']];pitch=note.find('pitch')
        if proposal['kind']=='native_octave'or proposal.get('field')=='octave':
            if int(pitch.findtext('octave'))!=proposal['before']:raise ValueError('Octave proposal no longer matches its source.')
            pitch.find('octave').text=str(proposal['after']);continue
        current=float(pitch.findtext('alter','0'))
        if current!=proposal['before']:raise ValueError('Proposal no longer matches its source.')
        alter=pitch.find('alter')
        if alter is None:alter=ET.Element('alter');pitch.insert(1,alter)
        alter.text=str(proposal['after'])
        accidental=note.find('accidental')
        if accidental is not None:accidental.text={0:'natural',-1:'flat',1:'sharp'}[proposal['after']]
    # This changes pitches only. The exact sequence of notes, durations, voices,
    # tie/slur marks and source IDs is preserved for review and mapping.
    target.write_bytes(ET.tostring(xml,encoding='utf-8',xml_declaration=True))


def validate_pitch_candidate(baseline,report,target):
    if sha256(Path(baseline).read_bytes()).hexdigest()!=report['baseline_sha256']:raise ValueError('Baseline hash changed.')
    before=read_musicxml(baseline);after=read_musicxml(target)
    def anomalies(xml):
        opened={};bad=set()
        for part in xml.findall('part'):
            for mi,measure in enumerate(part.findall('measure')):
                for ni,note in enumerate(measure.findall('note')):
                    if note.find('pitch')is None:continue
                    source=f"{part.get('id')}:{mi}:{ni}"
                    key=(part.get('id'),note.findtext('voice','1'),note.findtext('staff','1'),note.findtext('pitch/step'),float(note.findtext('pitch/alter','0')),int(note.findtext('pitch/octave')))
                    marks={t.get('type')for t in note.findall('tie')}
                    if 'stop'in marks:
                        if key not in opened:bad.add(('orphan_stop',source))
                        else:opened.pop(key)
                    if 'start'in marks:opened[key]=source
                    else:opened.pop(key,None)
        bad.update(('unclosed_start',source)for source in opened.values())
        return bad
    new_anomalies=anomalies(after)-anomalies(before)
    if new_anomalies:raise ValueError(f'Candidate introduces tie conflicts: {sorted(new_anomalies)}')
    notes_before=before.findall('.//note');notes_after=after.findall('.//note')
    if len(notes_before)!=len(notes_after):raise ValueError('Candidate changed the number of notes.')
    pitched=len(before.findall('.//note/pitch'));changed=0
    for a,b in zip(notes_before,notes_after):
        pa,pb=a.find('pitch'),b.find('pitch')
        if (ET.tostring(pa)if pa is not None else None)!=(ET.tostring(pb)if pb is not None else None):changed+=1
        for note in (a,b):
            for kind in ('pitch','accidental'):
                node=note.find(kind)
                if node is not None:note.remove(node)
    if ET.tostring(before)!=ET.tostring(after):raise ValueError('Candidate changed nonpitch score structure.')
    if changed!=len({p['source']for p in report['proposals']}):raise ValueError('Changed pitches differ from the proposal manifest.')
    return {'pitched_notes_before':pitched,'pitched_notes_after':pitched,'changed_note_pitches':changed,
        'changes_by_kind':dict(Counter(p['kind']for p in report['proposals'])),
        'nonpitch_musicxml_identical':True,'baseline_unchanged':True,'new_tie_conflicts':0,'human_labels':report.get('manual_labels_applied',0),'model_training_executed':False,'accuracy':None}


def review_package(pdf, job_directory, report, output):
    """Render source pages and a file://-capable manual review form."""
    import pymupdf
    from region_support import measure_regions
    job_directory=Path(job_directory);output=Path(output)
    job=json.loads((job_directory/'job.json').read_text());baseline=job_directory/job['results'][0]['name']
    project=next((job_directory/'output').glob('*.omr'));regions=measure_regions(project,baseline)
    xml=read_musicxml(baseline);measures=xml.find('part').findall('measure')
    problems={str(m['measure'])for m in job.get('rhythm_audit',{}).get('overfull_measures',[])}
    glyphs={g['id']:g for g in report['glyphs']};issues=defaultdict(list)
    source_notes={f"{part.get('id')}:{mi}:{ni}":note for part in xml.findall('part')for mi,m in enumerate(part.findall('measure'))for ni,note in enumerate(m.findall('note'))}
    def pitch_name(step,alter,octave):
        return f"{step}{ {-2:'𝄫',-1:'♭',0:'',1:'♯',2:'𝄪'}.get(alter,str(alter))}{octave}"
    def locate(glyph,system=None):
        choices=[r for r in regions if r['page']==glyph['page']and (system is None or r['system']==system)]
        x=glyph['origin'][0]/glyph['width'];y=glyph['origin'][1]/glyph['height']
        horizontal=[r for r in choices if r['x']-.005<=x<=r['x']+r['w']+.005]
        return min(horizontal or choices,key=lambda r:abs(y-(r['y']+r['h']/2)))if choices else None
    for proposal in report['proposals']:
        glyph=glyphs[proposal['glyph']];index=int(proposal['source'].split(':')[-2])
        note=source_notes[proposal['source']];step=note.findtext('pitch/step');alter=float(note.findtext('pitch/alter','0'));octave=int(note.findtext('pitch/octave'))
        before=pitch_name(step,alter,octave)
        after=pitch_name(step,alter,proposal['after'])if proposal['kind']=='native_octave'or proposal.get('field')=='octave'else pitch_name(step,proposal['after'],octave)
        kind={'explicit_accidental':'临时记号','accidental_carry':'小节内记号延续','native_octave':'高八度','tie_pitch_carry':'延音续音同步校正'}[proposal['kind']]
        evidence={'explicit_accidental':'原稿字体中明确的升／降／还原号，与唯一邻接符头同音位。',
            'accidental_carry':'同小节、同谱表、同书写音高与八度内，前面的原稿临时记号仍然有效。',
            'native_octave':'原稿八度字形及虚线具有终点竖钩，或沿明确重印标签续至真实终点。',
            'tie_pitch_carry':'原来同音高且相邻的延音链，起音经原稿校正后，续音须保持同一音高；不新增延音线。'}[proposal['kind']]
        issues[index].append({'id':f"proposal:{proposal['kind']}:{proposal['source']}",'kind':'proposal','box':glyph['bounds'],
            'title':f"{kind} · {before} → {after}",
            'detail':f"原结果：{before}；候选：{after}\n依据：{evidence}\n音符定位 {proposal['source']}；尚未人工确认。"})
        if proposal.get('tie_group'):issues[index][-1]['detail']+='\n延音链校正需整链复核、接受，避免将长音拆成多次击键。'
    for glyph in report['native_unmatched_heads']:
        region=locate(glyph)
        if region:issues[region['index']].append({'id':f"head:{glyph['id']}",'kind':'unmatched','box':glyph['bounds'],
            'title':f"原稿符头未匹配 · {'小符头'if glyph['kind']=='small-head'else '普通符头'} · {glyph['id']}",'detail':'确认是否为漏音、倚音、仅定位失败或非音符；没有可靠时值时不自动补音。'})
    for span in report['octave_ranges']:
        glyph=glyphs[span['label']];region=locate(glyph,span.get('system'))
        if region:issues[region['index']].append({'id':f"octave:{span['label']}",'kind':'octave',
            'box':[span.get('x0',glyph['bounds'][0]),glyph['bounds'][1],span.get('x1',glyph['bounds'][2]),glyph['bounds'][3]],
            'title':f"8va 范围 · {'原生线条已闭合'if span.get('resolved')else '待检查'}",
            'detail':json.dumps(span,ensure_ascii=False,indent=2)})
    page_sizes={g['page']:(g['width'],g['height'])for g in report['glyphs']}
    package={k:report[k]for k in ('source_sha256','baseline_sha256','pages','exported_notes')}
    package.update(proposal_count=len(report['proposals']),measures=[])
    for region in regions:
        index=region['index'];m=measures[index];width,height=page_sizes[region['page']]
        facts=f"导出音符 {len(m.findall('note/pitch'))}；休止 {len(m.findall('note/rest'))}。"
        if m.get('number')in problems:facts+=' 原结果超出拍号，须核对节奏与声部。'
        package['measures'].append({**{k:region[k]for k in ('index','number','page')},'width':width,'height':height,
            'box':[region['x']*width,region['y']*height,(region['x']+region['w'])*width,(region['y']+region['h'])*height],
            'issues':issues[index],'facts':facts})
    pages=output/'pages';pages.mkdir(exist_ok=True)
    with pymupdf.open(pdf)as document:
        for index,page in enumerate(document,1):page.get_pixmap(matrix=pymupdf.Matrix(2.5,2.5)).save(str(pages/f'page-{index:02d}.png'))
    template=(Path(__file__).parent/'scripts/score-review.html').read_text()
    payload=json.dumps(package,ensure_ascii=False).replace('<','\\u003c')
    (output/'index.html').write_text(template.replace('__REVIEW_DATA__',payload))
    labels={'version':1,'source_sha256':report['source_sha256'],'baseline_sha256':report['baseline_sha256'],
        'trained':False,'measures':{},'issues':{}}
    (output/'labels-template.json').write_text(json.dumps(labels,ensure_ascii=False,indent=2)+'\n')


def approved_report(report, labels):
    if labels.get('version')!=1 or labels.get('source_sha256')!=report['source_sha256']or labels.get('baseline_sha256')!=report['baseline_sha256']:
        raise ValueError('Manual labels do not match this source and baseline.')
    selected=[p for p in report['proposals']if labels.get('issues',{}).get(f"proposal:{p['kind']}:{p['source']}",{}).get('verdict')=='accept']
    for group in {p['tie_group']for p in selected if p.get('tie_group')}:
        if any(p.get('tie_group')==group and p not in selected for p in report['proposals']):
            raise ValueError('Tied pitch corrections must be reviewed and accepted as a complete chain.')
    return {**report,'proposals':[{**p,'reviewed':True,'human_label':'accept'}for p in selected], 'manual_labels_applied':len(selected)}
