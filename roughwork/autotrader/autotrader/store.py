"""SQLite persistence for orders, fills, equity history, events and key/value state."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .models import Fill, Order, to_dict

EVENT_LEVELS: frozenset[str] = frozenset({"info", "warn", "error", "trade"})

_SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    status TEXT NOT NULL,
    submitted_ts REAL NOT NULL,
    filled_qty REAL NOT NULL DEFAULT 0,
    filled_avg_price REAL,
    reason TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'market'
);
CREATE INDEX IF NOT EXISTS orders_ts ON orders(submitted_ts);
CREATE TABLE IF NOT EXISTS fills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    commission REAL NOT NULL DEFAULT 0,
    ts REAL NOT NULL,
    realized_pnl REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS fills_ts ON fills(ts);
CREATE TABLE IF NOT EXISTS equity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    equity REAL NOT NULL,
    cash REAL NOT NULL,
    allocation REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS equity_ts ON equity(ts);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def _json_default(obj: Any) -> Any:
    return to_dict(obj)


class Store:
    """Thread-safe SQLite store. Recent-* queries return newest first; time series return oldest first."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._depth = 0  # nesting level of transaction()
        self._conn = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            if db_path != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(_SCHEMA)

    @property
    def lock(self) -> threading.RLock:
        """The store's reentrant lock. Components that write to the store while holding their
        own lock share this one instead, so no two locks can be taken in opposite orders."""
        return self._lock

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """Make every write inside the block one atomic SQLite transaction (nestable).

        Other threads' reads and writes wait until it ends; an exception rolls the block back,
        and a process that dies inside it leaves none of its writes behind.
        """
        with self._lock:
            if self._depth:
                self._depth += 1
                try:
                    yield
                finally:
                    self._depth -= 1
                return
            self._conn.execute("BEGIN IMMEDIATE")
            self._depth = 1
            try:
                yield
            except BaseException:
                self._depth = 0
                try:
                    self._conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
            self._depth = 0
            self._conn.execute("COMMIT")

    def _write(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._lock:
            self._conn.execute(sql, params)

    def _query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def record_order(self, order: Order) -> None:
        """Insert or update an order by id."""
        self._write(
            """INSERT INTO orders (id, symbol, side, qty, status, submitted_ts, filled_qty,
                                   filled_avg_price, reason, type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                   symbol=excluded.symbol, side=excluded.side, qty=excluded.qty,
                   status=excluded.status, submitted_ts=excluded.submitted_ts,
                   filled_qty=excluded.filled_qty, filled_avg_price=excluded.filled_avg_price,
                   reason=excluded.reason, type=excluded.type""",
            (order.id, order.symbol, order.side, order.qty, order.status, order.submitted_ts,
             order.filled_qty, order.filled_avg_price, order.reason, order.type),
        )

    def record_fill(self, fill: Fill, realized_pnl: float = 0.0) -> None:
        """Append a fill with the realized P&L it produced."""
        self._write(
            """INSERT INTO fills (order_id, symbol, side, qty, price, commission, ts, realized_pnl)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (fill.order_id, fill.symbol, fill.side, fill.qty, fill.price, fill.commission,
             fill.ts, realized_pnl),
        )

    def record_equity(self, ts: float, equity: float, cash: float, allocation: float) -> None:
        """Append one equity-curve point."""
        self._write(
            "INSERT INTO equity (ts, equity, cash, allocation) VALUES (?, ?, ?, ?)",
            (ts, equity, cash, allocation),
        )

    def log_event(self, level: str, message: str, ts: float | None = None) -> None:
        """Append an event; ``level`` is one of info, warn, error, trade."""
        if level not in EVENT_LEVELS:
            raise ValueError(f"invalid event level: {level!r}")
        self._write(
            "INSERT INTO events (ts, level, message) VALUES (?, ?, ?)",
            (time.time() if ts is None else ts, level, message),
        )

    def get_kv(self, key: str, default: Any = None) -> Any:
        """Return the JSON-decoded value for ``key`` or ``default``."""
        with self._lock:
            row = self._conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return default if row is None else json.loads(row["value"])

    def set_kv(self, key: str, value: Any) -> None:
        """Store ``value`` JSON-encoded under ``key`` (dataclasses are converted via to_dict)."""
        encoded = json.dumps(value, default=_json_default)
        self._write(
            "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, encoded),
        )

    def recent_fills(self, limit: int = 100) -> list[dict[str, Any]]:
        """Most recent fills, newest first."""
        return self._query(
            """SELECT order_id, symbol, side, qty, price, commission, ts, realized_pnl
               FROM fills ORDER BY ts DESC, id DESC LIMIT ?""",
            (int(limit),),
        )

    def recent_orders(self, limit: int = 100) -> list[dict[str, Any]]:
        """Most recent orders, newest first."""
        return self._query(
            """SELECT id, symbol, side, qty, status, submitted_ts, filled_qty, filled_avg_price,
                      reason, type
               FROM orders ORDER BY submitted_ts DESC, rowid DESC LIMIT ?""",
            (int(limit),),
        )

    def equity_curve(self, limit: int = 2000) -> list[dict[str, Any]]:
        """The latest ``limit`` equity points, oldest first."""
        rows = self._query(
            "SELECT ts, equity, cash, allocation FROM equity ORDER BY ts DESC, id DESC LIMIT ?",
            (int(limit),),
        )
        rows.reverse()
        return rows

    def recent_events(self, limit: int = 200) -> list[dict[str, Any]]:
        """Most recent events, newest first."""
        return self._query(
            "SELECT ts, level, message FROM events ORDER BY ts DESC, id DESC LIMIT ?",
            (int(limit),),
        )

    def realized_pnl_total(self) -> float:
        """Sum of realized P&L across all fills."""
        with self._lock:
            row = self._conn.execute("SELECT COALESCE(SUM(realized_pnl), 0) AS total FROM fills").fetchone()
        return float(row["total"])

    def fills_since(self, ts: float) -> list[dict[str, Any]]:
        """Fills with ``ts`` at or after the given time, oldest first."""
        return self._query(
            """SELECT order_id, symbol, side, qty, price, commission, ts, realized_pnl
               FROM fills WHERE ts >= ? ORDER BY ts ASC, id ASC""",
            (ts,),
        )

    def close(self) -> None:
        """Close the database connection."""
        with self._lock:
            self._conn.close()
