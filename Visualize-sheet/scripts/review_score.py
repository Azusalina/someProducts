#!/usr/bin/env python3
"""Prepare local, unlabelled digital-PDF evidence and a reversible pitch candidate."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from native_score_review import review,write_pitch_candidate,review_package,approved_report,validate_pitch_candidate

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--pdf',type=Path,required=True)
    p.add_argument('--job',type=Path,required=True,help='Existing completed cache directory; read only')
    p.add_argument('--output',type=Path,required=True,help='New directory; existing runs are never overwritten')
    p.add_argument('--labels',type=Path,help='Apply only explicitly accepted proposals from matching manual labels')
    a=p.parse_args()
    if a.output.exists():p.error('output must be a new directory')
    if a.output.resolve().is_relative_to(a.job.resolve()):p.error('output must not be inside the original cache')
    job=json.loads((a.job/'job.json').read_text());result=job['results'][0];baseline=a.job/result['name']
    if job.get('state')!='done':p.error('use a completed cache')
    if sha256(a.pdf.read_bytes()).hexdigest()!=job.get('sha256'):p.error('PDF hash does not match the baseline cache')
    mapping=json.loads((a.job/Path(result['name']).with_suffix('.map.json')).read_text())
    project=next((a.job/'output').glob('*.omr'))
    report=review(a.pdf,project,baseline,mapping)
    if not report['native_head_candidates']:p.error('no supported embedded Opus notehead glyphs; use the image OMR workflow')
    if a.labels:report=approved_report(report,json.loads(a.labels.read_text()))
    a.output.mkdir(parents=True)
    (a.output/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    pending=a.output/'candidate.pending.musicxml'
    write_pitch_candidate(baseline,report,pending)
    validation=validate_pitch_candidate(baseline,report,pending)
    validation.update(source_unchanged=sha256(a.pdf.read_bytes()).hexdigest()==report['source_sha256'],baseline_unchanged=sha256(baseline.read_bytes()).hexdigest()==report['baseline_sha256'])
    (a.output/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
    pending.replace(a.output/'candidate.musicxml')
    review_package(a.pdf,a.job,report,a.output)
    print(json.dumps({k:v for k,v in report.items()if k not in ('glyphs','native_unmatched_heads','matches','pitch_findings','proposals','octave_ranges')},ensure_ascii=False,indent=2))
    print(f"Pitch proposals: {len(report['proposals'])}; pitch conflicts: {len(report['pitch_findings'])}; octave labels: {len(report['octave_ranges'])}")

if __name__=='__main__':main()
