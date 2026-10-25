"""Per-view refresh demand, expiry and scheduler response."""
import importlib.util
from pathlib import Path
import sys
import threading
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'backend'))
spec=importlib.util.spec_from_file_location('refresh_rate_monitor',Path(__file__).parents[1]/'backend/monitor_service.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from widget_config import validate, WidgetConfig
import tempfile

class RefreshRateTests(unittest.TestCase):
    def setUp(self):
        self.telemetry=m.Telemetry()
    def tearDown(self):
        self.telemetry.stop.set()
        self.telemetry.pool.shutdown()
        self.telemetry.terminals.shutdown()
    def test_fastest_active_client_and_per_target_ping_period(self):
        t=self.telemetry
        with patch.object(m.time,'monotonic',return_value=10):
            t.get(['slow.test'],1000,'slow')
            t.get(['fast.test'],100,'fast')
            self.assertEqual(t.sample_interval(),.1)
            self.assertEqual(t.sample_interval('slow.test'),1)
            self.assertEqual(t.sample_interval('fast.test'),.1)
        with patch.object(m.time,'monotonic',return_value=12.1):
            self.assertEqual(t.sample_interval(),1)
        with patch.object(m.time,'monotonic',return_value=13.1):
            self.assertEqual(t.sample_interval(),.2)
    def test_same_view_can_slow_down_and_clients_are_bounded(self):
        t=self.telemetry
        t.get([],100,'view');t.get([],5000,'view')
        self.assertEqual(t.sample_interval(),5)
        for i in range(80):t.get([],5000,'view'+str(i))
        self.assertLessEqual(len(t.sample_clients),64)
    def test_fast_view_interrupts_slow_sample_wait(self):
        t=self.telemetry;ready=threading.Event();observed=[]
        def sample():
            observed.append(time.monotonic());ready.set()
            if len(observed)==2:t.stop.set()
            return {'percent':20}
        t.get([],5000,'slow')
        with patch.object(m.Cpu,'sample',side_effect=sample),patch.object(m.Gpu,'sample',return_value=[]),patch.object(m,'memory_snapshot',return_value={}):
            t.thread.start();self.assertTrue(ready.wait(1))
            t.get([],100,'fast')
            self.assertTrue(t.stop.wait(.7));t.thread.join(1)
        self.assertEqual(len(observed),2)
        self.assertGreaterEqual(observed[1]-observed[0],.09)
        self.assertLess(observed[1]-observed[0],.5)
    def test_invalid_requests_and_persisted_config_bounds(self):
        for value in (0,99,5001,True,100.5):
            with self.assertRaises(ValueError):self.telemetry.get([],value,'view')
        with self.assertRaises(ValueError):self.telemetry.get([],200,'bad/client')
        for changes in ({'flowHistorySeconds':4},{'flowHistorySeconds':121},{'flowRefreshMs':99},{'flowRefreshMs':5001},{'audioRefreshMs':49},{'audioRefreshMs':1001}):
            with self.assertRaises(ValueError):validate(changes)
        with tempfile.TemporaryDirectory() as directory:
            store=WidgetConfig(Path(directory)/'config.json')
            store.update({'flowRefreshMs':750,'audioRefreshMs':50,'flowHistorySeconds':60},store.read()['revision'])
            settings=WidgetConfig(store.path).read()['settings']
            self.assertEqual(settings['flowHistorySeconds'],60)
            self.assertEqual((settings['flowRefreshMs'],settings['audioRefreshMs']),(750,50))
