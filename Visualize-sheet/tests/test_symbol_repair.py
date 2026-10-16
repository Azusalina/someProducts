import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile
from symbol_repair import repair_symbols, correlation, staff_y, audit_export

try:
    import numpy as np
    from PIL import Image, ImageDraw
    import scipy
except ImportError:
    np=None


@unittest.skipIf(np is None,'image checks need Pillow, NumPy and SciPy')
class SymbolTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'score.omr'
    def tearDown(self):self.temp.cleanup()
    def fixture(self,clef=True):
        image=Image.new('L',(600,240),255);draw=ImageDraw.Draw(image)
        for y in range(80,121,10):draw.line((10,y,590,y),fill=0)
        sheet=ET.fromstring('<sheet last-persistent-id="100"><scale><interline main="10"/></scale><page><system id="1"><stack id="1" left="10" right="590"/><part id="1"><staff id="1" left="10" right="590"><lines>'+''.join(f'<line><point x="10" y="{y}"/><point x="590" y="{y}"/></line>'for y in range(80,121,10))+'</lines></staff><measure id="1"><clefs>1</clefs><head-chords>12</head-chords><voice id="1"><slots><entry><key>1</key><value chord="12" status="BEGIN"/></entry></slots></voice></measure></part><sig><inters/><relations/></sig></system></page></sheet>')
        inters=sheet.find('.//inters');rels=sheet.find('.//relations')
        def entity(tag,attrs,b):
            el=ET.SubElement(inters,tag,attrs);ET.SubElement(el,'bounds',dict(zip(('x','y','w','h'),map(str,b))));return el
        if clef:
            # One linked source glyph and its identical unclassified occurrence;
            # a third copy outside staff alignment must not become a clef.
            rng=np.random.default_rng(4);glyph=Image.fromarray(np.where(rng.random((65,20))<.38,0,255).astype('uint8'))
            for x,y in [(140,50),(320,50),(450,160)]:image.paste(glyph,(x,y))
            entity('clef',{'id':'1','staff':'1','kind':'TREBLE','shape':'G_CLEF_SMALL','pitch':'2','grade':'.9'},(140,50,20,65))
            entity('head',{'id':'11','staff':'1','shape':'NOTEHEAD_VOID','grade':'.25','pitch':'0'},(325,85,10,10))
            entity('head-chord',{'id':'12','staff':'1'},(325,85,10,10))
            rel=ET.SubElement(rels,'relation',{'source':'12','target':'11'});ET.SubElement(rel,'containment')
        else:
            for x in (180,380):
                draw.line((x+1,65,x+1,92),fill=0,width=2);draw.line((x+6,71,x+6,95),fill=0,width=2);draw.line((x,75,x+7,72),fill=0,width=2);draw.line((x,84,x+7,81),fill=0,width=2)
            for ident,x in [('11',200),('13',400)]:entity('head',{'id':ident,'staff':'1','shape':'NOTEHEAD_BLACK','grade':'.9','pitch':'-4'},(x,75,10,10))
            entity('alter',{'id':'2','staff':'1','shape':'NATURAL','grade':'.9'},(180,65,8,30))
            rel=ET.SubElement(rels,'relation',{'source':'2','target':'11'});ET.SubElement(rel,'alter-head')
            sheet.find('.//measure/clefs').text=''
        data=io.BytesIO();image.save(data,format='PNG')
        with zipfile.ZipFile(self.path,'w')as z:
            z.writestr('book.xml','<book/>');z.writestr('sheet#1/sheet#1.xml',ET.tostring(sheet));z.writestr('sheet#1/BINARY.png',data.getvalue());z.writestr('keep.bin',b'unchanged')
    def read(self):
        with zipfile.ZipFile(self.path)as z:
            self.assertEqual(z.read('keep.bin'),b'unchanged');return ET.fromstring(z.read('sheet#1/sheet#1.xml'))
    def test_inline_clef_recovered_with_its_loop_removed_and_outside_copy_ignored(self):
        self.fixture();r=repair_symbols(self.path);s=self.read()
        self.assertEqual(sum(a['kind']=='TREBLE'for a in r['repairs']),1)
        self.assertEqual(len(s.findall('.//clef')),2)
        self.assertIsNone(s.find('.//head'));self.assertIsNone(s.find('.//head-chord'));self.assertIsNone(s.find('.//voice'))
        ids={e.get('id')for e in s.findall('.//inters/*')}
        self.assertTrue(all(v in ids for refs in s.findall('.//measure/clefs')for v in refs.text.split()))
        self.assertEqual(repair_symbols(self.path)['repairs'],[])
    def test_natural_requires_an_unmarked_head_and_does_not_steal_existing_sign(self):
        self.fixture(False);r=repair_symbols(self.path);s=self.read()
        self.assertEqual([p['kind']for p in r['repairs']],['NATURAL'])
        self.assertEqual(len(s.findall('.//alter')),2)
        self.assertEqual({r.get('target')for r in s.findall('.//relation')if r.find('alter-head')is not None},{'11','13'})
        self.assertEqual(repair_symbols(self.path)['repairs'],[])
    def test_cancellation_leaves_original_project_untouched(self):
        self.fixture();before=self.path.read_bytes()
        def cancel(_):raise RuntimeError('cancelled')
        with self.assertRaisesRegex(RuntimeError,'cancelled'):repair_symbols(self.path,cancel)
        self.assertEqual(self.path.read_bytes(),before)
    def test_composite_bass_requires_two_natural_matches_and_never_removes_manual_clef(self):
        for two,manual,height,removed in [(True,False,85,True),(False,False,85,False),(True,True,85,False),(True,False,60,False)]:
            with self.subTest(two=two,manual=manual,height=height):
                self.fixture(False)
                with zipfile.ZipFile(self.path)as z:files={n:z.read(n)for n in z.namelist()}
                sheet=ET.fromstring(files['sheet#1/sheet#1.xml']);inters=sheet.find('.//inters')
                clef=ET.SubElement(inters,'clef',{'id':'90','staff':'1','kind':'BASS','shape':'F_CLEF','manual':str(manual).lower()})
                ET.SubElement(clef,'bounds',{'x':'378','y':'63','w':'12','h':str(height)})
                if two:
                    image=Image.open(io.BytesIO(files['sheet#1/BINARY.png'])).copy();draw=ImageDraw.Draw(image);x,y=380,105
                    draw.line((x+1,y,x+1,y+27),fill=0,width=2);draw.line((x+6,y+6,x+6,y+30),fill=0,width=2);draw.line((x,y+10,x+7,y+7),fill=0,width=2);draw.line((x,y+19,x+7,y+16),fill=0,width=2)
                    data=io.BytesIO();image.save(data,format='PNG');files['sheet#1/BINARY.png']=data.getvalue()
                files['sheet#1/sheet#1.xml']=ET.tostring(sheet)
                with zipfile.ZipFile(self.path,'w')as z:
                    for name,data in files.items():z.writestr(name,data)
                repair_symbols(self.path);self.assertEqual(self.read().find('.//clef[@id="90"]')is None,removed)
    def test_curved_staff_is_interpolated_at_symbol_x(self):
        staff=ET.fromstring('<staff><lines><line><point x="0" y="100"/><point x="100" y="110"/></line></lines></staff>')
        self.assertEqual(staff_y(staff,50),[105]);self.assertEqual(staff_y(staff,200),[110])
    def test_missing_exported_head_is_reported_without_creating_notes(self):
        self.fixture(False);before=self.path.read_bytes()
        mapping={'positions':{'P1:0:0':{'page':1,'head':'11'}}}
        with patch('omr_support.source_map',return_value=mapping):r=audit_export(self.path,['unused.mxl'])
        self.assertEqual(r['physical_heads'],2);self.assertEqual([p['head']for p in r['unexported_heads']],['13']);self.assertEqual(self.path.read_bytes(),before)
