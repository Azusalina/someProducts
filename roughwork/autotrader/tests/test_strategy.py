"""Indicator correctness against hand-computed values, and ensemble strategy behaviour."""

from __future__ import annotations

import math
import random

import pytest

from autotrader.config import StrategyConfig
from autotrader.models import Bar, Signal
from autotrader.strategy import Strategy, atr, ema, rank, rate_of_change, rsi, sma, zscore


def make_bars(closes: list[float], volumes: list[float] | None = None) -> list[Bar]:
    vols = volumes or [1000.0] * len(closes)
    bars: list[Bar] = []
    prev = closes[0]
    for i, (c, v) in enumerate(zip(closes, vols)):
        bars.append(Bar(ts=1_700_000_000 + 300 * i, open=prev, high=max(prev, c) * 1.002,
                        low=min(prev, c) * 0.998, close=c, volume=v))
        prev = c
    return bars


def trending(n: int, drift: float, seed: int = 7, start: float = 100.0, noise: float = 0.004) -> list[float]:
    rng = random.Random(seed)
    out = [start]
    for _ in range(n - 1):
        out.append(out[-1] * (1.0 + drift + rng.gauss(0.0, noise)))
    return out


# ----- indicators ---------------------------------------------------------------

def test_sma() -> None:
    assert sma([1, 2, 3, 4, 5], 3) == pytest.approx(4.0)
    assert sma([1, 2, 3, 4, 5], 5) == pytest.approx(3.0)
    assert sma([1, 2], 3) is None


def test_ema_seeded_with_sma() -> None:
    # seed (1+2+3)/3 = 2; alpha 0.5: 4 -> 3, 5 -> 4
    assert ema([1, 2, 3, 4, 5], 3) == pytest.approx(4.0)
    # seed 3; alpha 2/3: 6 -> 5, 8 -> 7, 12 -> 10.3333
    assert ema([2, 4, 6, 8, 12], 2) == pytest.approx(31 / 3)
    assert ema([1, 2], 3) is None


def test_rsi_wilder_hand_computed() -> None:
    # changes +1, -0.5, +1.5 | -1, +2 ; seed gain 2.5/3, loss 0.5/3
    # -> gain 5/9, loss 4/9 -> gain 28/27, loss 8/27 ; RS 3.5 ; RSI 700/9
    assert rsi([10, 11, 10.5, 12, 11, 13], 3) == pytest.approx(700 / 9)


def test_rsi_edges() -> None:
    assert rsi([1, 2, 3, 4, 5], 3) == pytest.approx(100.0)
    assert rsi([5, 4, 3, 2, 1], 3) == pytest.approx(0.0)
    assert rsi([3, 3, 3, 3], 3) == pytest.approx(50.0)
    assert rsi([1, 2, 3], 3) is None  # needs n + 1 values


def test_rsi_uses_wilder_not_simple_average() -> None:
    values = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
              45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64]
    changes = [b - a for a, b in zip(values, values[1:])]
    n = 14
    g = sum(max(c, 0) for c in changes[:n]) / n
    lo = sum(max(-c, 0) for c in changes[:n]) / n
    for c in changes[n:]:
        g = (g * (n - 1) + max(c, 0)) / n
        lo = (lo * (n - 1) + max(-c, 0)) / n
    expected = 100 - 100 / (1 + g / lo)
    assert rsi(values, n) == pytest.approx(expected)
    tail = changes[-n:]
    cutler = 100 - 100 / (1 + sum(max(c, 0) for c in tail) / sum(max(-c, 0) for c in tail))
    assert abs(rsi(values, n) - cutler) > 0.1


def test_rate_of_change() -> None:
    assert rate_of_change([100, 105, 110], 2) == pytest.approx(0.10)
    assert rate_of_change([100, 90], 1) == pytest.approx(-0.10)
    assert rate_of_change([100], 1) is None
    assert rate_of_change([0, 5], 1) is None


def test_atr_wilder_hand_computed() -> None:
    bars = [
        Bar(0, 9, 10, 8, 9, 1),
        Bar(1, 9, 11, 9, 10.5, 1),    # TR max(2, 2, 0) = 2
        Bar(2, 10.5, 12, 10, 11, 1),  # TR max(2, 1.5, 0.5) = 2
        Bar(3, 13, 15, 13, 14, 1),    # TR max(2, 4, 2) = 4 (gap up)
    ]
    # seed (2 + 2) / 2 = 2 ; Wilder (2 * 1 + 4) / 2 = 3
    assert atr(bars, 2) == pytest.approx(3.0)
    assert atr(bars[:3], 2) == pytest.approx(2.0)
    assert atr(bars[:2], 2) is None


def test_zscore() -> None:
    # mean 4, population variance 50/5 = 10
    assert zscore([1, 2, 3, 4, 10], 5) == pytest.approx(6 / math.sqrt(10))
    assert zscore([0, 1, 2, 3, 4, 10], 5) == pytest.approx(6 / math.sqrt(10))
    assert zscore([5, 5, 5], 3) == 0.0
    assert zscore([1, 2], 3) is None


# ----- strategy -----------------------------------------------------------------

def test_not_enough_bars_returns_none() -> None:
    strat = Strategy(StrategyConfig())
    bars = make_bars(trending(strat.min_bars - 1, 0.002))
    assert strat.evaluate("AAA", bars) is None
    assert strat.evaluate("AAA", make_bars(trending(strat.min_bars, 0.002))) is not None


def test_uptrend_is_bullish_downtrend_is_bearish() -> None:
    strat = Strategy(StrategyConfig())
    up = strat.evaluate("UP", make_bars(trending(120, 0.003)))
    down = strat.evaluate("DN", make_bars(trending(120, -0.003)))
    assert up is not None and down is not None
    assert up.score > 0.2 and down.score < -0.2
    assert up.components["trend"] > 0.5 and up.components["momentum"] > 0.5
    assert down.components["trend"] < -0.5 and down.components["momentum"] < -0.5
    assert up.price == pytest.approx(make_bars(trending(120, 0.003))[-1].close)
    assert up.reason and down.reason


def test_components_bounded_and_score_is_weighted_sum() -> None:
    cfg = StrategyConfig()
    strat = Strategy(cfg)
    for seed in range(20):
        sig = strat.evaluate("X", make_bars(trending(80, 0.0, seed=seed, noise=0.02)))
        assert sig is not None
        assert set(sig.components) == {"trend", "momentum", "mean_reversion", "volume"}
        assert all(-1.0 <= v <= 1.0 for v in sig.components.values())
        present = sum(cfg.weights[k] for k in sig.components)
        expected = sum(cfg.weights[k] * v for k, v in sig.components.items()) / present
        assert sig.score == pytest.approx(max(-1.0, min(1.0, expected)), abs=1e-3)


def test_weights_are_normalized_so_scale_does_not_matter() -> None:
    bars = make_bars(trending(120, 0.004))
    light = StrategyConfig(weights={"trend": 0.5, "momentum": 0.5, "mean_reversion": 0.0, "volume": 0.0})
    heavy = StrategyConfig(weights={"trend": 3.0, "momentum": 3.0, "mean_reversion": 0.0, "volume": 0.0})
    a, b = Strategy(light).evaluate("UP", bars), Strategy(heavy).evaluate("UP", bars)
    assert a is not None and b is not None
    assert a.score == pytest.approx(b.score)
    assert a.score == pytest.approx((a.components["trend"] + a.components["momentum"]) / 2.0, abs=1e-3)
    assert -1.0 <= b.score <= 1.0


def test_flat_series_is_neutral() -> None:
    strat = Strategy(StrategyConfig())
    sig = strat.evaluate("FLAT", make_bars([50.0] * 60))
    assert sig is not None
    assert sig.score == pytest.approx(0.0)
    assert sig.components["mean_reversion"] == pytest.approx(0.0)


def test_mean_reversion_oversold_positive() -> None:
    cfg = StrategyConfig(weights={"mean_reversion": 1.0})
    flat = trending(60, 0.0, noise=0.001)
    closes = flat + [flat[-1] * (0.98 ** k) for k in range(1, 16)]
    sig = Strategy(cfg).evaluate("OS", make_bars(closes))
    assert sig is not None
    assert sig.components["mean_reversion"] == pytest.approx(1.0)
    assert sig.score == pytest.approx(1.0)
    rising = [100 * (1.02 ** k) for k in range(60)]
    over = Strategy(cfg).evaluate("OB", make_bars(rising))
    assert over is not None and over.components["mean_reversion"] == pytest.approx(-1.0)


def test_volume_confirms_direction() -> None:
    strat = Strategy(StrategyConfig())
    base = [100.0 + (i % 2) * 0.1 for i in range(59)]
    vols = [1000.0] * 59 + [2500.0]
    up = strat.evaluate("V", make_bars(base + [base[-1] + 1.0], vols))
    down = strat.evaluate("V", make_bars(base + [base[-1] - 1.0], vols))
    quiet = strat.evaluate("V", make_bars(base + [base[-1] + 1.0], [1000.0] * 60))
    assert up is not None and down is not None and quiet is not None
    assert up.components["volume"] == pytest.approx(1.0)
    assert down.components["volume"] == pytest.approx(-1.0)
    assert quiet.components["volume"] == pytest.approx(0.0)


def test_rank_sorts_by_score_desc() -> None:
    sigs = [Signal("A", 0.1, 1.0, ""), Signal("B", 0.9, 1.0, ""), Signal("C", -0.5, 1.0, "")]
    assert [s.symbol for s in rank(sigs)] == ["B", "A", "C"]
    assert rank([]) == []


def test_evaluate_is_deterministic() -> None:
    strat = Strategy(StrategyConfig())
    bars = make_bars(trending(100, 0.001, seed=11, noise=0.01))
    a, b = strat.evaluate("D", bars), strat.evaluate("D", bars)
    assert a == b


def test_forming_bar_volume_is_pro_rated_by_elapsed_time() -> None:
    strat = Strategy(StrategyConfig())
    base = [100.0 + (i % 2) * 0.1 for i in range(59)]
    bars = make_bars(base + [base[-1] + 1.0], [1000.0] * 59 + [600.0])  # 20% into a bar at 3x pace
    spacing = bars[-1].ts - bars[-2].ts
    forming = strat.evaluate("V", bars, now=bars[-1].ts + 0.2 * spacing)
    complete = strat.evaluate("V", bars)  # no clock: the bar is taken as complete (0.6x)
    assert forming is not None and complete is not None
    assert forming.components["volume"] == pytest.approx(1.0)
    assert complete.components["volume"] == pytest.approx(0.0)
    later = strat.evaluate("V", bars, now=bars[-1].ts + 2 * spacing)  # long past: complete bar
    assert later is not None and later.components["volume"] == pytest.approx(0.0)
