from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import xml.etree.ElementTree as ET
from curve_repair import recover_curves


def system(sid,slur,side,head,x1,x2,tie='',staff='1'):
    return f'''<system id="{sid}"><stack left="100" right="1000"/><part id="1"><staff id="{staff}"/></part><sig><inters><head id="{head}" staff="{staff}"/><slur id="{slur}" above="true" {tie}><curve x1="{x1}" x2="{x2}"/></slur></inters><relations><relation source="{slur}" target="{head}"><slur-head side="{side}"/></relation></relations></sig></system>'''

class CurveTests(unittest.TestCase):
    def run_case(self,tie=False,pitch='D',gap=False,crosspage=False,ambiguous=False):
        with tempfile.TemporaryDirectory()as directory:
            d=Path(directory);project=d/'score.omr';path=d/'score.musicxml'
            attr='tie="true"'if tie else ''
            first=system(1,10,'LEFT',1,800,1000,attr)
            second=system(2,20,'RIGHT',2,100,300,attr)
            if ambiguous:second=second.replace('</inters>','<slur id="21" above="true"><curve x1="100" x2="290"/></slur></inters>').replace('</relations>','<relation source="21" target="2"><slur-head side="RIGHT"/></relation></relations>')
            def sheet(s):return '<sheet><scale><interline main="20"/></scale><page>'+s+'</page></sheet>'
            with zipfile.ZipFile(project,'w')as z:
                z.writestr('sheet#1/sheet#1.xml',sheet(first if crosspage else first+second))
                if crosspage:z.writestr('sheet#2/sheet#2.xml',sheet(second))
            def note(step):return f'<note><pitch><step>{step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>'
            xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes>'+note('C')+('<note><rest/><duration>4</duration></note>'if gap else '')+'</measure><measure number="2">'+note(pitch)+'</measure></part></score-partwise>'
            path.write_text(xml);before=[ET.tostring(n.find('pitch'))for n in ET.fromstring(xml).findall('.//note')if n.find('pitch')is not None]
            mapping={'positions':{'P1:0:0':{'page':1,'head':'1'},'P1:1:0':{'page':2 if crosspage else 1,'head':'2'}}}
            with patch('curve_repair.source_map',return_value=mapping):
                r=recover_curves(project,path)
                again=recover_curves(project,path)
            root=ET.parse(path).getroot();after=[ET.tostring(n.find('pitch'))for n in root.findall('.//note')if n.find('pitch')is not None]
            self.assertEqual(before,after);self.assertEqual(again['repairs'],[])
            return r,root

    def test_cross_system_slur_keeps_two_attacks_and_pitch(self):
        r,root=self.run_case();self.assertEqual(len(r['repairs']),1);self.assertEqual(len(root.findall('.//slur')),2);self.assertFalse(root.findall('.//tie'))

    def test_cross_page_slur(self):
        r,_=self.run_case(crosspage=True);self.assertEqual(r['repairs'][0]['end_page'],2)

    def test_tie_requires_same_pitch_and_contiguous_time(self):
        r,root=self.run_case(tie=True,pitch='C');self.assertEqual(len(r['repairs']),1);self.assertEqual(len(root.findall('.//tie')),2)
        r,_=self.run_case(tie=True);self.assertEqual(r['repairs'],[])
        r,_=self.run_case(tie=True,pitch='C',gap=True);self.assertEqual(r['repairs'],[])

    def test_ambiguous_fragments_are_not_joined(self):
        r,_=self.run_case(ambiguous=True);self.assertEqual(r['repairs'],[]);self.assertTrue(r['findings'])
