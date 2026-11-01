"""Risk manager: exits, halts, day roll, trade cap, cooldown and position sizing."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from autotrader.config import RiskConfig
from autotrader.models import Position, Signal
from autotrader.risk import RiskManager, trading_day
from autotrader.store import Store

ET = ZoneInfo("America/New_York")


def et(*args: int) -> float:
    """Epoch seconds for a US/Eastern wall-clock time."""
    return datetime(*args, tzinfo=ET).timestamp()


NOW = et(2026, 3, 10, 11, 0)


def pos(symbol: str = "AAA", avg: float = 100.0, qty: float = 10.0, hw: float = 0.0) -> Position:
    return Position(symbol=symbol, qty=qty, avg_price=avg, opened_ts=NOW, high_water=hw)


def sig(score: float = 1.0, price: float = 100.0) -> Signal:
    return Signal("AAA", score, price, "test")


# ----- exits --------------------------------------------------------------------

def test_stop_loss(store: Store) -> None:
    rm = RiskManager(RiskConfig(stop_loss_pct=0.05), store)
    positions = {"AAA": pos()}
    rm.update_marks(positions, {"AAA": 95.5})
    assert rm.check_exits(positions, {"AAA": 95.5}) == []
    exits = rm.check_exits(positions, {"AAA": 95.0})
    assert len(exits) == 1 and exits[0][0] == "AAA" and exits[0][1].startswith("stop-loss")


def test_take_profit(store: Store) -> None:
    rm = RiskManager(RiskConfig(take_profit_pct=0.15), store)
    positions = {"AAA": pos()}
    assert rm.check_exits(positions, {"AAA": 114.9}) == []
    rm.update_marks(positions, {"AAA": 115.0})
    exits = rm.check_exits(positions, {"AAA": 115.0})
    assert exits[0][1].startswith("take-profit")


def test_trailing_stop_uses_high_water(store: Store) -> None:
    rm = RiskManager(RiskConfig(stop_loss_pct=0.05, take_profit_pct=0.5, trailing_stop_pct=0.07), store)
    positions = {"AAA": pos()}
    rm.update_marks(positions, {"AAA": 120.0})
    assert positions["AAA"].high_water == 120.0
    rm.update_marks(positions, {"AAA": 112.0})  # pullback does not lower the mark
    assert positions["AAA"].high_water == 120.0
    assert rm.check_exits(positions, {"AAA": 112.0}) == []  # trail level 111.6
    exits = rm.check_exits(positions, {"AAA": 111.5})
    assert exits[0][1].startswith("trailing-stop")
    assert rm.levels(positions["AAA"])["trail"] == pytest.approx(111.6)


def test_trailing_high_water_from_position_and_persisted(store: Store) -> None:
    cfg = RiskConfig(take_profit_pct=0.5, trailing_stop_pct=0.10)
    rm = RiskManager(cfg, store)
    positions = {"AAA": pos(hw=130.0)}
    assert rm.check_exits(positions, {"AAA": 116.0})[0][1].startswith("trailing-stop")
    rm.update_marks(positions, {"AAA": 125.0})
    fresh = {"AAA": pos()}
    rm2 = RiskManager(cfg, store)  # restart: mark restored from kv
    assert rm2.levels(fresh["AAA"])["high_water"] == 130.0
    rm2.update_marks({}, {})  # position closed -> mark dropped
    assert rm2.levels(fresh["AAA"])["high_water"] == 100.0


def test_exit_skips_missing_prices(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    assert rm.check_exits({"AAA": pos()}, {}) == []


# ----- halts --------------------------------------------------------------------

def test_daily_loss_halt_and_eastern_day_roll(store: Store) -> None:
    rm = RiskManager(RiskConfig(daily_loss_limit_pct=0.05, max_drawdown_pct=0.5), store)
    assert rm.can_open(10_000.0, NOW) == (True, "ok")
    assert rm.can_open(9_600.0, NOW + 60)[0] is True
    ok, reason = rm.can_open(9_500.0, NOW + 120)
    assert not ok and "daily loss" in reason
    assert rm.status()["halted"] and rm.status()["halt_kind"] == "daily"
    # recovering intraday does not clear the halt
    assert rm.can_open(10_000.0, NOW + 180)[0] is False
    # 20:30 ET is already the next day in UTC but the same US/Eastern trading day
    late = et(2026, 3, 10, 20, 30)
    assert trading_day(late) == "2026-03-10"
    assert rm.can_open(9_500.0, late)[0] is False
    # after Eastern midnight the halt clears and the day baseline resets
    next_day = et(2026, 3, 11, 0, 5)
    assert rm.can_open(9_500.0, next_day) == (True, "ok")
    assert rm.status()["day"] == "2026-03-11"
    assert rm.status()["day_start_equity"] == 9_500.0
    assert any("halted" in e["message"] for e in store.recent_events())


def test_exit_before_first_can_open_of_a_new_day_uses_live_equity(store: Store) -> None:
    """A trade noted first on a new day must not baseline the day on the stale pre-gap equity."""
    rm = RiskManager(RiskConfig(daily_loss_limit_pct=0.05), store)
    assert rm.can_open(10_000.0, NOW) == (True, "ok")
    later = et(2026, 3, 12, 10, 0)  # two days of downtime while prices fell 10%
    RiskManager(RiskConfig(daily_loss_limit_pct=0.05), store).note_trade("BTC-USD", "sell", later)
    rm2 = RiskManager(RiskConfig(daily_loss_limit_pct=0.05), store)
    assert rm2.can_open(9_000.0, later + 1) == (True, "ok")
    assert rm2.status()["day_start_equity"] == 9_000.0
    assert rm2.status()["trades_today"] == 1
    assert not rm2.halted


def test_max_drawdown_kill_persists_until_cleared(store: Store) -> None:
    cfg = RiskConfig(daily_loss_limit_pct=1.0, max_drawdown_pct=0.25)
    rm = RiskManager(cfg, store)
    rm.can_open(10_000.0, NOW)
    rm.can_open(12_000.0, et(2026, 3, 11, 10, 0))  # new peak on a later day
    assert rm.can_open(9_100.0, et(2026, 3, 12, 10, 0))[0] is True  # 24.2% down
    ok, reason = rm.can_open(9_000.0, et(2026, 3, 12, 11, 0))  # 25% down from 12k peak
    assert not ok and "drawdown" in reason
    # does not clear at day roll, and survives restart
    rm2 = RiskManager(cfg, store)
    assert rm2.can_open(11_000.0, et(2026, 3, 13, 10, 0))[0] is False
    rm2.clear_halt()
    assert rm2.can_open(9_000.0, et(2026, 3, 13, 10, 5)) == (True, "ok")
    assert rm2.status()["peak_equity"] == 9_000.0  # rebased on resume


def test_manual_halt(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    rm.halt("operator kill")
    assert rm.halted and rm.can_open(10_000.0, NOW) == (False, "operator kill")
    rm.clear_halt()
    assert rm.can_open(10_000.0, NOW)[0] is True


def test_adjust_baselines_ignores_withdrawals(store: Store) -> None:
    rm = RiskManager(RiskConfig(daily_loss_limit_pct=0.05), store)
    rm.can_open(10_000.0, NOW)
    rm.adjust_baselines(-5_000.0)
    assert rm.can_open(5_000.0, NOW + 60) == (True, "ok")


def test_trade_count_cap_resets_next_day(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_trades_per_day=3, cooldown_minutes=0), store)
    for i in range(3):
        assert rm.can_open(10_000.0, NOW + i)[0] is True
        rm.note_trade(f"S{i}", "buy", NOW + i)
    ok, reason = rm.can_open(10_000.0, NOW + 10)
    assert not ok and "trade limit" in reason
    assert not rm.halted  # a cap, not a halt
    assert rm.can_open(10_000.0, et(2026, 3, 11, 9, 31)) == (True, "ok")
    assert rm.status()["trades_today"] == 0


def test_cooldown(store: Store) -> None:
    rm = RiskManager(RiskConfig(cooldown_minutes=30), store)
    assert not rm.in_cooldown("AAA", NOW)
    rm.note_trade("AAA", "sell", NOW)
    assert rm.in_cooldown("AAA", NOW + 29 * 60)
    assert not rm.in_cooldown("BBB", NOW + 60)
    assert not rm.in_cooldown("AAA", NOW + 30 * 60)
    assert RiskManager(RiskConfig(cooldown_minutes=30), store).in_cooldown("AAA", NOW + 60)


# ----- sizing -------------------------------------------------------------------

def test_size_caps_at_max_position_pct(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_position_pct=0.20), store)
    qty = rm.size_entry(sig(1.0, 100.0), cash_available=10_000, deployable=10_000, equity=10_000,
                        n_positions=0, fractional=True)
    assert qty == pytest.approx(20.0)


def test_size_scales_with_signal_strength(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_position_pct=0.20), store)
    strong = rm.size_entry(sig(1.0), 10_000, 10_000, 10_000, 0, True)
    weak = rm.size_entry(sig(0.4), 10_000, 10_000, 10_000, 0, True)
    assert weak == pytest.approx(14.0)  # 2000 * (0.5 + 0.2) / 100
    assert 0 < weak < strong
    assert rm.size_entry(sig(0.0), 10_000, 10_000, 10_000, 0, True) == 0.0
    assert rm.size_entry(sig(-0.5), 10_000, 10_000, 10_000, 0, True) == 0.0


def test_size_respects_max_positions(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_positions=3), store)
    assert rm.size_entry(sig(), 10_000, 10_000, 10_000, 2, True) > 0
    assert rm.size_entry(sig(), 10_000, 10_000, 10_000, 3, True) == 0.0


def test_size_respects_cash_reserve_and_deployable(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_position_pct=1.0, min_cash_reserve_pct=0.10), store)
    # spendable = (min(cash, deployable) - 10% of equity) * buffer
    qty = rm.size_entry(sig(1.0, 10.0), cash_available=1_500, deployable=50_000, equity=10_000,
                        n_positions=0, fractional=True)
    assert qty * 10.0 <= 500.0 and qty * 10.0 > 490.0
    qty = rm.size_entry(sig(1.0, 10.0), cash_available=50_000, deployable=1_500, equity=10_000,
                        n_positions=0, fractional=True)
    assert qty * 10.0 <= 500.0
    assert rm.size_entry(sig(1.0, 10.0), 900, 900, 10_000, 0, True) == 0.0


def test_size_min_order_value(store: Store) -> None:
    rm = RiskManager(RiskConfig(min_order_value=50.0, min_cash_reserve_pct=0.0), store)
    assert rm.size_entry(sig(1.0, 10.0), 40.0, 40.0, 10_000, 0, True) == 0.0
    assert rm.size_entry(sig(1.0, 10.0), 60.0, 60.0, 10_000, 0, True) > 0.0


def test_size_whole_shares_when_not_fractional(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_position_pct=0.20, min_order_value=1.0), store)
    qty = rm.size_entry(sig(1.0, 300.0), 10_000, 10_000, 10_000, 0, fractional=False)
    assert qty == 6.0  # 2000 / 300 = 6.67 -> 6
    frac = rm.size_entry(sig(1.0, 300.0), 10_000, 10_000, 10_000, 0, fractional=True)
    assert frac == pytest.approx(6.666666) and round(frac, 6) == frac
    # price above the position budget: no whole share affordable
    assert rm.size_entry(sig(1.0, 2_500.0), 10_000, 10_000, 10_000, 0, fractional=False) == 0.0


def test_size_rejects_bad_price(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    assert rm.size_entry(sig(1.0, 0.0), 10_000, 10_000, 10_000, 0, True) == 0.0
    assert rm.size_entry(sig(1.0, float("nan")), 10_000, 10_000, 10_000, 0, True) == 0.0


def test_status_is_json_safe(store: Store) -> None:
    import json

    rm = RiskManager(RiskConfig(), store)
    rm.can_open(10_000.0, NOW)
    status = rm.status()
    json.dumps(status)
    for key in ("halted", "halt_reason", "day_start_equity", "peak_equity", "trades_today"):
        assert key in status
