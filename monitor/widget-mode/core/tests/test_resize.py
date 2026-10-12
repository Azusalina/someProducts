import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'backend'))
from widget_config import validate

class ResizeTests(unittest.TestCase):
    def test_layout_validation(self):
        validate({'layoutHeights':'{"cpu":100,"countdownBody":180}','layoutColumnWeights':'[1,2,1]','layoutSplits':'{"todos":0.6}'})
        for key,value in [('layoutHeights','{"cpu":0}'),('layoutHeights','{"bad":50}'),('layoutColumnWeights','[1,0,2]'),('layoutColumnWeights','[1,2]'),('layoutSplits','{"todos":1}'),('layoutSplits','{"bad":0.5}')]:
            with self.assertRaises(ValueError):validate({key:value})
