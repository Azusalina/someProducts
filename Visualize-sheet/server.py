"""Loopback-only static app and asynchronous local Audiveris jobs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import signal
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
import uuid
import xml.etree.ElementTree as ET
import zipfile
from omr_support import repair_meters, repair_dynamics, source_map, repair_initial_meter, INITIAL_METERS, read_musicxml
from octave_support import audit_octaves, training_bundle
from octave_repair import repair_octaves
from native_ornaments import recover_ornaments, small_music_font
from symbol_repair import repair_symbols, audit_export
from region_support import measure_regions, selection, context_at, merge_region
from curve_repair import recover_curves
from ensemble import compare_scores, events
from assist_support import progress as assistance_progress
from rhythm_repair import repair_beam_links, repair_repeated_tuplets, audit_rhythm

ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 40 * 1024 * 1024
MAX_JOBS = 8
TIMEOUT = 3600
CONFIG_LOCK = threading.Lock()
PIPELINE = 'image-octave-tuplet-curves-v9'
OMR_STEPS = ('LOAD', 'BINARY', 'SCALE', 'GRID', 'HEADERS', 'STEM_SEEDS', 'BEAMS', 'LEDGERS', 'HEADS', 'STEMS', 'REDUCTION', 'CUE_BEAMS', 'TEXTS', 'MEASURES', 'CHORDS', 'CURVES', 'SYMBOLS', 'LINKS', 'RHYTHMS', 'PAGE')


def configuration():
    path = ROOT / 'config.json'
    config = json.loads(path.read_text()) if path.exists() else {}
    if not isinstance(config, dict):
        raise ValueError('config.json 必须是 JSON 对象。')
    override = os.environ.get('SHEETVIS_DEFAULT_SCORE')
    if override is not None:
        config['default_score'] = override
    return config


def recognition_resources(config):
    """Bound engine parallelism; one job owns these resources at a time."""
    cpus = max(1, len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else (os.cpu_count() or 1))
    requested = config.get('recognition_threads', 0)
    memory = config.get('recognition_memory_mb', 2048)
    if isinstance(requested, bool) or not isinstance(requested, int) or not 0 <= requested <= 64:
        raise ValueError('recognition_threads 必须是 0–64 的整数（0 为自动）。')
    if isinstance(memory, bool) or not isinstance(memory, int) or not 512 <= memory <= 16384:
        raise ValueError('recognition_memory_mb 必须是 512–16384 的整数。')
    threads = min(cpus, requested or min(8, max(1, cpus - 2)))
    # Low-memory machines should not launch several heavy recognition stages.
    if not requested:
        try:
            available = int(re.search(r'MemAvailable:\s+(\d+)', Path('/proc/meminfo').read_text()).group(1)) // 1024
            threads = min(threads, max(1, available // 768))
            memory = min(memory, max(512, available // 2))
        except (OSError, AttributeError, ValueError):
            pass
    return {'threads': threads, 'memory_mb': memory, 'parallel': threads > 1}


def engine_options(engine, resources):
    # Book-wide parallelism uses an unbounded pool upstream. Keep pages ordered
    # for cross-page rhythm context; parallelize systems inside each page.
    parallel = str(resources['parallel']).lower()
    return [str(engine), '-batch', '-swap', '-constant',
            f'org.audiveris.omr.util.OmrExecutors.useParallelism={parallel}',
            '-constant', 'org.audiveris.omr.sheet.Book.processAllStubsInParallel=false']


def save_configuration(changes):
    with CONFIG_LOCK:
        path=ROOT/'config.json'
        config=json.loads(path.read_text()) if path.exists() else {}
        if not isinstance(config,dict): raise ValueError('config.json 必须是 JSON 对象。')
        config.update(changes)
        temp=path.with_suffix('.json.part');temp.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
        return config


def copy_project(project, target, pdf):
    """Stream-copy a checkpoint and rebase its input without expanding it in RAM."""
    temp=target.with_suffix('.omr.part')
    try:
        with zipfile.ZipFile(project) as source, zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as output:
            book=ET.fromstring(source.read('book.xml'));book.set('path',str(pdf))
            for path in book.findall('sheet/input/path'):
                path.text=str(pdf)
            for entry in source.infolist():
                if entry.filename=='book.xml':
                    output.writestr(entry,ET.tostring(book,encoding='utf-8',xml_declaration=True))
                else:
                    with source.open(entry) as reader,output.open(entry,'w') as writer:
                        shutil.copyfileobj(reader,writer)
        temp.replace(target)
    finally:
        temp.unlink(missing_ok=True)


def score_override(digest):
    overrides=configuration().get('score_overrides',{})
    if not isinstance(overrides,dict): raise ValueError('score_overrides 必须为 JSON 对象。')
    settings=overrides.get(digest,{})
    if not isinstance(settings,dict): raise ValueError('单份乐谱配置必须为 JSON 对象。')
    return settings


def initial_meter_for(digest):
    """Context is explicitly configured per file hash, never inferred by title."""
    settings=score_override(digest)
    meter=settings.get('initial_meter')
    if meter is None: return None
    if not isinstance(meter,str) or meter not in {f'{n}/{d}' for n,d in INITIAL_METERS}:
        raise ValueError('score_overrides 的 initial_meter 无效。')
    return meter


def implicit_tuplets_for(digest):
    value=score_override(digest).get('implicit_tuplets',False)
    if not isinstance(value,bool): raise ValueError('implicit_tuplets 必须为 true 或 false。')
    return value


def small_notes_for(digest):
    value=score_override(digest).get('small_notes',False)
    if not isinstance(value,bool): raise ValueError('small_notes 必须为 true 或 false。')
    return value


def input_dpi_for(digest):
    value=score_override(digest).get('input_dpi',300)
    if not isinstance(value,int) or isinstance(value,bool) or value not in (300,400,600): raise ValueError('input_dpi 必须为 300、400 或 600。')
    return value


def validate_export_notes(files,baseline=0):
    count=sum(len(read_musicxml(path).findall('.//note/pitch')) for path in files)
    if baseline and count < baseline*.97:
        raise RuntimeError(f'重新识别仅导出 {count} 个音符，少于原缓存的 {baseline} 个；未采用可能严重漏音的结果，原缓存保留。')
    return count


class RecognitionCancelled(Exception):
    pass


def default_score():
    value = configuration().get('default_score')
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def quality_report(log, inherited=None):
    # These are engine diagnostics, not ground-truth accuracy or confidence scores.
    rhythms = sorted(set(re.findall(r'\[score#(\d+)\].*?S(\d+) MeasureStack#(\d+) no correct rhythm', log)))
    offsets = set(re.findall(r'\[score#(\d+)\].*?No timeOffset for (\w+Inter#\d+)', log))
    export_errors = sorted(set(re.findall(r'Error visiting Measure\{#(\d+)\} in \{Page#(\d+)\.\d+\}', log)))
    inherited = inherited or {}
    issues = {(int(p),int(s),int(m)) for p,s,m in rhythms}
    issues.update((r['page'],r['system'],r['stack']) for r in inherited.get('rhythm_issues',[]))
    return {'rhythm_issues': [{'page':p,'system':s,'stack':m} for p,s,m in sorted(issues)],
            'missing_offsets': max(len(offsets),inherited.get('missing_offsets',0)), 'export_errors': [{'page': int(p), 'stack': int(m)} for m, p in export_errors], 'accuracy': None}


def recognition_progress(log, state, phase='recognize', selected_pages=None, remaining_steps=None):
    if state == 'done':
        return {"progress": 100, "stage": "完成"}
    if state == 'cancelled' and not log.strip():
        return {'progress':0,'stage':'已中断'}
    if state == 'queued':
        return {"progress": 0, "stage": "排队"}
    match = re.search(r'\b(\d+) sheets? in ', log)
    pages = max(1, int(match.group(1))) if match else 1
    if phase == 'recognize' and 'SHEETVIS_TRANSCRIBE' in log:
        log = log.split('SHEETVIS_TRANSCRIBE')[-1]
    steps = re.findall(r'StepMonitoring\s+\d+\s*\|\s*([A-Z_]+)', log)
    reached = sum(step in OMR_STEPS for step in steps)
    # The emitted step has just started; count only preceding stage slots.
    pages = selected_pages or pages
    if phase == 'scan':
        progress = min(24, 2 + int(23 * max(0, reached - 1) / (pages * 4)))
    else:
        progress = min(95, 25 + int(70 * max(0, reached - 1) / (remaining_steps or pages * 16)))
    stage = steps[-1] if steps else '启动'
    if 'Exporting sheet(s)' in log or 'exported to ' in log:
        progress, stage = 97, '导出'
    if state == 'error': stage = '失败'
    if state == 'cancelling': stage = '正在中断'
    if state == 'cancelled': stage = '已中断'
    detail = {}
    for line in reversed(log.splitlines()):
        context = re.search(r'\[score(?:#(\d+))?\]', line)
        if not context: continue
        if context.group(1): detail['current_page'] = int(context.group(1))
        elif pages == 1: detail['current_page'] = 1
        system = re.search(r'\bS(\d+)\b',line)
        measure = re.search(r'(?:MeasureStack#|Measure\{#)(\d+)',line)
        if system: detail['current_system'] = int(system.group(1))
        if measure: detail['current_measure'] = int(measure.group(1))
        break
    return {"progress": progress, "stage": stage, "pages": pages, **detail}


def staff_pages(project):
    """Reuse Audiveris GRID detection; never transcribe sheets without five-line staves."""
    with zipfile.ZipFile(project) as archive:
        book = ET.fromstring(archive.read('book.xml'))
        total = len(book.findall('sheet'))
        selected = []
        for path in archive.namelist():
            match = re.fullmatch(r'sheet#(\d+)/sheet#\1\.xml', path)
            if not match:
                continue
            sheet = ET.fromstring(archive.read(path))
            if any(len(staff.findall('lines/line')) == 5 for staff in sheet.iter('staff')):
                selected.append(int(match.group(1)))
    selected.sort()
    return total, selected


def completed_pages(project):
    with zipfile.ZipFile(project) as archive:
        book = ET.fromstring(archive.read('book.xml'))
        return [int(s.get('number')) for s in book.findall('sheet') if 'PAGE' in s.findtext('steps', '').split()]


def engine_path():
    configured = os.environ.get("SHEETVIS_AUDIVERIS")
    if configured:
        return Path(configured).expanduser().resolve()
    installed = shutil.which("audiveris") or shutil.which("Audiveris")
    return Path(installed) if installed else ROOT / ".runtime/audiveris/opt/audiveris/bin/Audiveris"


def comparison_identity(pdf, baseline, first, last, start, end):
    xml=ET.canonicalize(ET.tostring(read_musicxml(baseline),encoding='unicode'),strip_text=True)
    value={'pdf':hashlib.sha256(pdf.read_bytes()).hexdigest(),'xml':hashlib.sha256(xml.encode()).hexdigest(),
           'pages':[first,last],'range':[start,end],'engine':'homr-0.7.0','comparison_version':2}
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()


class JobStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.mapping_lock = threading.Lock()
        self.jobs = {}
        for path in self.directory.glob('*/job.json'):
            try:
                job = json.loads(path.read_text());original=json.dumps(job,sort_keys=True)
                if re.fullmatch(r'[a-f0-9]{32}', path.parent.name) and job.get('id') == path.parent.name:
                    if job.get('second_engine') and job.get('requested_by')!='user' and job.get('state')in ('queued','running','cancelling'):
                        job.update(state='cancelled',message='自动 homr 已停用；仅接受手动启动。')
                    if job.get('assistance'):
                        job['assistance'].update(state='stopped',message='自动 homr 已停用；已有报告保留。')
                    if job.get('state') == 'cancelling': job.update(state='cancelled',message='识别已中断。')
                    if job.get('state') in ('queued', 'running'):
                        job.update(state='error', message='服务重启，识别任务已中断。')
                    self.jobs[job['id']] = job
                    if json.dumps(job,sort_keys=True)!=original:self.persist(job['id'])
            except (OSError, ValueError):
                pass
        self.process = None
        self.active_id = None
        self.cancel_requested = set()
        self.futures = {}
        self.stopping = False
        self.deadline = None
        self.default_file_hash = None
        self.executor = ThreadPoolExecutor(max_workers=1)

    def create(self, data, filename=""):
        with self.lock:
            if self.stopping:
                raise ValueError("服务正在停止。")
            digest = hashlib.sha256(data).hexdigest()
            initial_meter = initial_meter_for(digest)
            implicit_tuplets = implicit_tuplets_for(digest)
            input_dpi = input_dpi_for(digest)
            small_notes = small_notes_for(digest)
            matches = [j for j in self.jobs.values() if j.get('sha256') == digest and not j.get('pending_region')]
            for cached in sorted(matches, key=lambda j: j.get('created', 0), reverse=True):
                if cached.get('pipeline') != PIPELINE:continue
                if not cached.get('region') and (cached.get('initial_meter') != initial_meter or cached.get('implicit_tuplets',False) != implicit_tuplets or cached.get('input_dpi',300)!=input_dpi or cached.get('small_notes',False)!=small_notes):continue
                available = cached['state'] in ('queued', 'running') or (cached['state'] == 'done' and all((self.directory / cached['id'] / r['name']).is_file() for r in cached.get('results', [])) and cached.get('results'))
                if available:
                    if filename and not cached.get('filename'):
                        cached['filename'] = Path(filename).name[:200]; self.persist(cached['id'])
                    return cached['id']
            if sum(j["state"] in ("queued", "running", "cancelling") for j in self.jobs.values()) >= MAX_JOBS:
                raise ValueError("识别队列已满，请等待当前乐谱处理完成。")
            identifier = uuid.uuid4().hex
            directory = self.directory / identifier
            directory.mkdir()
            (directory / "score.pdf").write_bytes(data)
            job = {"id": identifier, "state": "queued", "created": time.time(), "message": "等待本地识别", "sha256": digest, "pipeline": PIPELINE, "results": [], "filename": Path(filename).name[:200]}
            if initial_meter: job['initial_meter']=initial_meter
            if implicit_tuplets: job['implicit_tuplets']=True
            if small_music_font(directory/'score.pdf'): job['small_notes_font']=True
            if small_notes:job['small_notes']=True
            job['input_dpi']=input_dpi
            for previous in sorted(matches,key=lambda j:j.get('created',0),reverse=True):
                if previous['state']=='done' and previous.get('results'):
                    try:
                        job['baseline_notes']=sum(len(read_musicxml(self.directory/previous['id']/r['name']).findall('.//note/pitch')) for r in previous['results'])
                        job['compared_with']=previous['id'];break
                    except (OSError,zipfile.BadZipFile,ET.ParseError,KeyError,StopIteration): pass
            # Resume saved OMR stages for the identical PDF after a failed run.
            for previous in sorted(matches, key=lambda j: j.get('created', 0), reverse=True):
                if previous.get('region'):continue
                if previous.get('small_notes',False)!=small_notes: continue
                if previous.get('initial_meter') not in (None,initial_meter): continue
                if previous.get('implicit_tuplets') and not implicit_tuplets: continue
                if previous.get('input_dpi',300)!=input_dpi: continue
                if previous['state'] not in ('error','done','cancelled') or previous.get('phase') != 'recognize':
                    continue
                projects = sorted((self.directory / previous['id'] / 'output').rglob('*.omr'))
                checkpoint = self.directory / previous['id'] / 'checkpoint.omr'
                if checkpoint.is_file(): projects.append(checkpoint)
                restored = False
                for project in projects:
                    try:
                        total, selected = staff_pages(project)
                        if not selected: continue
                        output = directory / 'output'; output.mkdir(exist_ok=True)
                        target=output/'score.omr';copy_project(project,target,directory/'score.pdf')
                        old_log = self.directory / previous['id'] / 'engine.log'
                        if old_log.exists(): shutil.copyfile(old_log, directory/'previous.log')
                        job['resumed_from'] = previous['id']
                        job['upgraded_from_complete'] = previous['state'] == 'done'
                        if previous['state']=='done':
                            for bi,result in enumerate(previous.get('results',[])):
                                old=self.directory/previous['id']/result['name']
                                if old.exists():shutil.copyfile(old,directory/f'baseline-{bi}{old.suffix}')
                        else:
                            for old in (self.directory/previous['id']).glob('baseline-*'):
                                if old.is_file():shutil.copyfile(old,directory/old.name)
                        job['inherited_rhythm_quality'] = previous.get('quality') if previous['state'] == 'done' else None
                        restored = True;break
                    except (OSError,zipfile.BadZipFile,ET.ParseError,KeyError): continue
                if restored: break
            self.jobs[identifier] = job
            self.persist(identifier)
            self.futures[identifier] = self.executor.submit(self.run, identifier)
        return identifier

    def ensure_assistance(self, identifier):
        """Compatibility for old tabs: reading this endpoint never starts work."""
        with self.lock:
            job=self.jobs.get(identifier)
            if job is None:raise KeyError(identifier)
            plan=job.get('assistance')
            if not plan:return {'state':'disabled','pages':[],'manual_only':True}
            result=assistance_progress(plan,self.jobs)
            if result['state']in ('pending','running'):result['state']='stopped'
            return {**result,'manual_only':True,'message':'自动 homr 已停用；已有报告保留。'}

    def schedule_assistance(self, identifier):
        """Legacy continuation hook intentionally cannot enqueue homr work."""
        return

    def create_second_engine(self, parent_id, result=0, first=1, last=1, start=0, end=None, *, manual=False):
        if not manual:raise ValueError('homr 核查需要手动点击启动。')
        with self.lock:
            if self.stopping:raise ValueError('服务正在停止。')
            parent=self.jobs.get(parent_id)
            if not parent or parent['state']!='done' or parent.get('second_engine'):raise ValueError('需要已完成的原识别缓存。')
            if any(isinstance(v,bool)or not isinstance(v,int)for v in (result,first,last,start))or (end is not None and (isinstance(end,bool)or not isinstance(end,int))):raise ValueError('页码和小节序号必须为整数。')
            if not 0<=result<len(parent['results'])or not 1<=first<=last or last-first>=16:raise ValueError('请选择 1–16 个连续 PDF 页面和有效乐章。')
            if parent.get('total_pages')and last>parent['total_pages']:raise ValueError('页码超出 PDF。')
            from ensemble import events
            count=len(events(read_musicxml(self.directory/parent_id/parent['results'][result]['name'])))
            if not 0<=start< count or (end is not None and not start<=end<count):raise ValueError('小节范围超出原结果。')
            end=count-1 if end is None else end
            request={'parent':parent_id,'result':result,'first':first,'last':last,'start':start,'end':end}
            source=self.directory/parent_id;baseline=source/parent['results'][result]['name']
            identity=comparison_identity(source/'score.pdf',baseline,first,last,start,end)
            for job in self.jobs.values():
                if not job.get('second_engine')or job['state']not in ('queued','running','done'):continue
                if job['state']in ('queued','running')and job.get('requested_by')!='user':continue
                if job['state']=='done'and not isinstance(job.get('comparison'),dict):continue
                previous=job['second_engine'];key=job.get('comparison_identity')
                if key is None:
                    try:
                        previous_dir=self.directory/job['id'];old=next(previous_dir.glob('baseline.*'))
                        count_old=len(events(read_musicxml(old)))
                        key=comparison_identity(previous_dir/'score.pdf',old,previous['first'],previous['last'],previous['start'],previous.get('end')if previous.get('end')is not None else count_old-1)
                    except (OSError,ValueError,KeyError,StopIteration,ET.ParseError,zipfile.BadZipFile):continue
                if key==identity:return job['id']
            executable=ROOT/'.runtime/bin/homr'
            if not executable.is_file():raise ValueError('本机尚未安装 homr，参见 README 的安装步骤。')
            if sum(j['state']in ('queued','running','cancelling')for j in self.jobs.values())>=MAX_JOBS:raise ValueError('识别队列已满。')
            identifier=uuid.uuid4().hex;directory=self.directory/identifier;directory.mkdir()
            try:
                source=self.directory/parent_id
                shutil.copyfile(source/'score.pdf',directory/'score.pdf')
                baseline=source/parent['results'][result]['name'];shutil.copyfile(baseline,directory/('baseline'+baseline.suffix))
                job={'id':identifier,'state':'queued','created':time.time(),'filename':parent.get('filename','乐谱.pdf')+' · homr 核查','results':[],
                     'message':'等待本地 homr 核查','pipeline':PIPELINE,'second_engine':request,'requested_by':'user','comparison_identity':identity}
                self.jobs[identifier]=job;self.persist(identifier);self.futures[identifier]=self.executor.submit(self.run,identifier)
            except Exception:
                self.jobs.pop(identifier,None);shutil.rmtree(directory);raise
            return identifier

    def run_second_engine(self, identifier):
        job=self.jobs[identifier]
        if job.get('requested_by')!='user':
            self.update(identifier,state='cancelled',message='自动 homr 已停用；仅接受手动启动。');return
        request=job['second_engine'];directory=self.directory/identifier
        self.deadline=time.monotonic()+TIMEOUT
        self.update(identifier,state='running',message=f"homr 核查 PDF 第 {request['first']}–{request['last']} 页",phase='compare')
        # A cancelled run is kept for inspection; a retry creates a new job.
        command=[sys.executable,str(ROOT/'scripts/second_engine.py'),'--pdf',str(directory/'score.pdf'),
                 '--baseline',str(next(directory.glob('baseline.*'))),'--output',str(directory/'second-engine'),
                 '--pages',str(request['first']),str(request['last']),'--start',str(request['start'])]
        if request['end']is not None:command+=['--end',str(request['end'])]
        try:
            with(directory/'engine.log').open('wb')as log:
                code=self.execute(command,dict(os.environ),log)
            if code:raise RuntimeError('homr 核查未完成，请查看日志；原识别结果保留。')
            report=json.loads((directory/'second-engine/comparison.json').read_text())
            self.update(identifier,state='done',message='多引擎核查完成，原结果保持不变。',comparison=report)
        except (OSError,ValueError,RuntimeError,subprocess.SubprocessError,StopIteration)as exc:
            self.update(identifier,state='error',message=str(exc))

    def regions(self,identifier,index=0):
        job=self.get(identifier)
        if not job or job['state']!='done' or index!=0 or len(job.get('results',[]))!=1:raise ValueError('请选择已完成、单乐章的钢琴乐谱。')
        directory=self.directory/identifier
        project=directory/'base-project.omr' if job.get('region') else next((directory/'output').rglob('*.omr'),None)
        if project is None or not project.is_file():raise ValueError('原识别工程不存在。')
        return measure_regions(project,directory/job['results'][0]['name'])

    def create_region(self,parent_id,start,end,dpi=400,implicit_tuplets=False):
        if type(dpi)is not int or dpi not in (400,600) or type(implicit_tuplets)is not bool:raise ValueError('局部识别分辨率限 400／600 DPI。')
        parent=self.get(parent_id)
        if not parent or parent.get('pending_region'):raise ValueError('请选择已采用的完整乐谱缓存。')
        regions=self.regions(parent_id);region=selection(regions,start,end)
        parent_mapping=json.loads(self.mapping(parent_id,'result-0.map.json'))
        with self.mapping_lock,self.lock:
            if self.stopping:raise ValueError('服务正在停止。')
            for existing in sorted(self.jobs.values(),key=lambda j:j.get('created',0),reverse=True):
                chosen=existing.get('region',{})
                if existing.get('pending_region')and existing['state']in('queued','running','done')and chosen.get('parent')==parent_id and chosen.get('start')==start and chosen.get('end')==end and existing.get('input_dpi')==dpi and existing.get('implicit_tuplets',False)==implicit_tuplets:return existing['id']
            if parent_id not in self.jobs:raise ValueError('原缓存已删除。')
            if sum(j['state']in('queued','running','cancelling')for j in self.jobs.values())>=MAX_JOBS:raise ValueError('识别队列已满。')
            identifier=uuid.uuid4().hex;directory=self.directory/identifier;directory.mkdir()
            source=self.directory/parent_id
            project=source/'base-project.omr' if parent.get('region') else next((source/'output').rglob('*.omr'))
            shutil.copyfile(source/'score.pdf',directory/'score.pdf');shutil.copyfile(source/parent['results'][0]['name'],directory/'parent.mxl')
            copy_project(project,directory/'base-project.omr',directory/'score.pdf')
            (directory/'parent.map.json').write_text(json.dumps(parent_mapping))
            xml=read_musicxml(directory/'parent.mxl');part=xml.find('part')
            first=min(r['index']for r in regions if r['page']==region['page'] and r['crop_y']>=region['crop']['y']-1e-7 and r['crop_y']<region['crop']['y']+region['crop']['h'])
            attrs=context_at(part,first+1);time_element=attrs.find('time')
            meter=(time_element.findtext('beats')+'/'+time_element.findtext('beat-type'))if time_element is not None else score_override(parent.get('sha256','')).get('verified_initial_meter')
            job={'id':identifier,'state':'queued','created':time.time(),'sha256':parent.get('sha256'),'pipeline':PIPELINE,'filename':parent.get('filename','乐谱.pdf'),'results':[],'message':'等待局部识别','input_dpi':dpi,'implicit_tuplets':implicit_tuplets,'pending_region':True,'region':{**region,'parent':parent_id},'parent_quality':parent.get('quality'),'parent_pages':{k:parent.get(k)for k in ('total_pages','included_pages','skipped_pages')}}
            if meter:job['initial_meter']=meter
            self.jobs[identifier]=job;self.persist(identifier);self.futures[identifier]=self.executor.submit(self.run,identifier)
        return identifier

    def accept_region(self,identifier):
        with self.lock:
            job=self.jobs.get(identifier)
            if not job:raise KeyError(identifier)
            if job['state']!='done' or not job.get('region'):raise ValueError('局部识别尚未完成。')
            job['pending_region']=False;self.persist(identifier)
        return self.get(identifier)

    def get(self, identifier):
        with self.lock:
            job = dict(self.jobs[identifier]) if identifier in self.jobs else None
        if job is not None:
            job['upgrade_available'] = job.get('pipeline') != PIPELINE or job.get('initial_meter') != initial_meter_for(job.get('sha256','')) or job.get('implicit_tuplets',False) != implicit_tuplets_for(job.get('sha256',''))
            job['upgrade_available'] |= job.get('input_dpi',300)!=input_dpi_for(job.get('sha256',''))
            job['upgrade_available'] |= job.get('small_notes',False)!=small_notes_for(job.get('sha256',''))
        if job is not None and (job.get('region')or job.get('second_engine')):job['upgrade_available']=False
        if job is None:
            return None
        if job.get('assistance'):
            job['assistance']=self.ensure_assistance(identifier)
        path = self.directory / identifier / 'engine.log'
        try:
            log = path.read_text(errors='replace') if path.exists() else ''
        except OSError:
            log = ''
        job.update(recognition_progress(log, job['state'], job.get('phase', 'scan'), job.get('page_count'), job.get('remaining_steps')))
        if job['state'] == 'done':
            job['quality'] = job.get('parent_quality') if job.get('region') else quality_report(log,job.get('inherited_rhythm_quality'))
            job['results'] = [{**r, 'mapping':f'/api/jobs/{identifier}/{Path(r["name"]).stem}.map.json'} for r in job.get('results', [])]
        return job

    def cache_entries(self):
        selected=self.default_selection()
        default_id=selected.get('job_id') if selected else None
        with self.lock:
            entries = []
            for job in sorted(self.jobs.values(), key=lambda j:j.get('created',0), reverse=True):
                directory = self.directory / job['id']
                if not directory.is_dir() or directory.is_symlink(): continue
                size = 0
                for p in directory.rglob('*'):
                    try:
                        if p.is_file() and not p.is_symlink(): size += p.stat().st_size
                    except OSError: pass
                entries.append({'id':job['id'], 'filename':job.get('filename') or f"乐谱 {job['id'][:8]}.pdf",
                    'state':job['state'], 'created':job.get('created',0), 'bytes':size,
                    'pages':job.get('total_pages'), 'results':len(job.get('results',[])), 'is_default':job['id']==default_id,
                    'second_engine':bool(job.get('second_engine')),'pending_region':job.get('pending_region',False),'upgrade_available':job.get('pipeline')!=PIPELINE or job.get('initial_meter')!=initial_meter_for(job.get('sha256','')) or job.get('implicit_tuplets',False)!=implicit_tuplets_for(job.get('sha256','')) or job.get('input_dpi',300)!=input_dpi_for(job.get('sha256','')) or job.get('small_notes',False)!=small_notes_for(job.get('sha256',''))})
            for entry in entries:
                if self.jobs[entry['id']].get('region')or self.jobs[entry['id']].get('second_engine'):entry['upgrade_available']=False
        return entries

    def delete_cache(self, identifier):
        with self.mapping_lock, self.lock:
            job = self.jobs.get(identifier)
            if job is None: raise KeyError(identifier)
            if job['state'] in ('queued','running','cancelling'): raise ValueError('识别任务仍在运行，不能删除。')
            directory = self.directory / identifier
            if directory.is_symlink(): raise ValueError('不删除链接目录。')
            if configuration().get('default_cache') == identifier: save_configuration({'default_cache':None})
            if directory.exists(): shutil.rmtree(directory)
            del self.jobs[identifier]

    def default_selection(self):
        def descriptor(job,active=False):
            if not job or job.get('pending_region'): return None
            if active:
                if job['state'] not in ('queued','running','cancelling'): return None
            elif job['state']!='done' or not job.get('results'): return None
            identifier=job['id'];directory=self.directory/identifier
            if not (directory/'score.pdf').is_file() or not all((directory/r['name']).is_file() for r in job.get('results',[])): return None
            return {'job_id':identifier,'name':job.get('filename') or f'乐谱 {identifier[:8]}.pdf','available':True,'url':f'/api/jobs/{identifier}/score.pdf'}
        identifier=configuration().get('default_cache') if os.environ.get('SHEETVIS_DEFAULT_SCORE') is None else None
        with self.lock:
            if isinstance(identifier,str) and re.fullmatch(r'[a-f0-9]{32}',identifier):
                selected=descriptor(self.jobs.get(identifier))
                if selected: return selected
        # The external default PDF may already have a completed cache. Resolve
        # it before startup, instead of uploading/recognising it on every reload.
        source=default_score()
        try:
            if source is None or not source.is_file() or source.stat().st_size>MAX_UPLOAD: return None
            stat=source.stat();key=(str(source.resolve()),stat.st_mtime_ns,stat.st_ctime_ns,stat.st_size)
            cached=self.default_file_hash
            digest=cached[1] if cached and cached[0]==key else hashlib.sha256(source.read_bytes()).hexdigest()
            self.default_file_hash=(key,digest)
        except OSError: return None
        with self.lock:
            for job in sorted(self.jobs.values(),key=lambda j:j.get('created',0),reverse=True):
                if job.get('sha256')==digest:
                    selected=descriptor(job)
                    if selected: return {**selected,'name':source.name}
            for job in sorted(self.jobs.values(),key=lambda j:j.get('created',0),reverse=True):
                if job.get('sha256')==digest:
                    selected=descriptor(job,active=True)
                    if selected:return {**selected,'name':source.name}
        return None

    def set_default(self,identifier):
        with self.lock:
            job=self.jobs.get(identifier)
            if not job: raise KeyError(identifier)
            directory=self.directory/identifier
            if job.get('pending_region'):raise ValueError('请先检查并采用局部识别候选。')
            if job['state']!='done' or not job.get('results') or not (directory/'score.pdf').is_file() or not all((directory/r['name']).is_file() for r in job['results']):
                raise ValueError('只有完整的已完成缓存可设为默认。')
            save_configuration({'default_cache':identifier})
        return self.default_selection()

    def cancel(self, identifier):
        with self.lock:
            job=self.jobs.get(identifier)
            if not job: raise KeyError(identifier)
            if job['state'] not in ('queued','running','cancelling'): return
            self.cancel_requested.add(identifier)
            if self.active_id != identifier:
                future=self.futures.pop(identifier,None)
                if future: future.cancel()
                job.update(state='cancelled',message='已取消排队，文件与缓存保留。')
                self.persist(identifier);self.cancel_requested.discard(identifier);return
            job.update(state='cancelling',message='正在中断识别，保留已保存进度。')
            self.persist(identifier)
            process=self.process
        if process: self.stop_process(process)

    def check_cancelled(self, identifier):
        with self.lock:
            if identifier in self.cancel_requested: raise RecognitionCancelled()

    def checkpoint(self, identifier, project):
        self.check_cancelled(identifier)
        directory=self.directory/identifier;temp=directory/'checkpoint.omr.part'
        shutil.copyfile(project,temp);temp.replace(directory/'checkpoint.omr')

    def octave_review(self, identifier):
        with self.mapping_lock:
            with self.lock:
                job = self.jobs.get(identifier)
                if not job: raise KeyError(identifier)
                if job['state'] != 'done': raise ValueError('识别尚未完成。')
                existing = job.get('octave_audit')
            if existing is not None: return existing
            directory = self.directory / identifier
            projects = sorted((directory/'output').rglob('*.omr'))
            if not projects: raise ValueError('此缓存没有 OMR 工程。')
            result = audit_octaves(projects[0],directory/'score.pdf')
            self.update(identifier,octave_audit=result)
            return result

    def mapping(self, identifier, name):
        with self.mapping_lock:
            directory = self.directory / identifier
            cached = directory / name
            if cached.exists():
                data = cached.read_bytes()
                if json.loads(data).get('version') == 4: return data
            index = int(re.fullmatch(r'result-(\d+)\.map\.json', name).group(1))
            job = self.get(identifier)
            if not job or job['state'] != 'done' or index >= len(job['results']):
                raise ValueError('音符定位尚未生成。')
            projects = sorted((directory / 'output').rglob('*.omr'))
            if not projects: raise ValueError('此记录没有原谱坐标。')
            result = source_map(projects[0], directory / job['results'][index]['name'], index)
            data = json.dumps(result,ensure_ascii=False).encode(); temp = cached.with_suffix('.json.part');temp.write_bytes(data);temp.replace(cached)
            return data

    def update(self, identifier, **changes):
        with self.lock:
            if identifier in self.cancel_requested: raise RecognitionCancelled()
            self.jobs[identifier].update(changes)
            self.persist(identifier)

    def persist(self, identifier):
        directory = self.directory / identifier
        temp = directory / 'job.json.part'
        temp.write_text(json.dumps(self.jobs[identifier], ensure_ascii=False))
        os.replace(temp, directory / 'job.json')

    def execute(self, command, env, log):
        with self.lock:
            if self.active_id in self.cancel_requested: raise RecognitionCancelled()
            if self.stopping:
                raise RuntimeError("服务已停止，识别任务取消。")
            process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            self.process = process
        try:
            result=process.wait(timeout=max(1, self.deadline-time.monotonic()) if self.deadline else TIMEOUT)
            self.check_cancelled(self.active_id)
            return result
        except subprocess.TimeoutExpired:
            self.stop_process(process)
            raise
        finally:
            with self.lock:
                if self.process is process:
                    self.process = None

    @staticmethod
    def stop_process(process):
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
        except ProcessLookupError:
            pass
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()

    def shutdown(self):
        with self.lock:
            self.stopping = True
            process = self.process
        if process:
            self.stop_process(process)
        self.executor.shutdown(wait=True, cancel_futures=True)

    def run(self, identifier):
        with self.lock:
            job=self.jobs.get(identifier)
            if not job or job['state']!='queued': return
            self.active_id=identifier
        try:
            if job.get('second_engine'):
                if job.get('requested_by')=='user':self.run_second_engine(identifier)
                else:self.update(identifier,state='cancelled',message='自动 homr 已停用；仅接受手动启动。')
            else:self._run(identifier)
        except RecognitionCancelled:
            pass
        finally:
            with self.lock:
                if identifier in self.cancel_requested and identifier in self.jobs:
                    self.jobs[identifier].update(state='cancelled',message='识别已中断；保留文件、日志和已保存进度。')
                    self.persist(identifier)
                self.cancel_requested.discard(identifier)
                self.futures.pop(identifier,None)
                if self.active_id==identifier: self.active_id=None

    def _run(self, identifier):
        try:
            config = configuration()
            resources = recognition_resources(config)
            timeout = float(config.get('recognition_timeout_seconds', TIMEOUT))
            if not 30 <= timeout <= 7200:
                raise ValueError('recognition_timeout_seconds 必须在 30–7200 之间。')
        except (OSError, ValueError, TypeError) as exc:
            self.update(identifier, state='error', message=f'配置读取失败：{exc}')
            return
        self.deadline = time.monotonic() + timeout
        directory = self.directory / identifier
        self.update(identifier, state="running", phase="scan", message="筛选乐谱页面", resources=resources)
        engine = engine_path()
        env = dict(os.environ)
        # Isolate engine preferences and keep headless processing independent of the desktop.
        for name, subdir in [("XDG_CONFIG_HOME", "config"), ("XDG_CACHE_HOME", "cache"), ("XDG_DATA_HOME", "data")]:
            env[name] = str(ROOT / ".data/engine" / subdir)
            Path(env[name]).mkdir(parents=True, exist_ok=True)
        home = ROOT / ".data/engine/home"
        home.mkdir(parents=True, exist_ok=True)
        env["JAVA_TOOL_OPTIONS"] = f"-Djava.awt.headless=true -Duser.home={home} -Djava.util.prefs.userRoot={home / 'prefs'} -Xmx{resources['memory_mb']}m -XX:ActiveProcessorCount={resources['threads']}"
        if (ROOT / ".runtime/tessdata/eng.traineddata").exists():
            env["TESSDATA_PREFIX"] = str(ROOT / ".runtime/tessdata")
        output = directory / 'output'
        env['OMP_THREAD_LIMIT'] = '1'
        env['OMP_NUM_THREADS'] = '1'
        base = engine_options(engine, resources)
        base += ['-constant',f"org.audiveris.omr.image.ImageLoading.pdfResolution={self.jobs[identifier].get('input_dpi',300)}"]
        if self.jobs[identifier].get('implicit_tuplets'):
            base += ['-constant','org.audiveris.omr.sheet.ProcessingSwitches.implicitTuplets=true']
        if self.jobs[identifier].get('small_notes'):
            base += ['-constant','org.audiveris.omr.sheet.ProcessingSwitches.smallHeads=true',
                     '-constant','org.audiveris.omr.sheet.ProcessingSwitches.smallBeams=true']
        command = [*base, "-step", "GRID", "-save", "-output", str(output), "--", str(directory / "score.pdf")]
        region=self.jobs[identifier].get('region')
        try:
            with (directory / "engine.log").open("wb") as log:
                log.write(f"SHEETVIS_RESOURCES threads={resources['threads']} heap_mb={resources['memory_mb']} parallel={resources['parallel']}\n".encode()); log.flush()
                previous = directory / 'previous.log'
                if previous.exists() and not self.jobs[identifier].get('upgraded_from_complete'):
                    log.write(previous.read_bytes()); log.write(b'\nSHEETVIS_RESUME\n'); log.flush()
                if region and not (directory/'region.png').exists():
                    self.update(identifier,message=f"裁取 PDF 第 {region['page']} 页的双谱表上下文")
                    self.execute(['pdftoppm','-f',str(region['page']),'-l',str(region['page']),'-singlefile','-r',str(self.jobs[identifier]['input_dpi']),'-png',str(directory/'score.pdf'),str(directory/'page')],env,log)
                    from PIL import Image
                    with Image.open(directory/'page.png')as image:
                        c=region['crop'];left=round(c['x']*image.width);top=round(c['y']*image.height);right=round((c['x']+c['w'])*image.width);bottom=round((c['y']+c['h'])*image.height)
                        image.crop((left,top,right,bottom)).save(directory/'region.png')
                    (directory/'page.png').unlink()
                if region:command[-1]=str(directory/'region.png')
                if not (output / ('region.omr' if region else 'score.omr')).exists():
                    self.execute(command, env, log)
                projects = sorted(output.rglob('*.omr'))
                if not projects:
                    raise RuntimeError('未检测到五线谱页面。')
                total, selected = staff_pages(projects[0])
                if not selected:
                    raise RuntimeError('未检测到五线谱页面。')
                meter_repairs = repair_meters(projects[0], directory/'score.pdf') if not region and config.get('repair_native_meter', True) else []
                baseline_heads=set()
                for bi,old in enumerate(sorted(directory.glob('baseline-*.mxl'))+sorted(directory.glob('baseline-*.musicxml'))):
                    mapping=source_map(projects[0],old,bi)
                    baseline_heads.update((p['page'],p['head'])for p in mapping['positions'].values())
                self.execute([*base,'-step','LINKS','-save','-output',str(output),'-sheets',*map(str,selected),'--',str(projects[0])],env,log)
                beam_repairs=repair_beam_links(projects[0]);self.update(identifier,beam_repairs=beam_repairs)
                tuplet_repairs=repair_repeated_tuplets(projects[0]);self.update(identifier,tuplet_repairs=tuplet_repairs)
                if tuplet_repairs:
                    inherited=dict(self.jobs[identifier].get('inherited_rhythm_quality')or{})
                    corrected={(r['page'],int(r['system']),int(r['stack']))for r in tuplet_repairs}
                    inherited['rhythm_issues']=[r for r in inherited.get('rhythm_issues',[])if(r['page'],r['system'],r['stack'])not in corrected]
                    self.update(identifier,inherited_rhythm_quality=inherited)
                initial_meter = self.jobs[identifier].get('initial_meter')
                if initial_meter:
                    # A fresh GRID checkpoint has no measures or chords yet.
                    self.update(identifier,phase='recognize',message='恢复片段起始拍号',included_pages=selected,page_count=len(selected),total_pages=total)
                    meter_repairs += repair_initial_meter(projects[0],initial_meter)
                if meter_repairs:
                    self.update(identifier,inherited_rhythm_quality=None)
                    # Recompute all affected rhythms; old diagnostics are retained
                    # separately, not counted as current unresolved errors.
                    log.seek(0); log.truncate(); log.flush()
                with zipfile.ZipFile(projects[0]) as archive:
                    book = ET.fromstring(archive.read('book.xml'))
                    remaining = sum(len(OMR_STEPS)-len(s.findtext('steps','').split()) for s in book.findall('sheet') if int(s.get('number')) in selected)
                self.update(identifier, phase='recognize', total_pages=total, page_count=len(selected), included_pages=selected, skipped_pages=[n for n in range(1, total + 1) if n not in selected], message='识别中', timeout_seconds=timeout, meter_repairs=meter_repairs, remaining_steps=max(1,remaining))
                self.checkpoint(identifier,projects[0])
                log.write(b'\nSHEETVIS_TRANSCRIBE\n'); log.flush()
                command = [*base, '-step', 'PAGE', '-save', '-output', str(output), '-sheets', *map(str, selected), '--', str(projects[0])]
                exit_code = self.execute(command, env, log)
                incomplete = sorted(set(selected) - set(completed_pages(projects[0])))
                if incomplete:
                    raise RuntimeError(f'乐谱第 {"、".join(map(str, incomplete))} 页未完成识别；已保存进度，重新导入可继续。')
                self.checkpoint(identifier,projects[0])
                def symbol_progress(page):
                    self.check_cancelled(identifier)
                    if time.monotonic() > self.deadline: raise subprocess.TimeoutExpired('symbol image checks',timeout)
                    self.update(identifier,message=f'符号复核 · 第 {page} 页',current_page=page)
                symbol_recovery = repair_symbols(projects[0],symbol_progress,directory/'base-project.omr' if region else None)
                self.update(identifier,symbol_recovery=symbol_recovery)
                octave_recovery = repair_octaves(projects[0])
                octave_audit = audit_octaves(projects[0], directory/('region.png' if region else 'score.pdf'))
                dynamics_repairs = repair_dynamics(projects[0])
                self.update(identifier, octave_audit=octave_audit, octave_recovery=octave_recovery, dynamics_repairs=dynamics_repairs, message='导出与校验')
                log.write(b'\nSHEETVIS_EXPORT\n'); log.flush()
                exit_code = self.execute([*base, '-export', '-save', '-output', str(output), '-sheets', *map(str, selected), '--', str(projects[0])], env, log)
            self.update(identifier, exit_code=exit_code)
            files = sorted((directory / "output").rglob("*.mxl")) + sorted((directory / "output").rglob("*.musicxml"))
            if not files:
                if exit_code:
                    raise RuntimeError("本地识别引擎执行失败；可下载日志查看原因。")
                raise RuntimeError("未生成可播放乐谱，请尝试更清晰的 PDF，或导入 MusicXML／MIDI。")
            results = []
            curves=[recover_curves(projects[0],path,index)for index,path in enumerate(files)]
            self.update(identifier,curve_recovery={'repairs':[r for c in curves for r in c['repairs']],'findings':[r for c in curves for r in c['findings']]})
            symbol_audit=audit_export(projects[0],files)
            self.update(identifier,symbol_audit=symbol_audit)
            (directory/'symbol-audit.json').write_text(json.dumps({'recovery':self.jobs[identifier].get('symbol_recovery'), 'export':symbol_audit},ensure_ascii=False,indent=2))
            recovered=[recover_ornaments(projects[0],directory/'score.pdf',path,index) for index,path in enumerate(files)] if not region else []
            self.update(identifier,ornament_recovery={'native_marks':sum(r['native_marks'] for r in recovered),
                        'recovered':[mark for r in recovered for mark in r['recovered']],
                        'findings':[mark for r in recovered for mark in r['findings']]})
            if region:
                if len(files)!=1:raise RuntimeError('局部识别产生多个乐章，未替换原结果。')
                candidate=files[0];candidate_mapping=source_map(projects[0],candidate)
                parent_map=json.loads((directory/'parent.map.json').read_text())
                merged=directory/'merged.mxl'
                mapping,comparison=merge_region(directory/'parent.mxl',parent_map,candidate,candidate_mapping,measure_regions(projects[0],candidate),region,merged)
                comparison['local_quality']=quality_report((directory/'engine.log').read_text(errors='replace'))
                comparison['unexported_heads']=len(symbol_audit['unexported_heads'])
                (directory/'result-0.map.json').write_text(json.dumps(mapping,ensure_ascii=False))
                for field in ('symbol_recovery','symbol_audit'):
                    audit=self.jobs[identifier].get(field,{})
                    for key in ('repairs','findings','unexported_heads','ambiguous_accidentals'):
                        for item in audit.get(key,[]):item['page']=region['page']
                (directory/'symbol-audit.json').write_text(json.dumps({'recovery':self.jobs[identifier].get('symbol_recovery'),'export':symbol_audit},ensure_ascii=False,indent=2))
                self.update(identifier,region_comparison=comparison,**self.jobs[identifier]['parent_pages'])
                files=[merged]
            baseline=self.jobs[identifier].get('baseline_notes',0)
            exported_notes=validate_export_notes(files,baseline)
            if baseline_heads and not region:
                mapped=set()
                for bi,path in enumerate(files):mapped.update((p['page'],p['head'])for p in source_map(projects[0],path,bi)['positions'].values())
                removed={(r['page'],r['head'])for r in symbol_recovery['repairs']if r['kind']=='clef-loop-head'}
                lost=baseline_heads-mapped-removed
                if lost:raise RuntimeError(f'重新计算后有 {len(lost)} 个原有符头未能保留，已拒绝采用；原缓存不变，可改用局部重识别比较。')
            audit_meter=self.jobs[identifier].get('initial_meter')or score_override(self.jobs[identifier].get('sha256','')).get('verified_initial_meter')
            self.update(identifier,exported_notes=exported_notes,rhythm_audit=audit_rhythm(files,audit_meter))
            for index, path in enumerate(files):
                name = f"result-{index}{path.suffix}"
                shutil.copyfile(path, directory / name)
                results.append({"name": name, "url": f"/api/jobs/{identifier}/{name}"})
            self.update(identifier, state="done", message="识别完成", results=results, exit_code=exit_code, quality=self.jobs[identifier].get('parent_quality') if region else quality_report((directory / 'engine.log').read_text(errors='replace'),self.jobs[identifier].get('inherited_rhythm_quality')))
        except subprocess.TimeoutExpired:
            self.update(identifier, state="error", message=f"识别超过 {timeout / 60:g} 分钟；已保存进度，重新导入可继续。")
        except (OSError, RuntimeError, ValueError, zipfile.BadZipFile, ET.ParseError) as exc:
            self.update(identifier, state="error", message=str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = "sheetVis/0.1"

    def allowed(self, mutation=False):
        expected = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if self.headers.get("Host") not in expected:
            self.json_response(403, {"error": "仅允许本机访问。"})
            return False
        if mutation:
            origin = self.headers.get("Origin")
            permitted = {f"http://{host}" for host in expected} | {"http://127.0.0.1:5173", "http://localhost:5173"}
            if origin and origin not in permitted:
                self.json_response(403, {"error": "请求来源不允许。"})
                return False
            if self.headers.get("X-SheetVis") != "local":
                self.json_response(403, {"error": "缺少本地请求标识。"})
                return False
        return True

    def send_bytes(self, status, data, mime):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; connect-src 'self'; font-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def json_response(self, status, obj):
        self.send_bytes(status, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        if not self.allowed():
            return
        path = unquote(urlsplit(self.path).path)
        if path == "/api/health":
            engine = engine_path()
            return self.json_response(200, {"app": "sheetVis", "api_revision": 6, "omr": engine.is_file() and os.access(engine, os.X_OK), "samples": (ROOT / "public/samples/manifest.json").is_file(), "engine": "Audiveris", "version": "5.11.0", "local": True})
        if path == '/api/cache':
            return self.json_response(200, {'entries':self.server.jobs.cache_entries()})
        if path == '/api/config':
            try:
                config = configuration(); source = default_score()
                return self.json_response(200, {'colors': config.get('colors', {}), 'recognition': {'auto_assist':False,'threads':config.get('recognition_threads',0), 'memory_mb':config.get('recognition_memory_mb',2048), 'available_cpus':len(os.sched_getaffinity(0)) if hasattr(os,'sched_getaffinity') else (os.cpu_count() or 1), 'effective':recognition_resources(config)}, 'default_score': self.server.jobs.default_selection() or ({'name': source.name, 'available': source.is_file(), 'url': '/api/default-score'} if source else None)})
            except (OSError, ValueError) as exc:
                return self.json_response(500, {'error': f'配置读取失败：{exc}'})
        if path == '/api/default-score':
            try:
                selected=self.server.jobs.default_selection()
                source = self.server.jobs.directory/selected['job_id']/'score.pdf' if selected else default_score()
                if source is None or not source.is_file():
                    return self.json_response(404, {'error': '默认乐谱不存在。'})
                if source.stat().st_size > MAX_UPLOAD:
                    return self.json_response(413, {'error': '默认 PDF 必须小于 40 MB。'})
                return self.send_bytes(200, source.read_bytes(), 'application/pdf')
            except (OSError, ValueError) as exc:
                return self.json_response(500, {'error': f'默认乐谱读取失败：{exc}'})
        region_match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/regions',path)
        if region_match:
            try:return self.json_response(200,{'measures':self.server.jobs.regions(region_match.group(1))})
            except (OSError,ValueError,KeyError,zipfile.BadZipFile,ET.ParseError)as exc:return self.json_response(422,{'error':str(exc)})
        match = re.fullmatch(r"/api/jobs/([a-f0-9]{32})(?:/(result-\d+\.(?:mxl|musicxml)|result-\d+\.map\.json|engine\.log|score\.pdf|project\.omr|symbol-audit\.json|octave-audit\.json|octave-training\.zip))?", path)
        if match:
            identifier, name = match.groups()
            job = self.server.jobs.get(identifier)
            if not job:
                return self.json_response(404, {"error": "识别任务不存在。"})
            if not name:
                return self.json_response(200, job)
            if name == 'octave-training.zip':
                if job['state'] != 'done': return self.json_response(409, {'error':'识别尚未完成。'})
                try:
                    with self.server.jobs.mapping_lock:
                        projects = sorted((self.server.jobs.directory / identifier / 'output').rglob('*.omr'))
                        if not projects: return self.json_response(404, {'error':'没有 OMR 工程。'})
                        data = training_bundle(projects[0])
                    return self.send_bytes(200,data,'application/zip')
                except (OSError,zipfile.BadZipFile,ET.ParseError) as exc: return self.json_response(422,{'error':str(exc)})
            if name == 'octave-audit.json':
                try: return self.json_response(200,self.server.jobs.octave_review(identifier))
                except (ValueError,OSError,KeyError,zipfile.BadZipFile,ET.ParseError) as exc: return self.json_response(422,{'error':str(exc)})
            if name.endswith('.map.json'):
                try: return self.send_bytes(200,self.server.jobs.mapping(identifier,name),'application/json; charset=utf-8')
                except (ValueError,OSError,KeyError,zipfile.BadZipFile,ET.ParseError) as exc: return self.json_response(422, {'error':str(exc)})
            if name == 'project.omr':
                projects = sorted((self.server.jobs.directory / identifier / 'output').rglob('*.omr'))
                if not projects: return self.json_response(404, {'error':'没有 OMR 工程。'})
                file = projects[0]
            else:
                file = self.server.jobs.directory / identifier / name
            if file.is_file():
                return self.send_bytes(200, file.read_bytes(), "application/pdf" if name.endswith("pdf") else "application/octet-stream" if name.endswith("omr") else "application/vnd.recordare.musicxml" if name.endswith("mxl") else "text/plain; charset=utf-8")
            return self.json_response(404, {"error": "结果尚未生成。"})
        if path.startswith("/api/"):
            return self.json_response(404, {"error": "未知接口。"})
        static = ROOT / "dist"
        requested = (static / path.lstrip("/")).resolve()
        if not requested.is_relative_to(static.resolve()):
            return self.json_response(403, {"error": "路径不允许。"})
        if requested.is_dir():
            requested = requested / "index.html"
        if not requested.is_file():
            return self.json_response(404, {"error": "文件不存在，请先运行 npm run build。"})
        return self.send_bytes(200, requested.read_bytes(), mimetypes.guess_type(requested.name)[0] or "application/octet-stream")

    def do_DELETE(self):
        if not self.allowed(mutation=True): return
        match = re.fullmatch(r'/api/cache/([a-f0-9]{32})', urlsplit(self.path).path)
        if not match: return self.json_response(404, {'error':'缓存不存在。'})
        try:
            self.server.jobs.delete_cache(match.group(1))
            return self.json_response(200, {'deleted':match.group(1)})
        except KeyError: return self.json_response(404, {'error':'缓存不存在。'})
        except ValueError as exc: return self.json_response(409, {'error':str(exc)})
        except OSError as exc: return self.json_response(500, {'error':f'删除失败：{exc}'})

    def do_POST(self):
        if not self.allowed(mutation=True):
            return
        assist_match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/assist',urlsplit(self.path).path)
        if assist_match:
            try:return self.json_response(200,self.server.jobs.ensure_assistance(assist_match.group(1)))
            except (OSError,ValueError,KeyError)as exc:return self.json_response(422,{'error':str(exc)})
        second_match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/second-engine',urlsplit(self.path).path)
        if second_match:
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=2048:raise ValueError('请求大小无效。')
                self.connection.settimeout(10);values=json.loads(self.rfile.read(length))
                if not isinstance(values,dict)or set(values)-{'result','first','last','start','end'}:raise ValueError('核查参数无效。')
                identifier=self.server.jobs.create_second_engine(second_match.group(1),manual=True,**values)
                return self.json_response(202,{'id':identifier})
            except (OSError,ValueError,TypeError,KeyError)as exc:return self.json_response(422,{'error':str(exc)})
        compare_match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/compare',urlsplit(self.path).path)
        if compare_match:
            try:
                identifier=compare_match.group(1);job=self.server.jobs.get(identifier)
                if not job or job['state']!='done':raise ValueError('需要已完成的识别缓存。')
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=8*1024*1024:raise ValueError('对照请求必须小于 8 MB。')
                self.connection.settimeout(15);values=json.loads(self.rfile.read(length))
                if not isinstance(values,dict)or set(values)-{'xml','engine','result','start','end'}:raise ValueError('对照参数无效。')
                xml=values.get('xml');engine=values.get('engine','external');index=values.get('result',0)
                if not isinstance(xml,str)or not isinstance(engine,str)or isinstance(index,bool)or not isinstance(index,int)or not 0<=index<len(job['results']):raise ValueError('对照文件或乐章无效。')
                if '<!ENTITY' in xml.upper():raise ValueError('不支持自定义实体。')
                directory=self.server.jobs.directory/identifier
                # Temporary input is never placed among playable result files.
                import tempfile
                with tempfile.TemporaryDirectory(dir=directory,prefix='compare-')as work:
                    candidate=Path(work)/'candidate.musicxml';candidate.write_text(xml)
                    report=compare_scores(directory/job['results'][index]['name'],candidate,engine,values.get('start',0),values.get('end'))
                return self.json_response(200,report)
            except (OSError,ValueError,TypeError,KeyError,ET.ParseError,zipfile.BadZipFile,StopIteration)as exc:
                return self.json_response(422,{'error':str(exc)})
        region_match=re.fullmatch(r'/api/jobs/([a-f0-9]{32})/(regions|accept-region)',urlsplit(self.path).path)
        if region_match:
            try:
                parent_id,action=region_match.groups()
                if action=='accept-region':return self.json_response(200,self.server.jobs.accept_region(parent_id))
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=2048:raise ValueError('选区请求大小无效。')
                self.connection.settimeout(10);values=json.loads(self.rfile.read(length))
                if not isinstance(values,dict)or not {'start','end'}<=set(values)or set(values)-{'start','end','dpi','implicit_tuplets'}:raise ValueError('选区参数无效。')
                identifier=self.server.jobs.create_region(parent_id,values['start'],values['end'],values.get('dpi',400),values.get('implicit_tuplets',False))
                return self.json_response(202,{'id':identifier})
            except KeyError:return self.json_response(404,{'error':'识别记录不存在。'})
            except (OSError,ValueError,TypeError,zipfile.BadZipFile,ET.ParseError)as exc:return self.json_response(422,{'error':str(exc)})
        match=re.fullmatch(r'/api/(?:jobs/([a-f0-9]{32})/cancel|cache/([a-f0-9]{32})/default)',urlsplit(self.path).path)
        if match:
            try:
                if match.group(1):
                    identifier=match.group(1);self.server.jobs.cancel(identifier)
                    return self.json_response(200,self.server.jobs.get(identifier))
                return self.json_response(200,{'default_score':self.server.jobs.set_default(match.group(2))})
            except KeyError: return self.json_response(404,{'error':'缓存或任务不存在。'})
            except ValueError as exc: return self.json_response(409,{'error':str(exc)})
            except OSError as exc: return self.json_response(500,{'error':str(exc)})
        if urlsplit(self.path).path == '/api/config/recognition':
            try:
                length = int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 2048: raise ValueError('配置请求大小无效。')
                self.connection.settimeout(10)
                values = json.loads(self.rfile.read(length))
                if not isinstance(values,dict) or not {'threads','memory_mb'}<=set(values) or set(values)-{'threads','memory_mb','auto_assist'}:raise ValueError('需要 threads 和 memory_mb。')
                if 'auto_assist'in values and values['auto_assist']is not False:raise ValueError('homr 核查仅允许手动启动，请刷新页面。')
                with CONFIG_LOCK:
                    path = ROOT/'config.json'
                    config = json.loads(path.read_text()) if path.exists() else {}
                    if not isinstance(config,dict): raise ValueError('config.json 必须是 JSON 对象。')
                    config.update(recognition_threads=values['threads'],recognition_memory_mb=values['memory_mb'])
                    config['auto_assist']=False
                    effective = recognition_resources(config)
                    temp = path.with_suffix('.json.part');temp.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
                return self.json_response(200,{'saved':True,'effective':effective})
            except (ValueError,TypeError,TimeoutError) as exc: return self.json_response(400,{'error':str(exc)})
            except OSError as exc: return self.json_response(500,{'error':str(exc)})
        if urlsplit(self.path).path != "/api/recognize":
            return self.json_response(404, {"error": "未知接口。"})
        if not engine_path().is_file():
            return self.json_response(503, {"error": "尚未安装本地 PDF 识别资源，请在产品目录运行 npm run setup。"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.json_response(400, {"error": "无效上传长度。"})
        if not 0 < length <= MAX_UPLOAD:
            return self.json_response(413, {"error": "PDF 必须小于 40 MB。"})
        self.connection.settimeout(30)
        try:
            data = self.rfile.read(length)
        except (TimeoutError, OSError):
            return self.json_response(408, {"error": "上传超时，请重试。"})
        if len(data) != length or not data.lstrip().startswith(b"%PDF-"):
            return self.json_response(400, {"error": "请上传有效的 PDF 文件。"})
        try:
            identifier = self.server.jobs.create(data, unquote(self.headers.get("X-SheetVis-Filename", "")))
        except ValueError as exc:
            return self.json_response(429, {"error": str(exc)})
        self.json_response(202, {"id": identifier})


def make_server(port=4280, directory=None):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.jobs = JobStore(directory or os.environ.get('SHEETVIS_JOBS_DIR') or ROOT / ".data/jobs")
    return server


if __name__ == "__main__":
    def stop_on_signal(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop_on_signal)
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4280)
    args = parser.parse_args()
    server = make_server(args.port)
    print(f"sheetVis → http://127.0.0.1:{args.port} (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.jobs.shutdown()
