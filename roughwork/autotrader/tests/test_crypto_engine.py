"""Crypto in the engine: 24/7 trading beside session-gated stocks, routing, sizing caps, snapshot, universe, API.

Offline only: SyntheticData + PaperBroker, with a fake clock driving the real NYSE calendar.
"""

from __future__ import annotations

import dataclasses
import http.client
import json
import re
import threading
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

import run
from autotrader.broker import PaperBroker, us_market_open
from autotrader.config import Config, demo_config
from autotrader.data import CoinbaseData, MarketData, RoutedData, SyntheticData, YahooData
from autotrader.engine import Engine
from autotrader.models import Bar, asset_class
from autotrader.server import INDEX_PATH, make_server
from autotrader.store import Store

SATURDAY = datetime(2026, 10, 31, 15, 0, tzinfo=timezone.utc).timestamp()  # NYSE closed (weekend)
TUESDAY = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc).timestamp()   # 10:00 ET, NYSE open
STEP = 300.0
TOKEN = "crypto-test-token-0123456789"


class FakeClock:
    """Manually advanced epoch clock."""

    def __init__(self, t: float) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


class ShockData(MarketData):
    """SyntheticData with per-symbol price multipliers, recording the interval requested per symbol."""

    def __init__(self, seed: int = 7) -> None:
        self.inner = SyntheticData(seed=seed)
        self.shock: dict[str, float] = {}
        self.intervals: dict[str, str] = {}

    def refresh(self) -> None:
        self.inner.refresh()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        self.intervals[symbol] = interval
        k = self.shock.get(symbol, 1.0)
        return [dataclasses.replace(b, open=b.open * k, high=b.high * k, low=b.low * k, close=b.close * k)
                for b in self.inner.get_bars(symbol, interval, lookback)]

    def get_price(self, symbol: str) -> float | None:
        price = self.inner.get_price(symbol)
        return None if price is None else price * self.shock.get(symbol, 1.0)


class Rig:
    """Engine + PaperBroker whose market hours follow the real NYSE calendar at the fake clock's time."""

    def __init__(self, tmp_path: Path, start: float = SATURDAY, **overrides: Any) -> None:
        self.cfg: Config = dataclasses.replace(demo_config(), respect_market_hours=True, **overrides)
        self.cfg.db_path = str(tmp_path / "crypto.db")
        self.store = Store(self.cfg.db_path)
        self.data = ShockData()
        self.clock = FakeClock(start)
        self.broker = PaperBroker(
            self.store, self.data.get_price, self.cfg.initial_fund,
            slippage_bps=self.cfg.slippage_bps, crypto_slippage_bps=self.cfg.crypto_slippage_bps,
            fractional=self.cfg.fractional,
            market_hours_fn=lambda: us_market_open(datetime.fromtimestamp(self.clock.t, timezone.utc)))
        self.engine = Engine(self.cfg, self.data, self.broker, self.store, clock=self.clock)

    def tick(self) -> dict[str, Any]:
        self.clock.t += STEP
        return self.engine.tick()

    def run(self, n: int) -> list[dict[str, Any]]:
        return [self.tick() for _ in range(n)]

    def orders(self, side: str | None = None) -> list[dict[str, Any]]:
        rows = self.store.recent_orders(limit=100_000)
        return [o for o in rows if o["status"] != "rejected" and (side is None or o["side"] == side)]


@pytest.fixture
def rig(tmp_path: Path) -> Iterator[Rig]:
    r = Rig(tmp_path)
    yield r
    r.store.close()


def crypto(symbols: Any) -> list[str]:
    return [s for s in symbols if asset_class(s) == "crypto"]


def stocks(symbols: Any) -> list[str]:
    return [s for s in symbols if asset_class(s) == "stock"]


# ---------------------------------------------------------------- market-hours gating


def test_crypto_trades_while_nyse_closed_and_stocks_do_not(rig: Rig) -> None:
    assert not us_market_open(datetime.fromtimestamp(SATURDAY, timezone.utc))
    summaries = rig.run(60)
    first = summaries[0]
    assert first["status"] == "running" and first["market_open"] is True
    assert first["markets"] == {"stocks": {"open": False, "enabled": True, "respect_hours": True},
                                "crypto": {"open": True, "enabled": True}}
    traded = [o["symbol"] for o in rig.orders()]
    assert crypto(traded), "crypto must trade while the NYSE is closed"
    assert stocks(traded) == [], "stocks must not trade while the NYSE is closed"
    assert stocks(s["symbol"] for s in rig.engine.snapshot()["signals"]), "stocks are still scored"

    rig.clock.t = TUESDAY
    for _ in range(30):
        rig.tick()
        if stocks(o["symbol"] for o in rig.orders("buy")):
            break
    assert stocks(o["symbol"] for o in rig.orders("buy")), "stocks trade once the NYSE opens"
    assert rig.engine.snapshot()["markets"]["stocks"]["open"] is True


def test_market_closed_only_when_no_enabled_class_can_trade(tmp_path: Path) -> None:
    r = Rig(tmp_path, enable_crypto=False)
    try:
        summary = r.tick()
        assert summary["status"] == "market_closed" and summary["market_open"] is False
        assert summary["orders"] == [] and summary["symbols"] == len(r.cfg.universe)
        assert r.engine.snapshot()["status"] == "market_closed"
    finally:
        r.store.close()


def test_stock_session_transitions_are_logged_once(rig: Rig) -> None:
    rig.run(3)
    rig.clock.t = TUESDAY
    rig.run(3)
    messages = [e["message"] for e in rig.store.recent_events(500)]
    assert sum("stock market closed" in m for m in messages) == 1
    assert sum("stock market open" in m for m in messages) == 1


def test_held_crypto_exits_24_7_while_held_stocks_wait_for_the_open(tmp_path: Path) -> None:
    r = Rig(tmp_path, start=TUESDAY)
    try:
        for _ in range(200):
            r.tick()
            held = r.engine.snapshot()["positions"]
            if crypto(p["symbol"] for p in held) and stocks(p["symbol"] for p in held):
                break
        held_syms = [p["symbol"] for p in r.engine.snapshot()["positions"]]
        coin, share = crypto(held_syms)[0], stocks(held_syms)[0]

        r.clock.t = SATURDAY
        r.data.shock[coin] = r.data.shock[share] = 0.5  # crash both through their stop-losses
        r.tick()
        positions = r.broker.get_positions()
        assert coin not in positions, "crypto stop-loss fires on a weekend"
        assert share in positions, "stock exits wait for the NYSE session"
        sell = next(o for o in r.store.recent_orders(limit=1000) if o["symbol"] == coin and o["side"] == "sell")
        assert "stop-loss" in sell["reason"]

        r.clock.t = TUESDAY + 86400
        r.tick()
        assert share not in r.broker.get_positions()
    finally:
        r.store.close()


# ---------------------------------------------------------------- data routing and strategy


def test_bars_use_the_interval_of_each_asset_class(tmp_path: Path) -> None:
    r = Rig(tmp_path, crypto_bar_interval="15m", bar_interval="5m")
    try:
        r.tick()
        assert {r.data.intervals[s] for s in r.cfg.universe} == {"5m"}
        assert {r.data.intervals[s] for s in r.cfg.crypto_universe} == {"15m"}
    finally:
        r.store.close()


def test_crypto_uses_its_own_strategy_thresholds(rig: Rig) -> None:
    engine = rig.engine
    assert engine.strategy_for("BTC-USD") is engine.crypto_strategy
    assert engine.strategy_for("AAPL") is engine.strategy
    assert engine.crypto_strategy.cfg == rig.cfg.crypto_strategy_config()
    assert engine.crypto_strategy.cfg.entry_threshold == pytest.approx(0.40)
    assert engine.strategy.cfg.entry_threshold == pytest.approx(0.35)
    rig.run(80)
    entries = [o for o in rig.orders("buy") if asset_class(o["symbol"]) == "crypto"]
    assert entries
    for order in entries:
        score = float(re.match(r"entry ([+-]\d+\.\d+)", order["reason"]).group(1))  # type: ignore[union-attr]
        assert score >= 0.40 - 0.005


def test_run_builds_routed_feeds(monkeypatch: pytest.MonkeyPatch) -> None:
    demo = run.build_data(demo_config())
    assert isinstance(demo, RoutedData)
    assert isinstance(demo.stock_feed, SyntheticData) and isinstance(demo.crypto_feed, SyntheticData)

    live_like = run.build_data(Config())  # yahoo stocks + coinbase crypto (constructing does no I/O)
    assert isinstance(live_like, RoutedData)
    assert isinstance(live_like.stock_feed, YahooData) and isinstance(live_like.crypto_feed, CoinbaseData)
    assert live_like.feed_for("BTC-USD") is live_like.crypto_feed
    assert live_like.feed_for("AAPL") is live_like.stock_feed


# ---------------------------------------------------------------- sizing and caps


def test_crypto_respects_position_and_exposure_caps(rig: Rig) -> None:
    cap = rig.cfg.crypto_risk.max_positions
    limit = rig.cfg.crypto_risk.max_crypto_exposure_pct
    for _ in range(150):
        summary = rig.tick()
        snap = rig.engine.snapshot()
        assert len(crypto(p["symbol"] for p in snap["positions"])) <= cap
        # entries are sized at the signal price; allow drift and slippage since then
        assert summary["exposure"]["crypto_pct"] <= limit * 1.25
    assert rig.engine.snapshot()["exposure"]["crypto"] > 0


def test_crypto_quantities_are_fractional_even_without_fractional_shares(tmp_path: Path) -> None:
    r = Rig(tmp_path, start=TUESDAY, fractional=False)
    try:
        r.run(80)
        buys = r.orders("buy")
        coin_qty = [o["qty"] for o in buys if asset_class(o["symbol"]) == "crypto"]
        share_qty = [o["qty"] for o in buys if asset_class(o["symbol"]) == "stock"]
        assert coin_qty and share_qty
        assert all(q == int(q) for q in share_qty)
        assert any(q != int(q) for q in coin_qty)
    finally:
        r.store.close()


# ---------------------------------------------------------------- snapshot


def test_snapshot_carries_markets_exposure_and_asset_classes(rig: Rig) -> None:
    rig.run(40)
    snap = rig.engine.snapshot()
    json.dumps(snap, allow_nan=False)
    assert snap["markets"]["stocks"]["open"] is False and snap["markets"]["crypto"]["open"] is True
    exposure = snap["exposure"]
    assert set(exposure) >= {"stocks", "crypto", "crypto_pct", "crypto_limit_pct"}
    assert exposure["stocks"] == pytest.approx(0.0)
    crypto_value = sum(p["market_value"] for p in snap["positions"] if p["asset_class"] == "crypto")
    assert exposure["crypto"] == pytest.approx(crypto_value)
    assert exposure["crypto_pct"] == pytest.approx(crypto_value / snap["bot"]["equity"])
    assert snap["universe"] == rig.cfg.universe and snap["crypto_universe"] == rig.cfg.crypto_universe
    assert snap["active_universe"] == rig.cfg.active_universe()
    assert snap["limits"]["crypto"]["entry_threshold"] == pytest.approx(0.40)
    assert all(p["asset_class"] == asset_class(p["symbol"]) for p in snap["positions"])
    assert {s["asset_class"] for s in snap["signals"]} <= {"stock", "crypto"}
    pos = next(p for p in snap["positions"] if p["asset_class"] == "crypto")
    assert pos["stop"] == pytest.approx(pos["avg_price"] * (1 - rig.cfg.crypto_risk.stop_loss_pct))


# ---------------------------------------------------------------- universe


def test_set_universe_normalizes_both_asset_classes(rig: Rig) -> None:
    result = rig.engine.set_universe(["aapl", "btc/usd", " eth-usd", "BTCUSD", "SOL-USDT", "brk.b"])
    assert result == ["AAPL", "BRK.B", "BTC-USD", "ETH-USD", "SOL-USDT"]
    assert rig.engine.universe == ["AAPL", "BRK.B"]
    assert rig.engine.crypto_universe == ["BTC-USD", "ETH-USD", "SOL-USDT"]
    assert rig.engine.active_universe() == result
    for bad in (["ETH-EUR"], ["FOOUSD"], ["BTC/"], ["$$$"]):
        with pytest.raises(ValueError):
            rig.engine.set_universe(bad)
    assert rig.engine.active_universe() == result
    assert rig.tick()["symbols"] == len(result)


def test_set_universe_per_class(rig: Rig) -> None:
    assert rig.engine.set_universe(["doge-usd"], asset_class="crypto") == [*rig.cfg.universe, "DOGE-USD"]
    assert rig.engine.set_universe(["msft"], asset_class="stock") == ["MSFT", "DOGE-USD"]
    assert rig.engine.set_universe([], asset_class="crypto") == ["MSFT"]
    with pytest.raises(ValueError):
        rig.engine.set_universe(["BTC-USD"], asset_class="stock")
    with pytest.raises(ValueError):
        rig.engine.set_universe([], asset_class="stock")  # nothing would be left to scan
    with pytest.raises(ValueError):
        rig.engine.set_universe(["AAPL"], asset_class="bonds")


def test_set_universe_rejects_disabled_class(tmp_path: Path) -> None:
    r = Rig(tmp_path, enable_stocks=False)
    try:
        assert r.engine.active_universe() == r.cfg.crypto_universe
        with pytest.raises(ValueError, match="enable_stocks"):
            r.engine.set_universe(["AAPL", "BTC-USD"])
        assert r.engine.set_universe(["btc-usd"]) == ["BTC-USD"]
    finally:
        r.store.close()


def test_universe_lists_persist_independently(tmp_path: Path) -> None:
    r = Rig(tmp_path)
    try:
        r.engine.set_universe(["AAPL", "BTC-USD"])
        again = Engine(r.cfg, r.data, r.broker, r.store, clock=r.clock)
        assert (again.universe, again.crypto_universe) == (["AAPL"], ["BTC-USD"])
        changed_cfg = dataclasses.replace(r.cfg, crypto_universe=["ETH-USD"])
        changed = Engine(changed_cfg, r.data, r.broker, r.store, clock=r.clock)
        assert (changed.universe, changed.crypto_universe) == (["AAPL"], ["ETH-USD"])
    finally:
        r.store.close()


# ---------------------------------------------------------------- HTTP API and dashboard


def _post(port: int, path: str, body: dict[str, Any]) -> tuple[int, Any]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request("POST", path, json.dumps(body),
                     {"X-Auth-Token": TOKEN, "Content-Type": "application/json"})
        resp = conn.getresponse()
        return resp.status, json.loads(resp.read())
    finally:
        conn.close()


def _get(port: int, path: str) -> tuple[int, Any]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request("GET", path, headers={"X-Auth-Token": TOKEN})
        resp = conn.getresponse()
        return resp.status, json.loads(resp.read())
    finally:
        conn.close()


def test_api_universe_per_class_and_trades_carry_asset_class(rig: Rig) -> None:
    rig.run(10)
    server = make_server(rig.engine, dataclasses.replace(rig.cfg.server, port=0), TOKEN)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        status, data = _post(port, "/api/universe", {"symbols": ["btc/usd", "ETH-USD"], "asset_class": "crypto"})
        assert status == 200 and data["universe"] == [*rig.cfg.universe, "BTC-USD", "ETH-USD"]
        assert rig.engine.crypto_universe == ["BTC-USD", "ETH-USD"]
        status, data = _post(port, "/api/universe", {"symbols": ["AAPL"], "asset_class": "forex"})
        assert status == 400 and "asset_class" in data["error"]
        status, data = _post(port, "/api/universe", {"symbols": ["AAPL"], "asset_class": "crypto"})
        assert status == 400

        status, trades = _get(port, "/api/trades")
        assert status == 200 and trades["fills"]
        for row in trades["fills"] + trades["orders"]:
            assert row["asset_class"] == asset_class(row["symbol"])
        status, state = _get(port, "/api/state")
        assert status == 200 and state["markets"]["crypto"]["open"] is True
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_dashboard_has_crypto_ui() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    for needle in ("asset_class", "s.markets", "s.exposure", "crypto_universe", "Crypto 24/7", "NYSE",
                   'data-filter="crypto"', 'data-filter="stock"', 'data-filter="all"',
                   "cryptoUniverseInput", "kCrypto"):
        assert needle in html, needle
