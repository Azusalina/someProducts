import json
from concurrent.futures import Future
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import server
from ensemble import compare_scores

XML='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>'

class SecondEngineJobs(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=server.JobStore(self.temp.name)
        self.parent='a'*32;self.directory=Path(self.temp.name)/self.parent;self.directory.mkdir()
        (self.directory/'score.pdf').write_bytes(b'%PDF-test')
        (self.directory/'result-0.musicxml').write_text(XML)
        self.store.jobs[self.parent]={'id':self.parent,'state':'done','results':[{'name':'result-0.musicxml'}],'filename':'test.pdf','total_pages':1,'created':0}
        self.submit=patch.object(self.store.executor,'submit',side_effect=lambda *a:Future());self.submit.start()
        # Do not require a downloaded external engine for unit tests.
        self.exists=patch.object(Path,'is_file',return_value=True);self.exists.start()

    def tearDown(self):
        self.exists.stop();self.submit.stop();self.store.shutdown();self.temp.cleanup()

    def test_dedupe_snapshot_and_cancel(self):
        key=self.store.create_second_engine(self.parent,manual=True,end=0)
        self.assertEqual(key,self.store.create_second_engine(self.parent,manual=True,end=0))
        self.assertEqual((Path(self.temp.name)/key/'baseline.musicxml').read_text(),XML)
        self.store.cancel(key);self.assertEqual(self.store.jobs[key]['state'],'cancelled')
        self.assertEqual(self.store.jobs[self.parent]['state'],'done')

    def test_invalid_ranges_fail_before_job_created(self):
        for args in [{'first':0},{'last':2},{'start':2},{'end':-1},{'first':True}]:
            with self.assertRaises(ValueError):self.store.create_second_engine(self.parent,manual=True,**args)
        self.assertEqual(len(self.store.jobs),1)

    def test_worker_saves_report_and_keeps_original(self):
        key=self.store.create_second_engine(self.parent,manual=True,end=0)
        def execute(command,env,log):
            d=Path(self.temp.name)/key/'second-engine';d.mkdir()
            baseline=Path(self.temp.name)/key/'baseline.musicxml'
            report=compare_scores(baseline,baseline,'homr-test')
            (d/'comparison.json').write_text(json.dumps(report));return 0
        with patch.object(self.store,'execute',side_effect=execute):self.store.run(key)
        self.assertEqual(self.store.jobs[key]['state'],'done')
        self.assertEqual(self.store.jobs[key]['comparison']['agreement'],1)
        self.assertEqual(self.store.jobs[key]['results'],[])
        self.assertEqual((self.directory/'result-0.musicxml').read_text(),XML)

    def test_failure_is_separate_from_original(self):
        key=self.store.create_second_engine(self.parent,manual=True,end=0)
        with patch.object(self.store,'execute',return_value=1):self.store.run(key)
        self.assertEqual(self.store.jobs[key]['state'],'error');self.assertEqual(self.store.jobs[self.parent]['state'],'done')


    def test_legacy_auto_endpoints_never_create_work_even_if_old_config_is_true(self):
        self.store.jobs[self.parent]['assistance']={'state':'pending','pages':[{'page':1,'start':0,'end':0}]}
        with patch('server.configuration',return_value={'auto_assist':True}):
            for _ in range(3):
                result=self.store.ensure_assistance(self.parent);self.store.schedule_assistance(self.parent)
                self.assertTrue(result['manual_only']);self.assertEqual(result['state'],'stopped')
        self.assertEqual(len(self.store.jobs),1)

    def test_requires_manual_request(self):
        with self.assertRaisesRegex(ValueError,'手动'):self.store.create_second_engine(self.parent)
        self.assertEqual(len(self.store.jobs),1)

    def test_empty_auto_endpoint_is_read_only(self):
        self.assertEqual(self.store.ensure_assistance(self.parent)['state'],'disabled')
        self.assertNotIn('assistance',self.store.jobs[self.parent]);self.assertEqual(len(self.store.jobs),1)

    def test_omitted_end_and_explicit_full_range_reuse_same_job(self):
        key=self.store.create_second_engine(self.parent,manual=True)
        self.assertEqual(key,self.store.create_second_engine(self.parent,manual=True,end=0))
        self.assertEqual(self.store.jobs[key]['requested_by'],'user')

    def test_equivalent_parent_caches_reuse_the_same_comparison(self):
        key=self.store.create_second_engine(self.parent,manual=True,end=0)
        other='b'*32;directory=Path(self.temp.name)/other;directory.mkdir()
        (directory/'score.pdf').write_bytes((self.directory/'score.pdf').read_bytes())
        (directory/'result-0.musicxml').write_text(XML.replace('><','>\n  <'))
        self.store.jobs[other]={**self.store.jobs[self.parent],'id':other}
        self.assertEqual(key,self.store.create_second_engine(other,manual=True,end=0))
        (directory/'result-0.musicxml').write_text(XML.replace('<step>C','<step>D'))
        self.assertNotEqual(key,self.store.create_second_engine(other,manual=True,end=0))

    def test_startup_cancels_legacy_automatic_jobs_and_preserves_files(self):
        key=self.store.create_second_engine(self.parent,manual=True,end=0)
        self.store.jobs[key].pop('requested_by');self.store.persist(key)
        reloaded=server.JobStore(self.temp.name)
        try:
            self.assertEqual(reloaded.jobs[key]['state'],'cancelled')
            self.assertEqual(json.loads((Path(self.temp.name)/key/'job.json').read_text())['state'],'cancelled')
            self.assertTrue((Path(self.temp.name)/key/'baseline.musicxml').exists())
        finally:reloaded.shutdown()
