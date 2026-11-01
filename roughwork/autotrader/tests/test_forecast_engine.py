"""Forecasts in the engine (tick cache, snapshot fields, chart()) and the GET /api/chart route.

Offline only: SyntheticData + PaperBroker.
"""

from __future__ import annotations

import dataclasses
import http.client
import json
import math
import threading
from collections.abc import Iterable, Iterator
from typing import Any

import pytest

from autotrader.broker import PaperBroker
from autotrader.config import Config, ServerConfig
from autotrader.data import MarketData, SyntheticData
from autotrader.engine import CHART_MAX_BARS, CHART_MIN_BARS, Engine, clamp_chart_bars
from autotrader.models import Bar
from autotrader.server import INDEX_PATH, make_server
from autotrader.store import Store

TOKEN = "forecast-test-token-0123456789"
BAR_KEYS = {"ts", "open", "high", "low", "close", "volume"}
FORECAST_KEYS = {"points", "expected_return", "direction", "confidence", "hit_rate", "horizon", "method"}
BRIEF_KEYS = {"direction", "expected_return", "confidence"}


class GappyData(MarketData):
    """SyntheticData that has no bars for ``missing`` symbols and raises for ``broken`` ones."""

    def __init__(self, missing: Iterable[str] = (), broken: Iterable[str] = ()) -> None:
        self.inner = SyntheticData(seed=7)
        self.missing, self.broken = set(missing), set(broken)

    def refresh(self) -> None:
        self.inner.refresh()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        if symbol in self.broken:
            raise RuntimeError("feed down")
        return [] if symbol in self.missing else self.inner.get_bars(symbol, interval, lookback)

    def get_price(self, symbol: str) -> float | None:
        return None if symbol in self.missing | self.broken else self.inner.get_price(symbol)


def build(cfg: Config, store: Store, data: MarketData | None = None) -> Engine:
    data = data or SyntheticData(seed=7, interval=cfg.bar_interval)
    broker = PaperBroker(store, data.get_price, cfg.initial_fund, slippage_bps=cfg.slippage_bps)
    return Engine(cfg, data, broker, store)


def strict_json(payload: Any) -> Any:
    """Round-trip through JSON, refusing NaN/Infinity."""
    return json.loads(json.dumps(payload, allow_nan=False))


@pytest.fixture
def engine(demo_cfg: Config, store: Store) -> Engine:
    return build(demo_cfg, store)


@pytest.fixture
def ticked(engine: Engine) -> Engine:
    engine.tick()
    return engine


# ---- tick cache & snapshot ----------------------------------------------------------------

def test_tick_forecasts_every_symbol_with_data(ticked: Engine) -> None:
    summary = ticked.tick()
    assert summary["forecasts"] == summary["symbols_with_data"] == len(ticked.active_universe())


def test_snapshot_signals_carry_forecast_brief(ticked: Engine) -> None:
    snap = strict_json(ticked.snapshot())
    assert snap["forecast"] == {"enabled": True, "horizon_bars": 12, "use_in_strategy": True}
    assert snap["signals"]
    for row in snap["signals"]:
        fc = row["forecast"]
        assert BRIEF_KEYS <= set(fc)
        assert fc["direction"] in {"up", "down", "flat"}
        assert 0.0 <= fc["confidence"] <= 1.0
        assert math.isfinite(fc["expected_return"])
        assert "forecast" in row["components"]


def test_forecast_feeds_strategy_only_when_enabled(demo_cfg: Config, store: Store) -> None:
    demo_cfg.forecast = dataclasses.replace(demo_cfg.forecast, use_in_strategy=False)
    engine = build(demo_cfg, store)
    engine.tick()
    snap = engine.snapshot()
    assert all("forecast" not in row["components"] for row in snap["signals"])
    assert all(row["forecast"] is not None for row in snap["signals"])  # still shown on the dashboard
    assert engine.chart("AAPL")["forecast"] is not None


def test_forecast_disabled_everywhere(demo_cfg: Config, store: Store) -> None:
    demo_cfg.forecast = dataclasses.replace(demo_cfg.forecast, enabled=False)
    engine = build(demo_cfg, store)
    assert engine.tick()["forecasts"] == 0
    snap = engine.snapshot()
    assert snap["forecast"]["enabled"] is False
    assert snap["signals"] and all(row["forecast"] is None for row in snap["signals"])
    assert all("forecast" not in row["components"] for row in snap["signals"])
    chart = engine.chart("AAPL")
    assert chart["forecast"] is None and len(chart["bars"]) == 120


def test_too_little_history_means_no_forecast(demo_cfg: Config, store: Store) -> None:
    engine = build(demo_cfg, store, SyntheticData(seed=7, history=35))
    engine.tick()
    snap = engine.snapshot()
    assert snap["signals"], "the strategy needs only 31 bars"
    assert all(row["forecast"] is None for row in snap["signals"])
    chart = engine.chart("AAPL")
    assert chart["forecast"] is None and len(chart["bars"]) == 36


# ---- chart() ------------------------------------------------------------------------------

def test_chart_payload_shape_and_json_safety(ticked: Engine) -> None:
    chart = strict_json(ticked.chart("AAPL"))
    assert set(chart) == {"symbol", "asset_class", "interval", "bars", "forecast", "position"}
    assert chart["symbol"] == "AAPL" and chart["asset_class"] == "stock" and chart["interval"] == "5m"
    assert len(chart["bars"]) == 120
    assert all(set(b) == BAR_KEYS for b in chart["bars"])
    fc = chart["forecast"]
    assert FORECAST_KEYS <= set(fc)
    assert fc["horizon"] == len(fc["points"]) == 12
    assert fc["direction"] in {"up", "down", "flat"}
    assert 0.0 <= fc["confidence"] <= 1.0 and 0.0 <= fc["hit_rate"] <= 1.0
    for p in fc["points"]:
        assert set(p) == {"ts", "mid", "lo", "hi"}
        assert 0.0 < p["lo"] <= p["mid"] <= p["hi"]
    assert fc["expected_return"] == pytest.approx(fc["points"][-1]["mid"] / chart["bars"][-1]["close"] - 1.0)


def test_forecast_starts_after_last_bar(ticked: Engine) -> None:
    for sym in ("AAPL", "BTC-USD"):
        chart = ticked.chart(sym)
        last_ts = chart["bars"][-1]["ts"]
        spacing = last_ts - chart["bars"][-2]["ts"]
        stamps = [p["ts"] for p in chart["forecast"]["points"]]
        assert stamps[0] == pytest.approx(last_ts + spacing)
        assert all(b > a for a, b in zip(stamps, stamps[1:]))
        assert all(b["ts"] < stamps[0] for b in chart["bars"])


def test_chart_reuses_the_tick_forecast(ticked: Engine) -> None:
    rows = {row["symbol"]: row for row in ticked.snapshot()["signals"]}
    chart = ticked.chart("MSFT")
    assert chart["forecast"]["expected_return"] == pytest.approx(rows["MSFT"]["forecast"]["expected_return"])
    assert chart["forecast"]["generated_ts"] == pytest.approx(ticked.last_tick_ts)


def test_crypto_chart_normalizes_symbol(ticked: Engine) -> None:
    chart = ticked.chart("btc/usd")
    assert chart["symbol"] == "BTC-USD" and chart["asset_class"] == "crypto"
    assert chart["forecast"] is not None and chart["position"] is None


def test_chart_bars_are_clamped(ticked: Engine) -> None:
    assert clamp_chart_bars(1) == CHART_MIN_BARS and clamp_chart_bars(10**6) == CHART_MAX_BARS
    assert len(ticked.chart("AAPL", 5)["bars"]) == CHART_MIN_BARS
    available = len(ticked.data.get_bars("AAPL", "5m", 5000))
    longer = ticked.chart("AAPL", 10**6)
    assert len(longer["bars"]) == min(CHART_MAX_BARS, available) > 120
    assert longer["forecast"]["points"][0]["ts"] > longer["bars"][-1]["ts"]


def test_unknown_symbol_is_fetched_on_demand(engine: Engine) -> None:
    assert "ZZZZ" not in engine.active_universe()
    chart = strict_json(engine.chart("zzzz", 60))
    assert chart["symbol"] == "ZZZZ" and len(chart["bars"]) == 60
    assert chart["forecast"] is not None and chart["position"] is None
    assert chart["forecast"]["points"][0]["ts"] > chart["bars"][-1]["ts"]


def test_held_symbol_outside_universe(demo_cfg: Config, store: Store) -> None:
    demo_cfg.fund_scope = "full_account"
    engine = build(demo_cfg, store)
    engine.pause()  # no entries or signal exits: the position below must survive the tick
    order = engine.broker.submit_order("ZZZZ", "buy", 3, reason="manual")
    assert order.status == "filled"
    engine.tick()
    assert "ZZZZ" not in engine.active_universe()
    chart = strict_json(engine.chart("ZZZZ"))
    pos = chart["position"]
    assert pos["qty"] == pytest.approx(3) and pos["avg_price"] > 0
    assert pos["stop"] < pos["avg_price"] < pos["target"] and pos["trail"] > 0
    assert chart["forecast"] is not None
    assert chart["forecast"]["generated_ts"] == pytest.approx(engine.last_tick_ts)  # cached by the tick


@pytest.mark.parametrize("bad", ["", "   ", "ETH-EUR", "FOOUSD", "$$$", "TOOLONGTICKER", "BTC/"])
def test_invalid_symbol_raises(engine: Engine, bad: str) -> None:
    with pytest.raises(ValueError):
        engine.chart(bad)


def test_no_data_returns_error(demo_cfg: Config, store: Store) -> None:
    engine = build(demo_cfg, store, GappyData(missing={"NODATA"}, broken={"BROKEN"}))
    engine.tick()
    assert engine.chart("NODATA") == {"error": "no market data for NODATA"}
    assert "error" in engine.chart("BROKEN")
    assert "error" not in engine.chart("AAPL")


# ---- GET /api/chart -----------------------------------------------------------------------

def _get(port: int, path: str, token: str | None = TOKEN, method: str = "GET") -> tuple[int, Any]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        headers = {"X-Auth-Token": token} if token is not None else {}
        conn.request(method, path, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        return resp.status, json.loads(raw, parse_constant=lambda c: pytest.fail(f"non-JSON constant {c}"))
    finally:
        conn.close()


@pytest.fixture
def port(demo_cfg: Config, store: Store) -> Iterator[int]:
    engine = build(demo_cfg, store, GappyData(missing={"NODATA"}))
    engine.tick()
    server = make_server(engine, ServerConfig(host="127.0.0.1", port=0), TOKEN)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.mark.parametrize("token", [None, "wrong-token-xxxxxxxxxx"])
def test_api_chart_requires_token(port: int, token: str | None) -> None:
    status, data = _get(port, "/api/chart?symbol=AAPL", token=token)
    assert status == 401 and "error" in data


def test_api_chart_payload(port: int) -> None:
    status, data = _get(port, "/api/chart?symbol=BTC-USD")
    assert status == 200
    assert data["symbol"] == "BTC-USD" and data["asset_class"] == "crypto"
    assert len(data["bars"]) == 120 and FORECAST_KEYS <= set(data["forecast"])
    assert data["forecast"]["points"][0]["ts"] > data["bars"][-1]["ts"]


@pytest.mark.parametrize(("bars", "expected"), [("1", 20), ("20", 20), ("60", 60), ("-5", 20), ("100000", None)])
def test_api_chart_clamps_bars(port: int, bars: str, expected: int | None) -> None:
    status, data = _get(port, f"/api/chart?symbol=AAPL&bars={bars}")
    assert status == 200
    if expected is None:
        assert 120 < len(data["bars"]) <= 500
    else:
        assert len(data["bars"]) == expected


@pytest.mark.parametrize("query", ["", "?symbol=", "?symbol=%20", "?symbol=ETH-EUR", "?symbol=AAPL&bars=abc",
                                   "?symbol=%24%24%24"])
def test_api_chart_bad_request(port: int, query: str) -> None:
    status, data = _get(port, "/api/chart" + query)
    assert status == 400 and data["error"]


def test_api_chart_no_data_is_404(port: int) -> None:
    status, data = _get(port, "/api/chart?symbol=NODATA")
    assert status == 404 and data == {"error": "no market data for NODATA"}


def test_api_chart_rejects_post(port: int) -> None:
    status, data = _get(port, "/api/chart?symbol=AAPL", method="POST")
    assert status == 405 and "error" in data


# ---- dashboard ----------------------------------------------------------------------------

def test_dashboard_chart_panel_matches_payload() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    for needle in ("/api/chart?symbol=", "d.bars", "d.forecast", "d.position", "d.interval", "p.mid", "p.lo", "p.hi",
                   "f.expected_return", "f.confidence", "f.hit_rate", "f.horizon", "g.forecast",
                   "avg_price", '"stop"', '"target"', '"trail"', "data-chart", "pxChart", "pxCaption",
                   "statistical projection, not a guarantee", "Outlook"):
        assert needle in html, needle
    for token in ("--fc-line", "--fc-band", "--fc-tint", "--fc-up", "--fc-down"):
        assert html.count(token + ":") == 3, token  # light, dark media query, explicit dark toggle
    assert "https://" not in html
