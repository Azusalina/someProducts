import importlib.util
import json
from pathlib import Path
import subprocess
import threading
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).parents[1] / 'backend'))

spec = importlib.util.spec_from_file_location('monitor_service', Path(__file__).parents[1] / 'backend/monitor_service.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TelemetryTests(unittest.TestCase):
    def test_cpu_excludes_guest_and_uses_deltas(self):
        cpu = m.Cpu()
        with patch.object(m, 'read', side_effect=['cpu 100 0 50 850 0 0 0 0 10 0', 'cpu 120 0 60 920 0 0 0 0 10 0']), patch.object(m.Path, 'glob', return_value=[]):
            self.assertIsNone(cpu.sample()['percent'])
            self.assertEqual(cpu.sample()['percent'], 30)

    def test_host_url_normalization_and_option_injection(self):
        self.assertEqual(m.normalize_host('https://example.com/path?q=1'), 'example.com')
        self.assertEqual(m.normalize_host('http://[::1]:8080/status'), '::1')
        for target in ['-c5', 'host --help', 'file:///etc/passwd', 'https://user:pass@example.com', '']:
            with self.assertRaises(ValueError):
                m.normalize_host(target)

    def test_ping_missing_reply_is_unknown(self):
        with patch.object(m, 'command', side_effect=subprocess.TimeoutExpired('ping', 3)):
            result = m.ping_target('example.com')
        self.assertIsNone(result['ms'])
        self.assertEqual(result['status'], 'No ICMP reply')

    def test_ping_under_one_ms(self):
        with patch.object(m, 'command', return_value='64 bytes time<1 ms'):
            result = m.ping_target('127.0.0.1')
        self.assertEqual(result['ms'], 1)
        self.assertTrue(result['less_than'])

    def test_bus_variant_metadata(self):
        payload = {'type': 'a{sv}', 'data': [{'Metadata': {'type': 'a{sv}', 'data': {'xesam:title': {'type': 's', 'data': 'Video'}, 'xesam:artist': {'type': 'as', 'data': ['Artist']}}}}]}
        with patch.object(m, 'command', return_value=json.dumps(payload)):
            props = m.bus('unused')
        self.assertEqual(props['Metadata']['xesam:title'], 'Video')
        self.assertEqual(props['Metadata']['xesam:artist'], ['Artist'])


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.telemetry = m.Telemetry()
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), m.Handler)
        cls.server.telemetry = cls.telemetry
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.telemetry.pool.shutdown()
        cls.telemetry.terminals.shutdown()

    def request(self, path, data=None, headers=None):
        return urlopen(Request(self.base + path, data=data,
                              headers=headers or {'X-Monitor-Client': 'plasma-widget'}), timeout=2)

    def test_snapshot_does_not_wait_for_ping(self):
        with patch.object(m, 'ping_target', return_value={'ms': 12, 'status': 'reachable'}):
            result = json.load(self.request('/snapshot?targets=%5B%22example.com%22%5D'))
        self.assertIn('cpu', result)
        self.assertNotIn('usage', result)
        self.assertNotIn('reset_news', result)
        self.assertEqual(result['pings'][0]['target'], 'example.com')

    def test_reject_browser_origin_and_rebound_host(self):
        for headers in [{}, {'X-Monitor-Client': 'plasma-widget', 'Origin': 'https://evil.example'},
                        {'X-Monitor-Client': 'plasma-widget', 'Host': 'evil.example'}]:
            with self.assertRaises(HTTPError) as result:
                self.request('/snapshot', headers=headers or {'Accept': 'application/json'})
            self.assertEqual(result.exception.code, 403)
            result.exception.close()

    def test_reject_arbitrary_dbus_destination(self):
        with patch.object(m, 'player_names', return_value=['org.mpris.MediaPlayer2.test']):
            with self.assertRaises(HTTPError) as result:
                self.request('/media/toggle', b'{"service":"org.kde.KWin"}')
            self.assertEqual(result.exception.code, 409)
            result.exception.close()

    def test_pause_capability_respected(self):
        with patch.object(m, 'player_names', return_value=['org.mpris.MediaPlayer2.test']), patch.object(m, 'bus', return_value={'PlaybackStatus': 'Playing', 'CanControl': True, 'CanPause': False}):
            with self.assertRaises(HTTPError) as result:
                self.request('/media/toggle', b'{"service":"org.mpris.MediaPlayer2.test"}')
            self.assertEqual(result.exception.code, 409)
            result.exception.close()

    def test_valid_pause_calls_playpause(self):
        with patch.object(m, 'player_names', return_value=['org.mpris.MediaPlayer2.test']), patch.object(m, 'bus', return_value={'PlaybackStatus': 'Playing', 'CanControl': True, 'CanPause': True}), patch.object(m, 'command') as command:
            result = json.load(self.request('/media/toggle', b'{"service":"org.mpris.MediaPlayer2.test"}'))
        self.assertTrue(result['ok'])
        self.assertEqual(command.call_args.args[0][-1], 'PlayPause')

    def test_settings_api_routes_native_target(self):
        with patch.object(m, 'open_settings') as launch:
            result = json.load(self.request('/settings/open', b'{"target":"wifi"}'))
        self.assertTrue(result['ok'])
        launch.assert_called_once_with('wifi')

    def test_settings_api_rejects_command_injection_and_invalid_shapes(self):
        for value in ({'target': 'wifi; shutdown now'}, {'target': []}, [], {}):
            with self.assertRaises(HTTPError) as result:
                self.request('/settings/open', json.dumps(value).encode())
            self.assertEqual(result.exception.code, 400)
            result.exception.close()

    def test_settings_missing_application_is_explicit_error(self):
        with patch.object(m, 'open_settings', side_effect=RuntimeError('Missing')):
            with self.assertRaises(HTTPError) as result:
                self.request('/settings/open', b'{"target":"proton"}')
            self.assertEqual(result.exception.code, 503)
            result.exception.close()

    def test_terminal_routes_require_native_origin_and_valid_dimensions(self):
        for body, headers, code in [(b'{"columns":60,"rows":12}', {'Origin':'https://example.com','X-Monitor-Client':'plasma-widget'}, 403),
                                     (b'{"columns":1,"rows":1}', {'X-Monitor-Client':'plasma-widget'}, 400)]:
            with self.assertRaises(HTTPError) as result:
                self.request('/terminal/start', body, headers)
            self.assertEqual(result.exception.code, code)
            result.exception.close()

    def test_unknown_terminal_does_not_expose_other_sessions(self):
        with self.assertRaises(HTTPError) as result:
            self.request('/terminal/screen?session=unknown')
        self.assertEqual(result.exception.code,410)
        result.exception.close()


if __name__ == '__main__':
    unittest.main()
