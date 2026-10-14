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
            if '-step' in command:
                with zipfile.ZipFile(out / 'score.omr', 'w') as z:
                    z.writestr('book.xml', '<book><sheet number="1"/><sheet number="2"/></book>')
                    z.writestr('sheet#1/sheet#1.xml', '<sheet/>')
                    z.writestr('sheet#2/sheet#2.xml', '<sheet><staff><lines>'+'<line/>'*5+'</lines></staff></sheet>')
                return 0
            self.assertIn('-sheets', command)
            self.assertEqual(command[command.index('-sheets')+1], '2')
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
