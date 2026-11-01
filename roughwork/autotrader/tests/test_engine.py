"""Engine and CLI tests: offline, using SyntheticData and PaperBroker."""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

import run
from autotrader.broker import PaperBroker
from autotrader.config import Config, demo_config
from autotrader.data import MarketData, SyntheticData
from autotrader.engine import Engine
from autotrader.models import Bar, Order
from autotrader.store import Store

START = datetime(2026, 10, 27, 14, 0, tzinfo=timezone.utc).timestamp()  # a Tuesday, 10:00 ET
STEP = 300.0


class FakeClock:
    """Manually advanced epoch clock."""

    def __init__(self, t: float = START) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


class ShockData(MarketData):
    """SyntheticData with optional per-symbol price multipliers (to force stops and drawdowns)."""

    def __init__(self, seed: int = 7) -> None:
        self.inner = SyntheticData(seed=seed)
        self.shock: dict[str, float] = {}

    def refresh(self) -> None:
        self.inner.refresh()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        k = self.shock.get(symbol, 1.0)
        return [dataclasses.replace(b, open=b.open * k, high=b.high * k, low=b.low * k, close=b.close * k)
                for b in self.inner.get_bars(symbol, interval, lookback)]

    def get_price(self, symbol: str) -> float | None:
        price = self.inner.get_price(symbol)
        return None if price is None else price * self.shock.get(symbol, 1.0)


class Rig:
    """An engine wired to synthetic data, a paper broker and a fake clock."""

    def __init__(self, tmp_path: Path, cfg: Config | None = None, paper_cash: float | None = None,
                 store: Store | None = None, data: ShockData | None = None,
                 broker_factory: Callable[..., Any] | None = None) -> None:
        self.cfg = cfg or demo_config()
        self.cfg.db_path = str(tmp_path / "engine.db")
        self.store = store or Store(self.cfg.db_path)
        self.data = data or ShockData()
        self.market_open = True
        factory = broker_factory or PaperBroker
        self.broker = factory(self.store, self.data.get_price,
                              self.cfg.initial_fund if paper_cash is None else paper_cash,
                              commission=self.cfg.commission_per_trade, slippage_bps=self.cfg.slippage_bps,
                              fractional=self.cfg.fractional, market_hours_fn=lambda: self.market_open)
        self.clock = FakeClock()
        self.engine = Engine(self.cfg, self.data, self.broker, self.store, clock=self.clock)

    def tick(self) -> dict[str, Any]:
        self.clock.t += STEP
        return self.engine.tick()

    def run(self, n: int) -> list[dict[str, Any]]:
        return [self.tick() for _ in range(n)]

    def run_until_positions(self, minimum: int = 1, limit: int = 300) -> None:
        for _ in range(limit):
            self.tick()
            if len(self.engine.snapshot()["positions"]) >= minimum:
                return
        raise AssertionError("engine never opened positions")

    def fills(self, side: str | None = None) -> list[dict[str, Any]]:
        rows = self.store.recent_fills(limit=100_000)
        return [r for r in rows if side is None or r["side"] == side]


@pytest.fixture
def rig(tmp_path: Path) -> Rig:
    r = Rig(tmp_path)
    yield r
    r.store.close()


def buy_orders(summary: dict[str, Any]) -> list[dict[str, Any]]:
    return [o for o in summary["orders"] if o["side"] == "buy"]


# ---------------------------------------------------------------- basic cycle


def test_tick_returns_json_summary(rig: Rig) -> None:
    summary = rig.tick()
    json.dumps(summary, allow_nan=False)
    for key in ("ts", "status", "market_open", "signals", "orders", "equity", "cash", "allocation", "positions"):
        assert key in summary
    assert summary["status"] == "running"
    assert summary["symbols"] == len(rig.cfg.active_universe())
    assert summary["signals"] > 0
    assert rig.store.equity_curve()[-1]["allocation"] == pytest.approx(rig.cfg.initial_fund)


def test_today_pnl_baseline_is_taken_before_first_trades(rig: Rig) -> None:
    summary = rig.tick()
    assert buy_orders(summary), "first demo tick should buy"
    snap = rig.engine.snapshot()
    # entry slippage on the first tick is part of today's P&L
    assert snap["pnl"]["today"] == pytest.approx(snap["bot"]["equity"] - rig.cfg.initial_fund)
    assert snap["pnl"]["today"] < 0


def test_data_outage_is_reported_once_and_recovers(rig: Rig, monkeypatch: pytest.MonkeyPatch) -> None:
    real_get_bars = rig.data.get_bars
    monkeypatch.setattr(rig.data, "get_bars", lambda *a: [])
    first, second = rig.tick(), rig.tick()
    assert first["symbols_with_data"] == 0 and first["signals"] == 0 and first["orders"] == []
    assert second["symbols_with_data"] == 0
    errors = [e for e in rig.store.recent_events() if e["level"] == "error"]
    assert len(errors) == 1 and "no market data" in errors[0]["message"]
    monkeypatch.setattr(rig.data, "get_bars", real_get_bars)
    assert rig.tick()["symbols_with_data"] == len(rig.cfg.active_universe())
    assert any(e["message"] == "market data restored" for e in rig.store.recent_events())


def test_entries_and_exits_over_300_ticks(rig: Rig) -> None:
    rig.run(300)
    buys, sells = rig.fills("buy"), rig.fills("sell")
    assert len(buys) >= 5
    assert len(sells) >= 3
    reasons = " ".join(o["reason"] for o in rig.store.recent_orders(limit=10_000) if o["side"] == "sell")
    assert any(word in reasons for word in ("stop-loss", "take-profit", "trailing-stop", "signal exit"))
    assert len(rig.store.equity_curve()) == 300

    snap = rig.engine.snapshot()
    # stocks and crypto have separate position caps
    by_class = {c: sum(p["asset_class"] == c for p in snap["positions"]) for c in ("stock", "crypto")}
    assert by_class["stock"] <= rig.cfg.risk.max_positions
    assert by_class["crypto"] <= rig.cfg.crypto_risk.max_positions
    # allocation accounting: initial + realized, and the bot's free cash equals the paper cash
    realized = rig.store.realized_pnl_total()
    assert rig.engine.allocation() == pytest.approx(rig.cfg.initial_fund + realized)
    assert snap["bot"]["cash"] == pytest.approx(rig.broker.cash, abs=1e-6)
    assert snap["bot"]["equity"] == pytest.approx(snap["account"]["equity"], rel=1e-9)


def test_entries_respect_cash_reserve_and_ranking(rig: Rig) -> None:
    summary = rig.tick()
    buys = buy_orders(summary)
    assert buys, "first tick should open positions"
    scores = {s.symbol: s.score for s in rig.engine._signals.values()}
    bought = [scores[o["symbol"]] for o in buys]
    assert bought == sorted(bought, reverse=True)
    assert all(scores[o["symbol"]] >= rig.cfg.strategy.entry_threshold for o in buys)
    reserve = rig.cfg.initial_fund * rig.cfg.risk.min_cash_reserve_pct
    assert rig.broker.cash >= reserve * 0.99


# ---------------------------------------------------------------- fund scope


def test_allocation_scope_caps_spending_below_broker_cash(tmp_path: Path) -> None:
    r = Rig(tmp_path, paper_cash=50_000.0)
    r.run(5)
    snap = r.engine.snapshot()
    invested = sum(p["qty"] * p["avg_price"] for p in snap["positions"])
    assert invested <= r.cfg.initial_fund
    assert r.engine.allocation() == pytest.approx(r.cfg.initial_fund + r.store.realized_pnl_total())
    assert r.broker.cash > 50_000.0 - r.cfg.initial_fund - 1e-6
    r.store.close()


def test_full_account_scope_uses_broker_equity(tmp_path: Path) -> None:
    cfg = demo_config()
    cfg.fund_scope = "full_account"
    r = Rig(tmp_path, cfg=cfg, paper_cash=50_000.0)
    account = r.broker.get_account()
    assert r.engine.allocation() == pytest.approx(50_000.0)
    assert r.engine.deployable_cash(account) == pytest.approx(50_000.0)
    r.run(5)
    snap = r.engine.snapshot()
    assert snap["allocation"] == pytest.approx(snap["account"]["equity"])
    invested = sum(p["qty"] * p["avg_price"] for p in snap["positions"])
    assert invested > r.cfg.initial_fund  # sized off the whole account, not initial_fund
    r.store.close()


def test_scope_decides_which_positions_are_managed(tmp_path: Path) -> None:
    r = Rig(tmp_path, paper_cash=50_000.0)
    r.tick()
    foreign = "ZZZZ"
    r.broker.submit_order(foreign, "buy", 10, reason="user's own position")
    r.engine.liquidate("test")
    assert foreign in r.broker.get_positions()
    assert r.engine.snapshot()["positions"] == []

    cfg = demo_config()
    cfg.fund_scope = "full_account"
    cfg.db_path = r.cfg.db_path
    full = Engine(cfg, r.data, r.broker, r.store, clock=r.clock)
    assert foreign in {p["symbol"] for p in full.snapshot()["positions"]}
    full.liquidate("test")
    assert r.broker.get_positions() == {}
    r.store.close()


def test_delayed_fills_are_tracked_until_filled(tmp_path: Path) -> None:
    class DelayedBroker(PaperBroker):
        """Acknowledges orders first and reveals the fill on the next lookup."""

        def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", **kw: Any) -> Order:
            order = super().submit_order(symbol, side, qty, reason, **kw)
            if order.status == "filled":
                return dataclasses.replace(order, status="accepted", filled_qty=0.0, filled_avg_price=None)
            return order

    r = Rig(tmp_path, broker_factory=DelayedBroker)
    first = buy_orders(r.tick())
    assert first and all(o["status"] == "accepted" for o in first)
    assert r.engine.snapshot()["pending_orders"] == len(first)
    assert not r.store.get_kv("bot_positions")  # nothing booked until the fill is seen
    assert r.engine.deployable_cash(r.broker.get_account()) < r.cfg.initial_fund * 0.2
    second = r.tick()
    live = [o for o in second["orders"] if o["status"] != "rejected"]
    assert r.engine.snapshot()["pending_orders"] == len(live)
    sold = {o["symbol"] for o in second["orders"] if o["side"] == "sell"}
    assert {o["symbol"] for o in first} <= set(r.store.get_kv("bot_positions")) | sold
    r.store.close()


# ---------------------------------------------------------------- fund adjustments


def test_adjust_fund_deposit_and_withdraw(rig: Rig) -> None:
    rig.tick()
    before_cash = rig.broker.cash
    before_today = rig.engine.snapshot()["pnl"]["today"]
    assert rig.engine.adjust_fund(500.0) == pytest.approx(rig.cfg.initial_fund + 500.0 + rig.store.realized_pnl_total())
    assert rig.broker.cash == pytest.approx(before_cash + 500.0)
    assert rig.engine.snapshot()["pnl"]["today"] == pytest.approx(before_today, abs=1e-6)
    rig.engine.adjust_fund(-200.0)
    assert rig.broker.cash == pytest.approx(before_cash + 300.0)
    assert rig.store.get_kv("net_deposits") == pytest.approx(300.0)
    assert rig.store.recent_events(limit=1)[0]["message"].startswith("fund withdrawal")


@pytest.mark.parametrize("delta", [0.0, float("nan"), float("inf"), True])
def test_adjust_fund_rejects_bad_delta(rig: Rig, delta: Any) -> None:
    with pytest.raises(ValueError):
        rig.engine.adjust_fund(delta)


def test_adjust_fund_cannot_go_below_zero_or_exceed_cash(rig: Rig) -> None:
    with pytest.raises(ValueError):
        rig.engine.adjust_fund(-(rig.cfg.initial_fund + 1.0))
    rig.tick()  # most cash is now invested
    with pytest.raises(ValueError):
        rig.engine.adjust_fund(-(rig.broker.cash + 100.0))
    assert rig.engine.allocation() >= 0.0


def test_full_account_rejects_fund_changes_for_real_brokers(tmp_path: Path) -> None:
    cfg = demo_config()
    cfg.fund_scope = "full_account"
    r = Rig(tmp_path, cfg=cfg)
    r.engine._is_paper = False  # behave like an external broker account
    with pytest.raises(ValueError, match="full_account"):
        r.engine.adjust_fund(100.0)
    r.store.close()


# ---------------------------------------------------------------- controls


def test_pause_blocks_entries_and_resume_restores(rig: Rig) -> None:
    rig.engine.pause()
    summary = rig.tick()
    assert buy_orders(summary) == []
    assert summary["status"] == "paused" and summary["entry_block"] == "paused"
    assert rig.engine.snapshot()["status"] == "paused"
    rig.engine.resume()
    assert rig.engine.snapshot()["status"] == "running"
    assert buy_orders(rig.tick())


def test_liquidate_sells_everything_and_keeps_running(rig: Rig) -> None:
    rig.run_until_positions(minimum=2)
    orders = rig.engine.liquidate("test")
    assert orders and all(o["side"] == "sell" and o["status"] == "filled" for o in orders)
    assert rig.broker.get_positions() == {}
    snap = rig.engine.snapshot()
    assert snap["positions"] == [] and snap["status"] == "running"
    assert rig.store.get_kv("bot_positions") == {}


def test_kill_liquidates_and_halts_until_resume(rig: Rig) -> None:
    rig.run_until_positions()
    rig.engine.kill("test")
    assert rig.broker.get_positions() == {}
    snap = rig.engine.snapshot()
    assert snap["status"] == "halted" and "kill switch" in snap["halt_reason"]
    for _ in range(3):
        assert buy_orders(rig.tick()) == []
    rig.engine.resume()
    assert rig.engine.snapshot()["status"] == "running"
    rig.clock.t += 3600  # past the cooldown on the liquidated symbols
    assert any(buy_orders(rig.tick()) for _ in range(5))


def test_drawdown_kill_switch_liquidates(tmp_path: Path) -> None:
    cfg = demo_config()
    cfg.risk.stop_loss_pct = 1.0
    cfg.risk.trailing_stop_pct = 1.0
    cfg.risk.daily_loss_limit_pct = 1.0
    cfg.risk.max_drawdown_pct = 0.10
    r = Rig(tmp_path, cfg=cfg)
    r.run_until_positions(minimum=3)
    for p in r.engine.snapshot()["positions"]:
        r.data.shock[p["symbol"]] = 0.4
    r.tick()
    snap = r.engine.snapshot()
    assert snap["status"] == "halted" and "drawdown" in snap["halt_reason"]
    assert snap["positions"] == []
    assert r.broker.get_positions() == {}
    r.store.close()


def test_market_closed_marks_to_market_without_trading(rig: Rig) -> None:
    rig.cfg.enable_crypto = False  # crypto trades 24/7; "market_closed" needs every enabled class closed
    rig.cfg.respect_market_hours = True
    rig.market_open = False
    summary = rig.tick()
    assert summary["market_open"] is False and summary["orders"] == []
    assert summary["status"] == "market_closed"
    assert rig.engine.snapshot()["status"] == "market_closed"
    assert len(rig.store.equity_curve()) == 1
    assert rig.engine.snapshot()["signals"], "signals are still computed while closed"
    rig.market_open = True
    assert buy_orders(rig.tick())


def test_stocks_closed_crypto_still_trades(rig: Rig) -> None:
    rig.cfg.respect_market_hours = True
    rig.market_open = False
    summaries = rig.run(60)
    assert all(s["status"] == "running" and s["market_open"] is True for s in summaries)
    orders = [o for s in summaries for o in s["orders"]]
    assert orders and all(o["asset_class"] == "crypto" for o in orders)


def test_market_hours_ignored_when_disabled(rig: Rig) -> None:
    rig.cfg.respect_market_hours = False
    rig.market_open = False
    assert rig.tick()["market_open"] is True


# ---------------------------------------------------------------- universe


def test_set_universe_validates_and_normalizes(rig: Rig) -> None:
    assert rig.engine.set_universe([" aapl", "BRK.B", "msft", "AAPL", "bf-b"]) == ["AAPL", "BRK.B", "MSFT", "BF-B"]
    assert rig.engine.snapshot()["universe"] == ["AAPL", "BRK.B", "MSFT", "BF-B"]
    for bad in (["AAPL1"], [""], ["TOOLONGTICKER"], ["A B"], [123], [], "AAPL"):
        with pytest.raises(ValueError):
            rig.engine.set_universe(bad)  # type: ignore[arg-type]
    assert rig.engine.universe == ["AAPL", "BRK.B", "MSFT", "BF-B"]
    assert rig.tick()["symbols"] == 4


def test_universe_persists_until_config_changes(tmp_path: Path) -> None:
    r = Rig(tmp_path)
    r.engine.set_universe(["AAPL", "MSFT"])
    again = Engine(r.cfg, r.data, r.broker, r.store, clock=r.clock)
    assert again.universe == ["AAPL", "MSFT"]
    cfg = demo_config()
    cfg.universe = ["NVDA"]
    changed = Engine(cfg, r.data, r.broker, r.store, clock=r.clock)
    assert changed.universe == ["NVDA"]
    r.store.close()


def test_held_symbols_outside_universe_are_exit_managed(rig: Rig) -> None:
    rig.run_until_positions()
    positions = rig.engine.snapshot()["positions"]
    held = positions[0]["symbol"]
    rig.engine.set_universe(["ZZZZ"])
    rig.data.shock[held] = 0.5  # crash through the stop-loss
    summary = rig.tick()
    assert summary["symbols"] == 1 + len(positions)
    assert held in {s["symbol"] for s in rig.engine.snapshot()["signals"]}
    assert held not in rig.broker.get_positions()
    sells = [o for o in rig.store.recent_orders(limit=1000) if o["symbol"] == held and o["side"] == "sell"]
    assert sells and "stop-loss" in sells[0]["reason"]


def test_no_new_entries_outside_universe(rig: Rig) -> None:
    rig.engine.set_universe(["ZZZZ", "YYYY"])
    for _ in range(30):
        for order in buy_orders(rig.tick()):
            assert order["symbol"] in ("ZZZZ", "YYYY")


# ---------------------------------------------------------------- snapshot and persistence


def test_snapshot_is_json_serializable(rig: Rig) -> None:
    json.dumps(rig.engine.snapshot(), allow_nan=False)
    rig.run_until_positions()
    snap = rig.engine.snapshot()
    json.dumps(snap, allow_nan=False)
    for key in ("status", "mode", "is_live", "account", "allocation", "pnl", "positions", "signals",
                "universe", "risk", "last_tick_ts", "next_tick_ts", "broker"):
        assert key in snap
    assert snap["mode"] == "sim" and snap["is_live"] is False and snap["broker"] == "paper"
    pos = snap["positions"][0]
    assert pos["stop"] < pos["avg_price"] < pos["target"]
    assert pos["trail"] <= pos["high_water"]
    assert set(snap["pnl"]) >= {"today", "realized_total", "unrealized"}
    assert all("components" in s for s in snap["signals"])


def test_state_survives_restart(tmp_path: Path) -> None:
    r = Rig(tmp_path)
    r.run_until_positions()
    r.engine.pause()
    held = {p["symbol"]: p["qty"] for p in r.engine.snapshot()["positions"]}
    broker = PaperBroker(r.store, r.data.get_price, r.cfg.initial_fund, market_hours_fn=lambda: True)
    again = Engine(r.cfg, r.data, broker, r.store, clock=r.clock)
    snap = again.snapshot()
    assert snap["status"] == "paused"
    assert {p["symbol"]: p["qty"] for p in snap["positions"]} == held
    r.store.close()


def test_run_forever_stops_on_event(rig: Rig) -> None:
    import threading

    rig.cfg.poll_seconds = 1
    stop = threading.Event()
    worker = threading.Thread(target=rig.engine.run_forever, args=(stop,))
    worker.start()
    try:
        for _ in range(100):
            if rig.engine.tick_count:
                break
            stop.wait(0.05)
    finally:
        stop.set()
        worker.join(timeout=5)
    assert not worker.is_alive()
    assert rig.engine.tick_count >= 1


# ---------------------------------------------------------------- CLI


def test_cli_demo_once_prints_json(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                   capsys: pytest.CaptureFixture[str]) -> None:
    def tmp_demo() -> Config:
        cfg = demo_config()
        cfg.db_path = str(tmp_path / "demo.db")
        return cfg

    monkeypatch.setattr(run, "demo_config", tmp_demo)
    monkeypatch.setattr(run, "setup_logging", lambda: None)
    assert run.main(["--demo", "--once"]) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["status"] == "running" and summary["signals"] > 0
    assert (tmp_path / "demo.db").exists()


def test_cli_refuses_live_without_confirmation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                               capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"mode": "alpaca-live", "db_path": str(tmp_path / "x.db")}), encoding="utf-8")
    monkeypatch.setenv("APCA_API_KEY_ID", "key")
    monkeypatch.setenv("APCA_API_SECRET_KEY", "secret")
    monkeypatch.setattr(run, "setup_logging", lambda: None)
    assert run.main(["--config", str(path), "--once"]) == 2
    assert "live_confirmation" in capsys.readouterr().err


def test_cli_rejects_bad_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"bogus": 1}), encoding="utf-8")
    monkeypatch.setattr(run, "setup_logging", lambda: None)
    assert run.main(["--config", str(path), "--once"]) == 2
    assert "unknown config key" in capsys.readouterr().err
