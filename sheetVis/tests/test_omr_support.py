import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile
from omr_support import repair_meters, repair_dynamics, source_map


SHEET = '''<sheet last-persistent-id="100"><picture width="1000" height="1000"/><scale><interline main="10"/></scale><page id="1"><system id="1"><stack id="1" left="100" right="900"><slot id="1" time-offset="0"/></stack><part id="1"><staff id="1"><lines><line><point y="200"/></line><line><point y="210"/></line><line><point y="220"/></line><line><point y="230"/></line><line><point y="240"/></line></lines></staff><staff id="2"><lines><line><point y="300"/></line><line><point y="310"/></line><line><point y="320"/></line><line><point y="330"/></line><line><point y="340"/></line></lines></staff><measure id="1"><voice id="1"><slots><entry><key>1</key><value chord="10" status="BEGIN"/></entry></slots></voice></measure></part><sig><inters><head-chord id="10"/><head id="11" staff="1" pitch="0" grade="0.9"><bounds x="150" y="215" w="12" h="10"/></head><wedge id="20"/><wedge id="21"/></inters><relations><relation source="10" target="11"><containment/></relation><relation source="10" target="20"><chord-wedge/></relation><relation source="99" target="21"><chord-wedge/></relation></relations></sig></system></page></sheet>'''
BOOK = '<book><sheet number="1"><steps>LOAD BINARY SCALE GRID HEADERS STEM_SEEDS BEAMS LEDGERS HEADS STEMS REDUCTION CUE_BEAMS TEXTS MEASURES CHORDS CURVES SYMBOLS LINKS RHYTHMS PAGE</steps><page id="1" delta-measure-id="1"><last-time-rational num="4" den="4"/></page></sheet><score><page sheet-number="1" sheet-page-id="1"/></score></book>'


class OMRSupportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory();self.directory = Path(self.temp.name);self.project = self.directory/'test.omr'
        with zipfile.ZipFile(self.project,'w') as z:
            z.writestr('book.xml',BOOK);z.writestr('sheet#1/sheet#1.xml',SHEET);z.writestr('untouched.bin',b'unchanged')
    def tearDown(self): self.temp.cleanup()

    def test_unanimous_native_signature_restores_meter_and_recomputes_rhythm(self):
        candidates = [{'page':1,'num':6,'den':4,'x':.11,'y':.22},{'page':1,'num':6,'den':4,'x':.11,'y':.32}]
        with patch('omr_support.native_meters',return_value=candidates): repairs = repair_meters(self.project,'unused.pdf')
        self.assertEqual(repairs[0]['meter'],'6/4')
        with zipfile.ZipFile(self.project) as z:
            sheet=ET.fromstring(z.read('sheet#1/sheet#1.xml'));book=ET.fromstring(z.read('book.xml'))
            self.assertEqual(len(sheet.findall('.//time-whole')),2)
            self.assertEqual(sheet.findtext('.//measure/times'),'101 102')
            self.assertNotIn('RHYTHMS',book.findtext('sheet/steps'))
            self.assertEqual(z.read('untouched.bin'),b'unchanged')

    def test_one_staff_or_conflicting_signatures_are_not_guessed(self):
        for candidates in [[{'page':1,'num':6,'den':4,'x':.11,'y':.22}], [{'page':1,'num':6,'den':4,'x':.11,'y':.22},{'page':1,'num':3,'den':4,'x':.11,'y':.32}]]:
            before=self.project.read_bytes()
            with patch('omr_support.native_meters',return_value=candidates): self.assertEqual(repair_meters(self.project,'unused.pdf'),[])
            self.assertEqual(before,self.project.read_bytes())

    def test_dynamic_repair_keeps_valid_wedges_and_every_note(self):
        repaired=repair_dynamics(self.project)
        self.assertEqual([r['wedge'] for r in repaired],['21'])
        with zipfile.ZipFile(self.project) as z:
            sheet=ET.fromstring(z.read('sheet#1/sheet#1.xml'))
            self.assertIsNotNone(sheet.find('.//wedge[@id="20"]'))
            self.assertIsNone(sheet.find('.//wedge[@id="21"]'))
            self.assertEqual(len(sheet.findall('.//head')),1)

    def test_note_mapping_requires_a_voice_and_physical_head_match(self):
        xml=self.directory/'score.musicxml'
        xml.write_text('<score-partwise><part id="P1"><measure number="1"><note default-x="50"><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note><note default-x="800"><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>')
        result=source_map(self.project,xml)
        self.assertEqual((result['mapped'],result['total']),(1,2))
        self.assertEqual(result['positions']['P1:0:0']['x'],.15)
        self.assertEqual(result['positions']['P1:0:0']['page'],1)
        self.assertNotIn('P1:0:1',result['positions'])

    def test_octave_display_shift_preserves_originating_head_identity(self):
        xml=self.directory/'ottava.musicxml'
        pitch='<note default-x="50"><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>'
        xml.write_text('<score-partwise><part id="P1"><measure number="1">'+pitch+'</measure></part></score-partwise>')
        # Geometry links an exported pitch to its originating head; it does
        # not certify that the exported octave is correct.
        self.assertEqual(source_map(self.project,xml)['mapped'],1)
        direction='<direction><direction-type><octave-shift type="down" size="8"/></direction-type><staff>1</staff></direction>'
        xml.write_text('<score-partwise><part id="P1"><measure number="1">'+direction+pitch+'</measure></part></score-partwise>')
        result=source_map(self.project,xml)
        self.assertEqual(result['mapped'],1)
        self.assertEqual(result['positions']['P1:0:0']['head'],'11')

    def test_octave_chord_members_keep_distinct_physical_heads(self):
        sheet=ET.fromstring(SHEET)
        inters=sheet.find('.//sig/inters');relations=sheet.find('.//sig/relations')
        head=ET.SubElement(inters,'head',{'id':'12','staff':'1','pitch':'7','grade':'0.9'})
        ET.SubElement(head,'bounds',{'x':'150','y':'250','w':'12','h':'10'})
        relation=ET.SubElement(relations,'relation',{'source':'10','target':'12'});ET.SubElement(relation,'containment')
        with zipfile.ZipFile(self.project,'w') as z:z.writestr('book.xml',BOOK);z.writestr('sheet#1/sheet#1.xml',ET.tostring(sheet))
        xml=self.directory/'chord.musicxml'
        xml.write_text('<score-partwise><part id="P1"><measure number="1"><direction><direction-type><octave-shift type="down" size="8"/></direction-type><staff>1</staff></direction><note default-x="50"><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note><note default-x="50"><chord/><pitch><step>B</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>')
        result=source_map(self.project,xml)
        self.assertEqual(result['positions']['P1:0:0']['head'],'12')
        self.assertEqual(result['positions']['P1:0:1']['head'],'11')


if __name__=='__main__':unittest.main()
