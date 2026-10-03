"""Curses alternate-screen dashboard; quitting restores the calling terminal."""
from __future__ import annotations
import curses
import os
import shlex
import socket
import subprocess
import time

from .config import ConfigError, load_config
from .display import Card, cards, cells, choose_player, clip, pad
from .engine import Engine


class Dashboard:
    def __init__(self, screen, config, required=False):
        self.screen = screen
        self.config = config
        self.required = required
        self.engine = Engine(config)
        self.engine.start()
        self.scroll = 0
        self.selected = ""
        self.message = ""
        self.paused = False
        self.help = False
        self.snapshot = self.engine.snapshot()
        self.colors = False
        self.setup()

    def setup(self):
        try:
            curses.curs_set(0)
        except curses.error:
            pass
        self.screen.keypad(True)
        self.screen.timeout(200)
        self.colors = self.config.color and "NO_COLOR" not in os.environ and curses.has_colors()
        if self.colors:
            curses.start_color()
            try:
                curses.use_default_colors()
                background = -1
            except curses.error:
                background = curses.COLOR_BLACK
            for index, foreground in enumerate((curses.COLOR_CYAN, curses.COLOR_GREEN, curses.COLOR_YELLOW, curses.COLOR_RED), 1):
                curses.init_pair(index, foreground, background)

    def ink(self, index=1):
        return curses.color_pair(index) if self.colors else 0

    def put(self, y, x, text, width, attr=0):
        height, columns = self.screen.getmaxyx()
        if y < 0 or y >= height or x < 0 or x >= columns or width <= 0:
            return
        value = clip(text, min(width, columns - x))
        try:
            self.screen.addstr(y, x, value, attr)
        except curses.error:
            # Writing the lower-right cell may report ERR after drawing it.
            pass

    def draw(self):
        if not self.paused:
            self.snapshot = self.engine.snapshot()
        height, width = self.screen.getmaxyx()
        self.screen.erase()
        if height < 8 or width < 24:
            self.put(0, 0, "MONITOR CLI", width, curses.A_BOLD)
            self.put(2, 0, "Resize terminal (24x8+)", width)
            self.put(4, 0, "q: quit", width)
            self.screen.refresh()
            return
        self.put(0, 1, "MONITOR CLI", width - 2, self.ink() | curses.A_BOLD)
        state = "PAUSED" if self.paused else "LIVE"
        stamp = f"{state}  {time.strftime('%H:%M:%S')}"
        self.put(0, max(14, width - len(stamp) - 1), stamp, len(stamp), self.ink(3 if self.paused else 2))
        self.put(1, 1, f"{socket.gethostname()}  /  {self.config.path}" + (" (defaults)" if not self.config.path.exists() else ""), width - 2, curses.A_DIM)
        columns = min(self.config.columns, max(1, width // 36))
        card_width = (width - 2 - (columns - 1)) // columns
        content = cards(self.config, self.snapshot, card_width - 4, self.selected)
        if self.help:
            content = [Card("help", "KEYS", ["q / Esc / Ctrl+C: quit to shell", "r: reload TOML (invalid drafts keep current settings)", "Space: selected player play/pause", "n: cycle media players", "e: edit configured note in VISUAL / EDITOR / vi", "p: pause/resume display; collectors continue", "Up / Down / j / k: scroll", "PageUp / PageDown: scroll by one screen", "Home / End: first / last card", "? / h: toggle this help", "Config: " + str(self.config.path)])]
            columns = 1
            card_width = width - 2
        groups = [content[i:i + columns] for i in range(0, len(content), columns)]
        group_heights = [max(len(card.lines) for card in group) + 3 for group in groups]
        viewport = height - 6
        total = sum(group_heights)
        self.max_scroll = max(0, total - viewport)
        self.scroll = min(self.max_scroll, max(0, self.scroll))
        top = 3
        offset = 0
        unicode = self.config.unicode
        tl, tr, bl, br, horizontal, vertical = ("┌", "┐", "└", "┘", "─", "│") if unicode else ("+", "+", "+", "+", "-", "|")
        def body_put(y, x, text, limit, attr=0):
            if top <= y < top + viewport:
                self.put(y, x, text, limit, attr)
        for group, group_height in zip(groups, group_heights):
            y = top + offset - self.scroll
            for col, card in enumerate(group):
                x = 1 + col * (card_width + 1)
                inner = card_width - 2
                title = " " + card.title + " "
                title = clip(title, inner)
                border = tl + title + horizontal * max(0, inner - cells(title)) + tr
                body_put(y, x, border, card_width, self.ink() | curses.A_BOLD)
                for row in range(group_height - 3):
                    line = card.lines[row] if row < len(card.lines) else ""
                    body_put(y + row + 1, x, vertical + pad(" " + line, inner) + vertical, card_width)
                body_put(y + group_height - 2, x, bl + horizontal * inner + br, card_width, self.ink())
            offset += group_height
        status = self.message or self.snapshot.get("action_message") or "? help  /  Edit config, then press r"
        if self.max_scroll:
            status += f"  [scroll {self.scroll}/{self.max_scroll}]"
        self.put(height - 3, 1, status, width - 2, self.ink(3))
        self.put(height - 2, 1, "q quit  r reload  Space media  n player  e note  p pause", width - 2, curses.A_DIM)
        self.screen.refresh()

    def reload(self):
        try:
            config = load_config(self.config.path, required=self.required)
        except ConfigError as error:
            self.message = "Reload failed: " + str(error)
            return
        previous = self.engine
        self.config = config
        self.engine = Engine(config)
        self.engine.start()
        previous.close()
        self.selected = ""
        self.scroll = 0
        self.paused = False
        self.message = "Configuration reloaded"
        self.setup()

    def edit_note(self):
        if "note" not in self.config.modules:
            self.message = "Enable the note module in your config first"
            return
        editor = self.config.editor or os.environ.get("VISUAL") or os.environ.get("EDITOR") or "vi"
        try:
            command = shlex.split(editor)
            if not command:
                raise ValueError("No editor configured")
            self.config.note_file.parent.mkdir(parents=True, exist_ok=True)
            # Creating in append mode preserves existing note content.
            with self.config.note_file.open("a"):
                pass
            curses.def_prog_mode()
            curses.endwin()
            try:
                result = subprocess.run([*command, str(self.config.note_file)])
                self.message = "Note updated" if result.returncode == 0 else f"Editor exited with status {result.returncode}"
            finally:
                curses.reset_prog_mode()
                self.screen.clear()
                self.setup()
        except (OSError, ValueError) as error:
            self.message = "Cannot open note editor: " + str(error)

    def key(self, key):
        if key in ("q", "Q", "\x1b", "\x03"):
            return False
        if key in ("?", "h"):
            self.help = not self.help
            self.scroll = 0
        elif key == "r":
            self.reload()
        elif key == "p":
            self.paused = not self.paused
        elif key == "e":
            self.edit_note()
        elif key == " " and "media" in self.config.modules:
            player = choose_player(self.snapshot, self.selected or self.config.media_service)
            self.message = ""
            if player:
                self.engine.toggle(player["service"])
            else:
                self.message = "No selected media player"
        elif key == "n" and "media" in self.config.modules:
            players = self.snapshot.get("media", {}).get("players", [])
            if players:
                current = choose_player(self.snapshot, self.selected or self.config.media_service)
                index = players.index(current) if current else -1
                self.selected = players[(index + 1) % len(players)]["service"]
                self.message = "Selected " + self.selected
        elif key in (curses.KEY_DOWN, "j"):
            self.scroll += 1
        elif key in (curses.KEY_UP, "k"):
            self.scroll = max(0, self.scroll - 1)
        elif key == curses.KEY_NPAGE:
            self.scroll += max(1, self.screen.getmaxyx()[0] - 6)
        elif key == curses.KEY_PPAGE:
            self.scroll = max(0, self.scroll - max(1, self.screen.getmaxyx()[0] - 6))
        elif key == curses.KEY_HOME:
            self.scroll = 0
        elif key == curses.KEY_END:
            self.scroll = getattr(self, "max_scroll", 0)
        elif key == "\x0c":
            self.screen.clear()
        return True

    def run(self):
        try:
            while True:
                self.draw()
                try:
                    key = self.screen.get_wch()
                except curses.error:
                    continue
                if not self.key(key):
                    return
        finally:
            self.engine.close()


def run(config, required=False):
    curses.wrapper(lambda screen: Dashboard(screen, config, required).run())
