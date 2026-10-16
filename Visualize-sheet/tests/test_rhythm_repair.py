from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from rhythm_repair import repair_beam_links

class BeamTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.p=Path(self.temp.name)/'score.omr'
    def tearDown(self):self.temp.cleanup()
    def fixture(self,gap=6,staff='1',voiced=False,ambiguous=False):
        s=ET.fromstring('<sheet><scale><interline main="10"/></scale><page><system id="1"><part><measure><voice><slots/></voice></measure></part><sig><inters/><relations/></sig></system></page></sheet>');ins=s.find('.//inters');rs=s.find('.//relations')
        def entity(tag,id,b,**attrs):
            e=ET.SubElement(ins,tag,{'id':id,**attrs});ET.SubElement(e,'bounds',dict(zip(('x','y','w','h'),map(str,b))));return e
        for i,x in enumerate([100,150,200]):
            entity('head-chord',f'c{i}',(x-10,170,12,10));entity('head',f'h{i}',(x-10,170,12,10),staff=staff if i==1 else'1',shape='NOTEHEAD_BLACK')
            entity('stem',f's{i}',(x-1,102+gap if i==1 else 100,2,80))
            r=ET.SubElement(rs,'relation',{'source':f'c{i}','target':f'h{i}'});ET.SubElement(r,'containment')
            r=ET.SubElement(rs,'relation',{'source':f'c{i}','target':f's{i}'});ET.SubElement(r,'chord-stem')
            if i!=1 or voiced:
                en=ET.SubElement(s.find('.//slots'),'entry');ET.SubElement(en,'value',{'chord':f'c{i}','status':'BEGIN'})
        for id,y,height in [('b',100,4)]+([('b2',102,6)]if ambiguous else[]):
            b=entity('beam',id,(100,y-2,120,4),height=str(height));median=ET.SubElement(b,'median');ET.SubElement(median,'p1',{'x':'100','y':str(y)});ET.SubElement(median,'p2',{'x':'220','y':str(y)})
            for i in (0,2):r=ET.SubElement(rs,'relation',{'source':id,'target':f's{i}'});ET.SubElement(r,'beam-stem')
        with zipfile.ZipFile(self.p,'w')as z:z.writestr('book.xml','<book><sheet number="1"><steps>LOAD LINKS RHYTHMS PAGE</steps></sheet></book>');z.writestr('sheet#1/sheet#1.xml',ET.tostring(s));z.writestr('unchanged',b'ink')
    def test_short_break_restores_only_missing_chord_connection_and_recomputes_rhythm(self):
        self.fixture();r=repair_beam_links(self.p);self.assertEqual(len(r),1);self.assertEqual(r[0]['chord'],'c1')
        with zipfile.ZipFile(self.p)as z:
            s=ET.fromstring(z.read('sheet#1/sheet#1.xml'));book=ET.fromstring(z.read('book.xml'));self.assertEqual(len(s.findall('.//head')),3);self.assertEqual(book.findtext('sheet/steps'),'LOAD LINKS');self.assertEqual(z.read('unchanged'),b'ink')
        self.assertEqual(repair_beam_links(self.p),[])
    def test_large_gap_other_staff_ambiguous_levels_and_already_voiced_chords_are_untouched(self):
        for args in [dict(gap=12),dict(staff='2'),dict(ambiguous=True),dict(voiced=True)]:
            with self.subTest(args=args):self.fixture(**args);before=self.p.read_bytes();self.assertEqual(repair_beam_links(self.p),[]);self.assertEqual(self.p.read_bytes(),before)

class RepeatedTupletTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.p=Path(self.temp.name)/'score.omr'
    def tearDown(self):self.temp.cleanup()
    def fixture(self,context=True,meter='1',overlap=False,extra_beam=False):
        root=ET.fromstring('<sheet last-persistent-id="1000"><scale><interline main="10"/></scale><page><system id="1"><stack id="1" expected="1"/><stack id="2" expected="'+meter+'"/><part id="1"><staff id="1"/><measure id="1"><head-chords/></measure><measure id="2"><head-chords/></measure></part><sig><inters/><relations/></sig></system></page></sheet>');ins=root.find('.//inters');rels=root.find('.//relations');measures=root.findall('.//measure')
        def entity(tag,id,x):
            e=ET.SubElement(ins,tag,{'id':id,'staff':'1','shape':'NOTEHEAD_BLACK'});ET.SubElement(e,'bounds',{'x':str(x),'y':'100','w':'10','h':'20'});return e
        for group in range(3):
            beam=f'b{group}';entity('beam',beam,group*200);chords=[]
            for n in range(6):
                cid=f'c{group}_{n}';sid=f's{group}_{n}';hid=f'h{group}_{n}';x=(200 if overlap and group==2 else group*200)+n*20
                entity('head-chord',cid,x);entity('head',hid,x);entity('stem',sid,x);chords.append(cid)
                for source,target,kind in [(cid,hid,'containment'),(cid,sid,'chord-stem'),(beam,sid,'beam-stem')]:ET.SubElement(ET.SubElement(rels,'relation',{'source':source,'target':target}),kind)
                if group==0 and context:ET.SubElement(ET.SubElement(rels,'relation',{'source':cid,'target':'t'}),'chord-tuplet')
                if extra_beam and group==2:ET.SubElement(ET.SubElement(rels,'relation',{'source':'b-extra','target':sid}),'beam-stem')
            m=measures[0 if group==0 else 1];m.find('head-chords').text=(m.findtext('head-chords','')+' '+' '.join(chords)).strip()
        if context:entity('tuplet','t',0).set('shape','TUPLET_SIX')
        with zipfile.ZipFile(self.p,'w')as z:z.writestr('book.xml','<book><sheet number="1"><steps>LOAD LINKS RHYTHMS PAGE</steps></sheet></book>');z.writestr('sheet#1/sheet#1.xml',ET.tostring(root));z.writestr('ink',b'original')
    def test_printed_context_and_meter_create_two_complete_groups_without_new_heads(self):
        from rhythm_repair import repair_repeated_tuplets
        self.fixture();r=repair_repeated_tuplets(self.p);self.assertEqual(len(r),2);self.assertTrue(all(len(p['chords'])==6 for p in r))
        with zipfile.ZipFile(self.p)as z:
            s=ET.fromstring(z.read('sheet#1/sheet#1.xml'));self.assertEqual(len(s.findall('.//head')),18);self.assertEqual(len(s.findall('.//tuplet[@manual="true"]')),2);self.assertEqual(z.read('ink'),b'original');self.assertEqual(ET.fromstring(z.read('book.xml')).findtext('sheet/steps'),'LOAD LINKS')
        self.assertEqual(repair_repeated_tuplets(self.p),[])
    def test_unknown_context_conflicting_meter_polyphony_and_two_beams_are_not_guessed(self):
        from rhythm_repair import repair_repeated_tuplets
        for args in [dict(context=False),dict(meter='3/4'),dict(overlap=True),dict(extra_beam=True)]:
            with self.subTest(args=args):
                self.fixture(**args);before=self.p.read_bytes();self.assertEqual(repair_repeated_tuplets(self.p),[]);self.assertEqual(self.p.read_bytes(),before)

class RhythmAuditTests(unittest.TestCase):
    def test_forward_gaps_are_distinguished_from_written_rests_and_never_rewritten(self):
        from rhythm_repair import audit_rhythm
        from region_support import write_mxl
        with tempfile.TemporaryDirectory()as temp:
            p=Path(temp)/'r.mxl';xml=ET.fromstring('<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note><forward><duration>1</duration></forward><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note><note><rest/><duration>1</duration></note></measure><measure number="2"><note><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration></note></measure></part></score-partwise>');write_mxl(xml,p);before=p.read_bytes();r=audit_rhythm([p])
            self.assertEqual(r['overfull_measures'][0]['measure'],'2');self.assertEqual(r['overfull_measures'][0]['actual_beats'],6)
            self.assertEqual(len(r['silent_gaps']),2);self.assertTrue(r['silent_gaps'][0]['forward']);self.assertFalse(r['silent_gaps'][0]['written_rest']);self.assertTrue(r['silent_gaps'][1]['written_rest']);self.assertEqual(p.read_bytes(),before)
    def test_missing_meter_is_reported_and_verified_context_is_only_used_for_auditing(self):
        from rhythm_repair import audit_rhythm
        from region_support import write_mxl
        with tempfile.TemporaryDirectory()as temp:
            p=Path(temp)/'r.mxl';write_mxl(ET.fromstring('<score-partwise><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>'),p);before=p.read_bytes()
            self.assertEqual(len(audit_rhythm([p])['missing_meter_measures']),1);r=audit_rhythm([p],'6/8');self.assertEqual(r['overfull_measures'][0]['expected_beats'],3);self.assertEqual(p.read_bytes(),before)
