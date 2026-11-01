"""Tests for broker.py: paper accounting, Alpaca REST client (faked), factory safety, market clock."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
import requests

from autotrader import broker as broker_mod
from autotrader.broker import (
    AlpacaBroker,
    BrokerError,
    PaperBroker,
    make_broker,
    round_qty,
    us_market_open,
)
from autotrader.config import LIVE_CONFIRMATION_PHRASE, Config, ConfigError
from autotrader.store import Store

UTC = timezone.utc


class Prices:
    """Mutable price table usable as a price_fn."""

    def __init__(self, **prices: float | None) -> None:
        self.prices: dict[str, float | None] = dict(prices)

    def __call__(self, symbol: str) -> float | None:
        return self.prices.get(symbol)


def make_paper(store: Store, prices: Prices, cash: float = 10_000.0, **kw: Any) -> PaperBroker:
    kw.setdefault("slippage_bps", 0.0)
    return PaperBroker(store, prices, cash, market_hours_fn=lambda: True, **kw)


# --------------------------------------------------------------------------- paper broker

def test_buy_debits_cash_and_opens_position(store: Store) -> None:
    b = make_paper(store, Prices(AAPL=100.0))
    order = b.submit_order("aapl", "buy", 10, reason="entry")
    assert order.status == "filled" and order.filled_qty == 10 and order.filled_avg_price == 100.0
    assert order.symbol == "AAPL" and order.reason == "entry"
    assert b.cash == pytest.approx(9_000.0)
    pos = b.get_positions()["AAPL"]
    assert pos.qty == 10 and pos.avg_price == pytest.approx(100.0) and pos.high_water == 100.0


def test_slippage_direction(store: Store) -> None:
    b = make_paper(store, Prices(X=100.0), slippage_bps=50.0)
    buy = b.submit_order("X", "buy", 10)
    assert buy.filled_avg_price == pytest.approx(100.5)
    sell = b.submit_order("X", "sell", 10)
    assert sell.filled_avg_price == pytest.approx(99.5)
    assert b.cash == pytest.approx(10_000.0 - 1005.0 + 995.0)
    assert store.realized_pnl_total() == pytest.approx(-10.0)


def test_avg_cost_on_adds_includes_commission(store: Store) -> None:
    prices = Prices(X=100.0)
    b = make_paper(store, prices, commission=1.0)
    b.submit_order("X", "buy", 10)
    prices.prices["X"] = 110.0
    b.submit_order("X", "buy", 10)
    pos = b.get_positions()["X"]
    assert pos.qty == 20
    assert pos.avg_price == pytest.approx((1000 + 1 + 1100 + 1) / 20)
    assert b.cash == pytest.approx(10_000 - 1001 - 1101)
    assert pos.high_water == 110.0


def test_partial_and_total_sell_realized_pnl(store: Store) -> None:
    prices = Prices(X=100.0)
    b = make_paper(store, prices, commission=2.0)
    b.submit_order("X", "buy", 10)  # avg = 100.2
    prices.prices["X"] = 120.0
    s1 = b.submit_order("X", "sell", 4)
    assert s1.status == "filled"
    pos = b.get_positions()["X"]
    assert pos.qty == pytest.approx(6) and pos.avg_price == pytest.approx(100.2)
    fills = store.recent_fills()
    assert fills[0]["realized_pnl"] == pytest.approx((120 - 100.2) * 4 - 2)
    prices.prices["X"] = 90.0
    b.submit_order("X", "sell", 6)
    assert "X" not in b.get_positions()
    assert store.recent_fills()[0]["realized_pnl"] == pytest.approx((90 - 100.2) * 6 - 2)
    # flat book: cash reconciles exactly with realized P&L
    assert b.cash == pytest.approx(10_000 + store.realized_pnl_total())
    assert b.cash == pytest.approx(10_000 - 1002 + (480 - 2) + (540 - 2))


def test_commission_recorded_on_fill(store: Store) -> None:
    b = make_paper(store, Prices(X=50.0), commission=0.5)
    b.submit_order("X", "buy", 2)
    fill = store.recent_fills()[0]
    assert fill["commission"] == 0.5 and fill["price"] == 50.0 and fill["side"] == "buy"
    assert fill["realized_pnl"] == 0.0


@pytest.mark.parametrize(
    ("symbol", "side", "qty", "fragment"),
    [
        ("NOPRICE", "buy", 1, "no price"),
        ("X", "buy", 1_000, "insufficient cash"),
        ("X", "sell", 1, "cannot sell"),
        ("X", "buy", 0, "positive"),
        ("X", "buy", -3, "positive"),
        ("X", "short", 1, "invalid side"),
    ],
)
def test_rejections(store: Store, symbol: str, side: str, qty: float, fragment: str) -> None:
    b = make_paper(store, Prices(X=100.0, NOPRICE=None), cash=1_000.0)
    order = b.submit_order(symbol, side, qty, reason="why")
    assert order.status == "rejected"
    assert fragment in order.reason and order.reason.startswith("why")
    assert b.cash == 1_000.0 and b.get_positions() == {}
    assert store.recent_fills() == []
    assert store.recent_orders()[0]["status"] == "rejected"


def test_oversell_rejected_but_dust_clamped(store: Store) -> None:
    b = make_paper(store, Prices(X=3.0))
    b.submit_order("X", "buy", 1 / 3)
    held = b.get_positions()["X"].qty
    assert held == 0.333333
    assert b.submit_order("X", "sell", 0.5).status == "rejected"
    order = b.submit_order("X", "sell", held + 5e-7)
    assert order.status == "filled" and order.filled_qty == held
    assert b.get_positions() == {}


def test_invalid_price_rejected(store: Store) -> None:
    b = make_paper(store, Prices(Z=0.0, N=float("nan")))
    assert b.submit_order("Z", "buy", 1).status == "rejected"
    assert b.submit_order("N", "buy", 1).status == "rejected"


def test_whole_share_rounding(store: Store) -> None:
    b = make_paper(store, Prices(X=10.0), fractional=False)
    order = b.submit_order("X", "buy", 3.99)
    assert order.qty == 3 and order.filled_qty == 3
    assert b.submit_order("X", "buy", 0.7).status == "rejected"


def test_fractional_rounding_down() -> None:
    assert round_qty(1.23456789, True) == 1.234567
    assert round_qty(0.1 + 0.2, True) == 0.3
    assert round_qty(2.9999999, False) == 2.0
    assert round_qty(3.0, False) == 3.0
    assert round_qty(float("inf"), True) == 0.0


def test_account_equity_marks_to_market(store: Store) -> None:
    prices = Prices(X=100.0, Y=20.0)
    b = make_paper(store, prices)
    b.submit_order("X", "buy", 10)
    b.submit_order("Y", "buy", 50)
    prices.prices["X"] = 110.0
    prices.prices["Y"] = None  # falls back to average cost
    acct = b.get_account()
    assert acct.cash == pytest.approx(8_000.0)
    assert acct.equity == pytest.approx(8_000 + 1_100 + 1_000)
    assert acct.buying_power == acct.cash and set(acct.positions) == {"X", "Y"}


def test_persistence_restores_across_instances(tmp_path: Path) -> None:
    path = str(tmp_path / "p.db")
    s1 = Store(path)
    prices = Prices(X=100.0)
    b1 = make_paper(s1, prices, commission=1.0)
    b1.submit_order("X", "buy", 5)
    oid = b1.submit_order("X", "sell", 2).id
    s1.close()

    s2 = Store(path)
    b2 = make_paper(s2, prices, cash=999_999.0, commission=1.0)  # initial_cash ignored on restore
    assert b2.cash == pytest.approx(10_000 - 501 + 199)
    pos = b2.get_positions()["X"]
    assert pos.qty == 3 and pos.avg_price == pytest.approx(100.2)
    restored = b2.get_order(oid)
    assert restored is not None and restored.status == "filled" and restored.side == "sell"
    assert b2.get_order("missing") is None
    assert s2.realized_pnl_total() == pytest.approx((100 - 100.2) * 2 - 1)
    s2.close()


def test_get_order_returns_copy(store: Store) -> None:
    b = make_paper(store, Prices(X=1.0))
    order = b.submit_order("X", "buy", 1)
    got = b.get_order(order.id)
    assert got == order and got is not order


def test_adjust_cash(store: Store) -> None:
    b = make_paper(store, Prices(), cash=100.0)
    assert b.adjust_cash(50.0) == 150.0
    assert b.adjust_cash(-150.0) == 0.0
    with pytest.raises(BrokerError):
        b.adjust_cash(-1.0)
    assert store.get_kv("paper_state")["cash"] == 0.0


def test_market_hours_fn_used(store: Store) -> None:
    b = PaperBroker(store, Prices(), 1.0, market_hours_fn=lambda: False)
    assert b.is_market_open() is False
    assert b.name == "paper" and b.is_live is False


# --------------------------------------------------------------------------- alpaca broker (fake session)

class FakeResponse:
    def __init__(self, status: int, body: Any) -> None:
        self.status_code = status
        self._body = body
        self.text = body if isinstance(body, str) else json.dumps(body)
        self.content = b"" if body is None else self.text.encode()

    def json(self) -> Any:
        if isinstance(self._body, str):
            raise ValueError("not json")
        return self._body


class FakeSession:
    """Routes (method, path) to queued responses and records every call."""

    def __init__(self, routes: dict[tuple[str, str], Any] | None = None) -> None:
        self.headers: dict[str, str] = {}
        self.routes: dict[tuple[str, str], list[Any]] = {}
        self.calls: list[dict[str, Any]] = []
        for key, value in (routes or {}).items():
            self.add(*key, value)

    def add(self, method: str, path: str, *responses: Any) -> None:
        self.routes.setdefault((method, path), []).extend(responses)

    def request(self, method: str, url: str, json: Any = None, timeout: float | None = None) -> FakeResponse:
        base, _, path = url.partition(".markets")
        self.calls.append({"method": method, "url": url, "path": path, "json": json, "timeout": timeout})
        queue = self.routes.get((method, path))
        if not queue:
            return FakeResponse(404, {"message": "not found"})
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(item, Exception):
            raise item
        status, body = item
        return FakeResponse(status, body)


def alpaca(session: FakeSession, paper: bool = True, **kw: Any) -> AlpacaBroker:
    return AlpacaBroker("KEY", "SECRET", paper=paper, session=session, **kw)


def order_body(**over: Any) -> dict[str, Any]:
    body = {"id": "o1", "symbol": "AAPL", "side": "buy", "qty": "1.5", "status": "accepted",
            "submitted_at": "2026-10-26T14:30:00.123456789Z", "filled_qty": "0",
            "filled_avg_price": None, "type": "market"}
    body.update(over)
    return body


def test_alpaca_urls_headers_and_flags() -> None:
    s = FakeSession({("GET", "/v2/clock"): (200, {"is_open": True})})
    paper = alpaca(s)
    assert paper.is_market_open() is True
    assert s.calls[-1]["url"] == "https://paper-api.alpaca.markets/v2/clock"
    assert s.calls[-1]["timeout"] == 10.0
    assert s.headers["APCA-API-KEY-ID"] == "KEY" and s.headers["APCA-API-SECRET-KEY"] == "SECRET"
    assert paper.is_live is False and paper.name == "alpaca-paper"
    live = alpaca(s, paper=False)
    live.is_market_open()
    assert s.calls[-1]["url"] == "https://api.alpaca.markets/v2/clock"
    assert live.is_live is True and live.name == "alpaca-live"


def test_alpaca_requires_credentials() -> None:
    with pytest.raises(BrokerError):
        AlpacaBroker("", "x", paper=True, session=FakeSession())


def test_alpaca_account_and_positions() -> None:
    s = FakeSession({
        ("GET", "/v2/account"): (200, {"cash": "1234.5", "equity": "2000", "buying_power": "2469"}),
        ("GET", "/v2/positions"): (200, [
            {"symbol": "AAPL", "qty": "3", "avg_entry_price": "150.25", "current_price": "155"},
            {"symbol": "MSFT", "qty": "0.5", "avg_entry_price": "400", "current_price": "410"},
        ]),
    })
    acct = alpaca(s).get_account()
    assert acct.cash == 1234.5 and acct.equity == 2000.0 and acct.buying_power == 2469.0
    assert acct.positions["AAPL"].qty == 3 and acct.positions["AAPL"].avg_price == 150.25
    assert acct.positions["MSFT"].qty == 0.5 and acct.positions["MSFT"].opened_ts > 0


def test_alpaca_submit_order_payload_and_parse() -> None:
    s = FakeSession({("POST", "/v2/orders"): (200, order_body())})
    order = alpaca(s).submit_order("aapl", "buy", 1.5000004, reason="signal")
    sent = s.calls[-1]["json"]
    assert sent["symbol"] == "AAPL" and sent["side"] == "buy" and sent["qty"] == "1.5"
    assert sent["type"] == "market" and sent["time_in_force"] == "day"
    assert sent["client_order_id"].startswith("autotrader-")
    assert order.id == "o1" and order.status == "accepted" and order.qty == 1.5
    assert order.reason == "signal" and order.filled_avg_price is None
    assert order.submitted_ts == pytest.approx(
        datetime(2026, 10, 26, 14, 30, 0, 123456, tzinfo=UTC).timestamp())


def test_alpaca_whole_shares_when_not_fractional() -> None:
    s = FakeSession({("POST", "/v2/orders"): (200, order_body(qty="2"))})
    alpaca(s, fractional=False).submit_order("AAPL", "buy", 2.9)
    assert s.calls[-1]["json"]["qty"] == "2"
    zero = alpaca(s, fractional=False).submit_order("AAPL", "buy", 0.4)
    assert zero.status == "rejected" and len(s.calls) == 1


def test_alpaca_api_error_raises_with_message() -> None:
    s = FakeSession({("POST", "/v2/orders"): (403, {"code": 40310000, "message": "insufficient buying power"})})
    with pytest.raises(BrokerError, match="insufficient buying power"):
        alpaca(s).submit_order("AAPL", "buy", 1)
    with pytest.raises(BrokerError, match="invalid order side"):
        alpaca(s).submit_order("AAPL", "hold", 1)


def test_alpaca_network_error_raises() -> None:
    s = FakeSession({("GET", "/v2/account"): requests.ConnectionError("boom")})
    with pytest.raises(BrokerError, match="boom"):
        alpaca(s).get_account()


def test_alpaca_get_order_and_404() -> None:
    s = FakeSession({("GET", "/v2/orders/o1"): (200, order_body(status="filled", filled_qty="1.5",
                                                                 filled_avg_price="101.0"))})
    b = alpaca(s)
    order = b.get_order("o1")
    assert order is not None and order.status == "filled" and order.filled_avg_price == 101.0
    assert b.get_order("nope") is None


def test_alpaca_status_mapping() -> None:
    s = FakeSession({("GET", "/v2/orders/o1"): (200, order_body(status="pending_new"))})
    s.add("GET", "/v2/orders/o2", (200, order_body(id="o2", status="expired")))
    b = alpaca(s)
    assert b.get_order("o1").status == "accepted"  # type: ignore[union-attr]
    assert b.get_order("o2").status == "canceled"  # type: ignore[union-attr]


def test_alpaca_clock_failure_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(broker_mod, "us_market_open", lambda now_utc=None: True)
    s = FakeSession({("GET", "/v2/clock"): (500, "oops")})
    assert alpaca(s).is_market_open() is True


def test_alpaca_reconciles_fills_into_store(store: Store) -> None:
    s = FakeSession()
    s.add("GET", "/v2/positions", (200, [{"symbol": "AAPL", "qty": "10", "avg_entry_price": "100"}]))
    s.add("POST", "/v2/orders", (200, order_body(side="sell", qty="10", status="accepted")))
    s.add("GET", "/v2/orders/o1",
          (200, order_body(side="sell", qty="10", status="partially_filled",
                           filled_qty="4", filled_avg_price="110")),
          (200, order_body(side="sell", qty="10", status="filled",
                           filled_qty="10", filled_avg_price="112")))
    s.add("GET", "/v2/account", (200, {"cash": "1", "equity": "1", "buying_power": "1"}))
    b = alpaca(s, store=store)
    order = b.submit_order("AAPL", "sell", 10, reason="exit")
    assert order.status == "accepted" and store.recent_fills() == []
    assert store.get_kv("alpaca_pending")["o1"]["avg_cost"] == 100.0

    b.get_account()  # partial fill
    b.get_account()  # final fill
    fills = list(reversed(store.recent_fills()))
    assert [f["qty"] for f in fills] == pytest.approx([4, 6])
    assert fills[0]["price"] == pytest.approx(110.0)
    assert fills[1]["price"] == pytest.approx((10 * 112 - 4 * 110) / 6)
    assert store.realized_pnl_total() == pytest.approx(10 * 112 - 10 * 100)
    assert store.recent_orders()[0]["status"] == "filled"
    assert store.recent_orders()[0]["reason"] == "exit"
    assert store.get_kv("alpaca_pending") == {}

    restarted = alpaca(s, store=store)  # nothing pending survives a terminal fill
    restarted.get_account()
    assert len(store.recent_fills()) == 2


# --------------------------------------------------------------------------- make_broker safety

class StubData:
    def get_price(self, symbol: str) -> float | None:
        return 10.0


@pytest.fixture
def no_keys(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.delenv("APCA_API_KEY_ID", raising=False)
    monkeypatch.delenv("APCA_API_SECRET_KEY", raising=False)
    return monkeypatch


def with_keys(mp: pytest.MonkeyPatch) -> None:
    mp.setenv("APCA_API_KEY_ID", "id")
    mp.setenv("APCA_API_SECRET_KEY", "secret")


def test_make_broker_sim(store: Store, demo_cfg: Config) -> None:
    demo_cfg.commission_per_trade = 1.0
    b = make_broker(demo_cfg, store, StubData())  # type: ignore[arg-type]
    assert isinstance(b, PaperBroker) and not b.is_live
    assert b.cash == demo_cfg.initial_fund and b.commission == 1.0
    assert b.submit_order("X", "buy", 1).status == "filled"


def test_make_broker_paper_needs_keys(store: Store, no_keys: pytest.MonkeyPatch) -> None:
    cfg = Config(mode="alpaca-paper")
    with pytest.raises(ConfigError, match="APCA_API_KEY_ID"):
        make_broker(cfg, store, StubData())  # type: ignore[arg-type]
    with_keys(no_keys)
    b = make_broker(cfg, store, StubData())  # type: ignore[arg-type]
    assert isinstance(b, AlpacaBroker) and not b.is_live
    assert b.base_url == "https://paper-api.alpaca.markets"


@pytest.mark.parametrize("phrase", ["", "i accept real-money risk", "I ACCEPT REAL-MONEY RISK ", "yes"])
def test_make_broker_live_refuses_without_exact_phrase(
        store: Store, no_keys: pytest.MonkeyPatch, phrase: str) -> None:
    with_keys(no_keys)
    cfg = Config(mode="alpaca-live", live_confirmation=phrase)
    with pytest.raises(ConfigError, match="live_confirmation"):
        make_broker(cfg, store, StubData())  # type: ignore[arg-type]


def test_make_broker_live_refuses_without_keys(store: Store, no_keys: pytest.MonkeyPatch) -> None:
    cfg = Config(mode="alpaca-live", live_confirmation=LIVE_CONFIRMATION_PHRASE)
    with pytest.raises(ConfigError, match="APCA_API_SECRET_KEY"):
        make_broker(cfg, store, StubData())  # type: ignore[arg-type]
    no_keys.setenv("APCA_API_KEY_ID", "id")
    with pytest.raises(ConfigError, match="APCA_API_SECRET_KEY"):
        make_broker(cfg, store, StubData())  # type: ignore[arg-type]


def test_make_broker_live_with_phrase_and_keys(store: Store, no_keys: pytest.MonkeyPatch) -> None:
    with_keys(no_keys)
    cfg = Config(mode="alpaca-live", live_confirmation=LIVE_CONFIRMATION_PHRASE)
    b = make_broker(cfg, store, StubData())  # type: ignore[arg-type]
    assert isinstance(b, AlpacaBroker) and b.is_live
    assert b.base_url == "https://api.alpaca.markets"


# --------------------------------------------------------------------------- market clock

def at(y: int, mo: int, d: int, h: int, mi: int = 0) -> datetime:
    return datetime(y, mo, d, h, mi, tzinfo=UTC)


@pytest.mark.parametrize(
    ("when", "expected"),
    [
        (at(2026, 10, 26, 13, 29), False),   # Mon 09:29 EDT
        (at(2026, 10, 26, 13, 30), True),    # Mon 09:30 EDT
        (at(2026, 10, 26, 17, 0), True),     # Mon 13:00 EDT
        (at(2026, 10, 26, 19, 59), True),    # Mon 15:59 EDT
        (at(2026, 10, 26, 20, 0), False),    # Mon 16:00 EDT
        (at(2026, 10, 27, 2, 0), False),     # overnight
        (at(2026, 10, 24, 15, 0), False),    # Saturday
        (at(2026, 10, 25, 15, 0), False),    # Sunday
        (at(2026, 11, 26, 15, 0), False),    # Thanksgiving
        (at(2026, 7, 3, 15, 0), False),      # Independence Day observed
        (at(2025, 1, 9, 15, 0), False),      # National Day of Mourning
        (at(2027, 12, 24, 15, 0), False),    # Christmas observed
        (at(2027, 12, 31, 15, 0), True),     # New Year 2028 is a Saturday: no observance
        # DST start: Sun 2026-03-08
        (at(2026, 3, 6, 13, 30), False),     # Fri 08:30 EST
        (at(2026, 3, 6, 14, 30), True),      # Fri 09:30 EST
        (at(2026, 3, 6, 20, 30), True),      # Fri 15:30 EST
        (at(2026, 3, 9, 13, 30), True),      # Mon 09:30 EDT
        (at(2026, 3, 9, 20, 30), False),     # Mon 16:30 EDT
        # DST end: Sun 2026-11-01
        (at(2026, 10, 30, 13, 30), True),    # Fri 09:30 EDT
        (at(2026, 11, 2, 13, 30), False),    # Mon 08:30 EST
        (at(2026, 11, 2, 14, 30), True),     # Mon 09:30 EST
        (at(2026, 11, 2, 20, 30), True),     # Mon 15:30 EST
        (at(2026, 11, 2, 21, 0), False),     # Mon 16:00 EST
        # early closes (13:00 ET)
        (at(2026, 11, 27, 17, 59), True),    # day after Thanksgiving 12:59 EST
        (at(2026, 11, 27, 18, 0), False),    # 13:00 EST: closed
        (at(2026, 12, 24, 19, 0), False),    # Christmas Eve 14:00 EST
        (at(2026, 12, 23, 19, 0), True),     # a normal day at 14:00 EST
    ],
)
def test_us_market_open(when: datetime, expected: bool) -> None:
    assert us_market_open(when) is expected


def test_market_open_accepts_naive_and_other_zones() -> None:
    assert us_market_open(datetime(2026, 10, 26, 14, 0)) is True  # naive = UTC
    tokyo = timezone(timedelta(hours=9))
    assert us_market_open(datetime(2026, 10, 26, 23, 30, tzinfo=tokyo)) is True  # 10:30 EDT
    assert isinstance(us_market_open(), bool)


def test_rule_based_eastern_matches_zoneinfo() -> None:
    t = at(2025, 1, 1, 0)
    end = at(2028, 1, 1, 0)
    while t < end:
        assert broker_mod._eastern_by_rule(t) == broker_mod.to_eastern(t), t
        t += timedelta(minutes=37)
