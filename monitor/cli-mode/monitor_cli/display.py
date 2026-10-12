"""Shared card rendering for the interactive display and plain snapshots."""
from __future__ import annotations
from dataclasses import dataclass
import math
import time
import unicodedata

from .config import Config


def clean(text):
    return "".join(" " if unicodedata.category(c).startswith("C") else c for c in str(text))


def cells(text):
    return sum(0 if unicodedata.combining(c) else 2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in text)


def clip(text, width):
    result = ""
    used = 0
    for c in clean(text):
        size = cells(c)
        if used + size > max(0, width):
            break
        if size or result:
            result += c
        used += size
    return result


def pad(text, width):
    value = clip(text, width)
    return value + " " * max(0, width - cells(value))


def percent(value):
    return f"{value:.1f}%" if isinstance(value, (int, float)) and math.isfinite(value) else "--"


def temperature(value):
    return f"{value:.0f} C" if isinstance(value, (int, float)) and math.isfinite(value) else "--"


def memory(value):
    return f"{value / 1073741824:.1f} GiB" if isinstance(value, (int, float)) else "--"


def clock(value):
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return "--:--"
    seconds = max(0, int(value))
    return f"{seconds // 60}:{seconds % 60:02d}"


def bar(value, width, unicode=True):
    width = max(1, width)
    if value is None:
        return "?" * width
    count = round(min(1, max(0, value / 100)) * width)
    return ("█" if unicode else "#") * count + ("░" if unicode else "-") * (width - count)


def spark(values, width, unicode=True, maximum=100):
    alphabet = "▁▂▃▄▅▆▇█" if unicode else " .:-=+*#"
    return "".join("?" if v is None else alphabet[round(min(1, max(0, v / maximum)) * 7)] for v in values[-max(1, width):])


def choose_player(snapshot, service=""):
    players = snapshot.get("media", {}).get("players", [])
    if service:
        return next((p for p in players if p["service"] == service), None)
    return players[0] if players else None


@dataclass
class Card:
    key: str
    title: str
    lines: list[str]


def cards(config: Config, snapshot, width, selected=""):
    output = []
    width = max(1, width)
    histories = snapshot.get("history", {})
    connected = snapshot.get("connectivity", {})
    for key in config.modules:
        lines = []
        title = key.upper()
        source = "system" if key in ("cpu", "ram") else key
        updated = snapshot.get("updated", {}).get(source)
        if key in ("cpu", "ram", "gpu", "media"):
            interval = 2 if key == "media" else config.refresh_seconds
            if not updated or time.time() - updated > max(5, interval * 3):
                title += " / waiting" if not updated else " / stale"
            error = snapshot.get("errors", {}).get(source)
            if error:
                lines.append("Collector error: " + error)
        if key == "cpu":
            cpu = snapshot.get("cpu", {})
            lines += [f"{percent(cpu.get('percent'))}  {cpu.get('cores', '--')} cores  {temperature(cpu.get('temperature'))}",
                      bar(cpu.get("percent"), width, config.unicode),
                      spark(histories.get("cpu", []), width, config.unicode)]
        elif key == "ram":
            ram = snapshot.get("ram", {})
            lines += [f"{percent(ram.get('percent'))}  {memory(ram.get('used'))} / {memory(ram.get('total'))}",
                      bar(ram.get("percent"), width, config.unicode),
                      spark(histories.get("ram", []), width, config.unicode),
                      "Swap: " + memory(ram.get("swap_used"))]
        elif key == "gpu":
            gpus = snapshot.get("gpus", [])
            if not gpus:
                lines.append("No readable GPU telemetry")
            for gpu in gpus:
                lines += [f"{gpu['name']}  {percent(gpu.get('percent'))}  {temperature(gpu.get('temperature'))}",
                          bar(gpu.get("percent"), width, config.unicode), str(gpu.get("scope", ""))]
                if gpu.get("memory_total_mib"):
                    lines.append(f"VRAM: {gpu.get('memory_used_mib', '--')} / {gpu['memory_total_mib']} MiB")
            lines.append(spark(histories.get("gpu", []), width, config.unicode))
        elif key == "ping":
            if not config.targets:
                lines += ["No ping targets configured", "Add [ping].targets in TOML"]
            for ping in snapshot.get("pings", []):
                latency = ping.get("ms")
                value = f"{'<' if ping.get('less_than') else ''}{latency:g} ms" if latency is not None else ping.get("status", "Checking...")
                checked = ping.get("checked_at")
                if checked and time.time() - checked > config.ping_interval * 3:
                    value += " (stale)"
                lines.append(f"{ping['label']}: {value}")
        elif key == "media":
            player = choose_player(snapshot, selected or config.media_service)
            if player is None:
                lines.append("Configured player unavailable" if selected or config.media_service else snapshot.get("media", {}).get("error") or "No MPRIS player")
            else:
                lines += [f"{player['name']} / {player['status']}", player.get("title") or "No track title"]
                if player.get("artist"):
                    lines.append(player["artist"])
                position, duration = player.get("position"), player.get("duration")
                if position is not None and player["status"] == "Playing":
                    position += max(0, time.time() - player.get("observed_at", time.time())) * player.get("rate", 1)
                if duration and position is not None:
                    position = min(position, duration)
                    lines += [bar(position / duration * 100, width, config.unicode), f"{clock(position)} / {clock(duration)}"]
                else:
                    lines.append("Playback progress unavailable")
                lines.append("Space: play/pause   n: next player")
            if config.cava:
                audio = snapshot.get("audio", {})
                if audio.get("available"):
                    lines.append(spark(audio.get("bars", []), width, config.unicode, maximum=1))
                else:
                    lines.append("Audio: " + (audio.get("error") or "Waiting for playback monitor"))
        elif key in ("proton", "wifi", "bluetooth"):
            if connected.get("stale", True):
                title += " / stale" if connected.get("checked_at") else " / waiting"
            value = connected.get(key, {})
            if key == "proton":
                state = value.get("connected")
                lines += ["Connected: " + str(value.get("server", "")) if state is True else "Disconnected" if state is False else "VPN state unavailable",
                          "Kill switch mode: " + str(value.get("kill_switch") or "Unknown"), "From NetworkManager / Proton settings"]
            elif key == "wifi":
                enabled, state = value.get("enabled"), value.get("connected")
                lines.append("Radio: " + ("on" if enabled is True else "off" if enabled is False else "unknown"))
                lines.append("Network: " + str(value.get("network")) if state is True else "Disconnected" if state is False else "NetworkManager unavailable")
            else:
                enabled = value.get("enabled")
                lines.append("Radio: " + ("on" if enabled is True else "off" if enabled is False else "unknown"))
                lines += value.get("devices", []) or ["No connected Bluetooth devices"]
        elif key == "note":
            text = snapshot.get("note", "")
            note_lines = text.splitlines()
            lines = note_lines[:6] or ["Empty note"]
            if len(note_lines) > 6 or len(text) >= 16384:
                lines.append("... more in note file")
            lines.append("e: edit  /  " + str(config.note_file))
        output.append(Card(key, title, lines))
    return output


def plain(config, snapshot, width=80):
    inner = max(1, width - 4)
    rows = ["MONITOR CLI  " + time.strftime("%Y-%m-%d %H:%M:%S"), ""]
    for card in cards(config, snapshot, inner):
        rows.append("+ " + pad(card.title + " ", inner) + " +")
        rows += ["| " + pad(line, inner) + " |" for line in card.lines]
        rows.append("+" + "-" * (inner + 2) + "+")
    return "\n".join(rows)
