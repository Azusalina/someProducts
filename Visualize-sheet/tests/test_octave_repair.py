import io
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from octave_repair import repair_octaves
try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None


@unittest.skipIf(Image is None, 'Optional image recovery requires Pillow')
class ImageOctaveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.path = Path(self.temp.name)/'score.omr'
    def tearDown(self): self.temp.cleanup()
    def fixture(self, dots=True, unknown=False, detached=False):
        image = Image.new('1',(400,400),1); draw = ImageDraw.Draw(image)
        for y in (150,285):
            draw.ellipse((118,y,135,y+15),fill=0);draw.ellipse((118,y+12,135,y+27),fill=0)
            draw.ellipse((123,y+4,130,y+10),fill=1);draw.ellipse((123,y+17,130,y+23),fill=1)
            if dots:
                for x in range(141,252,7): draw.rectangle((x,y+12,x+3,y+15),fill=0)
        root=ET.fromstring('<sheet last-persistent-id="100"><picture width="400" height="400"/><scale><interline main="12"/></scale><page><system id="1"><stack id="1" left="100" right="252"/><part><staff id="1"><lines/></staff></part><sig><inters/><relations/></sig></system></page></sheet>')
        sys=root.find('page/system');inters=sys.find('sig/inters');relations=sys.find('sig/relations')
        for y in range(200,249,12):ET.SubElement(ET.SubElement(sys.find('part/staff/lines'),'line'),'point',{'y':str(y)})
        for i,(x,y) in enumerate([(150,205),(235,240)],10):
            head=ET.SubElement(inters,'head',{'id':str(i),'staff':'1'});ET.SubElement(head,'bounds',{'x':str(x),'y':str(y),'w':'12','h':'10'})
            ET.SubElement(inters,'head-chord',{'id':str(i+10),'staff':'1'})
            ET.SubElement(ET.SubElement(relations,'relation',{'source':str(i+10),'target':str(i)}),'containment')
        for i,y in enumerate([150,285],1):
            if unknown and i==2: continue
            mark=ET.SubElement(inters,'octave-shift',{'id':str(i),'staff':'1','shape':'OTTAVA','kind':'ALTA' if i==1 else 'BASSA'})
            ET.SubElement(mark,'bounds',{'x':'118','y':str(y),'w':'18','h':'28'})
        if detached:
            # A plausible 8 far from the chain cannot authorize transposition.
            for mark in inters.findall('octave-shift'):mark.find('bounds').set('x','10')
            draw.rectangle((118,140,138,330),fill=1)
        buffer=io.BytesIO();image.save(buffer,format='PNG')
        with zipfile.ZipFile(self.path,'w')as z:
            z.writestr('book.xml','<book/>');z.writestr('sheet#1/sheet#1.xml',ET.tostring(root));z.writestr('sheet#1/BINARY.png',buffer.getvalue())
    def test_both_upper_and_lower_have_bounded_chord_links(self):
        self.fixture();r=repair_octaves(self.path)
        self.assertEqual({x['kind']for x in r['repairs']},{'ALTA','BASSA'})
        with zipfile.ZipFile(self.path)as z:
            sheet=ET.fromstring(z.read('sheet#1/sheet#1.xml'))
        self.assertEqual(len(sheet.findall('.//octave-shift')),2)
        self.assertEqual(len(sheet.findall('.//octave-shift-chord')),4)
        self.assertEqual(len(repair_octaves(self.path)['repairs']),2)
    def test_missing_value_can_use_same_document_glyph_template(self):
        self.fixture(unknown=True);r=repair_octaves(self.path)
        self.assertEqual(len(r['repairs']),2)
    def test_isolated_digit_without_dotted_line_never_shifts_notes(self):
        self.fixture(dots=False);before=self.path.read_bytes()
        self.assertEqual(repair_octaves(self.path)['repairs'],[]);self.assertEqual(self.path.read_bytes(),before)
    def test_dots_without_adjacent_value_never_shift_notes(self):
        self.fixture(detached=True)
        self.assertEqual(repair_octaves(self.path)['repairs'],[])
