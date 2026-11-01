"""Crypto rules in broker.py: 24/7 clock, paper precision/slippage, Alpaca symbol mapping (faked HTTP)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import pytest

from autotrader.broker import (
    AlpacaBroker,
    BrokerError,
    PaperBroker,
    canonical_symbol,
    from_alpaca_symbol,
    make_broker,
    market_open_for,
    round_qty,
    to_alpaca_symbol,
)
from autotrader.config import Config, demo_config
from autotrader.store import Store

SATURDAY = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)
TUESDAY_OPEN = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)  # 11:00 ET


class Prices:
    def __init__(self, **prices: float) -> None:
        self.prices = {k.replace("_", "-"): v for k, v in prices.items()}

    def __call__(self, symbol: str) -> float | None:
        return self.prices.get(symbol)


def paper(store: Store, *, open_: bool = False, **kw: Any) -> PaperBroker:
    prices = Prices(BTC_USD=60_000.0, DOGE_USD=0.1234, AAPL=200.0, ETH_USDT=3000.0)
    return PaperBroker(store, prices, 10_000.0, market_hours_fn=lambda: open_, **kw)


# --------------------------------------------------------------------------- clock

def test_market_open_for_crypto_is_always_true() -> None:
    assert market_open_for("BTC-USD", SATURDAY) is True
    assert market_open_for("ETH-USDT", SATURDAY) is True
    assert market_open_for("AAPL", SATURDAY) is False
    assert market_open_for("AAPL", TUESDAY_OPEN) is True


def test_paper_is_market_open_per_symbol(store: Store) -> None:
    b = paper(store, open_=False)
    assert b.is_market_open() is False
    assert b.is_market_open("AAPL") is False
    assert b.is_market_open("BTC-USD") is True
    assert b.is_market_open("btc/usd") is True
    assert paper(store, open_=True).is_market_open("AAPL") is True


# --------------------------------------------------------------------------- paper broker

def test_canonical_symbol_and_round_qty_precision() -> None:
    assert canonical_symbol(" btc/usd ") == "BTC-USD"
    assert canonical_symbol("brk.b") == "BRK.B"
    assert round_qty(0.123456789, True, 8) == 0.12345678
    assert round_qty(0.123456789, True) == 0.123456


def test_paper_crypto_always_fractional_8dp(store: Store) -> None:
    b = paper(store, fractional=False, slippage_bps=0.0, crypto_slippage_bps=0.0)
    order = b.submit_order("BTC-USD", "buy", 0.0123456789)
    assert order.status == "filled" and order.qty == 0.01234567
    assert b.get_positions()["BTC-USD"].qty == pytest.approx(0.01234567)
    stock = b.submit_order("AAPL", "buy", 2.9)
    assert stock.qty == 2.0  # stocks still honor fractional=False


def test_paper_crypto_trades_while_stock_market_closed(store: Store) -> None:
    b = paper(store, open_=False, crypto_slippage_bps=0.0)
    assert b.submit_order("DOGE-USD", "buy", 1000).status == "filled"
    sell = b.submit_order("DOGE-USD", "sell", 1000)
    assert sell.status == "filled" and "DOGE-USD" not in b.get_positions()


def test_paper_crypto_uses_crypto_slippage(store: Store) -> None:
    b = paper(store, slippage_bps=5.0, crypto_slippage_bps=10.0)
    btc = b.submit_order("BTC-USD", "buy", 0.01)
    assert btc.filled_avg_price == pytest.approx(60_000.0 * 1.001)
    aapl = b.submit_order("AAPL", "buy", 1)
    assert aapl.filled_avg_price == pytest.approx(200.0 * 1.0005)
    sold = b.submit_order("BTC-USD", "sell", 0.01)
    assert sold.filled_avg_price == pytest.approx(60_000.0 * 0.999)


def test_paper_crypto_dust_clamped_at_8dp(store: Store) -> None:
    b = paper(store, crypto_slippage_bps=0.0)
    b.submit_order("ETH-USDT", "buy", 0.5)
    sell = b.submit_order("ETH-USDT", "sell", 0.500000009)
    assert sell.status == "filled" and sell.qty == 0.5
    assert b.get_positions() == {}


def test_paper_slash_symbol_is_canonicalized(store: Store) -> None:
    b = paper(store)
    order = b.submit_order("btc/usd", "buy", 0.001)
    assert order.symbol == "BTC-USD" and order.status == "filled"


def test_paper_crypto_persists_and_restores(store: Store) -> None:
    b = paper(store, crypto_slippage_bps=0.0)
    b.submit_order("BTC-USD", "buy", 0.00012345)
    restored = paper(store)
    assert restored.get_positions()["BTC-USD"].qty == pytest.approx(0.00012345)
    assert restored.cash == pytest.approx(b.cash)


# --------------------------------------------------------------------------- alpaca mapping

@pytest.mark.parametrize(("canonical", "alpaca_sym"), [
    ("BTC-USD", "BTC/USD"), ("ETH-USDT", "ETH/USDT"), ("SOL-USDC", "SOL/USDC"),
    ("btc/usd", "BTC/USD"), ("AAPL", "AAPL"), ("BRK.B", "BRK.B"),
])
def test_to_alpaca_symbol(canonical: str, alpaca_sym: str) -> None:
    assert to_alpaca_symbol(canonical) == alpaca_sym


@pytest.mark.parametrize("bad", ["ETH-EUR", "ETH/BTC", "BTC-GBP"])
def test_to_alpaca_symbol_rejects_other_quotes(bad: str) -> None:
    with pytest.raises(BrokerError, match="USD, USDT or USDC"):
        to_alpaca_symbol(bad)


@pytest.mark.parametrize(("raw", "cls", "expected"), [
    ("BTCUSD", "crypto", "BTC-USD"), ("BTC/USD", "crypto", "BTC-USD"), ("BTC/USD", None, "BTC-USD"),
    ("ETHUSDT", "crypto", "ETH-USDT"), ("SOLUSDC", "crypto", "SOL-USDC"), ("AAPL", "us_equity", "AAPL"),
    ("ETH/BTC", "crypto", None), ("ETHBTC", "crypto", None),
])
def test_from_alpaca_symbol(raw: str, cls: str | None, expected: str | None) -> None:
    assert from_alpaca_symbol(raw, cls) == expected


class FakeResponse:
    def __init__(self, status: int, body: Any) -> None:
        self.status_code = status
        self._body = body
        self.text = json.dumps(body)
        self.content = self.text.encode()

    def json(self) -> Any:
        return self._body


class FakeSession:
    """Serves queued responses per (method, path) and records each request."""

    def __init__(self) -> None:
        self.headers: dict[str, str] = {}
        self.routes: dict[tuple[str, str], list[tuple[int, Any]]] = {}
        self.calls: list[dict[str, Any]] = []

    def add(self, method: str, path: str, *responses: tuple[int, Any]) -> None:
        self.routes.setdefault((method, path), []).extend(responses)

    def request(self, method: str, url: str, json: Any = None, timeout: float | None = None) -> FakeResponse:
        path = url.partition(".markets")[2]
        self.calls.append({"method": method, "path": path, "json": json})
        queue = self.routes.get((method, path))
        if not queue:
            return FakeResponse(404, {"message": "not found"})
        status, body = queue.pop(0) if len(queue) > 1 else queue[0]
        return FakeResponse(status, body)


def crypto_order(**over: Any) -> dict[str, Any]:
    body = {"id": "c1", "symbol": "BTC/USD", "asset_class": "crypto", "side": "buy",
            "qty": "0.012345678", "status": "pending_new", "submitted_at": "2026-10-24T15:00:00Z",
            "filled_qty": "0", "filled_avg_price": None, "type": "market"}
    body.update(over)
    return body


def test_alpaca_crypto_order_payload() -> None:
    s = FakeSession()
    s.add("POST", "/v2/orders", (200, crypto_order()))
    order = AlpacaBroker("K", "S", paper=True, fractional=False, session=s).submit_order(
        "BTC-USD", "buy", 0.0123456789, reason="signal")
    sent = s.calls[-1]["json"]
    assert sent["symbol"] == "BTC/USD" and sent["time_in_force"] == "gtc"
    assert sent["qty"] == "0.012345678" and sent["type"] == "market"
    assert order.symbol == "BTC-USD" and order.status == "accepted" and order.filled_qty == 0.0


def test_alpaca_stock_order_unchanged() -> None:
    s = FakeSession()
    s.add("POST", "/v2/orders", (200, crypto_order(symbol="AAPL", asset_class="us_equity", qty="1.5")))
    AlpacaBroker("K", "S", paper=True, session=s).submit_order("AAPL", "buy", 1.5)
    sent = s.calls[-1]["json"]
    assert sent["symbol"] == "AAPL" and sent["time_in_force"] == "day" and sent["qty"] == "1.5"


def test_alpaca_rejects_unsupported_quote_without_request() -> None:
    s = FakeSession()
    with pytest.raises(BrokerError):
        AlpacaBroker("K", "S", paper=True, session=s).submit_order("ETH-EUR", "buy", 1)
    assert s.calls == []


def test_alpaca_crypto_positions_map_to_canonical() -> None:
    s = FakeSession()
    s.add("GET", "/v2/positions", (200, [
        {"symbol": "BTCUSD", "asset_class": "crypto", "qty": "0.5", "avg_entry_price": "60000",
         "current_price": "61000"},
        {"symbol": "ETH/USDT", "asset_class": "crypto", "qty": "2", "avg_entry_price": "3000",
         "current_price": "3100"},
        {"symbol": "ETHBTC", "asset_class": "crypto", "qty": "1", "avg_entry_price": "0.05",
         "current_price": "0.05"},
        {"symbol": "AAPL", "asset_class": "us_equity", "qty": "3", "avg_entry_price": "150",
         "current_price": "155"},
    ]))
    positions = AlpacaBroker("K", "S", paper=True, session=s).get_positions()
    assert set(positions) == {"BTC-USD", "ETH-USDT", "AAPL"}
    assert positions["BTC-USD"].qty == 0.5 and positions["BTC-USD"].avg_price == 60_000.0


def test_alpaca_crypto_market_always_open_without_clock_call() -> None:
    s = FakeSession()
    s.add("GET", "/v2/clock", (200, {"is_open": False}))
    b = AlpacaBroker("K", "S", paper=True, session=s)
    assert b.is_market_open("BTC-USD") is True and s.calls == []
    assert b.is_market_open("AAPL") is False and b.is_market_open() is False


def test_alpaca_crypto_partial_fill_not_treated_as_filled(store: Store) -> None:
    s = FakeSession()
    s.add("GET", "/v2/positions", (200, [
        {"symbol": "BTCUSD", "asset_class": "crypto", "qty": "1", "avg_entry_price": "50000",
         "current_price": "60000"},
    ]))
    s.add("POST", "/v2/orders", (200, crypto_order(side="sell", qty="1", status="new")))
    s.add("GET", "/v2/orders/c1",
          (200, crypto_order(side="sell", qty="1", status="partially_filled",
                             filled_qty="0.4", filled_avg_price="60000")),
          (200, crypto_order(side="sell", qty="1", status="filled",
                             filled_qty="1", filled_avg_price="61000")))
    b = AlpacaBroker("K", "S", paper=True, session=s, store=store)
    sent = b.submit_order("BTC-USD", "sell", 1)
    assert sent.status == "new" and store.recent_fills() == []

    partial = b.get_order("c1")
    assert partial is not None and partial.status == "partially_filled" and partial.symbol == "BTC-USD"
    fills = store.recent_fills()
    assert len(fills) == 1 and fills[0]["qty"] == pytest.approx(0.4) and fills[0]["symbol"] == "BTC-USD"

    done = b.get_order("c1")
    assert done is not None and done.status == "filled"
    fills = store.recent_fills()
    assert sum(f["qty"] for f in fills) == pytest.approx(1.0)
    assert store.realized_pnl_total() == pytest.approx(61_000.0 - 50_000.0)


# --------------------------------------------------------------------------- factory

class StubData:
    def get_price(self, symbol: str) -> float | None:
        return 100.0


def test_make_broker_wires_crypto_slippage(store: Store) -> None:
    cfg = demo_config()
    cfg.crypto_slippage_bps = 25.0
    cfg.slippage_bps = 1.0
    cfg.fractional = False
    b = make_broker(cfg, store, StubData())  # type: ignore[arg-type]
    assert isinstance(b, PaperBroker)
    assert b.crypto_slippage_bps == 25.0 and b.slippage_bps == 1.0
    order = b.submit_order("SOL-USD", "buy", 0.123456789)
    assert order.qty == 0.12345678
    assert order.filled_avg_price == pytest.approx(100.0 * 1.0025)


def test_make_broker_default_crypto_slippage(store: Store) -> None:
    b = make_broker(Config(), store, StubData())  # type: ignore[arg-type]
    assert isinstance(b, PaperBroker) and b.crypto_slippage_bps == 10.0
