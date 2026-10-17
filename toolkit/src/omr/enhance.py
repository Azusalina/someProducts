#!/usr/bin/env python3
"""Local, reversible score-image candidates. No OMR accuracy is claimed."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import zipfile
from PIL import Image,ImageOps
import numpy as np

VERSION=1
MAX_PIXELS=40_000_000

def run(args):
    return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=60).stdout.decode(errors='replace')

def inspect(source,page):
    info=run(['pdfinfo',str(source)])
    def field(name):
        m=re.search(r'^'+re.escape(name)+r':\s*(.+)$',info,re.M);return m.group(1)if m else None
    pages=int(field('Pages')or 0)
    if not 1<=page<=pages:raise ValueError('Page is outside the PDF.')
    if field('Encrypted')and field('Encrypted').startswith('yes'):raise ValueError('Encrypted PDFs are not supported.')
    details=run(['pdfinfo','-f',str(page),'-l',str(page),str(source)])
    size=re.search(r'(?:Page\s+(?:\d+\s+)?size):\s*([\d.]+)\s*x\s*([\d.]+)\s*pts',details)
    if not size:raise ValueError('Cannot determine page dimensions.')
    width,height=map(float,size.groups());rot=re.search(r'Page\s+(?:\d+\s+)?rot:\s*(\d+)',details)
    if rot and int(rot.group(1))%180:width,height=height,width
    listing=run(['pdfimages','-f',str(page),'-l',str(page),'-list',str(source)])
    images=[]
    for line in listing.splitlines():
        c=line.split()
        if len(c)>=14 and c[0].isdigit()and c[2]=='image':
            images.append({'width':int(c[3]),'height':int(c[4]),'bits':int(c[7]),'x_dpi':float(c[12]),'y_dpi':float(c[13])})
    native=max([min(x['x_dpi'],x['y_dpi'])for x in images]+[0])
    # Preserve the scan's spatial sampling; upscaling a low-resolution raster
    # does not restore notehead/accidental detail. Keep vector pages at 400 DPI.
    dpi=min(900,max(300,int(round(native or 400))))
    estimated=round(width*dpi/72)*round(height*dpi/72)
    if estimated>MAX_PIXELS:raise ValueError('Page exceeds the 40 megapixel processing limit at its source resolution; crop it first.')
    return {'page':page,'pages':pages,'width_pt':width,'height_pt':height,'images':images,'render_dpi':dpi,'native_dpi':native or None,'estimated_pixels':estimated}

def open_beam_gap(image,roi,dpi):
    """Open only a visible narrow valley inside an explicitly selected beam pair.

    Requires ink above AND below the valley along the same slope. Fully solid
    bands have no recoverable gap evidence and are left untouched. Stem columns
    are protected. This produces a review candidate, never a ground-truth label.
    """
    x,y,w,h=roi
    left,top,right,bottom=round(x*image.width),round(y*image.height),round((x+w)*image.width),round((y+h)*image.height)
    if right-left<30 or bottom-top<12 or (right-left)*(bottom-top)>2_000_000:raise ValueError('Select a beam group between 30 pixels and 2 megapixels.')
    patch=np.array(image.crop((left,top,right,bottom)),copy=True);ink=patch<128
    height,width=ink.shape;xs=np.arange(max(2,round(width*.08)),width-max(2,round(width*.08)))
    offset=max(3,round(dpi/60));gap=max(1,round(dpi/400))
    best=None
    for slope in np.linspace(-.5,.5,101):
        delta=np.rint(slope*(xs-width/2)).astype(int)
        for center in range(offset+gap,height-offset-gap):
            ys=center+delta
            if ys.min()<offset+gap or ys.max()>=height-offset-gap:continue
            white=float((~ink[ys,xs]).mean())
            if not .12<=white<=.9:continue
            sides=min(float(ink[ys-offset,xs].mean()),float(ink[ys+offset,xs].mean()))
            if sides<.86:continue
            score=white*sides
            if best is None or score>best[0]:best=(score,slope,center)
    if best is None:return image.copy(),{'applied':False,'reason':'No unique visible gap with ink on both sides; no line was invented.'}
    _,slope,center=best;ys=np.rint(center+slope*(xs-width/2)).astype(int)
    reach=max(offset*3,round(dpi/20))
    # Stems are long vertical strokes extending beyond the beam band.
    protected=np.zeros(len(xs),dtype=bool)
    for direction in (-1,1):
        distances=np.arange(gap+1,reach+1);sample=ys[:,None]+direction*distances[None,:]
        valid=(sample>=0)&(sample<height);sample=np.clip(sample,0,height-1)
        ratio=(ink[sample,xs[:,None]]&valid).sum(axis=1)/len(distances)
        protected|=ratio>.94
    for dx in range(-max(1,round(dpi/300)),max(1,round(dpi/300))+1):
        if dx:protected|=np.roll(protected,dx)
    changed=0
    for dy in range(-gap//2+1,gap//2+1):
        keep=~protected;yy=ys[keep]+dy;xx=xs[keep]
        changed+=int((patch[yy,xx]<255).sum());patch[yy,xx]=255
    output=image.copy();output.paste(Image.fromarray(patch),(left,top))
    return output,{'applied':bool(changed),'changed_pixels':changed,'roi':roi,'slope':float(slope),'gap_width_px':gap,'visible_gap_fraction':float(best[0]),'manual_review_required':True}

def png(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()

def prepare(source,page=1,profile='preserve',roi=None,rotation=0):
    if profile not in ('preserve','contrast','deskew','beam-gap'):raise ValueError('Unknown enhancement profile.')
    if isinstance(rotation,bool) or not isinstance(rotation,(int,float)) or not np.isfinite(rotation) or not -5<=rotation<=5:raise ValueError('Rotation must be between -5 and 5 degrees.')
    meta=inspect(source,page);warnings=[]
    if meta['native_dpi'] and meta['native_dpi']>900:warnings.append('Source exceeds the 900 DPI processing cap; keep the original PDF for full detail.')
    if meta['native_dpi'] and meta['native_dpi']<300:warnings.append('The raster is upscaled to 300 DPI for processing; this does not restore missing detail.')
    with tempfile.TemporaryDirectory(prefix='toolkit-omr-render-')as work:
        prefix=Path(work)/'page'
        run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-r',str(meta['render_dpi']),'-gray','-png',str(source),str(prefix)])
        with Image.open(prefix.with_suffix('.png'))as im:
            if im.width*im.height>MAX_PIXELS:raise ValueError('Rendered page exceeds 40 megapixels.')
            original=im.convert('L')
    action={'applied':False}
    if profile=='contrast':candidate=ImageOps.autocontrast(original,cutoff=.2);action={'applied':True,'operation':'autocontrast','cutoff_percent':.2}
    elif profile=='deskew':
        if abs(rotation)<.02:candidate=original.copy();action={'applied':False,'reason':'Rotation below 0.02 degrees; original retained.'}
        else:candidate=original.rotate(float(rotation),resample=Image.Resampling.BICUBIC,expand=True,fillcolor=255);action={'applied':True,'operation':'rotate','degrees':float(rotation),'resampling':'bicubic','manual_review_required':True}
    elif profile=='beam-gap':
        if not isinstance(roi,list)or len(roi)!=4 or any(isinstance(v,bool)or not isinstance(v,(int,float))or not np.isfinite(v)for v in roi):raise ValueError('Select a normalized x/y/width/height region for the two beams.')
        x,y,w,h=roi
        if not(0<=x<1 and 0<=y<1 and w>0 and h>0 and x+w<=1 and y+h<=1):raise ValueError('Region is outside the page.')
        candidate,action=open_beam_gap(original,roi,meta['render_dpi'])
        warnings.append('Beam separation changes musical ink. Inspect every changed region before recognition; no accuracy gain is established.')
    else:candidate=original.copy()
    raw=png(original);enhanced=png(candidate);preview=original.copy();preview.thumbnail((1600,1800));preview_after=candidate.copy();preview_after.thumbnail((1600,1800))
    report={'version':VERSION,'source_name':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'profile':profile,'rotation_degrees':float(rotation),**meta,
            'width_px':original.width,'height_px':original.height,'source_unchanged':True,'accuracy':None,'action':action,
            'original_png_sha256':hashlib.sha256(raw).hexdigest(),'candidate_png_sha256':hashlib.sha256(enhanced).hexdigest(),
            'warnings':warnings,'limitations':['Image preparation does not repair pitches, voices, octave-shift scope, ties or MusicXML timing.','Retain original and candidate; higher sharpness or note count does not prove correctness.']}
    return report,raw,enhanced,png(preview),png(preview_after)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('--page',type=int,default=1);parser.add_argument('--profile',default='preserve');parser.add_argument('--roi',type=json.loads);parser.add_argument('--rotation',type=float,default=0);parser.add_argument('--output',type=Path);parser.add_argument('--pdf-output',type=Path);parser.add_argument('--preview-only',action='store_true')
    args=parser.parse_args()
    if any(p and p.resolve()==args.source.resolve()for p in (args.output,args.pdf_output)):raise ValueError('Output must not replace the source.')
    report,raw,candidate,preview,before=prepare(args.source,args.page,args.profile,args.roi,args.rotation)
    if args.pdf_output:
        with Image.open(io.BytesIO(candidate)) as page:
            page.save(args.pdf_output,format='PDF',resolution=report['render_dpi'],title=f"{args.source.stem} page {args.page} candidate",subject=f"Source SHA-256: {report['source_sha256']}; profile: {args.profile}",creator='Local Toolkit OMR Scan')
    if args.output:
        with zipfile.ZipFile(args.output,'x',zipfile.ZIP_DEFLATED)as z:
            z.writestr('report.json',json.dumps(report,indent=2)+'\n');z.writestr('original.png',raw);z.writestr('candidate.png',candidate)
        print(json.dumps({'report':report}))
    elif args.preview_only:print(json.dumps({'report':report,'before_preview':base64.b64encode(preview).decode(),'after_preview':base64.b64encode(before).decode()}))
    else:print(json.dumps({'report':report,'original_png':base64.b64encode(raw).decode(),'candidate_png':base64.b64encode(candidate).decode(),'before_preview':base64.b64encode(preview).decode(),'after_preview':base64.b64encode(before).decode()}))

if __name__=='__main__':
    signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
    try:main()
    except (ValueError,OSError,subprocess.SubprocessError)as exc:raise SystemExit(str(exc))
