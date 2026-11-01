"""Offline tests for market data feeds (Yahoo parsing via a stub session, synthetic market)."""

from __future__ import annotations

from typing import Any

import pytest
import requests

from autotrader.data import (
    MarketData,
    SyntheticData,
    YahooData,
    parse_chart,
    yahoo_range_for,
)
from autotrader.models import Bar
from autotrader.store import Store


def chart_payload(price: float | None = 101.5) -> dict[str, Any]:
    return {
        "chart": {
            "result": [{
                "meta": {"symbol": "AAPL", "regularMarketPrice": price},
                "timestamp": [1000, 1300, 1600, 1900, 2200],
                "indicators": {"quote": [{
                    "open": [100.0, 100.5, None, 101.0, 101.2],
                    "high": [100.8, 101.0, 101.4, 101.6, 101.9],
                    "low": [99.8, 100.2, 100.6, 100.9, 101.0],
                    "close": [100.5, 100.9, 101.1, 101.3, 101.4],
                    "volume": [1200, None, 900, 1500, 1800],
                }]},
            }],
            "error": None,
        }
    }


class StubResponse:
    def __init__(self, payload: Any, status: int = 200) -> None:
        self.payload = payload
        self.status_code = status

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error")

    def json(self) -> Any:
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class StubSession:
    def __init__(self, payload: Any = None, status: int = 200, exc: Exception | None = None) -> None:
        self.payload = chart_payload() if payload is None else payload
        self.status = status
        self.exc = exc
        self.calls: list[dict[str, Any]] = []

    def get(self, url: str, params: dict[str, str] | None = None, timeout: float | None = None,
            headers: dict[str, str] | None = None) -> StubResponse:
        self.calls.append({"url": url, "params": params, "timeout": timeout, "headers": headers})
        if self.exc is not None:
            raise self.exc
        return StubResponse(self.payload, self.status)


# --- Yahoo -----------------------------------------------------------------------------------

def test_parse_chart_drops_null_bars_and_zero_fills_volume() -> None:
    bars, price = parse_chart(chart_payload())
    assert price == 101.5
    assert [b.ts for b in bars] == [1000, 1300, 1900, 2200]
    assert bars[1].volume == 0.0
    assert bars[-1] == Bar(ts=2200, open=101.2, high=101.9, low=101.0, close=101.4, volume=1800)


@pytest.mark.parametrize("payload", [
    {}, {"chart": {"result": None, "error": None}}, {"chart": {"result": [], "error": None}},
    {"chart": {"result": None, "error": {"code": "Not Found", "description": "No data"}}},
    "garbage",
])
def test_parse_chart_malformed_payloads(payload: Any) -> None:
    assert parse_chart(payload) == ([], None)


def test_yahoo_get_bars_request_shape_and_lookback() -> None:
    session = StubSession()
    feed = YahooData(session=session)
    bars = feed.get_bars("aapl", "5m", 3)
    assert [b.close for b in bars] == [100.9, 101.3, 101.4]
    call = session.calls[0]
    assert call["url"].endswith("/v8/finance/chart/AAPL")
    assert call["params"]["interval"] == "5m"
    assert call["params"]["range"] == yahoo_range_for("5m", 3)
    assert call["timeout"] == 10.0
    assert "Mozilla" in call["headers"]["User-Agent"]


def test_yahoo_caches_per_tick_and_refresh_invalidates() -> None:
    session = StubSession()
    feed = YahooData(session=session)
    feed.get_bars("AAPL", "5m", 120)
    feed.get_bars("AAPL", "5m", 120)
    assert feed.get_price("AAPL") == 101.5
    assert len(session.calls) == 1
    feed.refresh()
    feed.get_bars("AAPL", "5m", 120)
    assert len(session.calls) == 2


def test_yahoo_price_falls_back_to_last_close() -> None:
    feed = YahooData(session=StubSession(payload=chart_payload(price=None)))
    assert feed.get_price("AAPL") == 101.4


def test_yahoo_dotted_ticker_uses_dash() -> None:
    session = StubSession()
    YahooData(session=session).get_bars("BRK.B", "1d", 10)
    assert session.calls[0]["url"].endswith("/BRK-B")


@pytest.mark.parametrize("session", [
    StubSession(exc=requests.ConnectionError("offline")),
    StubSession(exc=requests.Timeout("slow")),
    StubSession(status=404),
    StubSession(payload=ValueError("not json")),
])
def test_yahoo_errors_are_graceful(session: StubSession) -> None:
    feed = YahooData(session=session)
    assert feed.get_bars("AAPL", "5m", 50) == []
    assert feed.get_price("AAPL") is None


def test_yahoo_range_selection() -> None:
    assert yahoo_range_for("5m", 120) == "5d"
    assert yahoo_range_for("1m", 100_000) == "5d"      # capped by Yahoo's 1m limit
    assert yahoo_range_for("1d", 120) == "1y"         # 30% headroom for gaps
    assert yahoo_range_for("1h", 120) == "3mo"


# --- Synthetic -------------------------------------------------------------------------------

def test_synthetic_is_a_market_data() -> None:
    assert isinstance(SyntheticData(), MarketData)
    assert isinstance(YahooData(session=StubSession()), MarketData)


def test_synthetic_deterministic_for_seed() -> None:
    a, b = SyntheticData(seed=7, start_ts=0), SyntheticData(seed=7, start_ts=0)
    for _ in range(25):
        a.refresh()
        b.refresh()
    assert a.get_bars("MSFT", "5m", 200) == b.get_bars("MSFT", "5m", 200)
    assert SyntheticData(seed=8, start_ts=0).get_bars("MSFT", "5m", 50) != \
        SyntheticData(seed=7, start_ts=0).get_bars("MSFT", "5m", 50)


def test_synthetic_path_independent_of_first_request_time() -> None:
    early, late = SyntheticData(seed=3, start_ts=0), SyntheticData(seed=3, start_ts=0)
    early.get_bars("XYZ", "5m", 1)
    for _ in range(40):
        early.refresh()
        late.refresh()
    assert early.get_bars("XYZ", "5m", 400) == late.get_bars("XYZ", "5m", 400)


def test_synthetic_refresh_appends_one_aligned_bar_everywhere() -> None:
    feed = SyntheticData(seed=1, interval="5m", history=150, start_ts=0)
    before = {s: feed.get_bars(s, "5m", 1000) for s in ("AAPL", "SPY")}
    assert all(len(v) == 150 for v in before.values())
    feed.refresh()
    for sym, old in before.items():
        new = feed.get_bars(sym, "5m", 1000)
        assert len(new) == 151
        assert new[:-1] == old
        assert new[-1].ts - new[-2].ts == 300
        assert new[-1].ts == feed.now_ts
        assert feed.get_price(sym) == new[-1].close
    assert len(feed.get_bars("AAPL", "5m", 20)) == 20
    assert feed.get_bars("AAPL", "5m", 0) == []


def test_synthetic_bars_are_well_formed() -> None:
    feed = SyntheticData(seed=11, start_ts=0)
    for sym in ("AAPL", "TSLA", "KO", "BRK.B"):
        bars = feed.get_bars(sym, "5m", 300)
        for bar in bars:
            assert bar.low <= min(bar.open, bar.close) <= max(bar.open, bar.close) <= bar.high
            assert bar.low > 0 and bar.volume > 0
        vols = [b.volume for b in bars]
        assert max(vols) > 1.5 * min(vols)            # volume noise present


def _sma(values: list[float], n: int, i: int) -> float:
    return sum(values[i - n + 1:i + 1]) / n


def test_synthetic_regimes_create_trades_worth_of_movement() -> None:
    """Fast/slow SMA crossovers and both rising and falling stretches occur within a few hundred bars."""
    feed = SyntheticData(seed=42, start_ts=0)
    for _ in range(300):
        feed.refresh()
    ups = downs = crossings = 0
    symbols = ("AAPL", "MSFT", "NVDA", "SPY", "KO", "JPM")
    for sym in symbols:
        closes = [b.close for b in feed.get_bars(sym, "5m", 400)]
        prev: bool | None = None
        for i in range(30, len(closes)):
            above = _sma(closes, 10, i) > _sma(closes, 30, i)
            crossings += prev is not None and above != prev
            prev = above
        for i in range(60, len(closes), 60):
            change = closes[i] / closes[i - 60] - 1
            ups += change > 0.01
            downs += change < -0.01
    assert crossings >= 4 * len(symbols)
    assert ups > 0 and downs > 0


def test_yahoo_failed_price_is_cached_until_refresh() -> None:
    session = StubSession(exc=requests.ConnectionError("offline"))
    feed = YahooData(session=session)
    assert feed.get_price("AAPL") is None
    assert feed.get_price("AAPL") is None
    assert len(session.calls) == 1  # an outage costs one request per symbol per tick
    feed.refresh()
    assert feed.get_price("AAPL") is None
    assert len(session.calls) == 2


def test_synthetic_clock_survives_a_restart(store: Store) -> None:
    """A restarted demo continues its price paths instead of rewinding under the saved portfolio."""
    feed = SyntheticData(seed=4, store=store)
    for _ in range(40):
        feed.refresh()
    before = feed.get_bars("MSFT", "5m", 5)
    restarted = SyntheticData(seed=4, store=store)
    assert restarted.get_bars("MSFT", "5m", 5) == before
    assert restarted.get_price("BTC-USD") == feed.get_price("BTC-USD")
    restarted.refresh()
    feed.refresh()
    assert restarted.get_bars("MSFT", "5m", 1) == feed.get_bars("MSFT", "5m", 1)
    assert SyntheticData(seed=4).get_bars("MSFT", "5m", 5) != before  # without a store it starts over
