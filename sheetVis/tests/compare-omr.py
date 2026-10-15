"""Compare pitch/beat/staff events of the self-authored fixture with local OMR."""
from fractions import Fraction
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


def events(root):
    result = []
    divisions = 1
    origin = Fraction(0)
    for measure in root.find('part').findall('measure'):
        if measure.find('attributes/divisions') is not None:
            divisions = int(measure.findtext('attributes/divisions'))
        current = previous = extent = Fraction(0)
        for element in measure:
            if element.tag == 'backup':
                current -= Fraction(int(element.findtext('duration')), divisions)
            elif element.tag == 'forward':
                current += Fraction(int(element.findtext('duration')), divisions)
                extent = max(extent, current)
            elif element.tag == 'note':
                duration = Fraction(int(element.findtext('duration', '0')), divisions)
                chord = element.find('chord') is not None
                onset = previous if chord else current
                if not chord:
                    previous = current
                pitch = element.find('pitch')
                if pitch is not None:
                    midi = (int(pitch.findtext('octave')) + 1) * 12 + {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[pitch.findtext('step')] + int(pitch.findtext('alter', '0'))
                    result.append((str(origin + onset), midi, str(duration), int(element.findtext('staff', '1'))))
                if not chord:
                    current += duration
                extent = max(extent, onset + duration, current)
        origin += extent
    return sorted(result)


if __name__ == '__main__':
    record = Path('test-results/pdf.json')
    job = json.loads(record.read_text()).get('job', '') if record.exists() else ''
    if not re.fullmatch('[a-f0-9]{32}', job):
        raise SystemExit('Run the PDF fixture test first to record its job ID.')
    source = Path('.data/jobs') / job / 'result-0.mxl'
    with zipfile.ZipFile(source) as archive:
        container = ET.fromstring(archive.read('META-INF/container.xml'))
        path = next(e.attrib['full-path'] for e in container.iter() if e.tag.split('}')[-1] == 'rootfile')
        recognized = ET.fromstring(archive.read(path))
    expected = events(ET.parse('public/demo.musicxml').getroot())
    actual = events(recognized)
    result = {'source': str(source), 'expected_notes': len(expected), 'recognized_notes': len(actual), 'same_pitch_onset_duration_staff': expected == actual, 'only_expected': [x for x in expected if x not in actual], 'only_recognized': [x for x in actual if x not in expected]}
    Path('test-results/omr-comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))
    if expected != actual:
        raise SystemExit(1)
