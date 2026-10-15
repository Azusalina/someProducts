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
import threading
import time
from urllib.parse import unquote, urlsplit
import uuid
import xml.etree.ElementTree as ET
import zipfile
from omr_support import repair_meters, repair_dynamics, source_map
from octave_support import audit_octaves, training_bundle
from octave_repair import repair_octaves

ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 40 * 1024 * 1024
MAX_JOBS = 8
TIMEOUT = 3600
CONFIG_LOCK = threading.Lock()
PIPELINE = 'image-octaves-source-map-v4'
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


class JobStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.mapping_lock = threading.Lock()
        self.jobs = {}
        for path in self.directory.glob('*/job.json'):
            try:
                job = json.loads(path.read_text())
                if re.fullmatch(r'[a-f0-9]{32}', path.parent.name) and job.get('id') == path.parent.name:
                    if job.get('state') == 'cancelling': job.update(state='cancelled',message='识别已中断。')
                    if job.get('state') in ('queued', 'running'):
                        job.update(state='error', message='服务重启，识别任务已中断。')
                    self.jobs[job['id']] = job
            except (OSError, ValueError):
                pass
        self.process = None
        self.active_id = None
        self.cancel_requested = set()
        self.futures = {}
        self.stopping = False
        self.deadline = None
        self.executor = ThreadPoolExecutor(max_workers=1)

    def create(self, data, filename=""):
        with self.lock:
            if self.stopping:
                raise ValueError("服务正在停止。")
            digest = hashlib.sha256(data).hexdigest()
            matches = [j for j in self.jobs.values() if j.get('sha256') == digest]
            for cached in sorted(matches, key=lambda j: j.get('created', 0), reverse=True):
                if cached.get('pipeline') != PIPELINE:
                    continue
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
            # Resume saved OMR stages for the identical PDF after a failed run.
            for previous in sorted(matches, key=lambda j: j.get('created', 0), reverse=True):
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
                        job['inherited_rhythm_quality'] = previous.get('quality') if previous['state'] == 'done' else None
                        restored = True;break
                    except (OSError,zipfile.BadZipFile,ET.ParseError,KeyError): continue
                if restored: break
            self.jobs[identifier] = job
            self.persist(identifier)
            self.futures[identifier] = self.executor.submit(self.run, identifier)
        return identifier

    def get(self, identifier):
        with self.lock:
            job = dict(self.jobs[identifier]) if identifier in self.jobs else None
        if job is not None:
            job['upgrade_available'] = job.get('pipeline') != PIPELINE
        if job is None:
            return None
        path = self.directory / identifier / 'engine.log'
        try:
            log = path.read_text(errors='replace') if path.exists() else ''
        except OSError:
            log = ''
        job.update(recognition_progress(log, job['state'], job.get('phase', 'scan'), job.get('page_count'), job.get('remaining_steps')))
        if job['state'] == 'done':
            job['quality'] = quality_report(log,job.get('inherited_rhythm_quality'))
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
                    'pages':job.get('total_pages'), 'results':len(job.get('results',[])), 'is_default':job['id']==default_id})
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
        if os.environ.get('SHEETVIS_DEFAULT_SCORE') is not None: return None
        identifier=configuration().get('default_cache')
        if not isinstance(identifier,str) or not re.fullmatch(r'[a-f0-9]{32}',identifier): return None
        with self.lock:
            job=self.jobs.get(identifier)
            if not job or job['state']!='done' or not job.get('results'): return None
            directory=self.directory/identifier
            if not (directory/'score.pdf').is_file() or not all((directory/r['name']).is_file() for r in job['results']): return None
            return {'job_id':identifier,'name':job.get('filename') or f'乐谱 {identifier[:8]}.pdf','available':True,'url':f'/api/jobs/{identifier}/score.pdf'}

    def set_default(self,identifier):
        with self.lock:
            job=self.jobs.get(identifier)
            if not job: raise KeyError(identifier)
            directory=self.directory/identifier
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
            self._run(identifier)
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
        command = [*base, "-step", "GRID", "-save", "-output", str(output), "--", str(directory / "score.pdf")]
        try:
            with (directory / "engine.log").open("wb") as log:
                log.write(f"SHEETVIS_RESOURCES threads={resources['threads']} heap_mb={resources['memory_mb']} parallel={resources['parallel']}\n".encode()); log.flush()
                previous = directory / 'previous.log'
                if previous.exists() and not self.jobs[identifier].get('upgraded_from_complete'):
                    log.write(previous.read_bytes()); log.write(b'\nSHEETVIS_RESUME\n'); log.flush()
                if not (output / 'score.omr').exists():
                    self.execute(command, env, log)
                projects = sorted(output.rglob('*.omr'))
                if not projects:
                    raise RuntimeError('未检测到五线谱页面。')
                total, selected = staff_pages(projects[0])
                if not selected:
                    raise RuntimeError('未检测到五线谱页面。')
                meter_repairs = repair_meters(projects[0], directory/'score.pdf') if config.get('repair_native_meter', True) else []
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
                octave_recovery = repair_octaves(projects[0])
                octave_audit = audit_octaves(projects[0], directory/'score.pdf')
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
            for index, path in enumerate(files):
                name = f"result-{index}{path.suffix}"
                shutil.copyfile(path, directory / name)
                results.append({"name": name, "url": f"/api/jobs/{identifier}/{name}"})
            self.update(identifier, state="done", message="识别完成", results=results, exit_code=exit_code, quality=quality_report((directory / 'engine.log').read_text(errors='replace'),self.jobs[identifier].get('inherited_rhythm_quality')))
        except subprocess.TimeoutExpired:
            self.update(identifier, state="error", message=f"识别超过 {timeout / 60:g} 分钟；已保存进度，重新导入可继续。")
        except (OSError, RuntimeError, zipfile.BadZipFile, ET.ParseError) as exc:
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
            return self.json_response(200, {"app": "sheetVis", "api_revision": 5, "omr": engine.is_file() and os.access(engine, os.X_OK), "samples": (ROOT / "public/samples/manifest.json").is_file(), "engine": "Audiveris", "version": "5.11.0", "local": True})
        if path == '/api/cache':
            return self.json_response(200, {'entries':self.server.jobs.cache_entries()})
        if path == '/api/config':
            try:
                config = configuration(); source = default_score()
                return self.json_response(200, {'colors': config.get('colors', {}), 'recognition': {'threads':config.get('recognition_threads',0), 'memory_mb':config.get('recognition_memory_mb',2048), 'available_cpus':len(os.sched_getaffinity(0)) if hasattr(os,'sched_getaffinity') else (os.cpu_count() or 1), 'effective':recognition_resources(config)}, 'default_score': self.server.jobs.default_selection() or ({'name': source.name, 'available': source.is_file(), 'url': '/api/default-score'} if source else None)})
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
        match = re.fullmatch(r"/api/jobs/([a-f0-9]{32})(?:/(result-\d+\.(?:mxl|musicxml)|result-\d+\.map\.json|engine\.log|score\.pdf|project\.omr|octave-audit\.json|octave-training\.zip))?", path)
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
                if not isinstance(values,dict) or set(values) != {'threads','memory_mb'}: raise ValueError('需要 threads 和 memory_mb。')
                with CONFIG_LOCK:
                    path = ROOT/'config.json'
                    config = json.loads(path.read_text()) if path.exists() else {}
                    if not isinstance(config,dict): raise ValueError('config.json 必须是 JSON 对象。')
                    config.update(recognition_threads=values['threads'],recognition_memory_mb=values['memory_mb'])
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
    server.jobs = JobStore(directory or ROOT / ".data/jobs")
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
