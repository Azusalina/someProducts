"""Engine regressions for money accounting and safety controls (SyntheticData + PaperBroker, offline)."""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from autotrader.broker import AmbiguousOrderError, Broker, BrokerError, PaperBroker
from autotrader.config import Config, ConfigError, demo_config
from autotrader.engine import Engine
from autotrader.models import Account, CashFlow, Order, Position, asset_class
from test_engine import Rig, buy_orders


@pytest.fixture
def rig(tmp_path: Path) -> Iterator[Rig]:
    r = Rig(tmp_path)
    yield r
    r.store.close()


def held(rig: Rig) -> dict[str, Position]:
    return rig.broker.get_positions()


# ----- realized P&L in allocation scope uses the bot's own cost -------------------------------


def test_sells_realize_against_ledger_cost_when_the_user_holds_the_same_symbol(tmp_path: Path) -> None:
    r = Rig(tmp_path, paper_cash=50_000.0)
    r.run_until_positions()
    ledger = {s: h["avg_price"] for s, h in r.store.get_kv("bot_positions").items()}
    sym = next(iter(ledger))
    r.data.shock[sym] = 0.5  # the user buys 100 units of the same symbol much cheaper
    r.broker.submit_order(sym, "buy", 100, reason="user's own units")
    r.data.shock[sym] = 1.0
    assert r.broker.get_positions()[sym].avg_price < ledger[sym] * 0.9  # blended broker average
    before = r.store.realized_pnl_total()
    r.engine.liquidate("test")
    sells = [f for f in r.fills("sell") if f["symbol"] in ledger]
    expected = sum((f["price"] - ledger[f["symbol"]]) * f["qty"] - f["commission"] for f in sells)
    assert r.store.realized_pnl_total() - before == pytest.approx(expected, abs=1e-6)
    assert r.broker.get_positions()[sym].qty == pytest.approx(100.0)  # the user's units stay
    r.store.close()


# ----- units sold outside the bot ------------------------------------------------------------


def test_units_sold_outside_the_bot_do_not_trip_the_halts(rig: Rig) -> None:
    rig.run_until_positions(minimum=4)
    today_before = rig.engine.snapshot()["pnl"]["today"]
    allocation_before = rig.engine.allocation()
    ledger = rig.store.get_kv("bot_positions")
    removed_cost = sum(h["qty"] * h["avg_price"] for h in ledger.values())
    with rig.broker._lock:  # the user sells every bot position directly at the broker
        for sym, pos in list(rig.broker._positions.items()):
            rig.broker._cash += pos.qty * (rig.data.get_price(sym) or pos.avg_price)
            del rig.broker._positions[sym]
        rig.broker._persist()
    rig.engine.pause()  # keep the next tick from trading so P&L moves only with the withdrawal
    rig.tick()
    snap = rig.engine.snapshot()
    assert not snap["risk"]["halted"], snap["halt_reason"]
    assert snap["pnl"]["today"] == pytest.approx(today_before, abs=0.01 * rig.cfg.initial_fund)
    assert rig.engine.allocation() == pytest.approx(allocation_before - removed_cost, rel=1e-9)
    assert any("treated as withdrawn" in e["message"] for e in rig.store.recent_events())


def test_crypto_fee_taken_in_coin_raises_cost_basis_not_a_withdrawal(rig: Rig) -> None:
    crypto: list[str] = []
    for _ in range(300):
        rig.tick()
        ledger = rig.store.get_kv("bot_positions") or {}
        if crypto := [s for s in ledger if asset_class(s) == "crypto"]:
            break
    assert crypto, "engine never opened a crypto position"
    sym = crypto[0]
    allocation_before = rig.engine.allocation()
    qty, avg = ledger[sym]["qty"], ledger[sym]["avg_price"]
    with rig.broker._lock:  # Alpaca-style: a 0.25% fee comes out of the coins bought
        rig.broker._positions[sym].qty = qty * 0.9975
        rig.broker._persist()
    rig.engine.pause()
    rig.tick()
    after = rig.store.get_kv("bot_positions")[sym]
    assert after["qty"] == pytest.approx(qty * 0.9975)
    assert after["qty"] * after["avg_price"] == pytest.approx(qty * avg)  # same total cost
    assert rig.engine.allocation() == pytest.approx(allocation_before, rel=1e-9)
    assert not any("treated as withdrawn" in e["message"] for e in rig.store.recent_events())


# ----- halt equity after same-tick exits -------------------------------------------------------


def test_exits_in_a_tick_are_not_double_counted_in_the_halt_equity(rig: Rig) -> None:
    rig.run_until_positions(minimum=4)
    rig.engine.pause()  # protective stops still fire; no new entries muddy the numbers
    for sym in rig.broker.get_positions():
        rig.data.shock[sym] = 0.945  # every stop-loss (5%) triggers this tick
    rig.tick()
    assert any("stop-loss" in o["reason"] for o in rig.store.recent_orders(limit=50))
    account = rig.broker.get_account()
    true_equity = rig.engine._bot_equity(account, rig.engine._managed_positions(account))
    assert rig.engine.risk.status()["last_equity"] == pytest.approx(true_equity, rel=1e-9)


# ----- one database per mode -----------------------------------------------------------------


def test_a_sim_database_is_refused_in_an_alpaca_mode(rig: Rig) -> None:
    rig.run_until_positions(minimum=1)  # sim ledger, fills and paper cash now live in this database
    for mode in ("alpaca-paper", "alpaca-live"):
        with pytest.raises(ConfigError, match="holds sim state"):
            Engine(dataclasses.replace(rig.cfg, mode=mode), rig.data, rig.broker, rig.store, clock=rig.clock)
    Engine(rig.cfg, rig.data, rig.broker, rig.store, clock=rig.clock)  # same mode reopens fine


def test_a_database_from_before_the_mode_check_is_recognised_as_sim(rig: Rig) -> None:
    rig.tick()
    rig.store.set_kv("db_mode", None)  # as written by a version without the check
    assert rig.store.get_kv("paper_state") is not None
    with pytest.raises(ConfigError, match="holds sim state"):
        Engine(dataclasses.replace(rig.cfg, mode="alpaca-paper"), rig.data, rig.broker, rig.store, clock=rig.clock)


# ----- initial_fund edited between runs ------------------------------------------------------


def restart(r: Rig, fund: float) -> Engine:
    cfg = dataclasses.replace(r.cfg, initial_fund=fund)
    broker = PaperBroker(r.store, r.data.get_price, r.cfg.initial_fund, market_hours_fn=lambda: True)
    r.broker = broker
    return Engine(cfg, r.data, broker, r.store, clock=r.clock)


def test_lowering_initial_fund_is_a_withdrawal_not_a_drawdown(tmp_path: Path) -> None:
    r = Rig(tmp_path, paper_cash=50_000.0)
    r.run_until_positions(minimum=3)
    positions = set(held(r))
    cash, allocation = r.broker.cash, r.engine.allocation()
    r.engine = restart(r, 5_000.0)
    assert r.broker.cash == pytest.approx(cash - 5_000.0)
    assert r.engine.allocation() == pytest.approx(allocation - 5_000.0)
    r.engine.pause()
    r.tick()
    snap = r.engine.snapshot()
    assert not snap["risk"]["halted"], snap["halt_reason"]
    assert set(held(r)) == positions  # no kill-switch liquidation
    assert r.store.get_kv("initial_fund") == 5_000.0
    r.engine = restart(r, 5_000.0)  # applied once only
    assert r.broker.cash == pytest.approx(cash - 5_000.0)
    r.store.close()


def test_raising_initial_fund_deposits_paper_cash(rig: Rig) -> None:
    rig.tick()
    cash = rig.broker.cash
    rig.engine = restart(rig, 15_000.0)
    assert rig.broker.cash == pytest.approx(cash + 5_000.0)
    assert rig.engine.deployable_cash(rig.broker.get_account()) <= rig.broker.cash + 1e-9


def test_initial_fund_cut_beyond_free_cash_refuses_to_start(rig: Rig) -> None:
    rig.run_until_positions(minimum=3)
    cash = rig.broker.cash
    with pytest.raises(ConfigError, match="initial_fund"):
        restart(rig, 100.0)
    assert rig.broker.cash == pytest.approx(cash)
    assert rig.store.get_kv("initial_fund") == rig.cfg.initial_fund  # nothing applied


# ----- full_account: transfers made at the broker -------------------------------------------


class ExternalBroker(Broker):
    """A non-paper broker (like Alpaca) over a PaperBroker, reporting scripted cash activity."""

    name = "external"
    is_live = False

    def __init__(self, inner: PaperBroker) -> None:
        self.inner = inner
        self.flows: list[CashFlow] = []

    def get_account(self) -> Account:
        return self.inner.get_account()

    def get_positions(self) -> dict[str, Position]:
        return self.inner.get_positions()

    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", **kw: Any) -> Order:
        return self.inner.submit_order(symbol, side, qty, reason, **kw)

    def get_order(self, order_id: str) -> Order | None:
        return self.inner.get_order(order_id)

    def is_market_open(self, symbol: str | None = None) -> bool:
        return self.inner.is_market_open(symbol)

    def cash_flows(self, since: float) -> list[CashFlow]:
        return [f for f in self.flows if f.ts >= since]


def external_rig(tmp_path: Path) -> tuple[Rig, ExternalBroker]:
    cfg = demo_config()
    cfg.fund_scope = "full_account"
    r = Rig(tmp_path, cfg=cfg)
    ext = ExternalBroker(r.broker)
    r.engine = Engine(r.cfg, r.data, ext, r.store, clock=r.clock)
    return r, ext


def test_full_account_withdrawal_at_the_broker_is_not_a_drawdown(tmp_path: Path) -> None:
    r, ext = external_rig(tmp_path)
    ext.flows.append(CashFlow("old", r.clock.t, 1_000.0, "CSD"))  # predates the engine: already in equity
    r.engine.pause()
    r.tick()
    peak = r.engine.risk.status()["peak_equity"]
    assert peak == pytest.approx(r.cfg.initial_fund)  # the old deposit was not applied again
    r.broker.adjust_cash(-3_000.0)
    ext.flows.append(CashFlow("w1", r.clock.t, -3_000.0, "CSW"))
    r.tick()
    status = r.engine.risk.status()
    assert not status["halted"], status["halt_reason"]
    assert status["peak_equity"] == pytest.approx(peak - 3_000.0)
    assert r.engine.snapshot()["pnl"]["today"] == pytest.approx(0.0, abs=1e-6)
    r.tick()  # each flow is applied once
    assert r.engine.risk.status()["peak_equity"] == pytest.approx(peak - 3_000.0)

    r.broker.adjust_cash(-3_000.0)  # an unreported transfer still reads as a loss
    r.tick()
    assert r.engine.risk.status()["halted"]
    r.store.close()


def test_full_account_user_sale_of_a_bot_position_keeps_the_risk_baselines(tmp_path: Path) -> None:
    r, _ext = external_rig(tmp_path)
    r.run_until_positions(minimum=2)
    ledger = r.store.get_kv("bot_positions")
    sym = next(iter(ledger))
    r.engine.pause()
    r.tick()
    before = r.engine.risk.status()
    with r.broker._lock:  # the user sells the bot's units at the broker; the cash stays in the account
        pos = r.broker._positions.pop(sym)
        r.broker._cash += pos.qty * (r.data.get_price(sym) or pos.avg_price)
        r.broker._persist()
    r.tick()
    after = r.engine.risk.status()
    assert after["peak_equity"] >= before["peak_equity"] - 1e-6  # may rise with marks, never shifted down
    assert after["day_start_equity"] == pytest.approx(before["day_start_equity"], rel=1e-9)
    assert sym not in (r.store.get_kv("bot_positions") or {})
    assert not any("treated as withdrawn" in e["message"] for e in r.store.recent_events())
    r.store.close()


# ----- liquidation while a market is closed ----------------------------------------------------


def test_liquidate_defers_stocks_until_the_market_opens(tmp_path: Path) -> None:
    cfg = demo_config()
    cfg.respect_market_hours = True
    r = Rig(tmp_path, cfg=cfg)
    for _ in range(300):
        r.tick()
        classes = {asset_class(s) for s in held(r)}
        if classes == {"stock", "crypto"}:
            break
    stocks = {s for s in held(r) if asset_class(s) == "stock"}
    assert stocks and len(held(r)) > len(stocks)
    r.market_open = False
    orders = r.engine.liquidate("weekend")
    assert orders and all(asset_class(o["symbol"]) == "crypto" for o in orders)
    assert set(held(r)) == stocks  # no stock filled at a stale price
    assert set(r.engine.snapshot()["deferred_liquidations"]) == stocks
    r.tick()
    assert stocks <= set(held(r))
    r.market_open = True
    summary = r.tick()
    sold = {o["symbol"] for o in summary["orders"] if o["side"] == "sell" and o["status"] == "filled"}
    assert stocks <= sold
    assert not stocks & set(held(r))
    r.tick()
    assert r.engine.snapshot()["deferred_liquidations"] == []
    r.store.close()


# ----- kill switch with orders in flight ----------------------------------------------------------


class QueueBroker(PaperBroker):
    """Buys stay open at the broker until released (or cancelled); sells fill immediately."""

    def __init__(self, *args: Any, **kw: Any) -> None:
        super().__init__(*args, **kw)
        self.open: dict[str, Order] = {}
        self.cancellable = True
        self.cancels: list[str] = []

    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", **kw: Any) -> Order:
        if side != "buy":
            return super().submit_order(symbol, side, qty, reason, **kw)
        order = Order(id=f"q{len(self.open) + len(self.cancels)}-{symbol}", symbol=symbol, side=side,
                      qty=qty, status="accepted", submitted_ts=0.0, reason=reason)
        self.open[order.id] = order
        return dataclasses.replace(order)

    def release(self) -> None:
        """Fill every open buy."""
        for oid, order in list(self.open.items()):
            with self._lock:
                if not self._check(order):
                    self._fill(order, 0.0)
                else:
                    order.status = "rejected"
            self._orders[oid] = self.open.pop(oid)

    def get_order(self, order_id: str) -> Order | None:
        if order_id in self.open:
            return dataclasses.replace(self.open[order_id])
        return super().get_order(order_id)

    def cancel_order(self, order_id: str) -> bool:
        self.cancels.append(order_id)
        if not self.cancellable or order_id not in self.open:
            return False
        order = self.open.pop(order_id)
        order.status = "canceled"
        self._orders[order_id] = order
        return True


def test_kill_cancels_open_buys(tmp_path: Path) -> None:
    r = Rig(tmp_path, broker_factory=QueueBroker)
    first = buy_orders(r.tick())
    assert first and all(o["status"] == "accepted" for o in first)
    assert r.engine.kill("test") == []  # nothing held yet
    assert set(r.broker.cancels) == {o["id"] for o in first}
    r.tick()
    snap = r.engine.snapshot()
    assert held(r) == {} and snap["pending_orders"] == 0
    assert snap["status"] == "halted" and snap["liquidating"]
    r.store.close()


def test_kill_sells_buys_that_fill_after_it(tmp_path: Path) -> None:
    r = Rig(tmp_path, broker_factory=QueueBroker)
    assert buy_orders(r.tick())
    r.broker.cancellable = False  # too late to cancel: the buys fill anyway
    assert r.engine.kill("test") == []
    r.broker.release()
    assert held(r)
    r.tick()
    assert held(r) == {}
    for _ in range(3):
        assert buy_orders(r.tick()) == []
    assert r.engine.snapshot()["status"] == "halted"
    r.store.close()


# ----- submissions with an unknown outcome -------------------------------------------------------


class TimeoutBroker(PaperBroker):
    """The first buy is placed but its response is lost; lookups fail ``lookup_failures`` times first."""

    def __init__(self, *args: Any, **kw: Any) -> None:
        super().__init__(*args, **kw)
        self.lost: dict[str, str] = {}
        self.lookup_failures = 1
        self.armed = True

    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", **kw: Any) -> Order:
        order = super().submit_order(symbol, side, qty, reason, **kw)
        if side == "buy" and self.armed and order.status == "filled":
            self.armed = False
            self.lost[f"cid-{order.id}"] = order.id
            raise AmbiguousOrderError("read timed out", f"cid-{order.id}")
        return order

    def find_order_by_client_id(self, client_order_id: str, reason: str = "",
                                cost_basis: float | None = None) -> Order | None:
        if self.lookup_failures > 0:
            self.lookup_failures -= 1
            raise BrokerError("lookup unavailable")
        oid = self.lost.get(client_order_id)
        return self.get_order(oid) if oid else None


def test_lost_order_response_is_tracked_not_duplicated(tmp_path: Path) -> None:
    r = Rig(tmp_path, broker_factory=TimeoutBroker)
    r.tick()
    oid = next(iter(r.broker.lost.values()))
    order = r.broker.get_order(oid)
    assert order is not None
    sym, qty = order.symbol, order.qty
    snap = r.engine.snapshot()
    assert snap["unresolved_orders"] == 1 and sym not in {p["symbol"] for p in snap["positions"]}
    assert r.engine.risk.in_cooldown(sym, r.clock.t)
    r.tick()  # lookup fails: still unresolved, and the symbol is not bought again
    assert r.engine.snapshot()["unresolved_orders"] == 1
    assert held(r)[sym].qty == pytest.approx(qty)
    r.tick()  # found: the fill joins the ledger and is managed like any other position
    snap = r.engine.snapshot()
    assert snap["unresolved_orders"] == 0
    assert r.store.get_kv("bot_positions")[sym]["qty"] == pytest.approx(qty)
    assert held(r)[sym].qty == pytest.approx(qty) or sym not in held(r)  # never doubled
    r.store.close()


class FailingBroker(PaperBroker):
    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", **kw: Any) -> Order:
        raise BrokerError("503 service unavailable")


def test_repeated_submission_errors_halt_entries(tmp_path: Path) -> None:
    r = Rig(tmp_path, broker_factory=FailingBroker)
    r.tick()
    snap = r.engine.snapshot()
    assert snap["status"] == "halted" and "consecutive order submission errors" in snap["halt_reason"]
    errors = [e for e in r.store.recent_events() if "failed" in e["message"]]
    assert len(errors) == 3
    r.store.close()


# ----- drawdown during a daily-loss halt -----------------------------------------------------------


def test_drawdown_during_a_daily_halt_still_liquidates(tmp_path: Path) -> None:
    cfg: Config = demo_config()
    cfg.risk.stop_loss_pct = 1.0
    cfg.risk.trailing_stop_pct = 1.0
    cfg.crypto_risk.stop_loss_pct = 1.0
    cfg.crypto_risk.trailing_stop_pct = 1.0
    cfg.strategy.exit_threshold = -1.0
    r = Rig(tmp_path, cfg=cfg)
    r.run_until_positions(minimum=4)
    r.engine.pause()
    for sym in held(r):
        r.data.shock[sym] = 0.88
    r.tick()
    assert r.engine.risk.halt_kind == "daily"
    assert held(r)
    for sym in held(r):
        r.data.shock[sym] = 0.4
    r.tick()
    status = r.engine.risk.status()
    assert status["halt_kind"] == "drawdown"
    assert held(r) == {}
    r.store.close()
