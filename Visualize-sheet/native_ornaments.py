"""Font-verified MusiXTeX ornament recovery for digital PDFs.

MusiXTeX's documented 20-point font encoding is used only in that font, never
interpreted as Latin text in arbitrary PDFs. Compound signs are preserved for
review rather than assigned an invented performance.
"""
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from omr_support import read_musicxml, source_map

# MusiXTeX manual, section Simple ornaments. Capitalisation matters.
SYMBOLS={'Y':('mordent',{}),'w':('mordent',{'long':'yes'}),
         'W':('inverted-mordent',{}),'X':('inverted-mordent',{'long':'yes'}),
         'D':('turn',{}),'C':('inverted-turn',{}),
         'j':('other-ornament',{'name':'Shakel'}),'l':('other-ornament',{'name':'Shakesw'}),
         'm':('other-ornament',{'name':'Shakene'}),'k':('other-ornament',{'name':'Shakenw'})}


def small_music_font(pdf):
    try:
        fonts=subprocess.run(['pdffonts',str(pdf)],capture_output=True,text=True,check=True,timeout=20).stdout
        return bool(re.search(r'\bTeXMUSIX13-Regular\b',fonts))
    except (OSError,subprocess.SubprocessError): return False


def native_marks(pdf):
    try:
        html=ET.fromstring(subprocess.run(['pdftohtml','-xml','-nomerge','-noroundcoord','-fontfullname','-i','-stdout',str(pdf)],capture_output=True,check=True,timeout=30).stdout)
        bbox=ET.fromstring(subprocess.run(['pdftotext','-bbox',str(pdf),'-'],capture_output=True,check=True,timeout=30).stdout)
    except (OSError,subprocess.SubprocessError,ET.ParseError): return []
    fonts={}; anchors=[]
    for page in html.findall('page'):
        fonts.update({f.get('id'):f.get('family','') for f in page.findall('fontspec')})
        for text in page.findall('text'):
            if not re.search(r'(?:^|\+)TeXMUSIX20-Regular$',fonts.get(text.get('font'),'')): continue
            letters=[c for c in ''.join(text.itertext()) if c in SYMBOLS]
            if len(letters)!=1: continue
            anchors.append((int(page.get('number')),letters[0],float(text.get('left'))/float(page.get('width')),
                            float(text.get('top'))/float(page.get('height')),
                            float(text.get('width'))/float(page.get('width')),
                            float(text.get('height'))/float(page.get('height'))))
    marks=[]
    for number,page in enumerate((p for p in bbox.iter() if p.tag.endswith('}page')),1):
        for word in page:
            text=word.text or ''; letters=[c for c in text if c.isascii() and c.isalpha()]
            if len(letters)!=1 or letters[0] not in SYMBOLS: continue
            glyph=letters[0]; x=float(word.get('xMin'))/float(page.get('width')); y=float(word.get('yMin'))/float(page.get('height'))
            matched=[a for a in anchors if a[0]==number and a[1]==glyph and a[2]-.005<=x<=a[2]+a[4]+.005 and a[3]-.01<=y<=a[3]+a[5]+.01]
            if not matched: continue
            marks.append({'page':number,'glyph':glyph,'x':x,'y':float(word.get('yMax'))/float(page.get('height')),
                          'kind':SYMBOLS[glyph][0],'font':'TeXMUSIX20-Regular'})
    return marks


def recover_ornaments(project,pdf,xml_path,index=0):
    candidates=native_marks(pdf)
    if not candidates: return {'native_marks':0,'recovered':[],'findings':[]}
    mapping=source_map(project,xml_path,index)
    xml=read_musicxml(xml_path);notes={f"{part.get('id')}:{mi}:{ni}":note for part in xml.findall('part')
                                      for mi,measure in enumerate(part.findall('measure')) for ni,note in enumerate(measure.findall('note'))}
    recovered=[];findings=[];used=set()
    for candidate in candidates:
        near=[]
        for identifier,p in mapping['positions'].items():
            if p['page']!=candidate['page']: continue
            dx=abs(p['x']+p['w']/2-candidate['x']);dy=abs(p['y']+p['h']/2-candidate['y'])
            if dx<.012 and dy<.026:near.append((dx*2+dy,identifier,p))
        near.sort(key=lambda t:t[0])
        if not near or (len(near)>1 and near[1][0]-near[0][0]<.003 and near[1][2]['head']!=near[0][2]['head']):
            findings.append({**candidate,'reason':'ambiguous_or_missing_note_anchor'});continue
        _,identifier,_=near[0];note=notes.get(identifier)
        if note is None or identifier in used:
            findings.append({**candidate,'reason':'multiple_marks_for_note'});continue
        used.add(identifier)
        notations=note.find('notations')
        if notations is None:notations=ET.SubElement(note,'notations')
        ornaments=notations.find('ornaments')
        if ornaments is None:ornaments=ET.SubElement(notations,'ornaments')
        # Native encoded signs can correct a classifier's wrong ornament type.
        for old in list(ornaments):
            if old.tag in {'mordent','inverted-mordent','turn','inverted-turn','trill-mark','other-ornament'}:ornaments.remove(old)
        kind,attrs=SYMBOLS[candidate['glyph']];attrs=dict(attrs);name=attrs.pop('name',None)
        mark=ET.SubElement(ornaments,kind,attrs)
        if name:
            mark.text=f'MusiXTeX:{name}'
            findings.append({**candidate,'source':identifier,'reason':'compound_ornament_performance_needs_review'})
        recovered.append({**candidate,'source':identifier})
    if recovered:
        data=ET.tostring(xml,encoding='utf-8',xml_declaration=True);target=Path(xml_path);temp=target.with_suffix(target.suffix+'.part')
        if target.suffix=='.mxl':
            with zipfile.ZipFile(target)as original,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED)as output:
                container=ET.fromstring(original.read('META-INF/container.xml'))
                entry=next(e.get('full-path')for e in container.iter()if e.tag.split('}')[-1]=='rootfile')
                for item in original.infolist():output.writestr(item,data if item.filename==entry else original.read(item))
        else:temp.write_bytes(data)
        temp.replace(target)
    return {'native_marks':len(candidates),'recovered':recovered,'findings':findings}
