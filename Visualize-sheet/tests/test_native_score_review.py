from hashlib import sha256
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

from native_score_review import PROFILE,cmap_unicode,octave_ranges,review,write_pitch_candidate,approved_report,protect_tied_pitches,validate_pitch_candidate
from omr_support import read_musicxml


def staff(page=1,sid='1',system='1',top=100):
    element=ET.fromstring('<staff left="20" right="480"><lines/></staff>')
    for y in range(top,top+41,10):
        line=ET.SubElement(element.find('lines'),'line')
        for x in (20,480):ET.SubElement(line,'point',{'x':str(x),'y':str(y)})
    return {'page':page,'staff':sid,'system':system,'part':'1','ordinal':1,'width':500,'height':500,'element':element}


class NativeScoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_cmap_arrays_offsets_utf16_and_bfchar(self):
        text='2 beginbfrange <0001> <0003> [<0153><006e><201c>] <0004> <0005> <0041> endbfrange 1 beginbfchar <0006><D834DD1E> endbfchar'
        self.assertEqual(cmap_unicode(text),{1:'œ',2:'n',3:'“',4:'A',5:'B',6:'𝄞'})
    def test_regular_text_never_becomes_a_music_symbol(self):
        self.assertNotIn(('Times-Roman','n'),PROFILE);self.assertNotIn(('OpusTextStd','b'),PROFILE)
    def test_short_native_octave_line_is_valid_only_with_its_own_terminal_hook(self):
        glyph={'id':'8','page':1,'kind':'8va','origin':[70,75],'size':20,'width':500,'height':500}
        line={'page':1,'x0':84,'x1':90,'y0':68.75,'y1':68.75,'dashed':True}
        hook={'page':1,'x0':90,'x1':90,'y0':68.75,'y1':75,'dashed':False}
        self.assertTrue(octave_ranges([glyph],[line,hook],[staff()])[0]['resolved'])
        self.assertFalse(octave_ranges([glyph],[line],[staff()])[0]['resolved'])
        self.assertFalse(octave_ranges([glyph],[line,{**hook,'x0':98,'x1':98}],[staff()])[0]['resolved'])
    def test_native_octave_continuation_requires_next_system_same_staff_and_a_hook(self):
        a={'id':'a','page':1,'kind':'8va','origin':[100,75],'size':20,'width':500,'height':500}
        b={**a,'id':'b','origin':[70,275]}
        lines=[{'page':1,'x0':114,'x1':480,'y0':68.75,'y1':68.75,'dashed':True},
               {'page':1,'x0':84,'x1':130,'y0':268.75,'y1':268.75,'dashed':True},
               {'page':1,'x0':130,'x1':130,'y0':268.75,'y1':275,'dashed':False}]
        result=octave_ranges([a,b],lines,[staff(),staff(sid='3',system='2',top=300)])
        self.assertTrue(all(x['resolved']for x in result));self.assertEqual(result[0]['continues_to'],'b')
        self.assertFalse(octave_ranges([a,b],lines[:-1],[staff(),staff(sid='3',system='2',top=300)])[0]['resolved'])
    def test_explicit_accidental_carries_in_one_bar_but_not_next_bar_or_tied_continuation(self):
        pdf=self.folder/'score.pdf';pdf.write_bytes(b'unchanged PDF')
        baseline=self.folder/'score.musicxml'
        def note(x,tie=''):
            return f'<note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff>{tie}</note>'
        baseline.write_text('<score-partwise><part id="P1"><measure number="1">'+note(100)+note(140)+note(180,'<tie type="stop"/>')+'</measure><measure number="2">'+note(220)+'</measure></part></score-partwise>')
        glyphs=[{'id':f'h{i}','page':1,'kind':'head','origin':[x,140],'bounds':[x,137.5,x+6,142.5],'size':20,'width':500,'height':500}for i,x in enumerate((100,140,180,220))]
        glyphs += [{'id':'n','page':1,'kind':'natural','origin':[93,140],'bounds':[93,132,97,148],'size':20,'width':500,'height':500},
                   {'id':'clef','page':1,'kind':'treble','origin':[25,130],'bounds':[25,100,40,145],'size':20,'width':500,'height':500}]
        mapping={'positions':{source:{'page':1,'x':x/500,'y':137.5/500,'w':6/500,'h':5/500,'head':str(i)}for i,(source,x)in enumerate(zip(('P1:0:0','P1:0:1','P1:0:2','P1:1:0'),(100,140,180,220)))}}
        heads={(1,str(i)):{'staff':'1','system':'1'}for i in range(4)}
        before=baseline.read_bytes()
        with patch('native_score_review.native_evidence',return_value={'pages':1,'glyphs':glyphs,'lines':[],'diagnostics':[]}),patch('native_score_review.project_geometry',return_value=([staff()],heads)):
            result=review(pdf,'unused',baseline,mapping)
        self.assertEqual([(p['source'],p['kind'])for p in result['proposals']],[('P1:0:0','explicit_accidental'),('P1:0:1','accidental_carry')])
        target=self.folder/'candidate.musicxml';write_pitch_candidate(baseline,result,target)
        self.assertEqual([n.findtext('alter')for n in read_musicxml(target).findall('.//pitch')],['0','0','-1','-1'])
        self.assertEqual(before,baseline.read_bytes());self.assertEqual(pdf.read_bytes(),b'unchanged PDF')
        self.assertFalse(result['trained']);self.assertIsNone(result['accuracy'])
        with self.assertRaises(ValueError):write_pitch_candidate(baseline,result,target)
    def test_candidate_rejects_stale_baseline_and_preserves_every_nonpitch_field(self):
        source=self.folder/'source.musicxml';source.write_text('<score-partwise><part id="P1"><measure number="1"><note><pitch><step>A</step><octave>5</octave></pitch><duration>3</duration><voice>2</voice><staff>1</staff><tie type="start"/><notations><slur type="start"/></notations></note></measure></part></score-partwise>')
        report={'baseline_sha256':sha256(source.read_bytes()).hexdigest(),'proposals':[{'kind':'native_octave','source':'P1:0:0','before':5,'after':6}]}
        target=self.folder/'candidate.musicxml';write_pitch_candidate(source,report,target)
        a=read_musicxml(source);b=read_musicxml(target);self.assertEqual(b.findtext('.//octave'),'6')
        b.find('.//octave').text='5';self.assertEqual(ET.tostring(a),ET.tostring(b))
        source.write_text(source.read_text()+'\n')
        with self.assertRaisesRegex(ValueError,'hash'):write_pitch_candidate(source,report,self.folder/'other.musicxml')
    def test_only_matching_explicit_manual_acceptances_are_applied(self):
        report={'source_sha256':'pdf','baseline_sha256':'xml','proposals':[{'kind':'native_octave','source':'a'},{'kind':'explicit_accidental','source':'b'}]}
        labels={'version':1,'source_sha256':'pdf','baseline_sha256':'xml','issues':{'proposal:native_octave:a':{'verdict':'accept'},'proposal:explicit_accidental:b':{'verdict':'uncertain'}}}
        result=approved_report(report,labels)
        self.assertEqual([(p['kind'],p['source'])for p in result['proposals']],[('native_octave','a')]);self.assertEqual(len(report['proposals']),2)
        self.assertTrue(result['proposals'][0]['reviewed']);self.assertEqual(result['manual_labels_applied'],1);self.assertNotIn('reviewed',report['proposals'][0])
        labels['source_sha256']='other'
        with self.assertRaises(ValueError):approved_report(report,labels)
    def test_source_backed_correction_keeps_an_existing_tie_chain_in_tune(self):
        xml=ET.fromstring('<score-partwise><part id="P1"><measure><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><tie type="start"/></note></measure><measure><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><tie type="stop"/></note></measure></part></score-partwise>')
        proposal={'kind':'explicit_accidental','source':'P1:0:0','before':-1,'after':0,'page':1,'glyph':'a'}
        result,findings=protect_tied_pitches(xml,[proposal]);self.assertEqual(len(result),2);self.assertEqual(findings,[])
        self.assertEqual(result[1]['source'],'P1:1:0');self.assertEqual(result[1]['kind'],'tie_pitch_carry')
        result,findings=protect_tied_pitches(xml,[proposal,{**proposal,'source':'P1:1:0','after':1}])
        self.assertEqual(result,[]);self.assertEqual(findings[0]['kind'],'conflicting_native_tie_anchors')
    def test_tie_propagation_never_invents_a_missing_or_already_conflicting_link(self):
        xml=ET.fromstring('<score-partwise><part id="P1"><measure><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><tie type="start"/></note></measure><measure><note><pitch><step>E</step><alter>0</alter><octave>4</octave></pitch><tie type="stop"/></note></measure></part></score-partwise>')
        proposal={'kind':'explicit_accidental','source':'P1:0:0','before':-1,'after':0,'page':1,'glyph':'a'}
        self.assertEqual(protect_tied_pitches(xml,[proposal])[0],[proposal])
    def test_validation_rejects_a_new_pitch_conflict_in_an_unchanged_tie(self):
        source=self.folder/'source.musicxml';source.write_text('<score-partwise><part id="P1"><measure><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>3</duration><tie type="start"/></note></measure><measure><note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>3</duration><tie type="stop"/></note></measure></part></score-partwise>')
        proposal={'kind':'explicit_accidental','source':'P1:0:0','before':-1,'after':0,'page':1,'glyph':'a'}
        report={'baseline_sha256':sha256(source.read_bytes()).hexdigest(),'proposals':[proposal]}
        bad=self.folder/'bad.musicxml';write_pitch_candidate(source,report,bad)
        with self.assertRaisesRegex(ValueError,'tie conflicts'):validate_pitch_candidate(source,report,bad)
        report['proposals']=protect_tied_pitches(read_musicxml(source),[proposal])[0]
        good=self.folder/'good.musicxml';write_pitch_candidate(source,report,good)
        self.assertEqual(validate_pitch_candidate(source,report,good)['changed_note_pitches'],2)
    def test_manual_approval_of_one_tied_endpoint_requires_its_partner(self):
        report={'source_sha256':'pdf','baseline_sha256':'xml','proposals':[{'kind':'explicit_accidental','source':'a','tie_group':'a|b'},{'kind':'tie_pitch_carry','source':'b','tie_group':'a|b'}]}
        labels={'version':1,'source_sha256':'pdf','baseline_sha256':'xml','issues':{'proposal:explicit_accidental:a':{'verdict':'accept'}}}
        with self.assertRaisesRegex(ValueError,'complete chain'):approved_report(report,labels)
        labels['issues']['proposal:tie_pitch_carry:b']={'verdict':'accept'}
        self.assertEqual(len(approved_report(report,labels)['proposals']),2)

if __name__=='__main__':unittest.main()
