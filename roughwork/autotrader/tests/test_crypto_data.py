"""Offline tests for crypto market data: Coinbase candles (stubbed HTTP), routing, synthetic crypto."""

from __future__ import annotations

import math
from typing import Any

import pytest
import requests

from autotrader.config import StrategyConfig, demo_config
from autotrader.data import (
    COINBASE_MAX_CANDLES,
    CoinbaseData,
    MarketData,
    RoutedData,
    SyntheticData,
    YahooData,
    make_data,
    parse_candles,
)
from autotrader.models import Bar
from autotrader.strategy import Strategy

# Coinbase rows: [time, low, high, open, close, volume], newest first.
ROWS: list[list[float]] = [
    [1900, 101.0, 102.0, 101.5, 101.8, 3.5],
    [1600, 100.5, 101.7, 101.0, 101.5, 2.0],
    [1300, 100.0, 101.2, 100.4, 101.0, 4.25],
    [1000, 99.5, 100.6, 100.0, 100.4, 1.0],
]


class StubResponse:
    def __init__(self, payload: Any, status: int = 200) -> None:
        self.payload = payload
        self.status_code = status

    def json(self) -> Any:
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class CoinbaseStub:
    """Routes ``/products/{id}/{endpoint}`` to canned responses; records every call."""

    def __init__(self, products: dict[str, dict[str, Any]] | None = None,
                 exc: Exception | None = None) -> None:
        self.products = products if products is not None else {
            "BTC-USD": {"candles": ROWS, "ticker": {"price": "101.95", "volume": "10"}},
        }
        self.exc = exc
        self.calls: list[dict[str, Any]] = []

    def get(self, url: str, params: dict[str, str] | None = None, timeout: float | None = None,
            headers: dict[str, str] | None = None) -> StubResponse:
        self.calls.append({"url": url, "params": params, "timeout": timeout, "headers": headers})
        if self.exc is not None:
            raise self.exc
        product, endpoint = url.split("/products/", 1)[1].split("/", 1)
        canned = self.products.get(product)
        if canned is None or endpoint not in canned:
            return StubResponse({"message": "NotFound"}, 404)
        value = canned[endpoint]
        if callable(value):
            value = value(params or {})
        if isinstance(value, tuple):
            return StubResponse(value[0], value[1])
        return StubResponse(value)

    def endpoints(self) -> list[str]:
        return [c["url"].split("/products/", 1)[1] for c in self.calls]


def feed(stub: CoinbaseStub, **kwargs: Any) -> CoinbaseData:
    return CoinbaseData(session=stub, min_request_interval=0.0, **kwargs)


# --- parsing ---------------------------------------------------------------------------------

def test_parse_candles_ascending_and_mapped() -> None:
    bars = parse_candles(ROWS)
    assert [b.ts for b in bars] == [1000, 1300, 1600, 1900]
    assert bars[-1] == Bar(ts=1900, open=101.5, high=102.0, low=101.0, close=101.8, volume=3.5)


def test_parse_candles_drops_malformed_rows() -> None:
    rows: list[Any] = [
        [2200, 1.0, 2.0, 1.5],                     # too short
        [2500, None, 2.0, 1.5, 1.6, 1.0],          # missing low
        [2800, 0.0, 2.0, 1.5, 1.6, 1.0],           # non-positive price
        "junk",
        [3100, 1.0, 2.0, 1.5, 1.6, None],          # missing volume -> 0
        [3100, 1.0, 2.0, 1.5, 1.7, 2.0],           # duplicate ts keeps last
    ]
    bars = parse_candles(rows)
    assert [(b.ts, b.close, b.volume) for b in bars] == [(3100, 1.7, 2.0)]
    assert parse_candles({"message": "NotFound"}) == []
    assert parse_candles(None) == []


# --- CoinbaseData ----------------------------------------------------------------------------

def test_coinbase_request_shape_and_lookback() -> None:
    stub = CoinbaseStub()
    bars = feed(stub).get_bars("btc-usd", "5m", 3)
    assert [b.close for b in bars] == [101.0, 101.5, 101.8]
    call = stub.calls[0]
    assert call["url"] == "https://api.exchange.coinbase.com/products/BTC-USD/candles"
    assert call["params"] == {"granularity": "300"}
    assert call["timeout"] == 10.0
    assert call["headers"]["User-Agent"]


@pytest.mark.parametrize(("interval", "granularity"), [
    ("1m", "60"), ("5m", "300"), ("15m", "900"), ("1h", "3600"), ("6h", "21600"), ("1d", "86400"),
])
def test_coinbase_granularity_mapping(interval: str, granularity: str) -> None:
    stub = CoinbaseStub()
    feed(stub).get_bars("BTC-USD", interval, 10)
    assert stub.calls[0]["params"]["granularity"] == granularity


def test_coinbase_unsupported_interval_and_stock_symbols_make_no_requests() -> None:
    stub = CoinbaseStub()
    data = feed(stub)
    assert data.get_bars("BTC-USD", "2m", 10) == []
    assert data.get_bars("AAPL", "5m", 10) == []
    assert data.get_price("AAPL") is None
    assert data.get_bars("BTC-USD", "5m", 0) == []
    assert stub.calls == []


def test_coinbase_ticker_price_and_per_tick_cache() -> None:
    stub = CoinbaseStub()
    data = feed(stub)
    data.get_bars("BTC-USD", "5m", 120)
    data.get_bars("BTC-USD", "5m", 50)
    assert data.get_price("BTC-USD") == 101.95
    assert data.get_price("BTC-USD") == 101.95
    assert stub.endpoints() == ["BTC-USD/candles", "BTC-USD/ticker"]
    data.refresh()
    data.get_bars("BTC-USD", "5m", 120)
    data.get_price("BTC-USD")
    assert len(stub.calls) == 4


def test_coinbase_price_falls_back_to_last_bar_close() -> None:
    stub = CoinbaseStub({"ETH-USD": {"candles": ROWS, "ticker": ({"message": "busy"}, 503)}})
    data = feed(stub)
    data.get_bars("ETH-USD", "5m", 10)
    assert data.get_price("ETH-USD") == 101.8
    cold = feed(CoinbaseStub({"ETH-USD": {"candles": ROWS, "ticker": {"price": "bad"}}}))
    assert cold.get_price("ETH-USD") == 101.8        # fetched 1m candles on demand


def test_coinbase_usdt_404_falls_back_to_usd_once(caplog: pytest.LogCaptureFixture) -> None:
    stub = CoinbaseStub()
    data = feed(stub)
    with caplog.at_level("WARNING"):
        bars = data.get_bars("BTC-USDT", "5m", 10)
        price = data.get_price("BTC-USDT")
    assert len(bars) == 4 and price == 101.95
    assert stub.endpoints() == ["BTC-USDT/candles", "BTC-USD/candles", "BTC-USD/ticker"]
    assert data.product_id("BTC-USDT") == "BTC-USD"
    assert sum("not found" in r.getMessage() for r in caplog.records) == 1


def test_coinbase_existing_usdt_product_is_used_as_is() -> None:
    stub = CoinbaseStub({"ETH-USDT": {"candles": ROWS, "ticker": {"price": "99.5"}}})
    data = feed(stub)
    assert len(data.get_bars("ETH-USDT", "5m", 10)) == 4
    assert data.get_price("ETH-USDT") == 99.5
    assert all(e.startswith("ETH-USDT/") for e in stub.endpoints())


def test_coinbase_paginates_long_lookbacks() -> None:
    granularity = 300
    now = 1_000_000_200.0

    def candles(params: dict[str, str]) -> list[list[float]]:
        from datetime import datetime
        start = datetime.fromisoformat(params["start"].replace("Z", "+00:00")).timestamp()
        end = datetime.fromisoformat(params["end"].replace("Z", "+00:00")).timestamp()
        ts = range(int(end) - granularity, int(start) - 1, -granularity)  # newest first
        return [[t, 9.0, 11.0, 10.0, 10.0 + (t % 7) / 10, 1.0] for t in ts][:COINBASE_MAX_CANDLES]

    stub = CoinbaseStub({"SOL-USD": {"candles": candles}})
    bars = feed(stub, clock=lambda: now).get_bars("SOL-USD", "5m", 450)
    assert len(stub.calls) == 2
    assert len(bars) == 450
    stamps = [b.ts for b in bars]
    assert stamps == sorted(set(stamps))
    assert all(b - a == granularity for a, b in zip(stamps, stamps[1:]))
    assert stamps[-1] == now - now % granularity     # newest (in-progress) bucket included


@pytest.mark.parametrize("stub", [
    CoinbaseStub(exc=requests.ConnectionError("offline")),
    CoinbaseStub(exc=requests.Timeout("slow")),
    CoinbaseStub({"BTC-USD": {"candles": ({"message": "rate limited"}, 429),
                              "ticker": ({"message": "rate limited"}, 429)}}),
    CoinbaseStub({"BTC-USD": {"candles": ValueError("not json"), "ticker": ValueError("not json")}}),
    CoinbaseStub({}),
])
def test_coinbase_errors_are_graceful(stub: CoinbaseStub) -> None:
    data = feed(stub)
    assert data.get_bars("BTC-USD", "5m", 50) == []
    assert data.get_price("BTC-USD") is None


def test_coinbase_throttle_spaces_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps: list[float] = []
    monkeypatch.setattr("autotrader.data.time.sleep", sleeps.append)
    data = CoinbaseData(session=CoinbaseStub(), min_request_interval=0.5)
    data.get_bars("BTC-USD", "5m", 10)
    data.get_price("BTC-USD")
    assert len(sleeps) == 1 and 0.0 < sleeps[0] <= 0.5


# --- RoutedData / make_data ------------------------------------------------------------------

class CountingFeed(MarketData):
    def __init__(self, price: float) -> None:
        self.price = price
        self.refreshes = 0
        self.symbols: list[str] = []

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        self.symbols.append(symbol)
        return [Bar(ts=0, open=self.price, high=self.price, low=self.price, close=self.price, volume=1)]

    def get_price(self, symbol: str) -> float | None:
        self.symbols.append(symbol)
        return self.price

    def refresh(self) -> None:
        self.refreshes += 1


def test_routed_data_routes_by_asset_class_and_refreshes_both() -> None:
    stocks, crypto = CountingFeed(10.0), CountingFeed(20.0)
    routed = RoutedData(stocks, crypto)
    assert routed.get_price("AAPL") == 10.0
    assert routed.get_price("BRK.B") == 10.0
    assert routed.get_price("BTC-USD") == 20.0
    assert routed.get_bars("ETH-USDC", "5m", 1)[0].close == 20.0
    assert stocks.symbols == ["AAPL", "BRK.B"] and crypto.symbols == ["BTC-USD", "ETH-USDC"]
    routed.refresh()
    assert (stocks.refreshes, crypto.refreshes) == (1, 1)
    shared = CountingFeed(1.0)
    RoutedData(shared, shared).refresh()
    assert shared.refreshes == 1


def test_make_data_demo_shares_one_synthetic_clock() -> None:
    data = make_data(demo_config())
    assert isinstance(data, RoutedData)
    assert isinstance(data.stock_feed, SyntheticData) and data.crypto_feed is data.stock_feed
    data.refresh()
    assert data.get_bars("AAPL", "5m", 1)[0].ts == data.get_bars("BTC-USD", "5m", 1)[0].ts


def test_make_data_live_sources_and_mixed_intervals() -> None:
    cfg = demo_config()
    cfg.data_source, cfg.crypto_data_source = "yahoo", "coinbase"
    data = make_data(cfg)
    assert isinstance(data, RoutedData)
    assert isinstance(data.stock_feed, YahooData) and isinstance(data.crypto_feed, CoinbaseData)
    cfg.crypto_data_source = "yahoo"
    yahoo_both = make_data(cfg)
    assert isinstance(yahoo_both, RoutedData) and yahoo_both.crypto_feed is yahoo_both.stock_feed
    cfg.data_source, cfg.crypto_data_source, cfg.crypto_bar_interval = "synthetic", "synthetic", "1h"
    mixed = make_data(cfg)
    assert isinstance(mixed, RoutedData)
    assert isinstance(mixed.crypto_feed, SyntheticData) and mixed.crypto_feed is not mixed.stock_feed
    assert mixed.crypto_feed.bar_seconds == 3600


# --- SyntheticData crypto --------------------------------------------------------------------

def _bar_vol(bars: list[Bar]) -> float:
    rets = [math.log(b.close / a.close) for a, b in zip(bars, bars[1:])]
    mean = sum(rets) / len(rets)
    return math.sqrt(sum((r - mean) ** 2 for r in rets) / len(rets))


def test_synthetic_crypto_is_several_times_more_volatile() -> None:
    data = SyntheticData(seed=5, start_ts=0, history=1500)
    stock_syms = ("AAPL", "MSFT", "JPM", "KO", "SPY", "XOM")
    crypto_syms = ("BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD", "LINK-USD", "ADA-USD")
    stock_vol = sum(_bar_vol(data.get_bars(s, "5m", 1500)) for s in stock_syms) / len(stock_syms)
    crypto_vol = sum(_bar_vol(data.get_bars(s, "5m", 1500)) for s in crypto_syms) / len(crypto_syms)
    assert 2.5 < crypto_vol / stock_vol < 5.0


def test_synthetic_crypto_prices_and_precision() -> None:
    data = SyntheticData(seed=9, start_ts=0)
    btc = data.get_bars("BTC-USD", "5m", 1)[0].close
    doge = data.get_bars("DOGE-USD", "5m", 300)
    assert 20_000 < btc < 500_000
    assert all(0.01 < b.close < 2.0 for b in doge)
    assert any(round(b.close, 4) != b.close for b in doge)      # sub-cent precision kept
    for sym in ("BTC-USD", "DOGE-USD", "PEPE-USDT", "XYZ1-USDC"):
        for bar in data.get_bars(sym, "5m", 300):
            assert bar.low <= min(bar.open, bar.close) <= max(bar.open, bar.close) <= bar.high
            assert bar.low > 0 and bar.volume > 0


def test_synthetic_crypto_is_deterministic_and_keeps_stock_paths() -> None:
    a, b = SyntheticData(seed=4, start_ts=0), SyntheticData(seed=4, start_ts=0)
    a.get_bars("BTC-USD", "5m", 1)
    for _ in range(30):
        a.refresh()
        b.refresh()
    assert a.get_bars("BTC-USD", "5m", 400) == b.get_bars("BTC-USD", "5m", 400)
    stock_only = SyntheticData(seed=4, start_ts=0)
    for _ in range(30):
        stock_only.refresh()
    assert a.get_bars("AAPL", "5m", 400) == stock_only.get_bars("AAPL", "5m", 400)


def test_synthetic_crypto_has_bars_every_tick_around_the_clock() -> None:
    data = SyntheticData(seed=2, interval="1h", history=50, start_ts=0)
    for _ in range(24 * 7):
        data.refresh()
    stamps = [b.ts for b in data.get_bars("ETH-USD", "1h", 10_000)]
    assert len(stamps) == 50 + 24 * 7
    assert all(b - a == 3600 for a, b in zip(stamps, stamps[1:]))


def test_synthetic_crypto_produces_entries_and_exits() -> None:
    cfg = demo_config()
    strategy = Strategy(cfg.crypto_strategy_config())
    s: StrategyConfig = strategy.cfg
    data = SyntheticData(seed=42, start_ts=0)
    for _ in range(400):
        data.refresh()
    entries = exits = 0
    for sym in cfg.crypto_universe:
        bars = data.get_bars(sym, "5m", 700)
        for i in range(strategy.min_bars, len(bars)):
            signal = strategy.evaluate(sym, bars[max(0, i - cfg.lookback_bars):i])
            if signal is None:
                continue
            entries += signal.score >= s.entry_threshold
            exits += signal.score <= s.exit_threshold
    assert entries >= 3 * len(cfg.crypto_universe)
    assert exits >= 3 * len(cfg.crypto_universe)


def test_paper_fills_use_the_ticks_cached_price_without_a_request(tmp_path: Any) -> None:
    from autotrader.broker import make_broker
    from autotrader.config import Config
    from autotrader.store import Store

    stub = CoinbaseStub()
    cb = feed(stub)
    bars = cb.get_bars("BTC-USD", "5m", 3)  # what the tick fetches before any lock is taken
    calls = len(stub.calls)
    assert cb.cached_price("BTC-USD") == bars[-1].close and len(stub.calls) == calls
    store = Store(str(tmp_path / "p.db"))
    broker = make_broker(Config(), store, cb)
    order = broker.submit_order("BTC-USD", "buy", 0.01, reason="test")
    assert order.status == "filled"
    assert len(stub.calls) == calls, "a paper fill must not hit the network while holding locks"
    store.close()
