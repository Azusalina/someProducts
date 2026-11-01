"""Shared pytest fixtures; puts the project root on sys.path."""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from autotrader.config import Config, demo_config  # noqa: E402
from autotrader.store import Store  # noqa: E402


@pytest.fixture
def store(tmp_path: Path) -> Iterator[Store]:
    """A fresh Store backed by a temporary SQLite file."""
    s = Store(str(tmp_path / "test.db"))
    yield s
    s.close()


@pytest.fixture
def demo_cfg(tmp_path: Path) -> Config:
    """The demo Config (sim, synthetic, no market hours) with its database in tmp_path."""
    cfg = demo_config()
    cfg.db_path = str(tmp_path / "demo.db")
    return cfg
