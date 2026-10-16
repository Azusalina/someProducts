import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import zipfile
from unittest.mock import patch
import server


class LocalServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = server.make_server(0, cls.temp.name)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server.jobs.shutdown()
        cls.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        conn.request(method, path, body, headers or {})
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, data, dict(response.headers)

    def test_health_is_local_and_no_store(self):
        status, body, headers = self.request('GET', '/api/health')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['local'])
        self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_dns_rebinding_host_rejected(self):
        status, _, _ = self.request('GET', '/api/health', headers={'Host': 'evil.example'})
        self.assertEqual(status, 403)

    def test_cross_origin_upload_rejected(self):
        status, _, _ = self.request('POST', '/api/recognize', b'%PDF-1.4', {'Origin': 'https://evil.example', 'X-SheetVis': 'local'})
        self.assertEqual(status, 403)

    def test_missing_request_marker_rejected(self):
        status, _, _ = self.request('POST', '/api/recognize', b'%PDF-1.4')
        self.assertEqual(status, 403)

    def test_invalid_pdf_rejected(self):
        status, _, _ = self.request('POST', '/api/recognize', b'not a pdf', {'X-SheetVis': 'local'})
        self.assertEqual(status, 400)

    def test_oversize_rejected_before_body_read(self):
        status, _, _ = self.request('POST', '/api/recognize', headers={'X-SheetVis': 'local', 'Content-Length': str(server.MAX_UPLOAD + 1)})
        self.assertEqual(status, 413)

    def test_traversal_cannot_read_product_source(self):
        for path in ['/../server.py', '/%2e%2e/server.py', '/api/jobs/../../server.py']:
            status, body, _ = self.request('GET', path)
            self.assertIn(status, (403, 404))
            self.assertNotIn(b'class JobStore', body)

    def test_unknown_job_is_not_found(self):
        status, _, _ = self.request('GET', '/api/jobs/' + 'a' * 32)
        self.assertEqual(status, 404)

    def test_default_score_reads_only_configured_path(self):
        pdf = Path(self.temp.name) / 'default.pdf'; pdf.write_bytes(b'%PDF-1.4\nconfigured')
        with patch('server.default_score', return_value=pdf):
            status, body, _ = self.request('GET', '/api/default-score?path=/etc/passwd')
            self.assertEqual((status, body), (200, pdf.read_bytes()))
            status, body, _ = self.request('GET', '/api/config')
            config = json.loads(body)
            self.assertEqual(config['default_score']['name'], 'default.pdf')
            self.assertTrue(config['default_score']['available'])
        with patch('server.default_score', return_value=Path(self.temp.name) / 'missing.pdf'):
            self.assertEqual(self.request('GET', '/api/default-score')[0], 404)

    def test_identical_pdf_reuses_active_or_completed_new_pipeline_job(self):
        store = server.JobStore(Path(self.temp.name) / 'dedupe')
        with patch.object(store.executor, 'submit') as submit:
            first = store.create(b'%PDF-1.4\ndedupe')
            self.assertEqual(store.create(b'%PDF-1.4\ndedupe'), first)
            submit.assert_called_once()
            directory = store.directory / first
            (directory / 'result-0.mxl').write_bytes(b'result')
            store.update(first, state='done', results=[{'name':'result-0.mxl'}])
            self.assertEqual(store.create(b'%PDF-1.4\ndedupe'), first)
            (directory / 'result-0.mxl').unlink()
            self.assertNotEqual(store.create(b'%PDF-1.4\ndedupe'), first)
        store.shutdown()

    def test_cache_lists_deletes_and_removes_completed_job_data(self):
        store = self.server.jobs; identifier='1'*32
        directory=store.directory/identifier;directory.mkdir(exist_ok=True)
        (directory/'score.pdf').write_bytes(b'%PDF-1.4 cached')
        store.jobs[identifier]={'id':identifier,'state':'done','filename':'八度.pdf','created':0,'results':[]}
        store.persist(identifier)
        status,body,_=self.request('GET','/api/cache')
        self.assertEqual(status,200)
        row=next(e for e in json.loads(body)['entries'] if e['id']==identifier)
        self.assertEqual(row['filename'],'八度.pdf');self.assertGreater(row['bytes'],0)
        self.assertEqual(self.request('DELETE','/api/cache/'+identifier)[0],403)
        self.assertTrue(directory.exists())
        self.assertEqual(self.request('DELETE','/api/cache/'+identifier,headers={'X-SheetVis':'local'})[0],200)
        self.assertFalse(directory.exists());self.assertIsNone(store.get(identifier))
        self.assertEqual(self.request('GET','/api/jobs/'+identifier)[0],404)

    def test_active_cache_and_traversal_cannot_be_deleted(self):
        store=self.server.jobs;identifier='2'*32;directory=store.directory/identifier;directory.mkdir(exist_ok=True)
        store.jobs[identifier]={'id':identifier,'state':'running','results':[]}
        try:
            self.assertEqual(self.request('DELETE','/api/cache/'+identifier,headers={'X-SheetVis':'local'})[0],409)
            self.assertEqual(self.request('DELETE','/api/cache/../../other',headers={'X-SheetVis':'local'})[0],404)
            self.assertTrue(directory.exists())
        finally: store.jobs.pop(identifier);directory.rmdir()

    def test_cache_source_pdf_and_filename_are_kept(self):
        store=self.server.jobs;identifier='3'*32;directory=store.directory/identifier;directory.mkdir(exist_ok=True)
        payload=b'%PDF-1.4 cached';(directory/'score.pdf').write_bytes(payload)
        store.jobs[identifier]={'id':identifier,'state':'done','results':[]}
        try:
            status,body,headers=self.request('GET',f'/api/jobs/{identifier}/score.pdf')
            self.assertEqual((status,body),(200,payload));self.assertEqual(headers['Content-Type'],'application/pdf')
        finally: store.jobs.pop(identifier);(directory/'score.pdf').unlink();directory.rmdir()

    def test_octave_review_and_training_bundle_routes_use_completed_project(self):
        import io
        from test_octaves import SHEET
        store=self.server.jobs;identifier='4'*32;directory=store.directory/identifier
        output=directory/'output';output.mkdir(parents=True,exist_ok=True)
        project=output/'score.omr'
        with zipfile.ZipFile(project,'w') as archive:
            archive.writestr('sheet#1/sheet#1.xml',SHEET)
            archive.writestr('sheet#1/BINARY.png',b'png')
        store.jobs[identifier]={'id':identifier,'state':'done','results':[]}
        try:
            status,body,_=self.request('GET',f'/api/jobs/{identifier}/octave-audit.json')
            self.assertEqual(status,200);self.assertEqual(json.loads(body)['lower'],1)
            status,body,headers=self.request('GET',f'/api/jobs/{identifier}/octave-training.zip')
            self.assertEqual(status,200);self.assertEqual(headers['Content-Type'],'application/zip')
            with zipfile.ZipFile(io.BytesIO(body)) as archive:self.assertEqual(archive.read('review.omr'),project.read_bytes())
            status,body,_=self.request('GET',f'/api/jobs/{identifier}/project.omr')
            self.assertEqual((status,body),(200,project.read_bytes()))
        finally:
            store.jobs.pop(identifier,None);server.shutil.rmtree(directory)

    def test_resource_settings_save_atomically_and_preserve_other_configuration(self):
        directory=Path(self.temp.name)/'resource-config';directory.mkdir(exist_ok=True)
        path=directory/'config.json';path.write_text(json.dumps({'colors':{'left':'#123456'},'default_score':'keep.pdf'}))
        headers={'X-SheetVis':'local','Content-Type':'application/json'}
        with patch.object(server,'ROOT',directory):
            status,body,_=self.request('POST','/api/config/recognition',json.dumps({'threads':20,'memory_mb':4096}),headers)
            self.assertEqual(status,200);self.assertTrue(json.loads(body)['saved'])
            saved=json.loads(path.read_text());self.assertEqual(saved['recognition_threads'],20);self.assertEqual(saved['colors'],{'left':'#123456'})
            status,body,_=self.request('GET','/api/config');self.assertEqual(json.loads(body)['recognition']['threads'],20)
            before=path.read_bytes()
            self.assertEqual(self.request('POST','/api/config/recognition',json.dumps({'threads':65,'memory_mb':4096}),headers)[0],400)
            self.assertEqual(self.request('POST','/api/config/recognition',json.dumps({'threads':8,'memory_mb':4096}))[0],403)
            self.assertEqual(path.read_bytes(),before)

    def test_progress_reports_latest_real_page_system_measure_without_stale_locations(self):
        log='INFO [score#7] StepMonitoring 98 | RHYTHMS\nINFO [score#7] StackRhythm 2 | S3 MeasureStack#12 no correct rhythm\n'
        progress=server.recognition_progress(log,'running')
        self.assertEqual((progress['current_page'],progress['current_system'],progress['current_measure']),(7,3,12))
        progress=server.recognition_progress(log+'INFO [score#8] StepMonitoring 98 | HEADS\n','running')
        self.assertEqual(progress['current_page'],8);self.assertNotIn('current_measure',progress)
        self.assertNotIn('current_system',progress)

    def test_cancel_api_and_default_cache_startup_descriptor(self):
        store=self.server.jobs;identifier='5'*32;directory=store.directory/identifier;directory.mkdir(exist_ok=True)
        (directory/'score.pdf').write_bytes(b'%PDF-1.4 source')
        store.jobs[identifier]={'id':identifier,'state':'queued','results':[],'filename':'saved.pdf'}
        root=Path(self.temp.name)/'defaults-config';root.mkdir(exist_ok=True)
        (root/'config.json').write_text(json.dumps({'default_score':'fallback.pdf','colors':{'left':'#123456'}}))
        with patch.object(server,'ROOT',root),patch.dict(server.os.environ,{},clear=True):
            self.assertEqual(self.request('POST',f'/api/jobs/{identifier}/cancel')[0],403)
            status,body,_=self.request('POST',f'/api/jobs/{identifier}/cancel',headers={'X-SheetVis':'local'})
            self.assertEqual(status,200);self.assertEqual(json.loads(body)['state'],'cancelled');self.assertEqual(json.loads(body)['progress'],0)
            self.assertTrue((directory/'score.pdf').exists())
            self.assertEqual(self.request('POST',f'/api/cache/{identifier}/default',headers={'X-SheetVis':'local'})[0],409)
            (directory/'result-0.mxl').write_bytes(b'xml')
            store.jobs[identifier].update(state='done',results=[{'name':'result-0.mxl'}])
            self.assertEqual(self.request('POST',f'/api/cache/{identifier}/default',headers={'X-SheetVis':'local'})[0],200)
            status,body,_=self.request('GET','/api/config');selected=json.loads(body)['default_score']
            self.assertEqual(selected['job_id'],identifier);self.assertEqual(selected['name'],'saved.pdf')
            self.assertEqual(self.request('GET','/api/default-score')[1],b'%PDF-1.4 source')
            self.assertEqual(self.request('DELETE','/api/cache/'+identifier,headers={'X-SheetVis':'local'})[0],200)
            self.assertIsNone(json.loads((root/'config.json').read_text())['default_cache'])

    def test_quality_deduplicates_engine_diagnostics_and_keeps_accuracy_unknown(self):
        line = 'INFO [score#3] StackRhythm 224 | S2 MeasureStack#4 no correct rhythm\n'
        offset = 'INFO [score#3] MeasureRhythm 1044 | Measure{#4} No timeOffset for HeadChordInter#123\n'
        error = 'WARN [score] PartwiseBuilder 2229 | Error visiting Measure{#9} in {Page#10.1}\n'
        report = server.quality_report(line * 2 + offset * 2 + error * 2)
        self.assertEqual(report['rhythm_issues'], [{'page':3,'system':2,'stack':4}])
        self.assertEqual(report['missing_offsets'], 1)
        self.assertEqual(report['export_errors'], [{'page':10,'stack':9}])
        self.assertIsNone(report['accuracy'])

    def test_export_is_collected_and_log_saved(self):
        store = server.JobStore(Path(self.temp.name) / 'mock')
        identifier = 'b' * 32
        directory = store.directory / identifier
        directory.mkdir()
        (directory / 'score.pdf').write_bytes(b'%PDF-1.4')
        store.jobs[identifier] = {'id': identifier, 'state': 'queued'}
        def run(command, env, log):
            self.assertIn('org.audiveris.omr.util.OmrExecutors.useParallelism=true', command)
            self.assertIn('-XX:ActiveProcessorCount=4', env['JAVA_TOOL_OPTIONS'])
            self.assertIn('-Xmx2048m', env['JAVA_TOOL_OPTIONS'])
            self.assertEqual(env['OMP_THREAD_LIMIT'], '1')
            out = directory / 'output/score'
            out.mkdir(parents=True, exist_ok=True)
            if '-step' in command and command[command.index('-step')+1] == 'GRID':
                with zipfile.ZipFile(out / 'score.omr', 'w') as z:
                    z.writestr('book.xml', '<book><sheet number="1"/><sheet number="2"/></book>')
                    z.writestr('sheet#1/sheet#1.xml', '<sheet/>')
                    z.writestr('sheet#2/sheet#2.xml', '<sheet><staff><lines>'+'<line/>'*5+'</lines></staff></sheet>')
                return 0
            self.assertIn('-sheets', command)
            self.assertEqual(command[command.index('-sheets')+1], '2')
            with zipfile.ZipFile(out / 'score.omr', 'w') as z:
                z.writestr('book.xml', '<book><sheet number="1"/><sheet number="2"><steps>GRID PAGE</steps></sheet></book>')
            with zipfile.ZipFile(out/'score.mxl','w') as z:
                z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
                z.writestr('score.xml','<score-partwise><part id="P1"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>')
            return 0
        with patch.object(store, 'execute', side_effect=run), patch('server.configuration', return_value={'recognition_threads':4}), patch('server.os.sched_getaffinity', return_value=set(range(8))):
            store.run(identifier)
        self.assertEqual(store.get(identifier)['state'], 'done')
        self.assertEqual((directory / 'result-0.mxl').read_bytes(), (directory/'output/score/score.mxl').read_bytes())
        self.assertEqual(store.get(identifier)['exported_notes'],1)
        self.assertTrue((directory / 'engine.log').exists())
        self.assertEqual(store.get(identifier)['included_pages'], [2])
        self.assertEqual(store.get(identifier)['skipped_pages'], [1])
        self.assertEqual(store.get(identifier)['progress'], 100)
        store.executor.shutdown()

    def test_identical_failed_pdf_resumes_saved_grid_and_rejects_partial_export(self):
        store = server.JobStore(Path(self.temp.name) / 'resume')
        payload = b'%PDF-1.4\nresume'; previous = 'f' * 32
        directory = store.directory / previous; output = directory / 'output'; output.mkdir(parents=True)
        with zipfile.ZipFile(output / 'score.omr', 'w') as z:
            z.writestr('book.xml', '<book><sheet number="1"/></book>')
            z.writestr('sheet#1/sheet#1.xml', '<sheet><staff><lines>'+'<line/>'*5+'</lines></staff></sheet>')
        store.jobs[previous] = {'id':previous,'state':'error','phase':'recognize','created':0,'sha256':server.hashlib.sha256(payload).hexdigest()}
        with patch.object(store.executor, 'submit'):
            identifier = store.create(payload)
        self.assertEqual(store.jobs[identifier]['resumed_from'], previous)
        steps = []
        def engine(command, env, log):
            step = command[command.index('-step')+1]
            steps.append(step)
            if step == 'PAGE':
                (store.directory / identifier / 'output/partial.mxl').write_bytes(b'partial')
            return 0
        with patch.object(store, 'execute', side_effect=engine) as execute:
            store.run(identifier)
        self.assertEqual(execute.call_count, 2)
        self.assertEqual(steps, ['LINKS', 'PAGE'])
        self.assertEqual(store.get(identifier)['state'], 'error')
        self.assertIn('未完成识别', store.get(identifier)['message'])
        self.assertFalse((store.directory / identifier / 'result-0.mxl').exists())
        store.shutdown()

    def test_timeout_reports_error(self):
        store = server.JobStore(Path(self.temp.name) / 'timeout')
        identifier = 'c' * 32
        directory = store.directory / identifier
        directory.mkdir()
        store.jobs[identifier] = {'id': identifier, 'state': 'queued'}
        with patch.object(store, 'execute', side_effect=server.subprocess.TimeoutExpired('engine', 600)):
            store.run(identifier)
        self.assertEqual(store.get(identifier)['state'], 'error')
        store.executor.shutdown()

    def test_progress_uses_page_and_stage_counts_and_only_completes_on_success(self):
        log = 'Book 560 | 2 sheets in score.pdf\n'+ '\n'.join('StepMonitoring 98 | '+step for step in server.OMR_STEPS[:4])
        scan = server.recognition_progress(log, 'running', 'scan')
        self.assertGreater(scan['progress'], 0)
        self.assertLess(scan['progress'], 25)
        transcribe = server.recognition_progress(log+'\nSHEETVIS_TRANSCRIBE\n'+ '\n'.join('StepMonitoring 98 | '+step for step in server.OMR_STEPS[4:]), 'running', 'recognize', 1)
        self.assertGreater(transcribe['progress'], 80)
        self.assertLess(transcribe['progress'], 100)
        self.assertEqual(server.recognition_progress(log, 'done')['progress'], 100)
        self.assertLess(server.recognition_progress(log, 'error')['progress'], 100)

    def test_text_only_book_fails_without_transcription(self):
        store = server.JobStore(Path(self.temp.name) / 'text-only')
        identifier = 'd'*32; directory = store.directory / identifier; directory.mkdir()
        store.jobs[identifier] = {'id': identifier, 'state': 'queued'}
        def run(command, env, log):
            out = directory / 'output'; out.mkdir()
            with zipfile.ZipFile(out / 'score.omr','w') as z:
                z.writestr('book.xml','<book><sheet number="1"/></book>')
                z.writestr('sheet#1/sheet#1.xml','<sheet/>')
            return 0
        with patch.object(store, 'execute', side_effect=run) as engine:
            store.run(identifier)
        self.assertEqual(engine.call_count, 1)
        self.assertEqual(store.get(identifier)['state'], 'error')
        self.assertIn('未检测到五线谱', store.get(identifier)['message'])
        store.shutdown()

    def test_completed_job_survives_server_restart(self):
        directory = Path(self.temp.name) / 'persist'
        store = server.JobStore(directory)
        identifier = 'e' * 32
        (directory / identifier).mkdir()
        store.jobs[identifier] = {'id': identifier, 'state': 'running', 'results': []}
        store.update(identifier, state='done', results=[{'name':'result-0.mxl'}])
        store.shutdown()
        restored = server.JobStore(directory)
        self.assertEqual(restored.get(identifier)['state'], 'done')
        self.assertEqual(restored.get(identifier)['progress'], 100)
        restored.shutdown()

    def test_shutdown_stops_only_owned_engine_process_group(self):
        store = server.JobStore(Path(self.temp.name) / 'shutdown')
        process = unittest.mock.Mock()
        process.pid = 12345
        process.poll.return_value = None
        store.process = process
        with patch('server.os.killpg') as kill:
            store.shutdown()
        kill.assert_called_once_with(12345, server.signal.SIGTERM)
        process.wait.assert_called_once_with(timeout=5)
        with self.assertRaises(ValueError):
            store.create(b'%PDF-1.4')


if __name__ == '__main__':
    unittest.main()
