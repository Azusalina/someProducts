from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile
import server
from omr_support import repair_initial_meter

SHEET='''<sheet last-persistent-id="100"><scale><interline main="10"/></scale><page><system><stack id="1" left="100" right="800"/><part><staff id="1"><lines>LINE</lines></staff><staff id="2"><lines>LINE2</lines></staff><measure id="1"/></part><sig><inters/></sig></system></page></sheet>'''.replace('LINE2',''.join(f'<line><point y="{y}"/></line>'for y in range(300,341,10))).replace('LINE',''.join(f'<line><point y="{y}"/></line>'for y in range(200,241,10)))

class ContextTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def project(self):
        p=self.root/'score.omr'
        with zipfile.ZipFile(p,'w')as z:
            z.writestr('book.xml','<book><sheet number="1"><steps>LOAD LINKS RHYTHMS PAGE</steps><page><last-time-rational num="4" den="4"/></page></sheet></book>')
            z.writestr('sheet#1/sheet#1.xml',SHEET);z.writestr('binary.bin',b'unchanged')
        return p
    def test_verified_context_supplies_both_staves_and_invalidates_rhythm(self):
        p=self.project();result=repair_initial_meter(p,'6/8')
        self.assertEqual(result[0]['meter'],'6/8')
        with zipfile.ZipFile(p)as z:
            sheet=ET.fromstring(z.read('sheet#1/sheet#1.xml'));book=ET.fromstring(z.read('book.xml'))
            self.assertEqual(len(sheet.findall('.//time-whole')),2)
            self.assertEqual(sheet.findtext('.//measure/times'),'101 102')
            self.assertEqual(book.findtext('sheet/steps'),'LOAD LINKS')
            self.assertIsNone(book.find('sheet/page/last-time-rational'))
            self.assertEqual(z.read('binary.bin'),b'unchanged')
        before=p.read_bytes();self.assertEqual(repair_initial_meter(p,'4/4'),[]);self.assertEqual(p.read_bytes(),before)
    def test_invalid_meter_does_not_touch_project(self):
        p=self.project();before=p.read_bytes()
        with self.assertRaises(ValueError):repair_initial_meter(p,'99/8')
        self.assertEqual(p.read_bytes(),before)
    def test_context_and_resolution_are_file_specific_cache_keys(self):
        data=b'%PDF-1.4 context';digest=server.hashlib.sha256(data).hexdigest()
        settings={'initial_meter':'6/8','implicit_tuplets':True,'input_dpi':400}
        config={'score_overrides':{digest:settings}}
        store=server.JobStore(self.root/'jobs')
        try:
            with patch('server.configuration',return_value=config),patch.object(store.executor,'submit'):
                first=store.create(data,'fragment.pdf')
                self.assertEqual(store.create(data),first)
                self.assertFalse(store.get(first)['upgrade_available'])
                self.assertEqual(store.jobs[first]['initial_meter'],'6/8')
                self.assertTrue(store.jobs[first]['implicit_tuplets'])
                other=store.create(b'%PDF-1.4 other')
                self.assertIsNone(store.jobs[other].get('initial_meter'));self.assertEqual(store.jobs[other]['input_dpi'],300)
                settings['input_dpi']=600
                self.assertTrue(store.get(first)['upgrade_available'])
                second=store.create(data);self.assertNotEqual(first,second)
                self.assertEqual(store.jobs[second]['input_dpi'],600)
        finally:store.shutdown()
    def test_invalid_resolution_does_not_start_worker(self):
        for value in (True,400.0,1200,'400'):
            with patch('server.configuration',return_value={'score_overrides':{'hash':{'input_dpi':value}}}):
                with self.assertRaises(ValueError):server.input_dpi_for('hash')
    def test_export_with_large_note_loss_is_rejected(self):
        p=self.root/'test.musicxml'
        def write(count):p.write_text('<score-partwise><part><measure>'+'<note><pitch><step>C</step><octave>4</octave></pitch></note>'*count+'</measure></part></score-partwise>')
        write(97);self.assertEqual(server.validate_export_notes([p],100),97)
        write(96)
        with self.assertRaisesRegex(RuntimeError,'原缓存保留'):server.validate_export_notes([p],100)
    def test_reexport_does_not_erase_inherited_rhythm_diagnostics(self):
        inherited={'rhythm_issues':[{'page':3,'system':1,'stack':3}],'missing_offsets':2,'export_errors':[{'page':1,'stack':1}]}
        result=server.quality_report('new export succeeded',inherited)
        self.assertEqual(result['rhythm_issues'],inherited['rhythm_issues']);self.assertEqual(result['missing_offsets'],2)
        self.assertEqual(result['export_errors'],[])  # Export faults really can be repaired independently.

    def test_external_default_reuses_completed_cache_and_hash_invalidates_when_file_changes(self):
        pdf=self.root/'original.pdf';payload=b'%PDF-1.4 ABC';pdf.write_bytes(payload)
        digest=server.hashlib.sha256(payload).hexdigest();store=server.JobStore(self.root/'defaults')
        identifier='a'*32;directory=store.directory/identifier;directory.mkdir();(directory/'score.pdf').write_bytes(payload);(directory/'result-0.mxl').write_bytes(b'result')
        store.jobs[identifier]={'id':identifier,'state':'done','sha256':digest,'filename':'original.pdf','results':[{'name':'result-0.mxl'}]}
        try:
            with patch('server.configuration',return_value={'default_score':str(pdf)}):
                self.assertEqual(store.default_selection()['job_id'],identifier)
                self.assertEqual(store.default_selection()['job_id'],identifier)
                pdf.write_bytes(b'%PDF-1.4 XYZ')
                self.assertIsNone(store.default_selection())
        finally:store.shutdown()

    def test_default_can_resume_watching_an_active_job_without_creating_another(self):
        pdf=self.root/'active.pdf';payload=b'%PDF-1.4 active';pdf.write_bytes(payload)
        store=server.JobStore(self.root/'active')
        try:
            with patch('server.configuration',return_value={'default_score':str(pdf)}),patch.object(store.executor,'submit')as submit:
                identifier=store.create(payload,'active.pdf')
                self.assertEqual(store.default_selection()['job_id'],identifier)
                self.assertEqual(store.default_selection()['job_id'],identifier)
                self.assertEqual(store.create(payload),identifier);submit.assert_called_once()
        finally:store.shutdown()
