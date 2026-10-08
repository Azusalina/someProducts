import json
import sys
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock
sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))
from power import battery_reading, PowerCollector, AwakeManager
from timers import TimerManager

class PowerTests(unittest.TestCase):
    def test_battery_charge_and_discharge_time(self):
        props = {'IsPresent': True, 'Type': 2, 'Percentage': 23.5, 'EnergyRate': 12.3, 'State': 1, 'TimeToFull': 400, 'TimeToEmpty': 700}
        result = battery_reading(props)
        self.assertEqual((result['state'], result['remaining_seconds']), ('Charging', 400))
        props['State'] = 2
        self.assertEqual(battery_reading(props)['remaining_seconds'], 700)
        self.assertEqual(result['watts'], 12.3)
        self.assertNotIn('Serial', result)

    def test_unknown_and_invalid_battery_values(self):
        self.assertIsNone(battery_reading({})['percent'])
        result = battery_reading({'IsPresent': True, 'Type': 2, 'Percentage': float('nan'), 'EnergyRate': -1, 'TimeToEmpty': 0})
        self.assertIsNone(result['percent']); self.assertIsNone(result['watts'])
        self.assertIsNone(result['remaining_seconds'])
        json.dumps(result, allow_nan=False)

    def test_profile_whitelist_and_confirmation(self):
        collector = PowerCollector()
        collector.snapshot.update(profiles=['balanced', 'performance'], checked_at=1)
        with patch('power.run') as run, patch('power.dbus', return_value='performance'):
            for invalid in (None, 'power-saver', 'balanced;reboot', ['balanced']):
                with self.assertRaises(ValueError): collector.set_profile(invalid)
            run.assert_not_called()
            self.assertEqual(collector.set_profile('performance'), {'profile': 'performance'})
            self.assertIn('set-property', run.call_args.args[0])
        with patch('power.run'), patch('power.dbus', return_value='balanced'):
            with self.assertRaises(RuntimeError): collector.set_profile('performance')

    def test_awake_two_owners_expiry_and_cleanup(self):
        now = [0]
        manager = AwakeManager(clock=lambda: now[0])
        process = MagicMock(); process.poll.return_value = None
        process.stdout.readline.return_value = b'ready\n'
        with patch('power.subprocess.Popen', return_value=process), patch('power.select.select', return_value=([process.stdout], [], [])):
            a = manager.control('enable')['token']; b = manager.control('enable')['token']
        self.assertNotEqual(a, b)
        manager.control('disable', a)
        process.terminate.assert_not_called()
        now[0] = 9; manager.control('heartbeat', b)
        now[0] = 15; manager.sweep()
        self.assertIn(b, manager.leases)
        now[0] = 20; manager.sweep()
        process.terminate.assert_called_once()
        self.assertIsNone(manager.process)
        with self.assertRaises(KeyError): manager.control('heartbeat', b)

    def test_awake_helper_death_invalidates_lease(self):
        manager = AwakeManager()
        process = MagicMock(); process.poll.return_value = 1
        manager.process = process; manager.leases['owner'] = manager.clock()
        with self.assertRaises(KeyError): manager.control('heartbeat', 'owner')
        self.assertFalse(manager.leases)

class TimerTests(unittest.TestCase):
    def setUp(self):
        self.now = 100
        self.manager = TimerManager(clock=lambda: self.now)
        self.token = self.manager.create(10, 5)['session']

    def test_independent_pause_resume_and_finish(self):
        self.manager.control(self.token, 'countdown', 'start')
        self.manager.control(self.token, 'stopwatch', 'start')
        self.now += 3.25
        state = self.manager.control(self.token, 'countdown', 'pause')
        self.assertEqual(state['countdown']['seconds'], 6.75)
        self.assertEqual(state['stopwatch']['seconds'], 8.25)
        self.now += 4
        self.assertEqual(self.manager.state(self.token)['countdown']['seconds'], 6.75)
        self.manager.control(self.token, 'countdown', 'start')
        self.now += 7
        state = self.manager.state(self.token)
        self.assertTrue(state['countdown']['finished']); self.assertFalse(state['countdown']['running'])
        self.assertTrue(state['stopwatch']['running'])
        self.assertEqual(self.manager.control(self.token, 'countdown', 'reset')['countdown']['seconds'], 10)
        self.assertEqual(self.manager.control(self.token, 'stopwatch', 'reset')['stopwatch']['seconds'], 5)

    def test_instances_and_configure_do_not_affect_other_timer(self):
        other = self.manager.create(20, 0)['session']
        self.manager.control(self.token, 'stopwatch', 'start')
        self.now += 2
        state = self.manager.control(self.token, 'countdown', 'configure', 45)
        self.assertEqual(state['countdown']['seconds'], 45)
        self.assertEqual(state['stopwatch']['seconds'], 7)
        self.assertEqual(self.manager.state(other)['countdown']['seconds'], 20)
        self.manager.close(self.token)
        with self.assertRaises(KeyError): self.manager.state(self.token)
        self.assertEqual(self.manager.state(other)['stopwatch']['seconds'], 0)

    def test_validation_expiry_and_idempotent_start(self):
        for value in (True, -1, 86401, 1.5, '5', None):
            with self.assertRaises(ValueError): self.manager.create(value, 0)
        self.manager.control(self.token, 'countdown', 'start')
        self.now += 2
        self.manager.control(self.token, 'countdown', 'start')
        self.assertEqual(self.manager.state(self.token)['countdown']['seconds'], 8)
        self.now += 61
        with self.assertRaises(KeyError): self.manager.state(self.token)

if __name__ == '__main__': unittest.main()
