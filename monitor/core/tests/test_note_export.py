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
from monitor_service import Handler, save_note


class NoteExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.path = self.folder/'笔记 space.txt'

    def test_utf8_export_and_confirmed_overwrite(self):
        text = '第一行\nA note <plain text>\n'
        result = save_note(self.path.as_uri(), text)
        self.assertEqual(self.path.read_text(), text)
        self.assertEqual(result['url'], self.path.as_uri())
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        os.chmod(self.path, 0o640)
        save_note(self.path.as_uri(), 'Updated')
        self.assertEqual(self.path.read_text(), 'Updated')
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o640)

    def test_invalid_targets_and_oversized_text(self):
        for target, text in [('https://example.com/note.txt', 'note'), ('file://remote/tmp/note.txt', 'note'), ('file:relative.txt', 'note'), (self.path.as_uri()+'?x=1', 'note'), (self.path.as_uri(), False), (self.path.as_uri(), 'x'*65537)]:
            with self.assertRaises(ValueError):
                save_note(target, text)
        self.assertFalse(self.path.exists())

    def test_symlinks_directories_and_missing_folders_are_not_replaced(self):
        self.path.write_text('Keep')
        link = self.folder/'link.txt'
        link.symlink_to(self.path)
        with self.assertRaises(ValueError):
            save_note(link.as_uri(), 'Overwrite')
        with self.assertRaises(ValueError):
            save_note(self.folder.as_uri(), 'Overwrite directory')
        with self.assertRaises(OSError):
            save_note((self.folder/'missing/note.txt').as_uri(), 'note')
        self.assertEqual(self.path.read_text(), 'Keep')
        self.assertTrue(link.is_symlink())

    def test_failed_atomic_write_retains_existing_file(self):
        self.path.write_text('Keep')
        with patch('monitor_service.os.replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                save_note(self.path.as_uri(), 'New note')
        self.assertEqual(self.path.read_text(), 'Keep')
        self.assertEqual(list(self.folder.glob('.monitor-note-*')), [])


class NoteApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)/'note.txt'
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, payload, headers=None):
        return urlopen(Request(self.base+'/notes/save', data=json.dumps(payload).encode(), headers=headers or {'X-Monitor-Client':'plasma-widget'}), timeout=2)

    def test_save_route_and_invalid_payload(self):
        with self.request({'url':self.path.as_uri(), 'text':'Saved through API'}) as response:
            self.assertTrue(json.load(response)['ok'])
        self.assertEqual(self.path.read_text(), 'Saved through API')
        for payload in [{'url':self.path.as_uri()}, {'url':self.path.as_uri(), 'text':False}, {'url':'https://example.com', 'text':'note'}]:
            with self.assertRaises(HTTPError) as result:
                self.request(payload)
            self.assertEqual(result.exception.code, 400)
            result.exception.close()
        self.assertEqual(self.path.read_text(), 'Saved through API')

    def test_browser_and_rebound_requests_cannot_write(self):
        for headers in [{'Accept':'application/json'}, {'X-Monitor-Client':'plasma-widget','Origin':'https://example.com'}, {'X-Monitor-Client':'plasma-widget','Host':'example.com'}]:
            with self.assertRaises(HTTPError) as result:
                self.request({'url':self.path.as_uri(),'text':'Must not write'}, headers)
            self.assertEqual(result.exception.code, 403)
            result.exception.close()
        self.assertFalse(self.path.exists())
