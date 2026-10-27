import json
import os
import sqlite3
from pathlib import Path


class Store:
    """One durable snapshot per mode; serialized by the engine lock."""

    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, check_same_thread=False)
        os.chmod(path, 0o600)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("CREATE TABLE IF NOT EXISTS state (mode TEXT PRIMARY KEY, body TEXT NOT NULL)")
        self.db.commit()

    def load(self, mode):
        row = self.db.execute("SELECT body FROM state WHERE mode=?", (mode,)).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, mode, state):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO state VALUES (?,?)",
                            (mode, json.dumps(state, allow_nan=False)))

    def close(self):
        self.db.close()
