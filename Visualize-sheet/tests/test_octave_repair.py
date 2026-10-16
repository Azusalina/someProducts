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
    def rewrite(self,change):
        with zipfile.ZipFile(self.path)as z:files={n:z.read(n)for n in z.namelist()}
        root=ET.fromstring(files['sheet#1/sheet#1.xml']);image=Image.open(io.BytesIO(files['sheet#1/BINARY.png'])).convert('1');image=change(root,image)or image
        out=io.BytesIO();image.save(out,format='PNG');files['sheet#1/BINARY.png']=out.getvalue();files['sheet#1/sheet#1.xml']=ET.tostring(root)
        with zipfile.ZipFile(self.path,'w')as z:
            for n,b in files.items():z.writestr(n,b)
    def test_no_existing_ottava_can_bootstrap_both_directions_from_two_counter_eights(self):
        self.fixture()
        def remove(root,image):
            for inter in list(root.findall('.//octave-shift')):root.find('.//inters').remove(inter)
        self.rewrite(remove);self.assertEqual({r['kind']for r in repair_octaves(self.path)['repairs']},{'ALTA','BASSA'})
    def test_suffix_gap_and_connected_terminal_hooks_preserve_bounded_range(self):
        self.fixture()
        def suffix(root,image):
            draw=ImageDraw.Draw(image);root.find('.//stack').set('right','330')
            for y,upper in [(150,True),(285,False)]:
                draw.rectangle((140,y,270,y+32),fill=1);draw.text((140,y+8),'va'if upper else'vb',fill=0)
                for x in range(181,263,9):draw.rectangle((x,y+12,x+5,y+15),fill=0)
                draw.line((267,y+12,267,y+23 if upper else y+3),fill=0,width=2)
        self.rewrite(suffix);r=repair_octaves(self.path)
        self.assertEqual(len(r['repairs']),2);self.assertTrue(all(p['x_end']>250 for p in r['repairs']))
        with zipfile.ZipFile(self.path)as z:s=ET.fromstring(z.read('sheet#1/sheet#1.xml'))
        self.assertEqual(len(s.findall('.//octave-shift/hook')),2)
    def test_standalone_non_eight_label_is_not_used_as_bootstrap(self):
        self.fixture()
        def zero(root,image):
            draw=ImageDraw.Draw(image)
            for mark in list(root.findall('.//octave-shift')):root.find('.//inters').remove(mark)
            for y in [150,285]:draw.rectangle((118,y,137,y+28),fill=1);draw.ellipse((118,y,135,y+27),outline=0,width=3)
        self.rewrite(zero);self.assertEqual(repair_octaves(self.path)['repairs'],[])
    def test_same_part_staff_continuation_links_systems_and_requires_a_preceding_eight(self):
        for with_value in (True,False):
            with self.subTest(with_value=with_value):
                self.fixture()
                def extend(root,image):
                    canvas=Image.new('1',(400,600),1);canvas.paste(image,(0,0));draw=ImageDraw.Draw(canvas);draw.rectangle((110,280,270,325),fill=1)
                    for m in list(root.findall('.//octave-shift')):
                        if m.get('kind')=='BASSA'or not with_value:root.find('.//inters').remove(m)
                    if not with_value:draw.rectangle((118,150,137,180),fill=1)
                    root.find('picture').set('height','600');root.find('.//part').set('id','1')
                    sys=ET.SubElement(root.find('page'),'system',{'id':'2'});ET.SubElement(sys,'stack',{'id':'2','left':'100','right':'300'});part=ET.SubElement(sys,'part',{'id':'1'});staff=ET.SubElement(part,'staff',{'id':'2'});lines=ET.SubElement(staff,'lines')
                    for y in range(400,449,12):ET.SubElement(ET.SubElement(lines,'line'),'point',{'y':str(y)})
                    sig=ET.SubElement(sys,'sig');ins=ET.SubElement(sig,'inters');rels=ET.SubElement(sig,'relations')
                    for i,(x,y)in enumerate([(150,405),(235,440)],40):
                        h=ET.SubElement(ins,'head',{'id':str(i),'staff':'2'});ET.SubElement(h,'bounds',{'x':str(x),'y':str(y),'w':'12','h':'10'});ET.SubElement(ins,'head-chord',{'id':str(i+10),'staff':'2'});ET.SubElement(ET.SubElement(rels,'relation',{'source':str(i+10),'target':str(i)}),'containment')
                    for x in range(101,244,7):draw.rectangle((x,362,x+3,365),fill=0)
                    draw.line((244,362,244,374),fill=0,width=2);return canvas
                self.rewrite(extend);r=repair_octaves(self.path)
                self.assertEqual(len(r['repairs']),2 if with_value else 0)
                if with_value:
                    with zipfile.ZipFile(self.path)as z:s=ET.fromstring(z.read('sheet#1/sheet#1.xml'))
                    marks=s.findall('.//octave-shift');self.assertEqual(marks[0].get('right-extension'),marks[1].get('id'));self.assertEqual(marks[1].get('left-extension'),marks[0].get('id'))
