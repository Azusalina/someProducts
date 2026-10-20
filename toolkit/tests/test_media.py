"""Local deterministic fixtures exercise the real yt-dlp and FFmpeg pipeline.
Function tests use local fixtures; the production CLI's network guard is tested
separately in a fresh process and has no test-mode bypass.
"""
import contextlib
import functools
import http.server
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('media_worker', ROOT/'src/media/worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

class MediaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='toolkit-media-tests-')
        cls.root = Path(cls.tmp.name)
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.4',str(cls.root/'tone.wav')],check=True)
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=0.4','-f','lavfi','-i','sine=frequency=660:duration=0.4','-c:v','libx264','-c:a','aac','-shortest',str(cls.root/'clip.mp4')],check=True)
        (cls.root/'links.html').write_text('<a href="tone.wav" title="Linked audio">audio</a><a href="clip.mp4">video</a>')
        (cls.root/'multi.html').write_text('<title>Two media</title><video src="clip.mp4" controls></video><audio src="tone.wav" controls></audio>')
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=cls.tmp.name))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.tmp.cleanup()

    def test_multi_scan_and_video_audio_download(self):
        rows = worker.scan(self.url+'/multi.html')
        self.assertEqual(len(rows),2)
        with tempfile.TemporaryDirectory() as folder:
            name = worker.download(rows,'mp3',Path(folder))
            with zipfile.ZipFile(Path(folder)/name) as archive:
                names=archive.namelist();self.assertEqual(len(names),2)
                for item in names:
                    self.assertTrue(item.endswith('.mp3'))
                    archive.extract(item,folder)
                    probe=subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_name,codec_type','-of','json',str(Path(folder)/item)],capture_output=True,text=True,check=True)
                    streams=json.loads(probe.stdout)['streams']
                    self.assertEqual([s['codec_type'] for s in streams],['audio'])
                    self.assertEqual(streams[0]['codec_name'],'mp3')

    def test_direct_media_links(self):
        rows=worker.scan(self.url+'/links.html')
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['title'],'Linked audio')

    def test_flac_and_original(self):
        rows=worker.scan(self.url+'/tone.wav')
        self.assertEqual(rows[0]['kind'],'audio')
        for mode in ('flac','original'):
            with tempfile.TemporaryDirectory() as folder:
                name=worker.download(rows,mode,Path(folder))
                self.assertTrue(name.endswith('.flac' if mode=='flac' else '.wav'))

    def test_production_guard_and_invalid_protocols(self):
        for url in ('file:///etc/passwd','ftp://example.com/a','https://user:pass@example.com/a'):
            with self.assertRaises(ValueError): worker.validate_url(url)
        result=subprocess.run([sys.executable,str(ROOT/'src/media/worker.py')],input=json.dumps({'action':'scan','url':self.url+'/multi.html'}),capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('private network',result.stderr)

if __name__=='__main__': unittest.main()
