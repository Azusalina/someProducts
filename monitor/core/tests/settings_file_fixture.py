"""Isolated config-file QML integration server; never touches user settings."""
import json
from pathlib import Path
import sys
import tempfile
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).parents[1]/'backend'))
from monitor_service import Handler
from widget_config import WidgetConfig


class Fixture(Handler):
    def do_GET(self):
        if self.path == '/test/raw' and self.allowed():
            path = self.server.widget_config.path
            self.reply(200, {'raw': path.read_text() if path.exists() else None})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/test/edit' and self.allowed():
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
    server.serve_forever()
