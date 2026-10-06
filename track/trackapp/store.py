"""SQLite archive; one durable transaction for an entire received batch."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager, closing
from pathlib import Path
from .protocol import parse_batch


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS batches (
                    hash TEXT PRIMARY KEY, received_ms INTEGER NOT NULL,
                    raw BLOB NOT NULL, event_count INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY, hash TEXT UNIQUE NOT NULL, raw TEXT NOT NULL,
                    ms INTEGER, day TEXT, lon REAL, lat REAL, accuracy REAL, altitude REAL,
                    device TEXT, device_key TEXT, motion TEXT);
                CREATE INDEX IF NOT EXISTS events_day ON events(day, id);
                CREATE TABLE IF NOT EXISTS notes (
                    day TEXT PRIMARY KEY, text TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA busy_timeout=15000")
        try:
            with db:
                yield db
        finally:
            db.close()

    def ingest(self, body):
        _, events = parse_batch(body)
        batch_hash = hashlib.sha256(body).hexdigest()
        received = int(time.time() * 1000)
        added = 0
        with self.connect() as db:
            # Acquires the write lock before inspecting whether the batch is already saved.
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT OR IGNORE INTO batches VALUES (?, ?, ?, ?)",
                       (batch_hash, received, body, len(events)))
            for event in events:
                p = event["point"] or {}
                result = db.execute("""INSERT OR IGNORE INTO events
                    (hash,raw,ms,day,lon,lat,accuracy,altitude,device,device_key,motion)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (event["hash"], event["raw"], *(p.get(k) for k in
                     ("ms", "day", "lon", "lat", "accuracy", "altitude", "device", "device_key", "motion"))))
                added += result.rowcount
            db.execute("INSERT OR REPLACE INTO state VALUES ('last_sync', ?)", (str(received),))
        return added

    def overview(self):
        with self.connect() as db:
            days = [dict(row) for row in db.execute("""SELECT day, COUNT(*) AS count,
                MIN(ms) AS first_ms, MAX(ms) AS last_ms FROM events WHERE ms IS NOT NULL
                GROUP BY day ORDER BY day DESC""")]
            devices = [dict(row) for row in db.execute("""SELECT device_key AS key,
                MAX(device) AS name, COUNT(*) AS count FROM events WHERE ms IS NOT NULL
                GROUP BY device_key ORDER BY name""")]
            count, max_id = db.execute("SELECT COUNT(*), COALESCE(MAX(id), 0) FROM events WHERE ms IS NOT NULL").fetchone()
            batches = db.execute("SELECT COUNT(*) FROM batches").fetchone()[0]
            state = db.execute("SELECT value FROM state WHERE key='last_sync'").fetchone()
            notes = {row["day"]: row["text"] for row in db.execute("SELECT * FROM notes")}
        return {"days": days, "devices": devices, "count": count, "max_id": max_id,
                "batches": batches, "last_sync": int(state[0]) if state else None, "notes": notes}

    def points(self, day=None, device=None, after=0, through=None, limit=5000):
        where = ["ms IS NOT NULL", "id > ?"]
        args = [after]
        if through is not None:
            where.append("id <= ?")
            args.append(through)
        if day:
            where.append("day = ?")
            args.append(day)
        if device:
            where.append("device_key = ?")
            args.append(device)
        with self.connect() as db:
            rows = db.execute(f"""SELECT id, ms, lon, lat, accuracy, altitude, device,
                device_key, motion FROM events WHERE {' AND '.join(where)} ORDER BY id LIMIT ?""",
                (*args, limit + 1)).fetchall()
        more = len(rows) > limit
        points = [dict(row) for row in rows[:limit]]
        for p in points:
            p["motion"] = json.loads(p["motion"])
        return {"points": points, "more": more, "after": points[-1]["id"] if points else after}

    def note(self, day, text):
        with self.connect() as db:
            if text:
                db.execute("INSERT OR REPLACE INTO notes VALUES (?, ?)", (day, text))
            else:
                db.execute("DELETE FROM notes WHERE day = ?", (day,))

    def backup(self, destination):
        with self.connect() as source, closing(sqlite3.connect(destination)) as target:
            source.backup(target)
