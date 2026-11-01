"""Engine locking, operator controls during a busy cycle, and shutdown: offline."""

from __future__ import annotations

import signal
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import requests

import run
from autotrader import engine as engine_mod
from autotrader.broker import PaperBroker
from autotrader.config import Config, demo_config
from autotrader.data import MarketData, SyntheticData, YahooData
from autotrader.engine import Engine, EngineBusy
from autotrader.models import Bar
from autotrader.store import Store

FAST = 0.5  # seconds a control may take while the engine lock is held elsewhere


class Clock:
    def __init__(self, t: float = 1_793_000_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        self.t += 300.0
        return self.t


@pytest.fixture
def short_waits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine_mod, "CONTROL_WAIT_SECONDS", 0.05)
    monkeypatch.setattr(engine_mod, "SNAPSHOT_WAIT_SECONDS", 0.05)


@pytest.fixture
def demo(tmp_path: Path) -> Iterator[tuple[Engine, Store]]:
    cfg = demo_config()
    cfg.db_path = str(tmp_path / "demo.db")
    store = Store(cfg.db_path)
    data = SyntheticData(seed=3)
    broker = PaperBroker(store, data.get_price, cfg.initial_fund)
    engine = Engine(cfg, data, broker, store, clock=Clock())
    yield engine, store
    store.close()


def hold_lock(lock: Any) -> tuple[threading.Event, threading.Thread]:
    """Hold ``lock`` from another thread (a busy trading cycle) until the returned event is set."""
    held, release = threading.Event(), threading.Event()

    def worker() -> None:
        with lock:
            held.set()
            release.wait(10)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    assert held.wait(5)
    return release, thread


def open_positions(engine: Engine, minimum: int = 2) -> None:
    for _ in range(300):
        engine.tick()
        if len(engine.snapshot()["positions"]) >= minimum:
            return
    raise AssertionError("engine never opened positions")


# ---------------------------------------------------------------- network I/O stays outside the lock


class ChartResponse:
    """A healthy Yahoo chart response quoting 101.5."""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        quote = {k: [100.0, 101.0] for k in ("open", "high", "low", "close")}
        return {"chart": {"error": None, "result": [{
            "meta": {"regularMarketPrice": 101.5}, "timestamp": [1000, 1300],
            "indicators": {"quote": [{**quote, "volume": [1000, 1000]}]}}]}}


class ProbeSession:
    """Yahoo stub that records, per request, whether the engine lock was held."""

    def __init__(self) -> None:
        self.engine: Engine | None = None
        self.fail = False
        self.calls: list[tuple[str, bool]] = []

    def get(self, url: str, **_: Any) -> ChartResponse:
        owned = bool(self.engine is not None and self.engine._lock._is_owned())  # noqa: SLF001
        self.calls.append((url.rsplit("/", 1)[-1], owned))
        if self.fail:
            raise requests.ConnectionError("yahoo down")
        return ChartResponse()


def test_failing_feed_is_never_queried_under_the_engine_lock(tmp_path: Path) -> None:
    cfg: Config = demo_config()
    cfg.db_path = str(tmp_path / "e.db")
    cfg.enable_crypto, cfg.universe, cfg.fund_scope = False, ["AAPL", "MSFT", "KO"], "full_account"
    store = Store(cfg.db_path)
    session = ProbeSession()
    feed = YahooData(session=session)  # type: ignore[arg-type]
    broker = PaperBroker(store, feed.get_price, cfg.initial_fund)
    for sym in ("AAPL", "MSFT", "JNJ"):
        assert broker.submit_order(sym, "buy", 1.0).status == "filled"
    engine = Engine(cfg, feed, broker, store, clock=Clock())
    session.engine, session.fail = engine, True
    session.calls.clear()
    engine.tick()
    store.close()
    assert session.calls, "the tick should have tried the feed"
    assert not [c for c in session.calls if c[1]], "network requests made while holding the engine lock"
    per_symbol: dict[str, int] = {}
    for sym, _ in session.calls:
        per_symbol[sym] = per_symbol.get(sym, 0) + 1
    assert max(per_symbol.values()) <= 2  # bars once, price once: failures are cached for the tick


# ---------------------------------------------------------------- controls during a busy cycle


def test_controls_do_not_wait_for_a_busy_cycle(demo: tuple[Engine, Store], short_waits: None) -> None:
    engine, store = demo
    open_positions(engine)
    engine.snapshot()
    release, holder = hold_lock(engine._lock)  # noqa: SLF001
    try:
        started = time.monotonic()
        engine.pause()
        assert engine.kill("test") == []  # queued
        snap = engine.snapshot()
        with pytest.raises(EngineBusy):
            engine.adjust_fund(100.0)
        with pytest.raises(EngineBusy):
            engine.set_universe(["AAPL"])
        assert time.monotonic() - started < FAST * 4
        assert engine.paused and engine.risk.halted and engine.risk.liquidating  # effective at once
        assert snap["busy"] is True and snap["status"] == "halted" and snap["paused"] is True
        assert snap["queued_controls"] == ["pause", "kill"]
    finally:
        release.set()
        holder.join(5)
    summary = engine.tick()
    assert any(o["side"] == "sell" for o in summary["orders"])
    assert engine.broker.get_positions() == {}
    messages = [e["message"] for e in store.recent_events()]
    assert any("kill switch engaged: test" in m for m in messages)
    assert any("queued" in m for m in messages)
    assert engine.snapshot()["busy"] is False


@pytest.mark.parametrize(("first", "second", "halted"), [("resume", "kill", True), ("kill", "resume", False)])
def test_queued_controls_apply_in_order(demo: tuple[Engine, Store], short_waits: None,
                                        first: str, second: str, halted: bool) -> None:
    engine, _ = demo
    release, holder = hold_lock(engine._lock)  # noqa: SLF001
    try:
        for action in (first, second):
            getattr(engine, action)()
    finally:
        release.set()
        holder.join(5)
    engine.tick()
    assert engine.risk.halted is halted


def test_queued_liquidation_stops_a_running_cycle_placing_orders(demo: tuple[Engine, Store],
                                                                 monkeypatch: pytest.MonkeyPatch) -> None:
    engine, _ = demo
    open_positions(engine)
    check_exits = engine.risk.check_exits

    def liquidation_arrives(*args: Any) -> list[tuple[str, str]]:
        with engine._requests_lock:  # noqa: SLF001 - queued by a dashboard thread mid-cycle
            engine._requests.append(("liquidate", "queued"))  # noqa: SLF001
        return check_exits(*args)

    monkeypatch.setattr(engine.risk, "check_exits", liquidation_arrives)
    summary = engine.tick()
    assert summary["orders"] and all(o["reason"] == "liquidate: queued" for o in summary["orders"])
    assert summary["entry_block"] == "operator liquidation pending"
    assert engine.broker.get_positions() == {}


def test_controls_queued_before_a_tick_are_reported_in_its_summary(demo: tuple[Engine, Store]) -> None:
    engine, _ = demo
    open_positions(engine)
    held = set(engine.broker.get_positions())
    with engine._requests_lock:  # noqa: SLF001 - queued while the previous cycle was busy
        engine._requests.append(("liquidate", "queued"))  # noqa: SLF001
    summary = engine.tick()
    sold = {o["symbol"] for o in summary["orders"] if o["reason"] == "liquidate: queued"}
    assert sold == held


# ---------------------------------------------------------------- shutdown


class StopOnFirstBars(MarketData):
    def __init__(self, stop: threading.Event) -> None:
        self.inner = SyntheticData(seed=1)
        self.stop = stop

    def refresh(self) -> None:
        self.inner.refresh()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        self.stop.set()
        return self.inner.get_bars(symbol, interval, lookback)

    def get_price(self, symbol: str) -> float | None:
        return self.inner.get_price(symbol)


def test_stop_abandons_the_cycle_before_trading(tmp_path: Path) -> None:
    cfg = demo_config()
    cfg.db_path = str(tmp_path / "s.db")
    store = Store(cfg.db_path)
    stop = threading.Event()
    data = StopOnFirstBars(stop)
    engine = Engine(cfg, data, PaperBroker(store, data.get_price, cfg.initial_fund), store, clock=Clock())
    engine.run_forever(stop)
    assert engine.tick_count == 0 and store.equity_curve() == [] and store.recent_orders() == []
    store.close()


class HungEngine:
    """Stands in for an engine whose cycle ignores the stop request."""

    def __init__(self, hang: bool) -> None:
        self.hang = hang
        self.release = threading.Event()

    def run_forever(self, stop: threading.Event) -> None:
        stop.set()  # as if Ctrl-C arrived mid-cycle
        if self.hang:
            self.release.wait(10)


@pytest.mark.parametrize("hang", [True, False])
def test_serve_reports_whether_the_engine_stopped(monkeypatch: pytest.MonkeyPatch, hang: bool) -> None:
    monkeypatch.setattr(run, "SHUTDOWN_WAIT_SECONDS", 0.1)
    saved = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
    fake = HungEngine(hang)
    try:
        code, stopped = run.serve(fake, demo_config(), no_server=True)  # type: ignore[arg-type]
    finally:
        fake.release.set()
        for signum, handler in saved.items():
            signal.signal(signum, handler)
    assert (code, stopped) == ((1, False) if hang else (0, True))


def test_kill_during_an_order_transaction_cannot_deadlock(tmp_path: Path) -> None:
    """The engine notes a trade inside a store transaction while the HTTP thread halts (kill)."""
    from autotrader.config import RiskConfig
    from autotrader.risk import RiskManager

    store = Store(str(tmp_path / "lock.db"))
    risk = RiskManager(RiskConfig(), store)
    assert risk._lock is store.lock  # one lock: no opposite acquisition orders exist
    inside = threading.Event()

    def engine_side() -> None:
        with store.transaction():  # as PaperBroker.atomic() holds it while an order fills
            inside.set()
            time.sleep(0.2)
            risk.note_trade("AAPL", "buy", time.time())

    workers = [threading.Thread(target=engine_side),
               threading.Thread(target=lambda: (inside.wait(), risk.halt("kill switch: test")))]
    for w in workers:
        w.start()
    for w in workers:
        w.join(timeout=5)
    assert not any(w.is_alive() for w in workers), "deadlock between order placement and kill"
    assert risk.halted
    store.close()
