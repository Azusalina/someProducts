"""Crypto risk: per-asset-class limits, crypto exposure cap, volatility-aware sizing, crypto strategy."""

from __future__ import annotations

import json
import math

import pytest

from autotrader.config import Config, CryptoRiskConfig, RiskConfig, StrategyConfig, from_dict
from autotrader.models import Bar, Position, Signal
from autotrader.risk import (
    TARGET_DAILY_VOL,
    AssetLimits,
    RiskManager,
    bar_seconds,
    bars_per_day,
    daily_vol,
    exposure_by_class,
    fmt_price,
    round_qty,
    vol_scale,
)
from autotrader.store import Store
from autotrader.strategy import AssetStrategies, Strategy

NOW = 1_773_158_400.0  # 2026-03-10 16:00 UTC


def pos(symbol: str, avg: float = 100.0, qty: float = 1.0, hw: float = 0.0) -> Position:
    return Position(symbol=symbol, qty=qty, avg_price=avg, opened_ts=NOW, high_water=hw)


def sig(symbol: str, score: float = 1.0, price: float = 100.0) -> Signal:
    return Signal(symbol, score, price, "test")


def flat_bars(n: int = 40, price: float = 100.0, range_pct: float = 0.01, step: float = 300.0) -> list[Bar]:
    """Constant-close bars whose high-low range is ``range_pct`` of price, so ATR = range."""
    half = price * range_pct / 2.0
    return [Bar(ts=NOW + i * step, open=price, high=price + half, low=price - half, close=price, volume=1000.0)
            for i in range(n)]


def trending_bars(n: int = 80, start: float = 100.0, drift: float = 0.004, step: float = 300.0) -> list[Bar]:
    """Rising closes with a small dip every fourth bar."""
    bars, price = [], start
    for i in range(n):
        price *= 1.0 + (drift if i % 4 else -drift / 2.0)
        bars.append(Bar(ts=NOW + i * step, open=price, high=price * 1.002, low=price * 0.998, close=price,
                        volume=1000.0 + 50.0 * (i % 5)))
    return bars


# ----- per-asset-class limits ---------------------------------------------------


def test_limits_for_routes_by_asset_class(store: Store) -> None:
    rm = RiskManager(RiskConfig(stop_loss_pct=0.05, cooldown_minutes=30), store,
                     CryptoRiskConfig(stop_loss_pct=0.08, cooldown_minutes=60))
    stock, crypto = rm.limits_for("AAPL"), rm.limits_for("BTC-USD")
    assert (stock.asset_class, stock.stop_loss_pct, stock.cooldown_minutes, stock.qty_decimals) == ("stock", 0.05, 30, None)
    assert (crypto.asset_class, crypto.stop_loss_pct, crypto.cooldown_minutes, crypto.qty_decimals) == ("crypto", 0.08, 60, 8)
    assert rm.max_positions_for("ETH-USDT") == 5 and rm.max_positions_for("MSFT") == 8


def test_crypto_defaults_when_crypto_cfg_omitted(store: Store) -> None:
    assert RiskManager(RiskConfig(), store).limits_for("BTC-USD") == AssetLimits.for_crypto(CryptoRiskConfig())


def test_from_config_uses_crypto_risk(store: Store) -> None:
    cfg = Config(crypto_risk=CryptoRiskConfig(stop_loss_pct=0.12))
    assert RiskManager.from_config(cfg, store).limits_for("SOL-USD").stop_loss_pct == 0.12


def test_crypto_levels_use_crypto_limits(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    lv = rm.levels(pos("BTC-USD", avg=100.0, hw=120.0))
    assert lv["stop"] == pytest.approx(92.0)
    assert lv["target"] == pytest.approx(125.0)
    assert lv["trail"] == pytest.approx(108.0)
    stock = rm.levels(pos("AAPL", avg=100.0))
    assert stock["stop"] == pytest.approx(95.0) and stock["target"] == pytest.approx(115.0)


def test_crypto_stop_is_wider_than_stock_stop(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    positions = {"AAPL": pos("AAPL"), "BTC-USD": pos("BTC-USD")}
    exits = dict(rm.check_exits(positions, {"AAPL": 94.0, "BTC-USD": 94.0}))
    assert set(exits) == {"AAPL"}
    exits = dict(rm.check_exits(positions, {"AAPL": 100.0, "BTC-USD": 91.0}))
    assert set(exits) == {"BTC-USD"} and exits["BTC-USD"].startswith("stop-loss")


def test_crypto_take_profit_and_trailing(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store, CryptoRiskConfig(take_profit_pct=0.5, trailing_stop_pct=0.10))
    p = {"ETH-USD": pos("ETH-USD")}
    rm.update_marks(p, {"ETH-USD": 140.0})
    assert rm.check_exits(p, {"ETH-USD": 127.0}) == []
    (sym, reason), = rm.check_exits(p, {"ETH-USD": 125.0})
    assert sym == "ETH-USD" and reason.startswith("trailing-stop")
    (_, reason), = rm.check_exits(p, {"ETH-USD": 151.0})
    assert reason.startswith("take-profit")


def test_exit_reason_uses_adaptive_precision(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    (_, reason), = rm.check_exits({"DOGE-USD": pos("DOGE-USD", avg=0.1234, qty=1000.0)}, {"DOGE-USD": 0.1100})
    assert "0.1100 <= 0.1135" in reason


def test_crypto_cooldown_is_separate(store: Store) -> None:
    rm = RiskManager(RiskConfig(cooldown_minutes=30), store, CryptoRiskConfig(cooldown_minutes=60))
    rm.note_trade("BTC-USD", "buy", NOW)
    rm.note_trade("AAPL", "buy", NOW)
    later = NOW + 45 * 60
    assert rm.in_cooldown("BTC-USD", later) and not rm.in_cooldown("AAPL", later)
    rm.note_trade("MSFT", "buy", later)  # prunes expired stock cooldowns, keeps the crypto one
    assert rm.in_cooldown("BTC-USD", later + 60)
    assert not rm.in_cooldown("BTC-USD", NOW + 61 * 60)
    assert RiskManager(RiskConfig(), store, CryptoRiskConfig(cooldown_minutes=60)).in_cooldown("BTC-USD", later)


# ----- crypto sizing ------------------------------------------------------------


def test_crypto_size_uses_crypto_position_pct_and_8dp(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_position_pct=0.20, min_cash_reserve_pct=0.0), store,
                     CryptoRiskConfig(max_position_pct=0.15))
    qty = rm.size_entry(sig("BTC-USD", 1.0, 65_432.1), 10_000, 10_000, 10_000, 0, fractional=False)
    assert 0.0 < qty * 65_432.1 <= 1_500.0 + 1e-6
    assert qty * 65_432.1 == pytest.approx(1_500.0, rel=1e-6)
    assert qty == round(qty, 8) and qty != round(qty, 6)
    stock = rm.size_entry(sig("AAPL", 1.0, 100.0), 10_000, 10_000, 10_000, 0, fractional=True)
    assert stock * 100.0 == pytest.approx(2_000.0)


def test_crypto_position_cap_is_per_class(store: Store) -> None:
    rm = RiskManager(RiskConfig(max_positions=8), store, CryptoRiskConfig(max_positions=5))
    assert rm.size_entry(sig("ETH-USD"), 10_000, 10_000, 10_000, 4, True) > 0.0
    assert rm.size_entry(sig("ETH-USD"), 10_000, 10_000, 10_000, 5, True) == 0.0
    assert rm.size_entry(sig("AAPL"), 10_000, 10_000, 10_000, 5, True) > 0.0


def test_crypto_min_order_value(store: Store) -> None:
    rm = RiskManager(RiskConfig(min_order_value=1.0, min_cash_reserve_pct=0.0), store,
                     CryptoRiskConfig(min_order_value=25.0))
    assert rm.size_entry(sig("SOL-USD", 1.0, 150.0), 20.0, 20.0, 10_000, 0, True) == 0.0
    assert rm.size_entry(sig("AAPL", 1.0, 10.0), 20.0, 20.0, 10_000, 0, True) > 0.0


def test_explicit_crypto_exposure_caps_entry(store: Store) -> None:
    rm = RiskManager(RiskConfig(min_cash_reserve_pct=0.0), store,
                     CryptoRiskConfig(max_position_pct=0.15, max_crypto_exposure_pct=0.50))
    qty = rm.size_entry(sig("BTC-USD", 1.0, 100.0), 10_000, 10_000, 10_000, 0, True, crypto_exposure=4_600.0)
    assert qty * 100.0 == pytest.approx(400.0)
    assert rm.size_entry(sig("BTC-USD"), 10_000, 10_000, 10_000, 0, True, crypto_exposure=5_000.0) == 0.0
    assert rm.size_entry(sig("AAPL"), 10_000, 10_000, 10_000, 0, True, crypto_exposure=5_000.0) > 0.0


def test_tracked_exposure_and_reservations_enforce_cap(store: Store) -> None:
    rm = RiskManager(RiskConfig(min_cash_reserve_pct=0.0), store,
                     CryptoRiskConfig(max_position_pct=0.15, max_crypto_exposure_pct=0.50, max_positions=10))
    held = {"BTC-USD": pos("BTC-USD", avg=100.0, qty=20.0)}  # 2,000 at 100
    rm.update_marks(held, {"BTC-USD": 100.0})
    assert rm.crypto_headroom(10_000) == pytest.approx(3_000.0)
    spent = 0.0
    for sym in ("ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD"):
        spent += rm.size_entry(sig(sym, 1.0, 10.0), 10_000, 10_000, 10_000, 1, True) * 10.0
    assert spent == pytest.approx(3_000.0)  # 1,500 + 1,500, then nothing left
    assert rm.crypto_headroom(10_000) == pytest.approx(0.0)
    assert rm.status()["crypto_exposure"] == pytest.approx(5_000.0)
    rm.update_marks(held, {"BTC-USD": 100.0})  # next tick: reservations cleared, re-marked from positions
    assert rm.crypto_headroom(10_000) == pytest.approx(3_000.0)


def test_exposure_by_class() -> None:
    positions = {"AAPL": pos("AAPL", 100.0, 10.0), "BTC-USD": pos("BTC-USD", 50_000.0, 0.1),
                 "ETH-USD": pos("ETH-USD", 2_000.0, 1.0)}
    exp = exposure_by_class(positions, {"AAPL": 110.0, "BTC-USD": 60_000.0}, equity=20_000.0)
    assert exp["stocks"] == pytest.approx(1_100.0)
    assert exp["crypto"] == pytest.approx(8_000.0)  # ETH unpriced -> at cost
    assert exp["crypto_pct"] == pytest.approx(0.4)
    assert exposure_by_class({}, {})["crypto_pct"] == 0.0


# ----- volatility-aware sizing helpers ------------------------------------------


def test_bar_seconds_and_bars_per_day() -> None:
    assert bar_seconds(flat_bars(10, step=300.0)) == 300.0
    gappy = flat_bars(10, step=300.0)
    gappy[5:] = [Bar(b.ts + 60_000, b.open, b.high, b.low, b.close, b.volume) for b in gappy[5:]]
    assert bar_seconds(gappy) == 300.0  # overnight gap ignored by the median
    assert bar_seconds(flat_bars(1)) is None
    assert bars_per_day(300.0, "stock") == pytest.approx(78.0)
    assert bars_per_day(300.0, "crypto") == pytest.approx(288.0)
    assert bars_per_day(86_400.0, "stock") == 1.0
    assert bars_per_day(None) == 1.0


def test_daily_vol_matches_atr_formula() -> None:
    bars = flat_bars(40, price=100.0, range_pct=0.01, step=300.0)
    assert daily_vol(bars, "stock") == pytest.approx(0.01 * math.sqrt(78.0))
    assert daily_vol(bars, "crypto") == pytest.approx(0.01 * math.sqrt(288.0))
    assert daily_vol(flat_bars(10), "stock") is None  # fewer than n + 1 bars


def test_vol_scale_bounds() -> None:
    calm = flat_bars(40, range_pct=0.0005)
    wild = flat_bars(40, range_pct=0.02)
    assert vol_scale(calm, "stock") == 1.0
    expected = TARGET_DAILY_VOL / (0.02 * math.sqrt(288.0))
    assert vol_scale(wild, "crypto") == pytest.approx(expected)
    assert 0.0 < vol_scale(wild, "crypto") < vol_scale(wild, "stock") < 1.0
    assert vol_scale(None) == 1.0 and vol_scale([]) == 1.0 and vol_scale(flat_bars(5)) == 1.0
    assert vol_scale(flat_bars(40, range_pct=0.0)) == 1.0


def test_size_entry_scales_down_for_volatility_never_up(store: Store) -> None:
    rm = RiskManager(RiskConfig(min_cash_reserve_pct=0.0), store, CryptoRiskConfig(max_position_pct=0.15))
    base = rm.size_entry(sig("BTC-USD"), 10_000, 10_000, 10_000, 0, True, crypto_exposure=0.0)
    calm = rm.size_entry(sig("BTC-USD"), 10_000, 10_000, 10_000, 0, True, crypto_exposure=0.0,
                         bars=flat_bars(40, range_pct=0.0005))
    wild_bars = flat_bars(40, range_pct=0.02)
    wild = rm.size_entry(sig("BTC-USD"), 10_000, 10_000, 10_000, 0, True, crypto_exposure=0.0, bars=wild_bars)
    assert calm == base
    assert wild == pytest.approx(base * vol_scale(wild_bars, "crypto"), rel=1e-6)
    stock = rm.size_entry(sig("AAPL"), 10_000, 10_000, 10_000, 0, True, bars=flat_bars(40, range_pct=0.0005))
    assert stock * 100.0 <= 2_000.0 + 1e-9


def test_round_qty_and_fmt_price() -> None:
    assert round_qty(1.234567891, 8) == 1.23456789
    assert round_qty(3.99, None) == 3.0
    assert round_qty(-1.0, 8) == 0.0 and round_qty(float("nan"), 6) == 0.0
    assert fmt_price(187.4234) == "187.42"
    assert fmt_price(0.123456) == "0.1235"
    assert fmt_price(0.0000123456) == "0.00001235"


def test_status_reports_crypto_limits_and_is_json_safe(store: Store) -> None:
    rm = RiskManager(RiskConfig(), store)
    rm.update_marks({"BTC-USD": pos("BTC-USD", 100.0, 10.0)}, {"BTC-USD": 100.0})
    rm.can_open(10_000.0, NOW)
    st = rm.status()
    assert st["max_crypto_exposure_pct"] == 0.50
    assert st["crypto_exposure"] == pytest.approx(1_000.0)
    assert st["crypto_exposure_pct"] == pytest.approx(0.1)
    assert st["limits"]["crypto"]["stop_loss_pct"] == 0.08
    assert st["limits"]["stock"]["stop_loss_pct"] == 0.05
    json.dumps(st)


# ----- per-asset-class strategy -------------------------------------------------


def test_asset_strategies_from_config_merges_crypto_overrides() -> None:
    cfg = from_dict({"crypto_strategy": {"weights": {"volume": 0.0}}})
    strategies = AssetStrategies.from_config(cfg)
    crypto = strategies.for_symbol("BTC-USD").cfg
    assert (crypto.rsi_oversold, crypto.rsi_overbought, crypto.entry_threshold) == (25.0, 75.0, 0.40)
    assert crypto.weights == {"trend": 0.35, "momentum": 0.25, "mean_reversion": 0.15, "volume": 0.0,
                              "forecast": 0.15}
    assert strategies.for_symbol("AAPL").cfg == cfg.strategy
    assert strategies.entry_threshold("ETH-USD") == 0.40 and strategies.entry_threshold("AAPL") == 0.35
    assert strategies.exit_threshold("ETH-USD") == cfg.strategy.exit_threshold
    assert strategies.min_bars <= cfg.lookback_bars


def test_asset_strategies_scores_crypto_with_crypto_config() -> None:
    stock_cfg = StrategyConfig()
    strategies = AssetStrategies(Strategy(stock_cfg), Strategy(StrategyConfig(rsi_oversold=10.0, rsi_overbought=90.0)))
    bars = trending_bars()
    as_stock = strategies.evaluate("AAPL", bars)
    as_crypto = strategies.evaluate("BTC-USD", bars)
    assert as_stock is not None and as_crypto is not None
    assert as_crypto.symbol == "BTC-USD"
    assert as_crypto.components["trend"] == as_stock.components["trend"]
    # Overbought RSI is penalized less on the wider crypto RSI band.
    assert as_stock.components["mean_reversion"] < as_crypto.components["mean_reversion"] < 0.0


def test_asset_strategies_default_crypto_is_stock_strategy() -> None:
    stock = Strategy(StrategyConfig())
    strategies = AssetStrategies(stock)
    assert strategies.for_symbol("BTC-USD") is stock
    custom = AssetStrategies.from_config(Config(), stock=stock)
    assert custom.for_symbol("AAPL") is stock and custom.for_symbol("BTC-USD") is not stock
