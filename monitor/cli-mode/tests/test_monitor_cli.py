from __future__ import annotations
import json
import os
from pathlib import Path
import select
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from monitor_cli import collectors
from monitor_cli import audio
from monitor_cli.config import Config, ConfigError, Target, init_config, load_config
from monitor_cli.display import cards, cells, clip, plain
from monitor_cli.engine import Engine


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "config.toml"

    def load(self, text):
        self.path.write_text(text)
        return load_config(self.path, required=True)

    def test_missing_default_and_required_file(self):
        config = load_config(self.path)
        self.assertEqual(config.note_file, self.path.parent / "notes.txt")
        self.assertEqual(config.targets, ())
        self.assertFalse(self.path.exists())
        with self.assertRaises(ConfigError):
            load_config(self.path, required=True)

    def test_example_and_no_overwrite(self):
        init_config(self.path)
        initial = self.path.read_text()
        self.assertEqual(load_config(self.path).columns, 2)
        with self.assertRaises(ConfigError):
            init_config(self.path)
        self.assertEqual(self.path.read_text(), initial)

    def test_order_targets_and_relative_note(self):
        config = self.load('[dashboard]\nmodules=["note","cpu"]\ncolumns=1\n[ping]\ntargets=[{label="Local",host="http://[::1]:80/x"}]\n[note]\nfile="other/notes.txt"\n')
        self.assertEqual(config.modules, ("note", "cpu"))
        self.assertEqual(config.targets, (Target("Local", "http://[::1]:80/x"),))
        self.assertEqual(config.note_file, self.path.parent / "other/notes.txt")

    def test_invalid_configs_are_actionable(self):
        for text in ('[dashboard]\ncolums=2', '[dashboard]\ncolumns=true', '[dashboard]\ncolumns=4',
                     '[dashboard]\nmodules=["cpu","cpu"]', '[dashboard]\nmodules=["terminal"]',
                     '[dashboard]\nmodules=[]', '[dashboard]\nrefresh_seconds=nan',
                     '[media]\ncava="yes"', '[media]\nservice="org.kde.KWin"',
                     '[note]\nfile=""', '[note]\neditor="\\\"unclosed"',
                     '[ping]\ntargets=[{host="-c5"}]', '[ping]\ntargets=[{host="https://u:p@x"}]',
                     '[ping]\ntargets=[{host="example.com",labell="typo"}]', '[dashboard'):
            with self.subTest(text=text), self.assertRaises(ConfigError):
                self.load(text)


class SamplingTests(unittest.TestCase):
    def test_cpu_counter_deltas_exclude_guest(self):
        cpu = collectors.Cpu()
        with patch.object(collectors, "read", side_effect=['cpu 100 0 50 850 0 0 0 0 10 0', 'cpu 120 0 60 920 0 0 0 0 10 0']), patch.object(collectors.Path, "glob", return_value=[]):
            self.assertIsNone(cpu.sample()["percent"])
            self.assertEqual(cpu.sample()["percent"], 30)

    def test_ping_normalizes_url_and_passes_host_as_argument(self):
        with patch.object(collectors, "command", return_value="64 bytes time<1 ms") as command:
            value = collectors.ping_target("https://example.com/a?q=1")
        self.assertEqual(value["ms"], 1)
        self.assertTrue(value["less_than"])
        self.assertEqual(command.call_args.args[0][-2:], ["--", "example.com"])
        for host in ("-c5", "host --help", "file:///etc/passwd"):
            with self.assertRaises(ValueError):
                collectors.normalize_host(host)

    def test_nonfinite_gpu_values_remain_json_safe_unknowns(self):
        gpu = collectors.Gpu()
        gpu.nvidia = True
        with patch.object(collectors, "command", return_value="00000000:01:00.0, NVIDIA, nan, N/A, -1, 35"), patch.object(gpu, "clients", return_value={}), patch.object(collectors.Path, "glob", return_value=[]):
            value = gpu.sample()
        self.assertIsNone(value[0]["percent"])
        self.assertIsNone(value[0]["memory_total_mib"])
        json.dumps(value, allow_nan=False)

    def test_media_rechecks_destination_and_capability(self):
        with patch.object(collectors, "player_names", return_value=[]), patch.object(collectors, "command") as command:
            with self.assertRaises(ValueError):
                collectors.toggle_media("org.kde.KWin")
            command.assert_not_called()
        service = "org.mpris.MediaPlayer2.test"
        with patch.object(collectors, "player_names", return_value=[service]), patch.object(collectors, "bus", return_value={"PlaybackStatus": "Playing", "CanControl": True, "CanPause": False}):
            with self.assertRaises(ValueError):
                collectors.toggle_media(service)
        with patch.object(collectors, "player_names", return_value=[service]), patch.object(collectors, "bus", return_value={"PlaybackStatus": "Playing", "CanControl": True, "CanPause": True}), patch.object(collectors, "command") as command:
            collectors.toggle_media(service)
            self.assertEqual(command.call_args.args[0][-1], "PlayPause")

    def test_audio_monitor_only_and_frame_validation(self):
        with patch.object(audio.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "output.test\n", "")):
            self.assertEqual(audio.playback_monitor(), "output.test.monitor")
        self.assertIn("source = output.test.monitor", audio.config_text("output.test.monitor"))
        for source in ("microphone", "output\nmethod=alsa.monitor"):
            with self.assertRaises(ValueError):
                audio.config_text(source)
        self.assertEqual(audio.parse_frame(";".join(["500"] * 32)), [0.5] * 32)
        for frame in ("500;", ";".join(["1001"] * 32), ";".join(["-1"] * 32)):
            with self.assertRaises(ValueError):
                audio.parse_frame(frame)

    def test_slow_probe_does_not_block_snapshot_or_cpu(self):
        config = Config(path=Path("/tmp/config.toml"), modules=("cpu", "gpu"), cava=False)
        engine = Engine(config)
        release = threading.Event()
        entered = threading.Event()
        def slow(gpu):
            entered.set()
            release.wait(3)
            return []
        try:
            with patch.object(collectors.Gpu, "sample", slow), patch.object(collectors.Cpu, "sample", return_value={"percent": 25}):
                engine.start()
                self.assertTrue(entered.wait(1))
                time.sleep(0.2)
                started = time.monotonic()
                snapshot = engine.snapshot()
                self.assertLess(time.monotonic() - started, 0.2)
                self.assertEqual(snapshot["cpu"]["percent"], 25)
                self.assertEqual(snapshot["gpus"], [])
        finally:
            release.set()
            engine.close()
            for thread in engine.threads:
                thread.join(timeout=1)


class DisplayTests(unittest.TestCase):
    def test_width_and_terminal_escape_sanitization(self):
        self.assertEqual(clip("中文abc", 5), "中文a")
        self.assertEqual(cells(clip("中\u0301文abc", 3)), 2)
        self.assertNotIn("\x1b", clip("title\x1b[2J\x00x", 80))
        config = Config(path=Path("/tmp/config.toml"), modules=("note",), unicode=False)
        output = plain(config, {"note": "中文" * 30 + "\x1b[2J"}, width=40)
        for line in output.splitlines()[2:]:
            self.assertEqual(cells(line), 40)

    def test_unknown_gpu_and_configured_missing_player(self):
        config = Config(path=Path("/tmp/config.toml"), modules=("gpu", "media"), cava=False, media_service="org.mpris.MediaPlayer2.missing")
        rendered = cards(config, {"gpus": [{"name": "Intel", "percent": None}], "media": {"players": []}}, 40)
        self.assertIn("--", rendered[0].lines[0])
        self.assertIn("?", rendered[0].lines[1])
        self.assertIn("Configured player unavailable", rendered[1].lines)


class CommandTests(unittest.TestCase):
    def test_json_and_invalid_config_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.toml"
            path.write_text('[dashboard]\nmodules=["cpu","ram"]\n')
            result = subprocess.run([str(ROOT / "monitor-cli"), "--config", str(path), "--json"], capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            value = json.loads(result.stdout)
            self.assertIsInstance(value["cpu"]["percent"], (int, float))
            self.assertGreater(value["ram"]["total"], 0)
            path.write_text('[dashboard]\ncolumns=4\n')
            result = subprocess.run([str(ROOT / "monitor-cli"), "--config", str(path), "--once"], capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("Traceback", result.stderr)

    def test_install_command_independent_of_source_and_uninstall(self):
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory)
            command = [sys.executable, str(ROOT / "scripts/install.py"), "--prefix", directory]
            installed = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            binary = prefix / "bin/monitor-cli"
            result = subprocess.run([str(binary), "--version"], cwd="/", capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("monitor-cli 0.1.0", result.stdout)
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            note = prefix / "keep.txt"
            note.write_text("keep")
            result = subprocess.run(command + ["--uninstall"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(binary.exists())
            self.assertFalse(binary.is_symlink())
            self.assertFalse((prefix / "share/monitor-cli").exists())
            self.assertEqual(note.read_text(), "keep")

    def test_installer_preserves_unrelated_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            binary = Path(directory) / "bin/monitor-cli"
            binary.parent.mkdir()
            binary.write_text("unrelated")
            result = subprocess.run([sys.executable, str(ROOT / "scripts/install.py"), "--prefix", directory], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(binary.read_text(), "unrelated")


@unittest.skipUnless(sys.platform.startswith("linux"), "Linux pseudo-terminal required")
class TerminalTests(unittest.TestCase):
    def test_live_reload_resize_editor_and_shell_restoration(self):
        import fcntl
        import pty
        import termios
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.toml"
            note = Path(directory) / "notes.txt"
            editor = Path(directory) / "editor.py"
            editor.write_text('import pathlib, sys\npathlib.Path(sys.argv[1]).write_text("edited note")\n')
            initial = '[dashboard]\nmodules=["cpu","ram","note"]\ncolumns=2\nrefresh_seconds=0.5\ncolor=false\nunicode=false\n[note]\neditor=' + json.dumps(f'{sys.executable} {editor}') + '\n'
            config.write_text(initial)
            master, slave = pty.openpty()
            before = termios.tcgetattr(slave)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 100, 0, 0))
            def child_setup():
                os.setsid()
                fcntl.ioctl(0, termios.TIOCSCTTY, 0)
            process = subprocess.Popen([str(ROOT / "monitor-cli"), "--config", str(config)], stdin=slave, stdout=slave, stderr=slave, env={**os.environ, "TERM": "xterm-256color"}, preexec_fn=child_setup)
            captured = bytearray()
            def wait_for(marker, timeout=5):
                deadline = time.monotonic() + timeout
                while marker not in captured and time.monotonic() < deadline:
                    ready, _, _ = select.select([master], [], [], 0.1)
                    if ready:
                        captured.extend(os.read(master, 65536))
                    if process.poll() is not None:
                        break
                self.assertIn(marker, captured, captured.decode(errors="replace")[-3000:])
            try:
                wait_for(b"MONITOR CLI")
                wait_for(b"CPU")
                wait_for(b"RAM")
                self.assertIn(b"\x1b[?1049h", captured)
                os.write(master, b"e")
                deadline = time.monotonic() + 5
                while not note.exists() or note.read_text() != "edited note":
                    if time.monotonic() >= deadline:
                        self.fail("note editor did not save")
                    time.sleep(0.05)
                wait_for(b"Note updated")
                config.write_text('[dashboard]\ncolumns=7\n')
                os.write(master, b"r")
                wait_for(b"Reload failed")
                config.write_text(initial.replace('modules=["cpu","ram","note"]', 'modules=["note","cpu"]'))
                os.write(master, b"r")
                wait_for(b"Configuration reloaded")
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 10, 40, 0, 0))
                os.kill(process.pid, signal.SIGWINCH)
                os.write(master, b"j?p?")
                time.sleep(0.3)
                self.assertIsNone(process.poll())
                os.write(master, b"q")
                process.wait(timeout=5)
                self.assertEqual(process.returncode, 0)
                while select.select([master], [], [], 0.1)[0]:
                    captured.extend(os.read(master, 65536))
                self.assertIn(b"\x1b[?1049l", captured)
                self.assertEqual(termios.tcgetattr(slave), before)
                self.assertNotIn(b"Traceback", captured)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                os.close(master)
                os.close(slave)

    def test_ctrl_c_and_sigterm_restore_terminal(self):
        import fcntl
        import pty
        import termios
        for action in ("ctrl-c", "sigterm"):
            with self.subTest(action=action), tempfile.TemporaryDirectory() as directory:
                config = Path(directory) / "config.toml"
                config.write_text('[dashboard]\nmodules=["cpu"]\n')
                master, slave = pty.openpty()
                before = termios.tcgetattr(slave)
                fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
                def child_setup():
                    os.setsid()
                    fcntl.ioctl(0, termios.TIOCSCTTY, 0)
                process = subprocess.Popen([str(ROOT / "monitor-cli"), "--config", str(config)], stdin=slave, stdout=slave, stderr=slave, env={**os.environ, "TERM": "xterm-256color"}, preexec_fn=child_setup)
                try:
                    output = b""
                    deadline = time.monotonic() + 5
                    while b"MONITOR CLI" not in output and time.monotonic() < deadline:
                        if select.select([master], [], [], 0.1)[0]:
                            output += os.read(master, 65536)
                    self.assertIn(b"MONITOR CLI", output)
                    if action == "ctrl-c":
                        os.write(master, b"\x03")
                    else:
                        process.terminate()
                    process.wait(timeout=5)
                    self.assertEqual(process.returncode, 0)
                    self.assertEqual(termios.tcgetattr(slave), before)
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait()
                    os.close(master)
                    os.close(slave)


if __name__ == "__main__":
    unittest.main()
