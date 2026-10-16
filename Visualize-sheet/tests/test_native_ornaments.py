from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile
from omr_support import read_musicxml
from native_ornaments import native_marks,recover_ornaments

class NativeOrnamentTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'test.mxl'
    def tearDown(self):self.temp.cleanup()
    def fixture(self):
        with zipfile.ZipFile(self.path,'w')as z:
            z.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>')
            z.writestr('score.xml','<score-partwise><part id="P1"><measure><note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><notations><ornaments><inverted-mordent/></ornaments></notations></note></measure></part></score-partwise>')
    def marks(self,font):
        html=f'<pdf2xml><page number="1" width="1000" height="1000"><fontspec id="1" family="{font}"/><text left="100" top="100" width="0" height="40" font="1">w</text></page></pdf2xml>'
        bbox='<html xmlns="x"><page width="1000" height="1000"><word xMin="100" yMin="100" xMax="100" yMax="140">w</word></page></html>'
        with patch('native_ornaments.subprocess.run',side_effect=[SimpleNamespace(stdout=html.encode()),SimpleNamespace(stdout=bbox.encode())]):return native_marks('unused.pdf')
    def test_letter_w_is_an_ornament_only_in_verified_music_font(self):
        self.assertEqual(len(self.marks('ABCDEF+TeXMUSIX20-Regular')),1)
        self.assertEqual(self.marks('Times-Roman'),[])
    def test_native_lower_mordent_replaces_wrong_upper_type_without_adding_notes(self):
        self.fixture();mark={'page':1,'glyph':'w','kind':'mordent','x':.1,'y':.14}
        mapping={'positions':{'P1:0:0':{'page':1,'x':.1,'y':.13,'w':.01,'h':.01,'head':'1'}}}
        with patch('native_ornaments.native_marks',return_value=[mark]),patch('native_ornaments.source_map',return_value=mapping):r=recover_ornaments('unused','unused',self.path)
        self.assertEqual(len(r['recovered']),1)
        xml=read_musicxml(self.path);self.assertEqual(len(xml.findall('.//note/pitch')),1)
        self.assertEqual(xml.find('.//mordent').get('long'),'yes');self.assertIsNone(xml.find('.//inverted-mordent'))
    def test_unlocated_or_ambiguous_symbol_never_modifies_a_note(self):
        self.fixture();before=self.path.read_bytes()
        mark={'page':1,'glyph':'w','kind':'mordent','x':.1,'y':.14}
        mapping={'positions':{f'P1:0:{n}':{'page':1,'x':.1,'y':.13,'w':.01,'h':.01,'head':str(n)}for n in range(2)}}
        with patch('native_ornaments.native_marks',return_value=[mark]),patch('native_ornaments.source_map',return_value=mapping):r=recover_ornaments('unused','unused',self.path)
        self.assertEqual(r['recovered'],[]);self.assertEqual(len(r['findings']),1);self.assertEqual(self.path.read_bytes(),before)
