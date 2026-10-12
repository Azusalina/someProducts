import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'backend'))
from widget_config import WidgetConfig,validate


class TodoSettingsTests(unittest.TestCase):
    def test_completion_customization_and_profiles_survive_reload(self):
        tasks={'pending':[{'id':'p1','text':'Write notes','done':True}],'urgent':[{'id':'u1','text':'Pay bill','done':False}]}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'config.json';store=WidgetConfig(path)
            store.update({'todoItems':json.dumps(tasks),'todoPendingTitle':'Later','todoUrgentColor':'#e06c75','todoHeight':180,'todoFontSize':12},'')
            reopened=WidgetConfig(path).read()['settings']
            self.assertEqual(json.loads(reopened['todoItems']),tasks)
            self.assertEqual(reopened['todoPendingTitle'],'Later')
            self.assertEqual(reopened['todoUrgentColor'],'#e06c75')
            other=store.for_profile('other')
            self.assertEqual(json.loads(other.read()['settings']['todoItems']),{'pending':[],'urgent':[]})

    def test_reject_malformed_task_data_without_overwriting_profile(self):
        good={'id':'p1','text':'Keep task','done':False}
        invalid=[{}, {'pending':[],'urgent':[], 'extra':[]}, {'pending':'text','urgent':[]},
                 {'pending':[good]*101,'urgent':[]}, {'pending':[good],'urgent':[good]},
                 {'pending':[{'id':'../bad','text':'task','done':False}],'urgent':[]},
                 {'pending':[{'id':'p1','text':'','done':False}],'urgent':[]},
                 {'pending':[{'id':'p1','text':'line\nbreak','done':False}],'urgent':[]},
                 {'pending':[{'id':'p1','text':'x'*301,'done':False}],'urgent':[]},
                 {'pending':[{'id':'p1','text':'task','done':1}],'urgent':[]},
                 {'pending':[{'id':'p1','text':'task','done':False,'extra':1}],'urgent':[]}]
        with tempfile.TemporaryDirectory() as folder:
            store=WidgetConfig(Path(folder)/'config.json');state=store.update({},'')
            original=store.path.read_bytes()
            for data in invalid:
                with self.assertRaises(ValueError):store.update({'todoItems':json.dumps(data)},state['revision'])
                self.assertEqual(store.path.read_bytes(),original)
            with self.assertRaises(ValueError):store.update({'todoItems':'{'},state['revision'])

    def test_customization_bounds_and_defaults(self):
        for changes in [{'todoHeight':79},{'todoHeight':601},{'todoFontSize':8},{'todoFontSize':19},{'todoPendingTitle':'x'*65},{'todoUrgentColor':'red'},{'todoEnabled':'true'}]:
            with self.assertRaises(ValueError):validate(changes)
        validate({'todoHeight':80,'todoFontSize':18,'todoEnabled':False,'todoPendingTitle':'','todoUrgentColor':'#aabbcc'})
