import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]/'backend'))
import cava_audio
import terminal_sessions as t
import monitor_service as m
import pyte


def wait_for(session, marker):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        screen = session.get()
        if any(line.strip() == marker for line in screen['plain']):
            return screen
        time.sleep(0.03)
    raise AssertionError('Terminal did not return the expected marker')


class MediaTests(unittest.TestCase):
    def test_microseconds_and_unknown_progress(self):
        name = 'org.mpris.MediaPlayer2.fixture'
        with patch.object(m, 'player_names', return_value=[name]), patch.object(m,'bus', return_value={
            'Metadata':{'mpris:length':120_000_000},'Position':30_000_000,'Rate':1,'PlaybackStatus':'Playing'}):
            player=m.media_snapshot()['players'][0]
        self.assertEqual(player['duration'],120)
        self.assertEqual(player['position'],30)
        with patch.object(m,'player_names',return_value=[name]),patch.object(m,'bus',return_value={'Metadata':{},'Position':float('nan')}):
            player=m.media_snapshot()['players'][0]
        self.assertIsNone(player['position']);self.assertIsNone(player['duration'])

    def test_real_cava_frame_validation(self):
        self.assertEqual(cava_audio.parse_frame(';'.join(['500']*32)+';'),[.5]*32)
        for value in ('500;',';'.join(['1001']*32),';'.join(['-1']*32)):
            with self.assertRaises(ValueError): cava_audio.parse_frame(value)

    def test_output_monitor_is_explicit_and_config_cannot_inject(self):
        with patch.object(cava_audio.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'output.test\n','')):
            self.assertEqual(cava_audio.playback_monitor(),'output.test.monitor')
        self.assertIn('source = output.test.monitor',cava_audio.config_text('output.test.monitor'))
        for value in ('microphone','output\nmethod=alsa.monitor'):
            with self.assertRaises(ValueError):cava_audio.config_text(value)


class TerminalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.manager=t.TerminalManager(cwd=self.temp.name,shell='/usr/bin/bash')
        self.token=self.manager.create(70,14)['session']
        self.session=self.manager.session(self.token)

    def tearDown(self):
        self.manager.shutdown();self.temp.cleanup()

    def test_real_shell_unicode_and_controlling_pty(self):
        self.session.input("printf 'RUN_%s\\n' READY; printf '中文_%s\\n' 正常; test -t 0 && printf 'TTY_%s\\n' READY\r")
        screen=wait_for(self.session,'TTY_READY')
        self.assertIn('RUN_READY','\n'.join(screen['plain']))
        self.assertIn('中文_正常','\n'.join(screen['plain']))

    def test_job_control_interrupt_and_resize(self):
        self.session.input('sleep 10\r');time.sleep(.15)
        self.session.input('\x03');self.session.input("printf 'AFTER_%s\\n' INTERRUPT\r")
        wait_for(self.session,'AFTER_INTERRUPT')
        self.session.resize(65,10)
        self.session.input('stty size\r')
        screen=wait_for(self.session,'10 65')
        self.assertEqual((screen['rows'],screen['columns']),(10,65))
        self.assertTrue(self.session.get(screen['revision'])['unchanged'])

    def test_separate_sessions_and_cleanup(self):
        second=self.manager.create(70,14)['session']
        self.assertNotEqual(self.token,second)
        self.session.input("printf 'ONLY_%s\\n' FIRST\r")
        wait_for(self.session,'ONLY_FIRST')
        self.assertNotIn('ONLY_FIRST','\n'.join(self.manager.session(second).get()['plain']))
        self.manager.close(self.token)
        self.assertIsNotNone(self.session.process.poll())
        with self.assertRaises(KeyError):self.manager.session(self.token)

    def test_sizes_and_input_are_bounded(self):
        for values in [(True,10),(5,5),(161,10),(60,61)]:
            with self.assertRaises(ValueError):t.dimensions(*values)
        with self.assertRaises(ValueError):self.session.input('a'*9000)

    def test_alternate_screen_and_terminal_colors(self):
        screen = t.Screen(40,10,lambda _:None)
        stream = pyte.ByteStream(screen)
        stream.feed(b'MAIN\x1b[?1049h\x1b[31mALT')
        self.assertTrue(screen.display[0].startswith('ALT'))
        self.assertEqual(t.color(screen.buffer[0][0].fg),'#e06c75')
        stream.feed(b'\x1b[?1049l')
        self.assertTrue(screen.display[0].startswith('MAIN'))


class MigrationTests(unittest.TestCase):
    def test_only_owned_statusline_is_restored(self):
        import os
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);config=root/'claude';config.mkdir()
            legacy=root/'data/monitor-dashboard/claude_statusline.py'
            settings=config/'settings.json'
            settings.write_text(json.dumps({'theme':'dark','statusLine':{'command':f'/usr/bin/python {legacy}'}}))
            (config/'settings.pre-monitor-statusline.json').write_text(json.dumps({'statusLine':{'command':'prior-script'}}))
            env={**os.environ,'CLAUDE_CONFIG_DIR':str(config),'XDG_DATA_HOME':str(root/'data')}
            script=Path(__file__).parents[1]/'scripts/migrate.py'
            subprocess.run([sys.executable,str(script)],env=env,check=True)
            value=json.loads(settings.read_text())
            self.assertEqual(value['theme'],'dark');self.assertEqual(value['statusLine']['command'],'prior-script')
            subprocess.run([sys.executable,str(script)],env=env,check=True)
            self.assertEqual(json.loads(settings.read_text()),value)
