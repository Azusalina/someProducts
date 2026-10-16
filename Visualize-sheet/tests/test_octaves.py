import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from octave_support import audit_octaves, native_octaves, training_bundle

SHEET='''<sheet><picture width="1000" height="1000"/><scale><interline main="10"/></scale><page><system><part><staff id="1"><lines><line><point y="200"/></line><line><point y="240"/></line></lines></staff></part><sig><inters><octave-shift id="1" kind="ALTA" staff="1"><bounds x="100" y="150" w="20" h="20"/><line><p1 x="100" y="150"/><p2 x="130" y="150"/></line></octave-shift><octave-shift id="2" kind="BASSA" staff="1"><bounds x="300" y="300" w="20" h="20"/><line><p1 x="300" y="300"/><p2 x="500" y="300"/></line><hook x="500" y="290"/></octave-shift></inters></sig></system></page></sheet>'''
class OctaveTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'test.omr'
  with zipfile.ZipFile(self.path,'w') as z:z.writestr('sheet#1/sheet#1.xml',SHEET);z.writestr('sheet#1/BINARY.png',b'png')
 def tearDown(self):self.temp.cleanup()
 def test_audit_flags_short_lines_not_all_lower_octaves(self):
  before=self.path.read_bytes();r=audit_octaves(self.path)
  self.assertEqual((r['upper'],r['lower']),(1,1));self.assertEqual([f['id'] for f in r['findings']],['1']);self.assertEqual(before,self.path.read_bytes())
 def test_native_missing_symbol_is_reported_without_rewriting_pitch(self):
  with patch('octave_support.native_octaves',return_value=[{'page':1,'x':.8,'y':.1,'text':'8vb'}]):r=audit_octaves(self.path,'unused')
  self.assertEqual(r['findings'][-1]['reason'],'native_label_without_omr_match');self.assertFalse(r['pitch_corrected'])
 def test_review_bundle_has_no_self_labelled_training_truth(self):
  with zipfile.ZipFile(io.BytesIO(training_bundle(self.path))) as z:
   data=json.loads(z.read('review.json'));self.assertFalse(data['trained']);self.assertTrue(all(s['human_label'] is None for s in data['samples']))
   self.assertEqual(z.read('review.omr'),self.path.read_bytes());self.assertIn('How-to-train.md',z.namelist())
 def test_native_reader_does_not_promote_bare_8_or_page_numbers(self):
  result=type('Result',(),{'stdout':b'<html xmlns="x"><page width="100" height="100"><word xMin="10" yMin="20">8</word><word xMin="10" yMin="30">8vb</word></page></html>'})()
  with patch('octave_support.subprocess.run',return_value=result):self.assertEqual(len(native_octaves('x')),1)
 def test_music_font_control_bytes_do_not_hide_valid_octave_text(self):
  result=type('Result',(),{'stdout':b'<html xmlns="x"><page width="100" height="100"><word xMin="1" yMin="2">\x03</word><word xMin="10" yMin="30">8va</word></page></html>'})()
  with patch('octave_support.subprocess.run',return_value=result):self.assertEqual(native_octaves('x')[0]['text'],'8va')
 def test_native_failure_is_reported_as_unavailable(self):
  with patch('octave_support.subprocess.run',side_effect=OSError('no pdftotext')):
   r=audit_octaves(self.path,'unused');self.assertFalse(r['native_available']);self.assertTrue(r['native_errors'])
