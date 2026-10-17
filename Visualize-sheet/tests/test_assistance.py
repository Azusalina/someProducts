import unittest
from assist_support import page_plan,progress

class PagePlanningTests(unittest.TestCase):
    def test_full_contiguous_mapping(self):
        r=page_plan([{'index':0,'page':2},{'index':1,'page':2},{'index':2,'page':3}],3)
        self.assertEqual(r,[{'page':2,'start':0,'end':1},{'page':3,'start':2,'end':2}])

    def test_missing_or_ambiguous_mapping_is_rejected(self):
        for regions,count in [([{'index':0,'page':1}],2),([{'index':0,'page':1},{'index':0,'page':2}],1),([{'index':0,'page':1},{'index':2,'page':1},{'index':1,'page':2}],3)]:
            with self.assertRaises(ValueError):page_plan(regions,count)

    def test_deleted_or_cancelled_report_does_not_look_complete(self):
        plan={'state':'running','pages':[{'page':1,'job_id':'a'},{'page':2}]}
        self.assertEqual(progress(plan,{})['state'],'stopped')
        self.assertEqual(progress(plan,{'a':{'state':'cancelled'}})['state'],'stopped')

    def test_summary_distinguishes_unalignable_pages(self):
        plan={'pages':[{'page':1,'job_id':'a'},{'page':2,'job_id':'b'}]}
        jobs={'a':{'state':'done','comparison':{'comparable':True,'differing_measures':3}},'b':{'state':'done','comparison':{'comparable':False}}}
        r=progress(plan,jobs);self.assertEqual(r['state'],'done');self.assertEqual(r['comparable_pages'],1);self.assertEqual(r['differing_measures'],3);self.assertIsNone(r['accuracy'])
