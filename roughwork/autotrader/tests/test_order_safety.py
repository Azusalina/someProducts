"""Broker and risk regressions: ledger cost basis, order-status mapping, ambiguous submissions,
cancellation, broker cash activity, outage valuation and drawdown escalation (all offline)."""

from __future__ import annotations

import json
from typing import Any

import pytest
import requests

from autotrader.broker import AlpacaBroker, AmbiguousOrderError, BrokerError, PaperBroker
from autotrader.config import RiskConfig
from autotrader.risk import HALT_DRAWDOWN, HALT_KILL, RiskManager
from autotrader.store import Store

NOW = 1_793_000_000.0


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
    """Routes (method, path-with-query) to queued responses; the last response repeats."""

    def __init__(self) -> None:
        self.headers: dict[str, str] = {}
        self.routes: dict[tuple[str, str], list[Any]] = {}
        self.calls: list[dict[str, Any]] = []

    def add(self, method: str, path: str, *responses: Any) -> None:
        self.routes.setdefault((method, path), []).extend(responses)

    def request(self, method: str, url: str, json: Any = None, timeout: float | None = None) -> FakeResponse:
        path = url.partition(".markets")[2]
        self.calls.append({"method": method, "path": path, "json": json})
        queue = self.routes.get((method, path))
        if not queue:
            return FakeResponse(404, {"message": "not found"})
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(item, Exception):
            raise item
        return FakeResponse(*item)


def body(**over: Any) -> dict[str, Any]:
    out = {"id": "o1", "symbol": "AAPL", "side": "sell", "qty": "10", "status": "accepted",
           "submitted_at": "2026-10-27T14:30:00Z", "filled_qty": "0", "filled_avg_price": None,
           "type": "market"}
    out.update(over)
    return out


def alpaca(session: FakeSession, store: Store | None = None) -> AlpacaBroker:
    return AlpacaBroker("KEY", "SECRET", paper=True, session=session, store=store)


# ----- realized P&L uses the caller's cost basis --------------------------------------------


def blended_account(s: FakeSession) -> None:
    """The user holds 100 AAPL @ 100 and the bot 10 @ 200: Alpaca averages them to 109.09."""
    s.add("GET", "/v2/positions", (200, [{"symbol": "AAPL", "qty": "110", "avg_entry_price": str(12000 / 110)}]))
    s.add("POST", "/v2/orders", (200, body(status="filled", filled_qty="10", filled_avg_price="210")))


def test_alpaca_sell_realizes_against_the_ledger_cost(store: Store) -> None:
    s = FakeSession()
    blended_account(s)
    alpaca(s, store).submit_order("AAPL", "sell", 10, reason="exit", cost_basis=200.0)
    assert store.realized_pnl_total() == pytest.approx(100.0)  # not 1009.09 from the blended average
    assert not any(c["path"] == "/v2/positions" for c in s.calls)  # the account average is not consulted


def test_alpaca_sell_without_basis_falls_back_to_the_account_average(store: Store) -> None:
    s = FakeSession()
    blended_account(s)
    alpaca(s, store).submit_order("AAPL", "sell", 10)
    assert store.realized_pnl_total() == pytest.approx((210 - 12000 / 110) * 10)


def test_paper_sell_realizes_against_the_given_cost_basis(store: Store) -> None:
    price = {"AAPL": 100.0}
    b = PaperBroker(store, price.get, 100_000.0, slippage_bps=0.0)
    b.submit_order("AAPL", "buy", 100)  # the user's units
    price["AAPL"] = 200.0
    b.submit_order("AAPL", "buy", 10)  # the bot's units
    price["AAPL"] = 210.0
    b.submit_order("AAPL", "sell", 10, cost_basis=200.0)
    assert store.realized_pnl_total() == pytest.approx(100.0)
    assert b.get_positions()["AAPL"].qty == pytest.approx(100.0)


# ----- Alpaca order status: only final states are terminal ----------------------------------


@pytest.mark.parametrize("raw", ["pending_cancel", "done_for_day", "pending_replace"])
def test_alpaca_non_final_statuses_stay_open(raw: str) -> None:
    s = FakeSession()
    s.add("GET", "/v2/orders/o1", (200, body(status=raw)))
    assert alpaca(s).get_order("o1").status == "accepted"  # type: ignore[union-attr]
    s.routes.clear()
    s.add("GET", "/v2/orders/o1", (200, body(status=raw, filled_qty="4", filled_avg_price="10")))
    assert alpaca(s).get_order("o1").status == "partially_filled"  # type: ignore[union-attr]


def test_fill_after_pending_cancel_is_recorded(store: Store) -> None:
    s = FakeSession()
    s.add("POST", "/v2/orders", (200, body(side="buy")))
    s.add("GET", "/v2/orders/o1",
          (200, body(side="buy", status="pending_cancel")),
          (200, body(side="buy", status="filled", filled_qty="10", filled_avg_price="100")))
    b = alpaca(s, store)
    b.submit_order("AAPL", "buy", 10)
    assert b.get_order("o1").status == "accepted"  # type: ignore[union-attr]
    assert "o1" in store.get_kv("alpaca_pending")  # still reconciled
    assert b.get_order("o1").status == "filled"  # type: ignore[union-attr]
    fills = store.recent_fills()
    assert len(fills) == 1 and fills[0]["qty"] == pytest.approx(10.0)
    assert store.get_kv("alpaca_pending") == {}


# ----- ambiguous submissions ------------------------------------------------------------------


class LookupSession(FakeSession):
    """Answers every client-order-id lookup with ``found`` (404 while it is None)."""

    def __init__(self) -> None:
        super().__init__()
        self.found: dict[str, Any] | None = None

    def request(self, method: str, url: str, json: Any = None, timeout: float | None = None) -> FakeResponse:
        if "by_client_order_id" in url:
            self.calls.append({"method": method, "path": url.partition(".markets")[2], "json": json})
            return FakeResponse(200, self.found) if self.found else FakeResponse(404, {"message": "not found"})
        return super().request(method, url, json=json, timeout=timeout)


def test_timeout_with_an_accepted_order_returns_it(store: Store) -> None:
    s = LookupSession()
    s.add("POST", "/v2/orders", requests.Timeout("read timed out"))
    s.found = body(id="o9", side="buy", status="accepted")
    order = alpaca(s, store).submit_order("AAPL", "buy", 10, reason="entry")
    assert order.id == "o9" and order.status == "accepted"
    assert "o9" in store.get_kv("alpaca_pending")  # tracked for fills like any other order


@pytest.mark.parametrize("failure", [requests.ConnectionError("reset"), (503, {"message": "unavailable"})])
def test_unknown_outcome_raises_with_client_id_and_resolves_later(store: Store, failure: Any) -> None:
    s = FakeSession()
    s.add("POST", "/v2/orders", failure)
    b = alpaca(s, store)
    with pytest.raises(AmbiguousOrderError) as info:
        b.submit_order("AAPL", "buy", 10, reason="entry")
    cid = info.value.client_order_id
    assert cid == s.calls[0]["json"]["client_order_id"] and cid.startswith("autotrader-")
    path = f"/v2/orders:by_client_order_id?client_order_id={cid}"
    assert any(c["path"] == path for c in s.calls)  # looked up once before giving up
    assert b.find_order_by_client_id(cid) is None
    s.add("GET", path, (200, body(id="o7", side="buy", status="filled", filled_qty="10", filled_avg_price="50")))
    found = b.find_order_by_client_id(cid, reason="entry")
    assert found is not None and found.id == "o7" and found.status == "filled"
    assert store.recent_fills()[0]["qty"] == pytest.approx(10.0)


def test_client_errors_are_not_ambiguous() -> None:
    s = FakeSession()
    s.add("POST", "/v2/orders", (403, {"message": "insufficient buying power"}))
    with pytest.raises(BrokerError, match="insufficient") as info:
        alpaca(s).submit_order("AAPL", "buy", 10)
    assert not isinstance(info.value, AmbiguousOrderError)


# ----- cancellation and cash activity ---------------------------------------------------------


def test_alpaca_cancel_order() -> None:
    s = FakeSession()
    s.add("DELETE", "/v2/orders/o1", (204, None))
    assert alpaca(s).cancel_order("o1") is True
    assert alpaca(s).cancel_order("gone") is False  # 404: nothing to cancel
    s.add("DELETE", "/v2/orders/done", (422, {"message": "order is already filled"}))
    assert alpaca(s).cancel_order("done") is False


@pytest.mark.parametrize("failure", [requests.ConnectionError("network down"),
                                     (503, {"message": "service unavailable"})])
def test_alpaca_cancel_transient_failure_raises_so_the_engine_retries(failure: Any) -> None:
    s = FakeSession()
    s.add("DELETE", "/v2/orders/o1", failure)
    with pytest.raises(BrokerError):
        alpaca(s).cancel_order("o1")


def test_paper_broker_has_nothing_to_cancel_or_report(store: Store) -> None:
    b = PaperBroker(store, lambda s: 10.0, 1000.0)
    assert b.cancel_order("x") is False
    assert b.cash_flows(NOW) == []


def test_alpaca_cash_flows_parse_activities() -> None:
    s = FakeSession()
    rows = [
        {"id": "a1", "activity_type": "CSW", "net_amount": "-3000", "date": "2026-10-27"},
        {"id": "a2", "activity_type": "CSD", "net_amount": "500.5", "date": "2026-10-27",
         "transaction_time": "2026-10-27T15:00:00Z"},
    ]
    path = ("/v2/account/activities?activity_types=CSD,CSW,JNLC&after=2026-10-26"
            "&direction=asc&page_size=100")
    s.add("GET", path, (200, rows))
    since = 1_793_102_400.0  # 2026-10-27T12:00:00Z
    flows = alpaca(s).cash_flows(since)
    assert [(f.id, f.amount, f.kind) for f in flows] == [("a1", -3000.0, "CSW"), ("a2", 500.5, "CSD")]
    assert flows[1].ts == pytest.approx(1_793_113_200.0)


def test_alpaca_cash_flows_error_raises() -> None:
    s = FakeSession()
    with pytest.raises(BrokerError):
        alpaca(s).cash_flows(NOW)  # every route 404s


# ----- valuation during a data outage -----------------------------------------------------------


def test_paper_values_positions_at_last_known_price_during_outage(store: Store) -> None:
    price: dict[str, float | None] = {"AAPL": 90.0}
    b = PaperBroker(store, price.get, 9000.0, slippage_bps=0.0)
    b.submit_order("AAPL", "buy", 100)
    price["AAPL"] = 120.0
    assert b.get_account().equity == pytest.approx(12_000.0)
    price["AAPL"] = None  # feed outage
    assert b.get_account().equity == pytest.approx(12_000.0)  # not 9,000 at cost
    restarted = PaperBroker(store, price.get, 9000.0)
    assert restarted.get_account().equity == pytest.approx(12_000.0)


# ----- drawdown kill switch under other halts ---------------------------------------------------


def test_drawdown_escalates_over_a_daily_halt(store: Store) -> None:
    rm = RiskManager(RiskConfig(daily_loss_limit_pct=0.05, max_drawdown_pct=0.25), store)
    assert rm.can_open(10_000.0, NOW) == (True, "ok")
    ok, why = rm.can_open(9_400.0, NOW)
    assert not ok and "daily loss" in why and rm.halt_kind == "daily"
    ok, why = rm.can_open(6_000.0, NOW)
    assert not ok and "max drawdown" in why
    assert rm.halt_kind == HALT_DRAWDOWN and rm.liquidating


@pytest.mark.parametrize("kind", ["manual", HALT_KILL])
def test_drawdown_escalates_over_operator_halts(store: Store, kind: str) -> None:
    rm = RiskManager(RiskConfig(max_drawdown_pct=0.25), store)
    rm.can_open(10_000.0, NOW)
    rm.halt("operator", kind)
    assert rm.liquidating is (kind == HALT_KILL)
    rm.can_open(7_000.0, NOW)
    assert rm.halt_kind == HALT_DRAWDOWN and rm.liquidating
