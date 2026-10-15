import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import zipfile
import server


class CancelDefaultTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.store=server.JobStore(self.root/'jobs')
    def tearDown(self):self.store.shutdown();self.temp.cleanup()
    def job(self,identifier,state='queued'):
        directory=self.store.directory/identifier;directory.mkdir(exist_ok=True)
        (directory/'score.pdf').write_bytes(b'%PDF-1.4 cached')
        self.store.jobs[identifier]={'id':identifier,'state':state,'created':0,'filename':'cached.pdf','results':[]}
        self.store.persist(identifier);return directory
    def wait_process(self):
        deadline=time.monotonic()+5
        while self.store.process is None and time.monotonic()<deadline:time.sleep(.01)
        self.assertIsNotNone(self.store.process);return self.store.process
    def test_cancel_running_stops_process_and_retains_uploaded_file(self):
        identifier='a'*32;directory=self.job(identifier)
        def work(id):
            self.store.update(id,state='running')
            with (directory/'engine.log').open('wb') as log:
                self.store.execute([sys.executable,'-c','import time; time.sleep(30)'],dict(os.environ),log)
            self.store.update(id,state='done')
        with patch.object(self.store,'_run',side_effect=work):
            future=self.store.executor.submit(self.store.run,identifier);process=self.wait_process()
            self.store.cancel(identifier);future.result(timeout=5)
        self.assertEqual(self.store.get(identifier)['state'],'cancelled');self.assertIsNotNone(process.poll())
        self.assertTrue((directory/'score.pdf').exists());self.assertTrue((directory/'engine.log').exists())
        self.store.cancel(identifier)  # Idempotent terminal request.
    def test_cancelling_queued_job_never_stops_a_different_active_job(self):
        first='b'*32;second='c'*32;directory=self.job(first);self.job(second)
        def work(id):
            self.store.update(id,state='running')
            with (directory/'engine.log').open('wb') as log:
                self.store.execute([sys.executable,'-c','import time; time.sleep(30)'],dict(os.environ),log)
        with patch.object(self.store,'_run',side_effect=work):
            active=self.store.executor.submit(self.store.run,first);process=self.wait_process()
            queued=self.store.executor.submit(self.store.run,second);self.store.futures[second]=queued
            self.store.cancel(second)
            self.assertEqual(self.store.get(second)['state'],'cancelled');self.assertTrue(queued.cancelled())
            self.assertIsNone(process.poll());self.assertEqual(self.store.get(first)['state'],'running')
            self.store.cancel(first);active.result(timeout=5)
    def test_cancel_between_stages_prevents_done_state_and_blocks_early_deletion(self):
        identifier='d'*32;self.job(identifier);started=threading.Event();release=threading.Event()
        def work(id):
            self.store.update(id,state='running');started.set();release.wait(5)
            self.store.update(id,state='done')
        with patch.object(self.store,'_run',side_effect=work):
            future=self.store.executor.submit(self.store.run,identifier);self.assertTrue(started.wait(2))
            self.store.cancel(identifier);self.assertEqual(self.store.get(identifier)['state'],'cancelling')
            with self.assertRaises(ValueError):self.store.delete_cache(identifier)
            release.set();future.result(timeout=2)
        self.assertEqual(self.store.get(identifier)['state'],'cancelled')
        self.store.delete_cache(identifier);self.assertIsNone(self.store.get(identifier))
    def test_resume_cancelled_job_uses_backup_when_live_project_is_invalid(self):
        identifier='e'*32;directory=self.job(identifier,'cancelled');output=directory/'output';output.mkdir()
        payload=(directory/'score.pdf').read_bytes();(output/'score.omr').write_bytes(b'partial zip')
        self.store.jobs[identifier].update(phase='recognize',sha256=server.hashlib.sha256(payload).hexdigest())
        with zipfile.ZipFile(directory/'checkpoint.omr','w') as z:
            z.writestr('book.xml','<book path="/old/score.pdf"><sheet number="1"><input><path>/old/score.pdf</path><number>1</number></input></sheet></book>')
            z.writestr('sheet#1/sheet#1.xml','<sheet><staff><lines>'+'<line/>'*5+'</lines></staff></sheet>')
        with patch.object(self.store.executor,'submit'):
            resumed=self.store.create(payload)
        self.assertEqual(self.store.jobs[resumed]['resumed_from'],identifier)
        with zipfile.ZipFile(self.store.directory/resumed/'output/score.omr') as z:
            self.assertEqual(server.ET.fromstring(z.read('book.xml')).get('path'),str(self.store.directory/resumed/'score.pdf'))
            self.assertEqual(server.ET.fromstring(z.read('book.xml')).findtext('sheet/input/path'),str(self.store.directory/resumed/'score.pdf'))
    def test_default_cache_validation_persistence_and_deletion_fallback(self):
        identifier='f'*32;directory=self.job(identifier,'done');(directory/'result-0.mxl').write_bytes(b'result')
        self.store.jobs[identifier]['results']=[{'name':'result-0.mxl'}]
        (self.root/'config.json').write_text(json.dumps({'default_score':'original.pdf','colors':{'left':'#123456'}}))
        with patch.object(server,'ROOT',self.root),patch.dict(os.environ,{},clear=True):
            selected=self.store.set_default(identifier)
            self.assertEqual(selected['job_id'],identifier)
            self.assertEqual(json.loads((self.root/'config.json').read_text())['colors'],{'left':'#123456'})
            self.assertTrue(self.store.cache_entries()[0]['is_default'])
            self.store.delete_cache(identifier)
            config=json.loads((self.root/'config.json').read_text())
            self.assertIsNone(config['default_cache']);self.assertEqual(config['default_score'],'original.pdf')
            self.assertIsNone(self.store.default_selection())
    def test_incomplete_cache_cannot_be_default_and_explicit_environment_keeps_precedence(self):
        identifier='0'*32;directory=self.job(identifier,'cancelled')
        with patch.object(server,'ROOT',self.root):
            with self.assertRaises(ValueError):self.store.set_default(identifier)
            self.store.jobs[identifier].update(state='done',results=[{'name':'result-0.mxl'}])
            with self.assertRaises(ValueError):self.store.set_default(identifier)
            (directory/'result-0.mxl').write_bytes(b'xml')
            self.store.set_default(identifier)
            with patch.dict(os.environ,{'SHEETVIS_DEFAULT_SCORE':'/explicit.pdf'}):self.assertIsNone(self.store.default_selection())
