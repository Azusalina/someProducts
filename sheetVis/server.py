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

ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 40 * 1024 * 1024
MAX_JOBS = 8
TIMEOUT = 3600
PIPELINE = 'native-meter-source-map-v3'
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


def default_score():
    value = configuration().get('default_score')
    if not value:
        return None
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


def quality_report(log):
    # These are engine diagnostics, not ground-truth accuracy or confidence scores.
    rhythms = sorted(set(re.findall(r'\[score#(\d+)\].*?S(\d+) MeasureStack#(\d+) no correct rhythm', log)))
    offsets = set(re.findall(r'\[score#(\d+)\].*?No timeOffset for (\w+Inter#\d+)', log))
    export_errors = sorted(set(re.findall(r'Error visiting Measure\{#(\d+)\} in \{Page#(\d+)\.\d+\}', log)))
    return {'rhythm_issues': [{'page': int(p), 'system': int(s), 'stack': int(m)} for p, s, m in rhythms],
            'missing_offsets': len(offsets), 'export_errors': [{'page': int(p), 'stack': int(m)} for m, p in export_errors], 'accuracy': None}


def recognition_progress(log, state, phase='recognize', selected_pages=None, remaining_steps=None):
    if state == 'done':
        return {"progress": 100, "stage": "完成"}
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
    if state == 'error':
        stage = '失败'
    return {"progress": progress, "stage": stage, "pages": pages}


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
                    if job.get('state') in ('queued', 'running'):
                        job.update(state='error', message='服务重启，识别任务已中断。')
                    self.jobs[job['id']] = job
            except (OSError, ValueError):
                pass
        self.process = None
        self.stopping = False
        self.deadline = None
        self.executor = ThreadPoolExecutor(max_workers=1)

    def create(self, data):
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
                    return cached['id']
            if sum(j["state"] in ("queued", "running") for j in self.jobs.values()) >= MAX_JOBS:
                raise ValueError("识别队列已满，请等待当前乐谱处理完成。")
            identifier = uuid.uuid4().hex
            directory = self.directory / identifier
            directory.mkdir()
            (directory / "score.pdf").write_bytes(data)
            job = {"id": identifier, "state": "queued", "created": time.time(), "message": "等待本地识别", "sha256": digest, "pipeline": PIPELINE, "results": []}
            # Resume saved OMR stages for the identical PDF after a failed run.
            for previous in sorted(matches, key=lambda j: j.get('created', 0), reverse=True):
                if previous['state'] not in ('error','done') or previous.get('phase') != 'recognize':
                    continue
                projects = sorted((self.directory / previous['id'] / 'output').rglob('*.omr'))
                if not projects:
                    continue
                try:
                    total, selected = staff_pages(projects[0])
                    if not selected:
                        continue
                    output = directory / 'output'; output.mkdir()
                    shutil.copyfile(projects[0], output / 'score.omr')
                    old_log = self.directory / previous['id'] / 'engine.log'
                    if old_log.exists():
                        shutil.copyfile(old_log, directory / 'previous.log')
                    job['resumed_from'] = previous['id']
                    job['upgraded_from_complete'] = previous['state'] == 'done'
                    break
                except (OSError, zipfile.BadZipFile, ET.ParseError, KeyError):
                    continue
            self.jobs[identifier] = job
            self.persist(identifier)
            self.executor.submit(self.run, identifier)
        return identifier

    def get(self, identifier):
        with self.lock:
            job = dict(self.jobs[identifier]) if identifier in self.jobs else None
        if job is None:
            return None
        path = self.directory / identifier / 'engine.log'
        try:
            log = path.read_text(errors='replace') if path.exists() else ''
        except OSError:
            log = ''
        job.update(recognition_progress(log, job['state'], job.get('phase', 'scan'), job.get('page_count'), job.get('remaining_steps')))
        if job['state'] == 'done':
            job['quality'] = quality_report(log)
            job['results'] = [{**r, 'mapping':f'/api/jobs/{identifier}/{Path(r["name"]).stem}.map.json'} for r in job.get('results', [])]
        return job

    def mapping(self, identifier, name):
        with self.mapping_lock:
            directory = self.directory / identifier
            cached = directory / name
            if cached.exists():
                data = cached.read_bytes()
                if json.loads(data).get('version') == 3: return data
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
            self.jobs[identifier].update(changes)
            self.persist(identifier)

    def persist(self, identifier):
        directory = self.directory / identifier
        temp = directory / 'job.json.part'
        temp.write_text(json.dumps(self.jobs[identifier], ensure_ascii=False))
        os.replace(temp, directory / 'job.json')

    def execute(self, command, env, log):
        with self.lock:
            if self.stopping:
                raise RuntimeError("服务已停止，识别任务取消。")
            process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            self.process = process
        try:
            return process.wait(timeout=max(1, self.deadline - time.monotonic()) if self.deadline else TIMEOUT)
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
        try:
            timeout = float(configuration().get('recognition_timeout_seconds', TIMEOUT))
            if not 30 <= timeout <= 7200:
                raise ValueError('recognition_timeout_seconds 必须在 30–7200 之间。')
        except (OSError, ValueError, TypeError) as exc:
            self.update(identifier, state='error', message=f'配置读取失败：{exc}')
            return
        self.deadline = time.monotonic() + timeout
        directory = self.directory / identifier
        self.update(identifier, state="running", phase="scan", message="筛选乐谱页面")
        engine = engine_path()
        env = dict(os.environ)
        # Isolate engine preferences and keep headless processing independent of the desktop.
        for name, subdir in [("XDG_CONFIG_HOME", "config"), ("XDG_CACHE_HOME", "cache"), ("XDG_DATA_HOME", "data")]:
            env[name] = str(ROOT / ".data/engine" / subdir)
            Path(env[name]).mkdir(parents=True, exist_ok=True)
        home = ROOT / ".data/engine/home"
        home.mkdir(parents=True, exist_ok=True)
        env["JAVA_TOOL_OPTIONS"] = f"-Djava.awt.headless=true -Duser.home={home} -Djava.util.prefs.userRoot={home / 'prefs'} -Xmx2g -XX:ActiveProcessorCount=2"
        if (ROOT / ".runtime/tessdata/eng.traineddata").exists():
            env["TESSDATA_PREFIX"] = str(ROOT / ".runtime/tessdata")
        output = directory / 'output'
        base = [str(engine), '-batch', '-swap', '-constant', 'org.audiveris.omr.util.OmrExecutors.useParallelism=false']
        command = [*base, "-step", "GRID", "-save", "-output", str(output), "--", str(directory / "score.pdf")]
        try:
            with (directory / "engine.log").open("wb") as log:
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
                meter_repairs = repair_meters(projects[0], directory/'score.pdf') if configuration().get('repair_native_meter', True) else []
                if meter_repairs:
                    # Recompute all affected rhythms; old diagnostics are retained
                    # separately, not counted as current unresolved errors.
                    log.seek(0); log.truncate(); log.flush()
                with zipfile.ZipFile(projects[0]) as archive:
                    book = ET.fromstring(archive.read('book.xml'))
                    remaining = sum(len(OMR_STEPS)-len(s.findtext('steps','').split()) for s in book.findall('sheet') if int(s.get('number')) in selected)
                self.update(identifier, phase='recognize', total_pages=total, page_count=len(selected), included_pages=selected, skipped_pages=[n for n in range(1, total + 1) if n not in selected], message='识别中', timeout_seconds=timeout, meter_repairs=meter_repairs, remaining_steps=max(1,remaining))
                log.write(b'\nSHEETVIS_TRANSCRIBE\n'); log.flush()
                command = [*base, '-step', 'PAGE', '-save', '-output', str(output), '-sheets', *map(str, selected), '--', str(projects[0])]
                exit_code = self.execute(command, env, log)
                incomplete = sorted(set(selected) - set(completed_pages(projects[0])))
                if incomplete:
                    raise RuntimeError(f'乐谱第 {"、".join(map(str, incomplete))} 页未完成识别；已保存进度，重新导入可继续。')
                dynamics_repairs = repair_dynamics(projects[0])
                self.update(identifier, dynamics_repairs=dynamics_repairs, message='导出与校验')
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
            self.update(identifier, state="done", message="识别完成", results=results, exit_code=exit_code, quality=quality_report((directory / 'engine.log').read_text(errors='replace')))
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
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' blob:; connect-src 'self'; font-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
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
            return self.json_response(200, {"app": "sheetVis", "api_revision": 3, "omr": engine.is_file() and os.access(engine, os.X_OK), "samples": (ROOT / "public/samples/manifest.json").is_file(), "engine": "Audiveris", "version": "5.11.0", "local": True})
        if path == '/api/config':
            try:
                config = configuration(); source = default_score()
                return self.json_response(200, {'colors': config.get('colors', {}), 'default_score': {'name': source.name, 'available': source.is_file(), 'url': '/api/default-score'} if source else None})
            except (OSError, ValueError) as exc:
                return self.json_response(500, {'error': f'配置读取失败：{exc}'})
        if path == '/api/default-score':
            try:
                source = default_score()
                if source is None or not source.is_file():
                    return self.json_response(404, {'error': '默认乐谱不存在。'})
                if source.stat().st_size > MAX_UPLOAD:
                    return self.json_response(413, {'error': '默认 PDF 必须小于 40 MB。'})
                return self.send_bytes(200, source.read_bytes(), 'application/pdf')
            except (OSError, ValueError) as exc:
                return self.json_response(500, {'error': f'默认乐谱读取失败：{exc}'})
        match = re.fullmatch(r"/api/jobs/([a-f0-9]{32})(?:/(result-\d+\.(?:mxl|musicxml)|result-\d+\.map\.json|engine\.log))?", path)
        if match:
            identifier, name = match.groups()
            job = self.server.jobs.get(identifier)
            if not job:
                return self.json_response(404, {"error": "识别任务不存在。"})
            if not name:
                return self.json_response(200, job)
            if name.endswith('.map.json'):
                try: return self.send_bytes(200,self.server.jobs.mapping(identifier,name),'application/json; charset=utf-8')
                except (ValueError,OSError,KeyError,zipfile.BadZipFile,ET.ParseError) as exc: return self.json_response(422, {'error':str(exc)})
            file = self.server.jobs.directory / identifier / name
            if file.is_file():
                return self.send_bytes(200, file.read_bytes(), "application/vnd.recordare.musicxml" if name.endswith("mxl") else "text/plain; charset=utf-8")
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

    def do_POST(self):
        if not self.allowed(mutation=True):
            return
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
            identifier = self.server.jobs.create(data)
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
