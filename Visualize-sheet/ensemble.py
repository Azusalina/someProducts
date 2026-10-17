"""Read-only, exact-event cross checks; engine agreement is never accuracy."""
from collections import Counter
from fractions import Fraction
import hashlib
import xml.etree.ElementTree as ET
from omr_support import read_musicxml


def events(root):
    if root.tag != 'score-partwise':
        raise ValueError('需要 score-partwise MusicXML。')
    parts = root.findall('part')
    piano = [p.get('id') for p in root.findall('part-list/score-part')
             if 'piano' in (p.findtext('part-name', '')).lower() or p.findtext('midi-instrument/midi-program') == '1']
    if len(parts) != 1 and len(piano) != 1:
        raise ValueError('多乐器文件需要唯一的钢琴声部。')
    part = next((p for p in parts if p.get('id') in piano), parts[0] if parts else None)
    if part is None: raise ValueError('没有乐谱声部。')
    divisions = Fraction(1); result = []
    for mi, measure in enumerate(part.findall('measure')):
        cursor = chord = Fraction(0); notes = []; extent = Fraction(0)
        for node in measure:
            if node.tag == 'attributes':
                divisions = Fraction(node.findtext('divisions', str(divisions)))
                if divisions <= 0: raise ValueError('divisions 必须为正。')
            elif node.tag in ('backup', 'forward'):
                duration = Fraction(node.findtext('duration', '0')) / divisions
                cursor += duration * (-1 if node.tag == 'backup' else 1)
                if cursor < 0: raise ValueError(f'第 {mi+1} 小节 backup 超出起点。')
                extent = max(extent, cursor)
            elif node.tag == 'note':
                if node.find('grace') is not None: continue
                duration = Fraction(node.findtext('duration', '0')) / divisions
                if duration <= 0: raise ValueError(f'第 {mi+1} 小节存在缺少实际时值的音符。')
                is_chord = node.find('chord') is not None
                onset = chord if is_chord else cursor
                if not is_chord: chord = cursor; cursor += duration
                extent = max(extent, onset + duration)
                pitch = node.find('pitch')
                if pitch is not None:
                    step = pitch.findtext('step'); octave = int(pitch.findtext('octave', '4'))
                    if step not in ('C','D','E','F','G','A','B'): raise ValueError('无效音名。')
                    midi = Fraction((octave+1)*12 + dict(C=0,D=2,E=4,F=5,G=7,A=9,B=11)[step]) + Fraction(pitch.findtext('alter','0'))
                    notes.append((onset, duration, midi))
        result.append({'number': measure.get('number', str(mi+1)), 'events': notes, 'extent': extent})
    return result


def compare_scores(baseline, candidate, engine='external', start=0, end=None):
    a = events(read_musicxml(baseline)); b = events(read_musicxml(candidate))
    if end is None: end = len(a)-1
    if isinstance(start,bool) or isinstance(end,bool) or not isinstance(start,int) or not isinstance(end,int) or not 0 <= start <= end < len(a):
        raise ValueError('原结果的小节范围无效。')
    selected = a[start:end+1]
    report = {'version':1, 'engine':engine[:80], 'accuracy':None, 'changed':False,
              'baseline_sha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),
              'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),
              'range':{'start':start,'end':end}, 'baseline_measures':len(selected), 'candidate_measures':len(b),
              'comparable':len(selected)==len(b), 'scope':'pitch-onset-duration',
              'limitations':['一致不等于正确；未自动修改播放结果。','按选定范围的小节顺序对齐；需确认两份结果来自同一原谱范围。','不评估弧线、装饰音、力度、谱号字形或异名同音拼写。'], 'measures':[]}
    if not report['comparable']:
        report['reason']='小节数量不同，可能漏检或切分不同，拒绝按序逐音比较。'
        return report
    matched = total_a = total_b = pitch_matched = rhythm_matched = 0
    for i,(left,right) in enumerate(zip(selected,b),start):
        ca, cb = Counter(left['events']), Counter(right['events']); same = ca & cb
        count = sum(same.values()); matched += count; total_a += sum(ca.values()); total_b += sum(cb.values())
        pitch_same=sum((Counter(p for _,_,p in left['events'])&Counter(p for _,_,p in right['events'])).values())
        rhythm_same=sum((Counter((o,d)for o,d,_ in left['events'])&Counter((o,d)for o,d,_ in right['events'])).values())
        pitch_matched+=pitch_same;rhythm_matched+=rhythm_same
        def serial(counter):
            return [{'onset':str(o),'duration':str(d),'midi':str(p),'count':n} for (o,d,p),n in sorted(counter.items())]
        report['measures'].append({'index':i,'number':left['number'],'candidate_number':right['number'],
                                  'matched':count,'pitch_matched':pitch_same,'rhythm_matched':rhythm_same,'baseline_only':serial(ca-same),'candidate_only':serial(cb-same),
                                  'extent_matches':left['extent']==right['extent']})
    report.update(matched=matched,baseline_notes=total_a,candidate_notes=total_b,
                  agreement=2*matched/(total_a+total_b) if total_a+total_b else None,
                  pitch_content_agreement=2*pitch_matched/(total_a+total_b) if total_a+total_b else None,
                  rhythm_event_agreement=2*rhythm_matched/(total_a+total_b) if total_a+total_b else None,
                  differing_measures=sum(bool(m['baseline_only'] or m['candidate_only'] or not m['extent_matches']) for m in report['measures']))
    return report
