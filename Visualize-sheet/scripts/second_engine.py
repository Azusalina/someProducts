#!/usr/bin/env python3
"""Run installed homr locally, then compare its MusicXML without adopting it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import copy

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ensemble import compare_scores

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pdf',type=Path,required=True)
p.add_argument('--baseline',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--pages',type=int,nargs=2,metavar=('FIRST','LAST'),required=True)
p.add_argument('--start',type=int,default=0,help='Zero-based baseline measure index')
p.add_argument('--end',type=int,help='Inclusive baseline measure index')
p.add_argument('--homr',default=str(ROOT/'.runtime/bin/homr'))
p.add_argument('--timeout',type=int,default=1800)
a=p.parse_args()
if not 1<=a.pages[0]<=a.pages[1] or a.pages[1]-a.pages[0]>=16:p.error('choose 1–16 consecutive PDF pages')
out=a.output.resolve()
if out.exists():p.error('output must be a new directory; existing experiments are preserved')
out.mkdir(parents=True)
source=out/'input.pdf';shutil.copyfile(a.pdf,source)
metadata={'engine':'homr','pdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'pages':a.pages,'adopted':False}
try:
    images=[]
    for page in range(a.pages[0],a.pages[1]+1):
        print(f'Rendering page {page}',flush=True)
        prefix=out/f'page-{page:04d}'
        subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-r','300','-png',str(source),str(prefix)],check=True,timeout=120)
        images.append(str(prefix.with_suffix('.png')))
    executable=Path(a.homr).resolve()
    print('Running local homr; initial model download may take time.',flush=True)
    with(out/'homr.log').open('w')as log:
        for image in images:
            subprocess.run([str(executable),image],cwd=out,stdout=log,stderr=subprocess.STDOUT,timeout=a.timeout,check=True)
    results=sorted(out.glob('*.musicxml'))
    merged=[r for r in results if r.name.startswith('merged_')]
    if merged:results=merged
    if len(results)!=len(images):raise RuntimeError(f'expected {len(images)} page results; found {len(results)}; inspect homr.log')
    if len(results)>1:
        root=ET.parse(results[0]).getroot();parts=root.findall('part')
        if len(parts)!=1:raise RuntimeError('multi-page joining requires one piano part')
        part=parts[0]
        for result in results[1:]:
            more=ET.parse(result).getroot().findall('part')
            if len(more)!=1:raise RuntimeError('page part counts differ; inspect each result')
            for m in more[0].findall('measure'):part.append(copy.deepcopy(m))
        for i,m in enumerate(part.findall('measure'),1):m.set('number',str(i))
        joined=out/'merged.musicxml';ET.ElementTree(root).write(joined,encoding='utf-8',xml_declaration=True);results=[joined]
    report=compare_scores(a.baseline.resolve(),results[0],'homr',a.start,a.end)
    report.update(metadata)
    (out/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items()if k!='measures'},ensure_ascii=False,indent=2))
except (OSError,ValueError,RuntimeError,subprocess.SubprocessError)as exc:
    (out/'failure.json').write_text(json.dumps({**metadata,'error':str(exc)},ensure_ascii=False,indent=2)+'\n')
    sys.exit(str(exc))
