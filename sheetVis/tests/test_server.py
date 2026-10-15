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
            (out / 'score.mxl').write_bytes(b'fixture result')
            return 0
        with patch.object(store, 'execute', side_effect=run):
            store.run(identifier)
        self.assertEqual(store.get(identifier)['state'], 'done')
        self.assertEqual((directory / 'result-0.mxl').read_bytes(), b'fixture result')
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
        def engine(command, env, log):
            self.assertEqual(command[command.index('-step')+1], 'PAGE')
            (store.directory / identifier / 'output/partial.mxl').write_bytes(b'partial')
            return 0
        with patch.object(store, 'execute', side_effect=engine) as execute:
            store.run(identifier)
        self.assertEqual(execute.call_count, 1)
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
