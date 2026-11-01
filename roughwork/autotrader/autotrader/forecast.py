"""Short-horizon statistical price projection (pure, deterministic, stdlib only).

Model, on log closes over the last ``window`` bars:

* (a) damped-trend Holt linear exponential smoothing. ``alpha``/``beta`` come from the config
  or, when ``None``, from a small grid search minimizing the one-step-ahead SSE; ``phi`` damps
  the trend so the h-step forecast is ``level + (phi + phi^2 + ... + phi^h) * trend``.
* (b) ordinary least-squares log-linear regression ``log(close) = a + b * t``.

The two log forecasts are blended by inverse mean-squared error (Holt's one-step errors vs.
the regression's in-sample residuals; equal weights when both are ~0). ``mid = exp(blend)``.

Uncertainty: ``sigma`` is the standard deviation (root-mean-square about zero) of Holt's
one-step log residuals, and the band is ``mid * exp(+-band_z * sigma * sqrt(h))``.

Skill: ``hit_rate`` is a walk-forward directional accuracy. At each of the last
``backtest_steps`` origins that still have ``horizon`` realized bars after them, the model is
refit on the bars up to that origin only (its own ``alpha``/``beta`` grid search too, so no
parameter is tuned on bars after the origin) and the sign of its ``horizon``-step move is
compared with the realized one. Origins where either move is exactly zero are skipped.
Neighbouring origins share ``horizon - 1`` of their realized bars, so ``scored`` origins are
worth only about ``scored / horizon`` independent trials. The rate is shrunk toward a coin flip
with those effective trials, ``(hits/h + HIT_RATE_PRIOR/2) / (scored/h + HIT_RATE_PRIOR)``, so
one persistent random swing cannot claim skill; with no scored origin it is 0.5.
Each origin's prediction depends only on its own history window, so it is memoized.

``confidence = clip((hit_rate - 0.5) * 2, 0, 1) * clip(1 - band_rel_width, 0, 1)`` where
``band_rel_width = (hi - lo) / mid`` at the final horizon step: a model no better than a coin
flip, or one whose band is wider than the price itself, gets zero confidence.

This is a statistical projection of recent drift, not a guarantee of future prices.
"""

from __future__ import annotations

import math
import time
from collections.abc import Sequence
from dataclasses import dataclass

from .config import ForecastConfig
from .models import Bar

ALPHA_GRID: tuple[float, ...] = (0.1, 0.2, 0.3, 0.5, 0.7, 0.9)
BETA_GRID: tuple[float, ...] = (0.01, 0.05, 0.1, 0.2, 0.3)
DEFAULT_SPACING_SECONDS: float = 60.0
HIT_RATE_PRIOR: float = 6.0  # pseudo-trials at 50% added to the walk-forward hit rate
_EPS: float = 1e-12


@dataclass
class ForecastPoint:
    """One projected bar: central estimate and the lo/hi band."""

    ts: float
    mid: float
    lo: float
    hi: float


@dataclass
class Forecast:
    """Projection for ``horizon`` bars after the last real bar of ``symbol``."""

    symbol: str
    horizon: int
    points: list[ForecastPoint]
    expected_return: float
    direction: str
    confidence: float
    hit_rate: float
    method: str
    generated_ts: float

    @property
    def band_half_width(self) -> float:
        """Half the lo-hi band at the final step, relative to its mid (0.0 if unavailable)."""
        if not self.points:
            return 0.0
        last = self.points[-1]
        return (last.hi - last.lo) / (2.0 * last.mid) if last.mid > 0.0 else 0.0


@dataclass
class HoltFit:
    """End state of a damped Holt pass plus its one-step-ahead errors."""

    level: float
    trend: float
    alpha: float
    beta: float
    phi: float
    errors: list[float]

    @property
    def sse(self) -> float:
        """Sum of squared one-step errors."""
        return sum(e * e for e in self.errors)

    def forecast(self, h: int) -> float:
        """h-step-ahead forecast: ``level + (phi + ... + phi^h) * trend``."""
        return self.level + damped_sum(self.phi, h) * self.trend


@dataclass
class LinearFit:
    """OLS line ``y = intercept + slope * x`` over ``x = 0..n-1`` and its residuals."""

    intercept: float
    slope: float
    n: int
    residuals: list[float]

    def forecast(self, h: int) -> float:
        """Value of the line ``h`` steps past the last observation."""
        return self.intercept + self.slope * (self.n - 1 + h)


def damped_sum(phi: float, h: int) -> float:
    """``phi + phi^2 + ... + phi^h`` (equals ``h`` when ``phi == 1``)."""
    if h <= 0:
        return 0.0
    if abs(1.0 - phi) < _EPS:
        return float(h)
    return phi * (1.0 - phi ** h) / (1.0 - phi)


def holt(y: Sequence[float], alpha: float, beta: float, phi: float) -> HoltFit:
    """Damped-trend Holt smoothing of ``y`` (needs >= 2 values).

    Initialised with ``level = y[0]`` and ``trend = y[1] - y[0]``; errors are recorded from
    ``y[2]`` on, because ``y[1]`` already seeded the trend and is not an out-of-sample point.
    """
    if len(y) < 2:
        raise ValueError("holt needs at least two observations")
    level, trend = y[0], y[1] - y[0]
    errors: list[float] = []
    for t in range(1, len(y)):
        predicted = level + phi * trend
        if t >= 2:
            errors.append(y[t] - predicted)
        new_level = alpha * y[t] + (1.0 - alpha) * predicted
        trend = beta * (new_level - level) + (1.0 - beta) * phi * trend
        level = new_level
    return HoltFit(level=level, trend=trend, alpha=alpha, beta=beta, phi=phi, errors=errors)


def fit_holt(y: Sequence[float], alpha: float | None, beta: float | None, phi: float) -> HoltFit:
    """Holt fit with any unset ``alpha``/``beta`` chosen by grid search on one-step SSE."""
    alphas = (alpha,) if alpha is not None else ALPHA_GRID
    betas = (beta,) if beta is not None else BETA_GRID
    best: HoltFit | None = None
    best_sse = math.inf
    for a in alphas:
        for b in betas:
            fit = holt(y, a, b, phi)
            sse = fit.sse
            if best is None or sse < best_sse - _EPS:
                best, best_sse = fit, sse
    assert best is not None
    return best


def linear_fit(y: Sequence[float]) -> LinearFit:
    """Ordinary least squares of ``y`` on ``x = 0..n-1``; slope 0 for a single point."""
    n = len(y)
    if n == 0:
        raise ValueError("linear_fit needs at least one observation")
    x_mean = (n - 1) / 2.0
    y_mean = sum(y) / n
    sxx = sum((i - x_mean) ** 2 for i in range(n))
    sxy = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(y))
    slope = sxy / sxx if sxx > 0.0 else 0.0
    intercept = y_mean - slope * x_mean
    residuals = [v - (intercept + slope * i) for i, v in enumerate(y)]
    return LinearFit(intercept=intercept, slope=slope, n=n, residuals=residuals)


def _rms(values: Sequence[float]) -> float:
    return math.sqrt(sum(v * v for v in values) / len(values)) if values else 0.0


def _median(values: Sequence[float]) -> float:
    s = sorted(values)
    n = len(s)
    if n == 0:
        return 0.0
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


@dataclass
class _Ensemble:
    """Blended log forecasts for h = 1..horizon plus the pieces that produced them."""

    log_mids: list[float]
    sigma: float
    holt_weight: float
    alpha: float
    beta: float


def _ensemble(y: Sequence[float], horizon: int, alpha: float | None, beta: float | None,
              phi: float) -> _Ensemble:
    """Fit both models on log prices ``y`` and blend them by inverse MSE."""
    h_fit = fit_holt(y, alpha, beta, phi)
    l_fit = linear_fit(y)
    mse_holt = _rms(h_fit.errors) ** 2
    mse_ols = _rms(l_fit.residuals) ** 2
    total = mse_holt + mse_ols
    w = 0.5 if total <= _EPS else mse_ols / total
    mids = [w * h_fit.forecast(h) + (1.0 - w) * l_fit.forecast(h) for h in range(1, horizon + 1)]
    return _Ensemble(log_mids=mids, sigma=_rms(h_fit.errors), holt_weight=w,
                     alpha=h_fit.alpha, beta=h_fit.beta)


class Forecaster:
    """Builds a :class:`Forecast` from a symbol's bars using :class:`ForecastConfig`."""

    _MEMO_LIMIT = 50_000

    def __init__(self, cfg: ForecastConfig) -> None:
        self.cfg = cfg
        # Walk-forward origins repeat across ticks; memoize their predicted move by history
        # window so each origin is fitted only once.
        self._memo: dict[int, float] = {}

    @property
    def min_bars(self) -> int:
        """Bars required before ``predict`` returns a forecast."""
        return self.cfg.min_bars

    def predict(self, symbol: str, bars: Sequence[Bar], now: float | None = None) -> Forecast | None:
        """Project the next ``horizon_bars``; ``None`` for too few bars, a constant or invalid series."""
        cfg = self.cfg
        if len(bars) < max(cfg.min_bars, 3):
            return None
        closes = [b.close for b in bars]
        if any(not math.isfinite(c) or c <= 0.0 for c in closes):
            return None
        logs = [math.log(c) for c in closes]
        y = logs[-cfg.window:]
        if max(y) - min(y) <= _EPS:
            return None

        fit = _ensemble(y, cfg.horizon_bars, cfg.alpha, cfg.beta, cfg.phi)
        last_close = closes[-1]
        spacing = self._spacing(bars[-cfg.window:])
        last_ts = bars[-1].ts
        points: list[ForecastPoint] = []
        for h, log_mid in enumerate(fit.log_mids, start=1):
            mid = math.exp(log_mid)
            spread = cfg.band_z * fit.sigma * math.sqrt(h)
            points.append(ForecastPoint(ts=last_ts + spacing * h, mid=mid,
                                        lo=mid * math.exp(-spread), hi=mid * math.exp(spread)))

        expected = points[-1].mid / last_close - 1.0
        if abs(expected) < cfg.flat_threshold:
            direction = "flat"
        else:
            direction = "up" if expected > 0.0 else "down"
        hit_rate = self._hit_rate(logs)
        band_rel_width = (points[-1].hi - points[-1].lo) / points[-1].mid
        confidence = _clip((hit_rate - 0.5) * 2.0, 0.0, 1.0) * _clip(1.0 - band_rel_width, 0.0, 1.0)
        method = (f"holt-damped(a={fit.alpha:g},b={fit.beta:g},phi={cfg.phi:g})+ols-loglinear"
                  f" w={fit.holt_weight:.2f}/{1.0 - fit.holt_weight:.2f}")
        return Forecast(
            symbol=symbol,
            horizon=cfg.horizon_bars,
            points=points,
            expected_return=expected,
            direction=direction,
            confidence=confidence,
            hit_rate=hit_rate,
            method=method,
            generated_ts=time.time() if now is None else now,
        )

    @staticmethod
    def _spacing(bars: Sequence[Bar]) -> float:
        """Median positive gap between bar timestamps (60 s if there is none)."""
        gaps = [b.ts - a.ts for a, b in zip(bars, bars[1:]) if b.ts > a.ts]
        spacing = _median(gaps)
        return spacing if spacing > 0.0 else DEFAULT_SPACING_SECONDS

    def _hit_rate(self, logs: Sequence[float]) -> float:
        """Shrunk walk-forward directional accuracy of the ``horizon``-step forecast (0.5 if unscored)."""
        cfg = self.cfg
        h = cfg.horizon_bars
        # Only origins with a full ``window`` of history: the same fit as a live forecast, and a
        # history that does not shift as the bar window slides, so the memo hits every tick.
        last_origin = len(logs) - 1 - h
        first_origin = max(max(3, cfg.window) - 1, last_origin - cfg.backtest_steps + 1)
        hits = scored = 0
        for origin in range(first_origin, last_origin + 1):
            history = logs[max(0, origin + 1 - cfg.window):origin + 1]
            if max(history) - min(history) <= _EPS:
                continue
            predicted = self._predicted_move(history, h)
            actual = logs[origin + h] - logs[origin]
            if abs(predicted) <= _EPS or abs(actual) <= _EPS:
                continue
            scored += 1
            hits += (predicted > 0.0) == (actual > 0.0)
        # overlapping h-bar windows: about scored / h independent trials
        return (hits / h + HIT_RATE_PRIOR / 2.0) / (scored / h + HIT_RATE_PRIOR)

    def _predicted_move(self, history: Sequence[float], h: int) -> float:
        """Log move the ensemble, fitted on ``history`` alone, predicts ``h`` bars ahead (memoized)."""
        key = hash(tuple(history))
        move = self._memo.get(key)
        if move is None:
            cfg = self.cfg
            move = _ensemble(history, h, cfg.alpha, cfg.beta, cfg.phi).log_mids[-1] - history[-1]
            if len(self._memo) >= self._MEMO_LIMIT:
                self._memo.clear()
            self._memo[key] = move
        return move
