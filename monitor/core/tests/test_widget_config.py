import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).parents[1]/'backend'))
from widget_config import WidgetConfig, DEFAULTS, Conflict, MAX_BYTES
from monitor_service import Handler


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/'profile/config.json'
        self.store = WidgetConfig(self.path)

    def test_saved_profile_survives_new_store_and_has_private_permissions(self):
        state = self.store.read()
        self.assertFalse(state['configured'])
        saved = self.store.update({'noteText': '私有笔记', 'cpuFlowColor': '#aabbcc', 'countdownSeconds': 1775, 'columns': 1}, '')
        restored = WidgetConfig(self.path).read()
        self.assertEqual(saved, restored)
        self.assertEqual(restored['settings']['noteText'], '私有笔记')
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)
        self.assertEqual(list(self.path.parent.glob('.config-*')), [])

    def test_manual_partial_profile_uses_defaults_and_can_be_updated(self):
        self.path.parent.mkdir()
        self.path.write_text(json.dumps({'version': 1, 'settings': {'gpuFlowColor': '#123456', 'countdownStyle': 'ring'}}))
        state = self.store.read()
        self.assertEqual(state['settings']['gpuFlowColor'], '#123456')
        self.assertEqual(state['settings']['columns'], DEFAULTS['columns'])
        changed = self.store.update({'columns': 3}, state['revision'])
        self.assertEqual(changed['settings']['countdownStyle'], 'ring')

    def test_invalid_edits_are_rejected_without_overwriting(self):
        self.store.update({}, '')
        for setting in [{'columns': True}, {'columns': 4}, {'cpuFlowColor': '#gg0000'}, {'countdownSeconds': 0}, {'stopwatchStyle': 'unknown'}, {'enabledModules': 'cpu,cpu'}, {'moduleOrder': 'remote'}, {'noteText': 'a'*65537}, {'notASetting': 2}]:
            original = self.path.read_bytes()
            with self.assertRaises(ValueError):
                self.store.update(setting, self.store.read()['revision'])
            self.assertEqual(self.path.read_bytes(), original)
        for raw in ['{', '{"version":2,"settings":{}}', '{"version":true,"settings":{}}', '{"version":1,"settings":[]}', 'x'*(MAX_BYTES+1)]:
            self.path.write_text(raw)
            with self.assertRaises(ValueError):
                self.store.read()
            with self.assertRaises(ValueError):
                self.store.update({'columns': 1}, '')
            self.assertEqual(self.path.read_text(), raw)

    def test_manual_change_causes_conflict_then_disjoint_merge_preserves_it(self):
        old = self.store.update({'columns': 1}, '')
        manual = {'version': 1, 'settings': {**old['settings'], 'gpuFlowColor': '#987654'}}
        self.path.write_text(json.dumps(manual))
        with self.assertRaises(Conflict) as conflict:
            self.store.update({'columns': 3}, old['revision'])
        merged = self.store.update({'columns': 3}, conflict.exception.state['revision'])
        self.assertEqual(merged['settings']['gpuFlowColor'], '#987654')
        self.assertEqual(merged['settings']['columns'], 3)

    def test_failed_atomic_save_keeps_previous_file(self):
        before = self.store.update({'columns': 1}, '')
        with patch('widget_config.os.replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.store.update({'columns': 3}, before['revision'])
        self.assertEqual(self.store.read(), before)
        self.assertEqual(list(self.path.parent.glob('.config-*')), [])

    def test_named_profiles_remain_independent_and_reject_traversal(self):
        default = self.store.update({'noteText': 'Default note'}, '')
        media = self.store.for_profile('media')
        media.update({'enabledModules': 'media', 'noteText': ''}, '')
        self.assertEqual(media.read()['settings']['enabledModules'], 'media')
        self.assertEqual(self.store.read(), default)
        self.assertIs(media, self.store.for_profile('media'))
        for name in ['../escape', '/tmp/escape', '', 'space name', 'x'*65]:
            with self.assertRaises(ValueError):
                self.store.for_profile(name)

    def test_xdg_config_directory(self):
        with patch.dict(os.environ, {'XDG_CONFIG_HOME': self.temp.name}):
            self.assertEqual(WidgetConfig().path, Path(self.temp.name)/'someProducts-monitor/config.json')


class ConfigApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = WidgetConfig(Path(self.temp.name)/'config.json')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.widget_config = self.store
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, value=None, headers=None):
        body = None if value is None else json.dumps(value).encode()
        return urlopen(Request(self.base+'/config', data=body, headers=headers or {'X-Monitor-Client': 'plasma-widget'}), timeout=2)

    def test_config_routes_save_restore_and_conflict(self):
        with self.request() as response:
            state = json.load(response)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
        with self.request({'revision': state['revision'], 'changes': {'countdownSeconds': 2935}}) as response:
            self.assertEqual(json.load(response)['settings']['countdownSeconds'], 2935)
        with self.assertRaises(HTTPError) as error:
            self.request({'revision': '', 'changes': {'columns': 3}})
        self.assertEqual(error.exception.code, 409)
        error.exception.close()

    def test_config_rejects_browser_requests_and_invalid_manual_draft(self):
        for headers in [{'Accept': 'application/json'}, {'X-Monitor-Client': 'plasma-widget', 'Origin': 'https://example.com'}, {'X-Monitor-Client': 'plasma-widget', 'Host': 'example.com'}]:
            with self.assertRaises(HTTPError) as error:
                self.request(headers=headers)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        self.store.path.write_text('{')
        with self.assertRaises(HTTPError) as error:
            self.request()
        self.assertEqual(error.exception.code, 422)
        self.assertEqual(json.load(error.exception)['path'], str(self.store.path))
        error.exception.close()
