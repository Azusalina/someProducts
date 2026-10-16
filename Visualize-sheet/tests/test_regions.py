from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile
import server
from region_support import measure_regions, selection, merge_region, write_mxl, context_at
from omr_support import read_musicxml


def note(step='C',duration=4):return f'<note><pitch><step>{step}</step><octave>4</octave></pitch><duration>{duration}</duration><voice>1</voice><staff>1</staff></note>'
def score(body):return ET.fromstring('<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>')

class RegionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.parent=self.root/'parent.mxl';self.candidate=self.root/'candidate.mxl'
        self.xml=score('<measure number="1"><attributes><divisions>4</divisions><key><fifths>1</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes>'+note()+'</measure><measure number="2">'+note('D')+'</measure><measure number="3">'+note('E')+'</measure>')
        write_mxl(self.xml,self.parent)
    def tearDown(self):self.temp.cleanup()
    def project(self,path):
        staff='<staff id="1" left="100" right="900"><lines>'+''.join(f'<line><point x="100" y="{y}"/><point x="900" y="{y}"/></line>'for y in range(200,241,10))+'</lines></staff>'
        sheet='<sheet><picture width="1000" height="1000"/><scale><interline main="10"/></scale><page id="1"><system id="1">'+''.join(f'<stack id="{i}" left="{100+(i-1)*260}" right="{100+i*260}"/>'for i in range(1,4))+'<part id="1">'+staff+''.join(f'<measure id="{i}"/>'for i in range(1,4))+'</part><sig><inters/><relations/></sig></system></page></sheet>'
        with zipfile.ZipFile(path,'w')as z:z.writestr('book.xml','<book><sheet number="1"><page id="1" delta-measure-id="3"/></sheet><score><page sheet-number="1" sheet-page-id="1"/></score></book>');z.writestr('sheet#1/sheet#1.xml',sheet)
    def mapping(self):
        return {'version':4,'positions':{f'P1:{i}:0':{'page':1,'x':.2+i*.26,'y':.22,'w':.01,'h':.01,'head':str(i),'grade':.9}for i in range(3)},'mapped':3,'total':3,'pages':{'1':{'width':1000,'height':1000}}}
    def test_selection_preserves_full_system_context_and_rejects_cross_page_or_partial_boundaries(self):
        project=self.root/'p.omr';self.project(project);regions=measure_regions(project,self.parent)
        self.assertEqual([r['number']for r in regions],['1','2','3']);r=selection(regions,1,1)
        self.assertEqual(r['crop']['x'],0);self.assertEqual(r['crop']['w'],1);self.assertEqual(r['measures'][0]['number'],'2')
        with self.assertRaises(ValueError):selection(regions,0,4)
        with self.assertRaises(ValueError):selection([regions[0],{**regions[1],'page':2}],0,1)
        with self.assertRaises(ValueError):selection(regions,False,1)
    def test_splice_changes_only_chosen_measure_restores_context_and_keeps_source_positions(self):
        write_mxl(score('<measure number="1"><attributes><divisions>8</divisions><clef><sign>F</sign><line>4</line></clef></attributes>'+note('G',8)+note('A',8)+'</measure>'),self.candidate)
        original_map=self.mapping();region={'start':1,'end':1,'page':1,'crop':{'x':0,'y':.1,'w':1,'h':.4},'measures':[{'index':1,'number':'2','x':.36,'y':.18,'w':.26,'h':.12}]}
        cm={'positions':{'P1:0:0':{'page':1,'x':.46,'y':.3,'w':.01,'h':.025,'head':'99','grade':.9},'P1:0:1':{'page':1,'x':.55,'y':.3,'w':.01,'h':.025,'head':'100','grade':.9}}}
        regions=[{'index':0,'x':.36,'y':.2,'w':.26,'h':.2}]
        output=self.root/'merged.mxl';mapping,report=merge_region(self.parent,original_map,self.candidate,cm,regions,region,output)
        measures=read_musicxml(output).findall('part/measure')
        self.assertEqual([m.get('number')for m in measures],['1','2','3'])
        self.assertEqual(ET.tostring(measures[0]),ET.tostring(self.xml.find('part/measure')))
        self.assertEqual(measures[2].findtext('note/pitch/step'),'E')
        attrs=context_at(read_musicxml(output).find('part'),3);self.assertEqual(attrs.findtext('divisions'),'4');self.assertEqual(attrs.findtext('clef/sign'),'G')
        self.assertEqual(measures[1].findtext('attributes/divisions'),'8')
        self.assertAlmostEqual(mapping['positions']['P1:1:0']['y'],.22)
        self.assertEqual(mapping['positions']['P1:2:0'],original_map['positions']['P1:2:0']);self.assertEqual(original_map,self.mapping())
        self.assertEqual(report['before']['notes'],1);self.assertEqual(report['after']['notes'],2)
    def test_unmatched_measure_does_not_write_a_result(self):
        write_mxl(score('<measure number="1">'+note()+'</measure>'),self.candidate);output=self.root/'no.mxl'
        region={'start':1,'end':1,'page':1,'crop':{'x':0,'y':0,'w':1,'h':1},'measures':[{'index':1,'number':'2','x':.5,'y':.2,'w':.4,'h':.1}]}
        with self.assertRaisesRegex(ValueError,'边界'):merge_region(self.parent,self.mapping(),self.candidate,{'positions':{}},[{'index':0,'x':0,'y':.2,'w':.1,'h':.1}],region,output)
        self.assertFalse(output.exists())
    def test_cross_boundary_slur_is_mapped_and_tie_requires_unchanged_pitch(self):
        xml=score('<measure number="1">'+note('D')+'</measure><measure number="2">'+note('D')+'</measure><measure number="3">'+note('E')+'</measure>')
        for mi,kind in [(0,'start'),(1,'stop')]:
            n=xml.findall('part/measure')[mi].find('note');ET.SubElement(n,'tie',{'type':kind});nt=ET.SubElement(n,'notations');ET.SubElement(nt,'tied',{'type':kind});ET.SubElement(nt,'slur',{'type':kind,'number':'1'})
        write_mxl(xml,self.parent)
        region={'start':1,'end':1,'page':1,'crop':{'x':0,'y':0,'w':1,'h':1},'measures':[{'index':1,'number':'2','x':.36,'y':.18,'w':.26,'h':.12}]}
        cm={'positions':{'P1:0:0':{'page':1,'x':.46,'y':.22,'w':.01,'h':.01,'head':'99'}}};regions=[{'index':0,'x':.36,'y':.18,'w':.26,'h':.12}]
        for step in ('D','F'):
            with self.subTest(step=step):
                write_mxl(score('<measure number="1">'+note(step)+'</measure>'),self.candidate)
                output=self.root/f'{step}.mxl';mapping,report=merge_region(self.parent,self.mapping(),self.candidate,cm,regions,region,output)
                n=read_musicxml(output).findall('part/measure')[1].find('note')
                self.assertEqual(n.find('notations/slur').attrib,{'type':'stop','number':'1'})
                self.assertEqual(n.find('tie')is not None,step=='D');self.assertEqual(n.find('notations/tied')is not None,step=='D')
                self.assertEqual(any('不同音高'in w for w in report['warnings']),step=='F')
                self.assertEqual(mapping['positions']['P1:0:0'],self.mapping()['positions']['P1:0:0'])
    def test_region_job_is_independent_pending_not_default_and_acceptance_enables_cache_reuse(self):
        store=server.JobStore(self.root/'jobs');identifier='a'*32;d=store.directory/identifier;(d/'output').mkdir(parents=True);self.project(d/'output/score.omr');payload=b'%PDF-1.4 region test';(d/'score.pdf').write_bytes(payload);write_mxl(self.xml,d/'result-0.mxl');(d/'result-0.map.json').write_text(json.dumps(self.mapping()))
        store.jobs[identifier]={'id':identifier,'sha256':hashlib.sha256(payload).hexdigest(),'state':'done','pipeline':server.PIPELINE,'created':1,'results':[{'name':'result-0.mxl'}],'filename':'test.pdf'};store.persist(identifier)
        try:
            with patch.object(store.executor,'submit')as submit:
                new=store.create_region(identifier,1,1,600);job=store.jobs[new];self.assertTrue(job['pending_region']);self.assertTrue((store.directory/new/'base-project.omr').exists());submit.assert_called_once()
                write_mxl(self.xml,store.directory/new/'result-0.mxl');store.update(new,state='done',results=[{'name':'result-0.mxl'}])
                with self.assertRaisesRegex(ValueError,'先检查'):store.set_default(new)
                self.assertNotEqual(store.create(payload),new)
                store.accept_region(new);self.assertFalse(store.get(new)['pending_region']);self.assertEqual(store.create(payload),new)
                self.assertEqual(ET.tostring(read_musicxml(d/'result-0.mxl')),ET.tostring(read_musicxml(self.parent)))
                with self.assertRaises(ValueError):store.create_region(identifier,1,1,True)
        finally:store.shutdown()
