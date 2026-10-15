from pathlib import Path
import unittest
from unittest.mock import patch
import server


class RecognitionResourcesTests(unittest.TestCase):
    @patch('server.os.sched_getaffinity', return_value=set(range(20)))
    @patch.object(Path, 'read_text', return_value='MemAvailable: 8388608 kB')
    def test_automatic_parallelism_is_bounded(self, *_):
        self.assertEqual(server.recognition_resources({}), {'threads':8,'memory_mb':2048,'parallel':True})

    @patch('server.os.sched_getaffinity', return_value={0})
    def test_explicit_threads_cannot_exceed_available_cpu(self, *_):
        self.assertEqual(server.recognition_resources({'recognition_threads':8})['threads'],1)

    def test_single_thread_switch_disables_engine_parallelism(self):
        resources=server.recognition_resources({'recognition_threads':1})
        options=server.engine_options('/engine',resources)
        self.assertIn('org.audiveris.omr.util.OmrExecutors.useParallelism=false',options)
        self.assertIn('org.audiveris.omr.sheet.Book.processAllStubsInParallel=false',options)

    @patch('server.os.sched_getaffinity', return_value=set(range(20)))
    @patch.object(Path, 'read_text', return_value='MemAvailable: 614400 kB')
    def test_automatic_resources_reduce_for_low_memory(self, *_):
        self.assertEqual(server.recognition_resources({}), {'threads':1,'memory_mb':512,'parallel':False})

    def test_invalid_limits_fail_before_starting_engine(self):
        for value in [-1,65,True,'4',2.5,None]:
            with self.subTest(threads=value), self.assertRaises(ValueError):
                server.recognition_resources({'recognition_threads':value})
        for value in [0,511,16385,True,'2048',None]:
            with self.subTest(memory=value), self.assertRaises(ValueError):
                server.recognition_resources({'recognition_memory_mb':value})

    def test_parallel_option_is_given_to_the_actual_engine(self):
        options=server.engine_options('/engine',{'parallel':True})
        self.assertIn('org.audiveris.omr.util.OmrExecutors.useParallelism=true',options)
        self.assertNotIn('-parallel',options)  # No such CLI switch in 5.11.0.
