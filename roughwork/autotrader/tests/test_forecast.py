"""Forecaster math on hand-checkable series, walk-forward skill, config and strategy wiring."""

from __future__ import annotations

import dataclasses
import json
import math
import random
from pathlib import Path

import pytest

from autotrader.config import ConfigError, ForecastConfig, StrategyConfig, from_dict, load_config
from autotrader.data import SyntheticData
from autotrader.forecast import (
    ALPHA_GRID,
    BETA_GRID,
    Forecast,
    Forecaster,
    ForecastPoint,
    damped_sum,
    fit_holt,
    holt,
    linear_fit,
)
from autotrader.models import Bar, to_dict
from autotrader.strategy import Strategy, forecast_component, weighted_score

T0 = 1_700_000_000.0


def bars_from(closes: list[float], spacing: float = 300.0) -> list[Bar]:
    return [Bar(ts=T0 + spacing * i, open=c, high=c * 1.001, low=c * 0.999, close=c, volume=1000.0)
            for i, c in enumerate(closes)]


def gbm(n: int, drift: float, vol: float, seed: int, start: float = 100.0) -> list[float]:
    rng = random.Random(seed)
    out = [start]
    for _ in range(n - 1):
        out.append(out[-1] * math.exp(drift + rng.gauss(0.0, vol)))
    return out


def predict(closes: list[float], cfg: ForecastConfig | None = None, spacing: float = 300.0) -> Forecast | None:
    return Forecaster(cfg or ForecastConfig()).predict("TEST", bars_from(closes, spacing), now=0.0)


# ----- building blocks ----------------------------------------------------------


def test_damped_sum() -> None:
    assert damped_sum(1.0, 5) == pytest.approx(5.0)
    assert damped_sum(0.5, 2) == pytest.approx(0.75)
    assert damped_sum(0.9, 3) == pytest.approx(0.9 + 0.81 + 0.729)
    assert damped_sum(0.9, 0) == 0.0


def test_holt_hand_computed_undamped() -> None:
    # l=1,b=2 | t1: pred 3 -> l=3,b=2 | t2: pred 5, err -1 -> l=4.5, b=1.75
    fit = holt([1.0, 3.0, 4.0], alpha=0.5, beta=0.5, phi=1.0)
    assert fit.errors == pytest.approx([-1.0])
    assert (fit.level, fit.trend) == pytest.approx((4.5, 1.75))
    assert fit.forecast(1) == pytest.approx(6.25)
    assert fit.forecast(2) == pytest.approx(8.0)
    assert fit.sse == pytest.approx(1.0)


def test_holt_hand_computed_damped() -> None:
    # l=1,b=2 | t1: pred 2 -> l=2.5, b=1.25 | t2: pred 3.125, err .875 -> l=3.5625, b=.84375
    fit = holt([1.0, 3.0, 4.0], alpha=0.5, beta=0.5, phi=0.5)
    assert fit.errors == pytest.approx([0.875])
    assert (fit.level, fit.trend) == pytest.approx((3.5625, 0.84375))
    assert fit.forecast(2) == pytest.approx(3.5625 + 0.75 * 0.84375)


def test_holt_exact_on_line_without_damping() -> None:
    fit = holt([2.0 + 0.5 * i for i in range(20)], alpha=0.3, beta=0.1, phi=1.0)
    assert all(abs(e) < 1e-12 for e in fit.errors)
    assert fit.forecast(4) == pytest.approx(2.0 + 0.5 * 23)


def test_holt_needs_two_points() -> None:
    with pytest.raises(ValueError):
        holt([1.0], 0.5, 0.5, 0.9)


def test_grid_search_picks_minimum_sse() -> None:
    y = [math.log(c) for c in gbm(60, 0.002, 0.01, seed=3)]
    best = fit_holt(y, None, None, 0.9)
    assert best.alpha in ALPHA_GRID and best.beta in BETA_GRID
    for a in ALPHA_GRID:
        for b in BETA_GRID:
            assert best.sse <= holt(y, a, b, 0.9).sse + 1e-12
    fixed = fit_holt(y, 0.3, None, 0.9)
    assert fixed.alpha == 0.3 and fixed.beta in BETA_GRID


def test_linear_fit_hand_computed() -> None:
    # x_mean 1.5, y_mean 2.5, sxx 5, sxy 6 -> slope 1.2, intercept 0.7
    fit = linear_fit([1.0, 2.0, 2.0, 5.0])
    assert (fit.slope, fit.intercept) == pytest.approx((1.2, 0.7))
    assert fit.forecast(1) == pytest.approx(5.5)
    assert sum(fit.residuals) == pytest.approx(0.0, abs=1e-12)
    single = linear_fit([3.0])
    assert single.slope == 0.0 and single.forecast(5) == pytest.approx(3.0)


# ----- forecasts on known shapes ------------------------------------------------


def test_linear_ramp_predicts_up_with_tight_band() -> None:
    closes = [100.0 + i for i in range(100)]
    fc = predict(closes)
    assert fc is not None
    assert fc.direction == "up" and fc.expected_return > 0.01
    assert all(b.mid > a.mid for a, b in zip(fc.points, fc.points[1:]))
    assert fc.points[0].mid > closes[-1]
    assert fc.band_half_width < 0.02
    # Every full-window origin (29 of them in 100 bars) hits, but overlapping 12-bar windows
    # are only ~29/12 independent trials, so the shrunk rate stays well below 1.
    assert 0.6 < fc.hit_rate < 0.66 and fc.confidence > 0.25


def test_falling_ramp_predicts_down() -> None:
    fc = predict([200.0 - i for i in range(100)])
    assert fc is not None and fc.direction == "down" and fc.expected_return < -0.01


def test_exponential_growth_is_extrapolated_exactly() -> None:
    closes = [100.0 * 1.01 ** i for i in range(100)]
    fc = predict(closes)
    assert fc is not None
    # Log prices are an exact line, so OLS has zero residuals and takes all the weight.
    assert fc.expected_return == pytest.approx(1.01 ** 12 - 1.0, rel=1e-6)
    for h, p in enumerate(fc.points, start=1):
        assert p.mid == pytest.approx(closes[-1] * 1.01 ** h, rel=1e-6)
        assert p.lo <= p.mid <= p.hi
    assert fc.direction == "up" and fc.confidence > 0.25


def test_constant_series_returns_none() -> None:
    assert predict([50.0] * 100) is None


def test_near_flat_series_is_flat_without_errors() -> None:
    closes = [100.0 + (1e-5 if i % 2 else 0.0) for i in range(100)]
    fc = predict(closes)
    assert fc is not None
    assert fc.direction == "flat"
    assert abs(fc.expected_return) < 0.002
    assert all(math.isfinite(v) for p in fc.points for v in (p.mid, p.lo, p.hi))
    assert 0.0 <= fc.confidence <= 1.0


@pytest.mark.parametrize("closes", [
    [100.0] * 10,                                  # fewer than min_bars
    [100.0 + i for i in range(59)] + [0.0],        # non-positive price
    [100.0 + i for i in range(59)] + [math.nan],   # NaN
    [100.0 + i for i in range(59)] + [math.inf],   # infinite
])
def test_invalid_or_short_data_returns_none(closes: list[float]) -> None:
    assert predict(closes) is None


def test_noisy_random_walk_has_low_confidence() -> None:
    walks = [predict(gbm(120, 0.0, 0.01, seed=s)) for s in range(30)]
    trends = [predict(gbm(120, 0.003, 0.004, seed=s)) for s in range(30)]
    assert all(fc is not None for fc in walks + trends)
    walk_conf = sum(fc.confidence for fc in walks) / len(walks)  # type: ignore[union-attr]
    trend_conf = sum(fc.confidence for fc in trends) / len(trends)  # type: ignore[union-attr]
    assert walk_conf < 0.35
    assert trend_conf > 0.3 and trend_conf > walk_conf + 0.3
    # overlapping windows are not independent trials: noise rarely looks skilled
    assert sum(fc.confidence >= 0.3 for fc in walks) <= 2  # type: ignore[union-attr]
    wild = predict(gbm(120, 0.0, 0.08, seed=1))
    assert wild is not None and wild.confidence < 0.2


def test_walk_forward_hit_rate_on_trending_series() -> None:
    for seed in range(10):
        fc = predict(gbm(120, 0.003, 0.004, seed=seed))
        assert fc is not None and fc.hit_rate > 0.5 and fc.direction == "up"


def test_few_scored_origins_cannot_claim_full_skill() -> None:
    # One scored origin (horizon 20, 40 bars): an unshrunk rate would be 0 or 1 on pure noise.
    cfg = ForecastConfig(horizon_bars=20, window=40, min_bars=40)
    rates = {round(p.hit_rate, 6) for s in range(20)
             if (p := predict(gbm(40, 0.0, 0.01, seed=s), cfg)) is not None}
    assert rates and all(abs(r - 0.5) < 0.01 for r in rates)


def test_hit_rate_defaults_to_coin_flip_without_backtest() -> None:
    fc = predict([100.0 + i for i in range(100)], ForecastConfig(backtest_steps=0))
    assert fc is not None and fc.hit_rate == 0.5 and fc.confidence == 0.0


def test_confidence_formula() -> None:
    fc = predict(gbm(120, 0.001, 0.01, seed=11))
    assert fc is not None
    last = fc.points[-1]
    band_rel_width = (last.hi - last.lo) / last.mid
    expected = max(0.0, min(1.0, (fc.hit_rate - 0.5) * 2)) * max(0.0, min(1.0, 1.0 - band_rel_width))
    assert fc.confidence == pytest.approx(expected)
    assert fc.band_half_width == pytest.approx(band_rel_width / 2.0)


def test_band_widens_with_horizon_as_sqrt_h() -> None:
    cfg = ForecastConfig()
    fc = predict(gbm(120, 0.0005, 0.01, seed=5), cfg)
    assert fc is not None and len(fc.points) == cfg.horizon_bars == fc.horizon
    widths = [p.hi - p.lo for p in fc.points]
    assert all(b > a for a, b in zip(widths, widths[1:]))
    spreads = [math.log(p.hi / p.mid) / math.sqrt(h) for h, p in enumerate(fc.points, start=1)]
    assert all(s == pytest.approx(spreads[0]) for s in spreads)
    assert all(math.log(p.mid / p.lo) == pytest.approx(math.log(p.hi / p.mid)) for p in fc.points)
    wider = predict(gbm(120, 0.0005, 0.01, seed=5), dataclasses.replace(cfg, band_z=2.0))
    assert wider is not None and wider.band_half_width > fc.band_half_width


def test_future_timestamps_use_median_spacing() -> None:
    bars = bars_from([100.0 + 0.5 * i + (i % 3) * 0.2 for i in range(80)])
    bars[40:] = [dataclasses.replace(b, ts=b.ts + 6000.0) for b in bars[40:]]  # one overnight-style gap
    fc = Forecaster(ForecastConfig(horizon_bars=5)).predict("GAP", bars, now=0.0)
    assert fc is not None
    assert [p.ts for p in fc.points] == pytest.approx([bars[-1].ts + 300.0 * h for h in range(1, 6)])


def test_duplicate_timestamps_fall_back_to_default_spacing() -> None:
    bars = [dataclasses.replace(b, ts=T0) for b in bars_from([100.0 + i for i in range(60)])]
    fc = Forecaster(ForecastConfig(horizon_bars=2)).predict("DUP", bars, now=0.0)
    assert fc is not None and [p.ts for p in fc.points] == [T0 + 60.0, T0 + 120.0]


def test_window_limits_the_fit() -> None:
    # Long decline then a recent rise: a short window should only see the rise.
    closes = [300.0 - i for i in range(150)] + [150.0 + 2.0 * i for i in range(50)]
    short = predict(closes, ForecastConfig(window=40, min_bars=30))
    assert short is not None and short.direction == "up"


def test_predict_is_deterministic_and_json_safe() -> None:
    feed = SyntheticData(seed=9)
    for _ in range(5):
        feed.refresh()
    a_bars = feed.get_bars("BTC-USD", "5m", 120)
    b_feed = SyntheticData(seed=9)
    for _ in range(5):
        b_feed.refresh()
    b_bars = b_feed.get_bars("BTC-USD", "5m", 120)
    f = Forecaster(ForecastConfig())
    a, b = f.predict("BTC-USD", a_bars, now=123.0), f.predict("BTC-USD", b_bars, now=123.0)
    assert a is not None and a == b and a.generated_ts == 123.0
    assert a.symbol == "BTC-USD" and a.method.startswith("holt-damped")
    d = to_dict(a)
    json.dumps(d)
    assert set(d["points"][0]) == {"ts", "mid", "lo", "hi"}


def test_generated_ts_defaults_to_wall_clock() -> None:
    fc = Forecaster(ForecastConfig()).predict("X", bars_from([100.0 + i for i in range(60)]))
    assert fc is not None and fc.generated_ts > T0


def test_fixed_smoothing_parameters_are_used() -> None:
    fc = predict(gbm(120, 0.001, 0.01, seed=2), ForecastConfig(alpha=0.4, beta=0.2, phi=1.0))
    assert fc is not None and "a=0.4,b=0.2,phi=1" in fc.method


# ----- config -------------------------------------------------------------------


def test_forecast_config_defaults() -> None:
    cfg = load_config(None)
    assert cfg.forecast == ForecastConfig()
    f = cfg.forecast
    assert (f.enabled, f.horizon_bars, f.window, f.min_bars, f.band_z) == (True, 12, 60, 40, 1.28)
    assert (f.flat_threshold, f.backtest_steps, f.use_in_strategy) == (0.002, 72, True)
    assert (f.alpha, f.beta, f.phi) == (None, None, 0.9)


def test_forecast_config_merges_and_coerces() -> None:
    cfg = from_dict({"forecast": {"horizon_bars": 24, "alpha": 0.5, "beta": 1, "use_in_strategy": False}})
    assert cfg.forecast.horizon_bars == 24 and cfg.forecast.window == 60
    assert cfg.forecast.alpha == 0.5 and cfg.forecast.beta == 1.0 and isinstance(cfg.forecast.beta, float)
    assert cfg.forecast.use_in_strategy is False
    assert from_dict({"forecast": {"alpha": None}}).forecast.alpha is None


@pytest.mark.parametrize("override, fragment", [
    ({"forecast": {"horizon_bars": 0}}, "horizon_bars"),
    ({"forecast": {"window": 30}}, "min_bars"),
    ({"forecast": {"min_bars": 5}}, "min_bars"),
    ({"forecast": {"band_z": 0}}, "band_z"),
    ({"forecast": {"flat_threshold": -0.1}}, "flat_threshold"),
    ({"forecast": {"backtest_steps": -1}}, "backtest_steps"),
    ({"forecast": {"alpha": 1.5}}, "alpha"),
    ({"forecast": {"beta": 0}}, "beta"),
    ({"forecast": {"phi": 0}}, "phi"),
    ({"forecast": {"enabled": "yes"}}, "enabled"),
    ({"forecast": {"seasonality": 7}}, "seasonality"),
    ({"forecast": {"min_bars": 100, "window": 100}, "lookback_bars": 90}, "forecast.min_bars"),
])
def test_invalid_forecast_config(override: dict, fragment: str) -> None:
    with pytest.raises(ConfigError, match=fragment):
        from_dict(override)


def test_disabled_forecast_skips_lookback_check() -> None:
    cfg = from_dict({"forecast": {"enabled": False, "min_bars": 100, "window": 100}, "lookback_bars": 90})
    assert cfg.forecast.enabled is False


def test_example_config_contains_forecast_section() -> None:
    root = Path(__file__).resolve().parent.parent
    raw = json.loads((root / "config.example.json").read_text(encoding="utf-8"))
    assert raw["forecast"] == dataclasses.asdict(ForecastConfig())
    assert raw["strategy"]["weights"] == StrategyConfig().weights


# ----- strategy component -------------------------------------------------------


def make_forecast(expected: float, half_width: float, confidence: float, last: float = 100.0) -> Forecast:
    mid = last * (1.0 + expected)
    point = ForecastPoint(ts=T0, mid=mid, lo=mid * (1.0 - half_width), hi=mid * (1.0 + half_width))
    return Forecast(symbol="X", horizon=1, points=[point], expected_return=expected,
                    direction="up" if expected > 0 else "down", confidence=confidence,
                    hit_rate=0.5 + confidence / 2.0, method="test", generated_ts=0.0)


def test_forecast_component_formula() -> None:
    assert forecast_component(make_forecast(0.005, 0.01, 0.8)) == pytest.approx(0.4)
    assert forecast_component(make_forecast(-0.005, 0.01, 0.8)) == pytest.approx(-0.4)
    assert forecast_component(make_forecast(0.05, 0.01, 0.5)) == pytest.approx(0.5)  # ratio clipped to 1
    assert forecast_component(make_forecast(0.02, 0.0, 0.6)) == pytest.approx(0.6)   # zero band guarded
    assert forecast_component(make_forecast(0.02, 0.01, 0.0)) == 0.0


def test_weighted_score_normalizes_over_present_components() -> None:
    weights = {"trend": 0.35, "momentum": 0.25, "forecast": 0.15}
    assert weighted_score({"trend": 1.0, "momentum": -1.0}, weights) == pytest.approx(0.10 / 0.60)
    assert weighted_score({"trend": 1.0, "momentum": -1.0, "forecast": 1.0}, weights) == pytest.approx(0.25 / 0.75)
    assert weighted_score({"volume": 1.0}, weights) == 0.0  # no weight present: no division by zero


def test_strategy_uses_forecast_only_when_given() -> None:
    cfg = StrategyConfig()
    bars = bars_from(gbm(120, 0.002, 0.006, seed=4))
    strat = Strategy(cfg)
    plain = strat.evaluate("UP", bars)
    fc = Forecaster(ForecastConfig()).predict("UP", bars, now=0.0)
    assert plain is not None and fc is not None
    with_fc = strat.evaluate("UP", bars, fc)
    assert with_fc is not None
    assert "forecast" not in plain.components and "forecast" in with_fc.components
    assert with_fc.components["forecast"] == pytest.approx(forecast_component(fc), abs=1e-4)
    present = sum(cfg.weights[k] for k in with_fc.components)
    expected = sum(cfg.weights[k] * v for k, v in with_fc.components.items()) / present
    assert with_fc.score == pytest.approx(expected, abs=1e-3)
    assert "fc " in with_fc.reason


def test_forecast_only_weights() -> None:
    cfg = StrategyConfig(weights={"forecast": 1.0})
    bars = bars_from(gbm(120, 0.003, 0.004, seed=1))
    fc = Forecaster(ForecastConfig()).predict("UP", bars, now=0.0)
    strat = Strategy(cfg)
    sig = strat.evaluate("UP", bars, fc)
    assert sig is not None and fc is not None
    assert sig.score == pytest.approx(forecast_component(fc), abs=1e-9) and sig.score > 0.3
    no_fc = strat.evaluate("UP", bars)
    assert no_fc is not None and no_fc.score == 0.0
