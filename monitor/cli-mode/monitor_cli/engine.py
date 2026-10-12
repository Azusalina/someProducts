"""Independent collectors keep slow hardware, D-Bus and ping work off the UI."""
from __future__ import annotations
from collections import deque
import copy
from pathlib import Path
import threading
import time

from . import collectors
from .audio import AudioCollector
from .config import Config
from .connectivity import ConnectivityCollector


def read_note(path: Path) -> str:
    try:
        with path.open(encoding="utf-8", errors="replace") as stream:
            return stream.read(16384)
    except FileNotFoundError:
        return "No note yet. Press e to create one."
    except OSError as error:
        return f"Cannot read note: {error}"


class Engine:
    def __init__(self, config: Config):
        self.config = config
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.threads = []
        self.data = {"cpu": {}, "ram": {}, "gpus": [], "media": {"players": []}, "pings": [], "errors": {}, "updated": {}}
        self.history = {key: deque(maxlen=config.history_size) for key in ("cpu", "ram", "gpu")}
        self.connectivity = ConnectivityCollector()
        self.audio = AudioCollector()
        self.action_message = ""
        self.action_pending = False

    def start(self):
        modules = self.config.modules
        if "cpu" in modules or "ram" in modules:
            cpu = collectors.Cpu()
            # Prime the counter, then obtain a useful first CPU sample quickly.
            try:
                cpu.sample()
            except (OSError, ValueError, IndexError):
                pass
            def system():
                value = {}
                if "cpu" in modules:
                    value["cpu"] = cpu.sample()
                if "ram" in modules:
                    value["ram"] = collectors.memory_snapshot()
                return value
            self.worker("system", system, self.config.refresh_seconds, delay=0.15)
        if "gpu" in modules:
            gpu = collectors.Gpu()
            self.worker("gpu", lambda: {"gpus": gpu.sample()}, self.config.refresh_seconds)
        if "media" in modules:
            self.worker("media", lambda: {"media": collectors.media_snapshot()}, 2)
            if self.config.cava:
                self.audio.thread.start()
        if set(modules) & {"proton", "wifi", "bluetooth"}:
            self.connectivity.thread.start()
        if "ping" in modules:
            with self.lock:
                self.data["pings"] = [{"target": t.host, "label": t.label, "ms": None, "status": "Checking..."} for t in self.config.targets]
            for target in self.config.targets:
                self.worker("ping:" + target.host, lambda t=target: self.sample_ping(t), self.config.ping_interval)

    def sample_ping(self, target):
        result = {"target": target.host, "label": target.label, **collectors.ping_target(target.host)}
        with self.lock:
            self.data["pings"] = [result if p["target"] == target.host else p for p in self.data["pings"]]
        return {}

    def worker(self, name, sample, interval, delay=0):
        def run():
            if self.stop.wait(delay):
                return
            while not self.stop.is_set():
                started = time.monotonic()
                try:
                    values = sample()
                    with self.lock:
                        self.data.update(values)
                        self.data["errors"].pop(name, None)
                        self.data["updated"][name] = time.time()
                        for key in ("cpu", "ram"):
                            if key in values:
                                self.history[key].append(values[key].get("percent"))
                        if "gpus" in values:
                            known = [g["percent"] for g in values["gpus"] if g.get("percent") is not None]
                            self.history["gpu"].append(max(known) if known else None)
                except Exception as error:
                    with self.lock:
                        self.data["errors"][name] = str(error)
                self.stop.wait(max(0.1, interval - (time.monotonic() - started)))
        thread = threading.Thread(target=run, daemon=True, name="monitor-cli-" + name)
        self.threads.append(thread)
        thread.start()

    def snapshot(self):
        with self.lock:
            value = copy.deepcopy(self.data)
            value["history"] = {k: list(v) for k, v in self.history.items()}
            value["action_message"] = self.action_message
        value["sampled_at"] = time.time()
        value["connectivity"] = self.connectivity.get()
        if "media" in self.config.modules and self.config.cava:
            value["audio"] = self.audio.get()
        else:
            value["audio"] = {"bars": [], "available": False, "error": "Spectrum disabled"}
        value["note"] = read_note(self.config.note_file) if "note" in self.config.modules else ""
        return value

    def wait_initial(self, timeout):
        expected = set()
        if set(self.config.modules) & {"cpu", "ram"}:
            expected.add("system")
        if "gpu" in self.config.modules:
            expected.add("gpu")
        if "media" in self.config.modules:
            expected.add("media")
        if "ping" in self.config.modules:
            expected.update("ping:" + t.host for t in self.config.targets)
        deadline = time.monotonic() + timeout
        # Bound waiting; unfinished modules stay explicitly unknown.
        while time.monotonic() < deadline:
            with self.lock:
                ready = expected <= (set(self.data["updated"]) | set(self.data["errors"]))
            if set(self.config.modules) & {"proton", "wifi", "bluetooth"}:
                ready = ready and self.connectivity.get()["checked_at"] is not None
            if ready:
                return
            self.stop.wait(0.05)

    def toggle(self, service):
        with self.lock:
            if self.action_pending:
                return
            self.action_pending = True
            self.action_message = "Updating playback..."
        def action():
            try:
                collectors.toggle_media(service)
                result = "Playback toggled"
                value = collectors.media_snapshot()
                with self.lock:
                    self.data["media"] = value
            except Exception as error:
                result = str(error)
            with self.lock:
                self.action_message = result
                self.action_pending = False
        thread = threading.Thread(target=action, daemon=True, name="monitor-cli-playback")
        self.threads.append(thread)
        thread.start()

    def close(self):
        self.stop.set()
        self.connectivity.stop.set()
        self.audio.stop.set()
        # Wait for CAVA to terminate and reap its subprocess. Other probes have
        # their own timeouts and daemon threads never block a dashboard reload.
        if self.audio.thread.is_alive():
            self.audio.thread.join(timeout=4)
