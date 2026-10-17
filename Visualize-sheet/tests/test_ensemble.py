from pathlib import Path
import tempfile
import unittest
from ensemble import compare_scores


def score(notes, divisions=4):
    return f'<score-partwise><part id="P1"><measure number="1"><attributes><divisions>{divisions}</divisions></attributes>{notes}</measure></part></score-partwise>'

def note(step='C',duration=4,extra=''):
    return f'<note>{extra}<pitch><step>{step}</step><octave>4</octave></pitch><duration>{duration}</duration></note>'

class EnsembleTests(unittest.TestCase):
    def compare(self,a,b):
        with tempfile.TemporaryDirectory()as d:
            a_path=Path(d)/'a.musicxml';b_path=Path(d)/'b.musicxml';a_path.write_text(a);b_path.write_text(b)
            before=a_path.read_bytes();result=compare_scores(a_path,b_path)
            self.assertEqual(before,a_path.read_bytes());return result

    def test_exact_fraction_and_chord_order_are_engine_independent(self):
        r=self.compare(score(note()+note('E',4,'<chord/>')),score(note('E',12)+note('C',12,'<chord/>'),12))
        self.assertEqual(r['agreement'],1);self.assertIsNone(r['accuracy']);self.assertFalse(r['changed'])

    def test_wrong_accidental_and_duration_never_agree(self):
        r=self.compare(score(note()),score(note(duration=8).replace('</step>','</step><alter>1</alter>')))
        self.assertEqual(r['agreement'],0);self.assertEqual(r['differing_measures'],1)

    def test_missing_measure_refuses_alignment(self):
        a=score(note());b=a.replace('</part>','<measure number="2">'+note()+'</measure></part>')
        self.assertFalse(self.compare(a,b)['comparable'])

    def test_forward_rest_gap_is_not_compacted(self):
        r=self.compare(score(note()+note('D')),score(note()+'<forward><duration>4</duration></forward>'+note('D')))
        self.assertEqual(r['matched'],1);self.assertFalse(r['measures'][0]['extent_matches'])

    def test_unisons_preserve_cardinality(self):
        r=self.compare(score(note()+note(extra='<chord/>')),score(note()))
        self.assertEqual(r['matched'],1);self.assertEqual(r['baseline_notes'],2)


    def test_pitch_content_can_agree_while_timing_differs(self):
        r=self.compare(score(note()+note('D')),score(note(duration=8)+note('D')))
        self.assertEqual(r['pitch_content_agreement'],1)
        self.assertLess(r['agreement'],1);self.assertLess(r['rhythm_event_agreement'],1)
