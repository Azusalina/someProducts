"""Isolated config-file QML integration server; never touches user settings."""
import json
import signal
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit, unquote
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).parents[1]/'backend'))
from monitor_service import Handler, save_note
from widget_config import WidgetConfig


class Fixture(Handler):
    def do_GET(self):
        if self.path == '/test/note' and self.allowed():
            path = self.server.widget_config.path.parent/'note 测试.txt'
            self.reply(200, {'url': path.as_uri(), 'text': path.read_text() if path.exists() else None})
        elif self.path == '/test/raw' and self.allowed():
            path = self.server.widget_config.path
            self.reply(200, {'raw': path.read_text() if path.exists() else None})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/notes/save' and self.allowed():
            payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            path = Path(unquote(urlsplit(payload['url']).path))
            if path.parent != self.server.widget_config.path.parent:
                self.reply(403, {'error': 'Test exports must stay inside the fixture directory'})
                return
            try:
                self.reply(200, save_note(payload['url'], payload['text']))
            except (ValueError, OSError) as error:
                self.reply(400, {'error': str(error)})
        elif self.path == '/test/edit' and self.allowed():
            value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            path = self.server.widget_config.path
            if value['raw'] is None:
                path.unlink(missing_ok=True)
            else:
                path.write_text(value['raw'])
            self.reply(200, {'ok': True})
        else:
            super().do_POST()


with tempfile.TemporaryDirectory(prefix='monitor-config-test-') as temporary:
    server = ThreadingHTTPServer(('127.0.0.1', 17342), Fixture)
    server.widget_config = WidgetConfig(Path(temporary)/'config.json')
    print('Config fixture ready', flush=True)
    def stop(*_):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
