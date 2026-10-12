"""Strict, dependency-free TOML configuration."""
from __future__ import annotations
from dataclasses import dataclass
import os
from pathlib import Path
import shlex
import tomllib

from .collectors import normalize_host

MODULES = ("cpu", "ram", "gpu", "ping", "media", "proton", "wifi", "bluetooth", "note")


class ConfigError(ValueError):
    pass


def default_path() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "monitor-cli/config.toml"


@dataclass(frozen=True)
class Target:
    label: str
    host: str


@dataclass(frozen=True)
class Config:
    path: Path
    modules: tuple[str, ...] = MODULES
    columns: int = 2
    refresh_seconds: float = 2.0
    history_size: int = 60
    color: bool = True
    unicode: bool = True
    ping_interval: float = 5.0
    targets: tuple[Target, ...] = ()
    media_service: str = ""
    cava: bool = True
    note_file: Path = Path("notes.txt")
    editor: str = ""


def table(value, allowed, name):
    if not isinstance(value, dict):
        raise ConfigError(f"{name} must be a TOML table")
    unknown = set(value) - set(allowed)
    if unknown:
        raise ConfigError(f"Unknown {name} setting: {', '.join(sorted(unknown))}")
    return value


def number(data, key, default, low, high, integer=False):
    value = data.get(key, default)
    expected = (int,) if integer else (int, float)
    if isinstance(value, bool) or not isinstance(value, expected) or not low <= value <= high:
        raise ConfigError(f"{key} must be {'an integer' if integer else 'a number'} between {low} and {high}")
    return value


def boolean(data, key, default):
    value = data.get(key, default)
    if not isinstance(value, bool):
        raise ConfigError(f"{key} must be true or false")
    return value


def string(data, key, default="", limit=4096):
    value = data.get(key, default)
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ConfigError(f"{key} must be a single-line string of at most {limit} characters")
    return value


def load_config(path: Path, required=False) -> Config:
    path = path.expanduser().resolve()
    try:
        if path.stat().st_size > 65536:
            raise ConfigError("Config exceeds 64 KiB")
        with path.open("rb") as stream:
            data = tomllib.load(stream)
    except FileNotFoundError:
        if required:
            raise ConfigError(f"Config does not exist: {path}") from None
        data = {}
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ConfigError(f"Cannot read {path}: {error}") from error
    table(data, ("dashboard", "ping", "media", "note"), "top-level")
    dashboard = table(data.get("dashboard", {}), ("modules", "columns", "refresh_seconds", "history_size", "color", "unicode"), "dashboard")
    ping = table(data.get("ping", {}), ("interval_seconds", "targets"), "ping")
    media = table(data.get("media", {}), ("service", "cava"), "media")
    note = table(data.get("note", {}), ("file", "editor"), "note")
    modules = dashboard.get("modules", list(MODULES))
    if (not isinstance(modules, list) or not modules or
            any(not isinstance(m, str) or m not in MODULES for m in modules) or len(set(modules)) != len(modules)):
        raise ConfigError(f"modules must be a nonempty list of unique names: {', '.join(MODULES)}")
    raw_targets = ping.get("targets", [])
    if not isinstance(raw_targets, list) or len(raw_targets) > 8:
        raise ConfigError("ping.targets must contain at most eight tables")
    targets = []
    for item in raw_targets:
        table(item, ("label", "host"), "ping target")
        host = string(item, "host", limit=2048)
        try:
            normalize_host(host)
        except ValueError as error:
            raise ConfigError(f"Invalid ping target: {error}") from error
        label = string(item, "label", host, limit=80)
        if not label:
            raise ConfigError("Ping labels cannot be empty")
        targets.append(Target(label, host))
    if len({t.host for t in targets}) != len(targets):
        raise ConfigError("Ping hosts must be unique")
    service = string(media, "service", limit=255)
    if service and not service.startswith("org.mpris.MediaPlayer2."):
        raise ConfigError("media.service must be empty or an org.mpris.MediaPlayer2.* name")
    note_path = string(note, "file", "notes.txt")
    if not note_path:
        raise ConfigError("note.file cannot be empty")
    note_file = Path(note_path).expanduser()
    if not note_file.is_absolute():
        note_file = path.parent / note_file
    editor = string(note, "editor")
    try:
        if editor and not shlex.split(editor):
            raise ValueError("empty command")
        shlex.split(editor)
    except ValueError as error:
        raise ConfigError(f"Invalid note.editor: {error}") from error
    return Config(path=path, modules=tuple(modules),
                  columns=number(dashboard, "columns", 2, 1, 3, True),
                  refresh_seconds=number(dashboard, "refresh_seconds", 2.0, 0.5, 60),
                  history_size=number(dashboard, "history_size", 60, 5, 600, True),
                  color=boolean(dashboard, "color", True), unicode=boolean(dashboard, "unicode", True),
                  ping_interval=number(ping, "interval_seconds", 5.0, 2, 300), targets=tuple(targets),
                  media_service=service, cava=boolean(media, "cava", True), note_file=note_file, editor=editor)


def init_config(path: Path):
    path = path.expanduser()
    template = Path(__file__).resolve().parent.parent / "config.example.toml"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x") as stream:
            stream.write(template.read_text())
    except FileExistsError:
        raise ConfigError(f"Refusing to overwrite existing config: {path}") from None
