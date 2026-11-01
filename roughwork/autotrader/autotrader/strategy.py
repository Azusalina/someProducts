"""Technical indicators and the weighted ensemble strategy.

Every indicator returns the value at the *last* element of its input, or ``None`` when
there is not enough data. Inputs are ordered oldest first. ``AssetStrategies`` pairs the
stock strategy with a crypto one built from ``strategy`` merged with ``crypto_strategy``.

The score is the weighted mean of the components present: ``sum(w_k * c_k) / sum(w_k)`` over
the components computed for this call (``forecast`` only exists when a Forecast is passed),
so omitting a component re-spreads its weight instead of shrinking the score.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from .config import Config, StrategyConfig
from .forecast import Forecast
from .models import Bar, Signal, asset_class

COMPONENTS: tuple[str, ...] = ("trend", "momentum", "mean_reversion", "volume", "forecast")
_BAND_EPS: float = 1e-6


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _pstdev(values: Sequence[float]) -> float:
    """Population standard deviation (0.0 for fewer than two values)."""
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    return math.sqrt(sum((v - mean) ** 2 for v in values) / n)


def sma(values: Sequence[float], n: int) -> float | None:
    """Simple moving average of the last ``n`` values."""
    if n <= 0 or len(values) < n:
        return None
    return sum(values[-n:]) / n


def ema(values: Sequence[float], n: int) -> float | None:
    """Exponential moving average (alpha = 2/(n+1)) seeded with the SMA of the first ``n`` values."""
    if n <= 0 or len(values) < n:
        return None
    alpha = 2.0 / (n + 1)
    current = sum(values[:n]) / n
    for v in values[n:]:
        current = alpha * v + (1.0 - alpha) * current
    return current


def rsi(values: Sequence[float], n: int) -> float | None:
    """Wilder's RSI in [0, 100]; needs ``n + 1`` values. Flat input yields 50."""
    if n <= 0 or len(values) < n + 1:
        return None
    changes = [values[i] - values[i - 1] for i in range(1, len(values))]
    avg_gain = sum(max(c, 0.0) for c in changes[:n]) / n
    avg_loss = sum(max(-c, 0.0) for c in changes[:n]) / n
    for c in changes[n:]:
        avg_gain = (avg_gain * (n - 1) + max(c, 0.0)) / n
        avg_loss = (avg_loss * (n - 1) + max(-c, 0.0)) / n
    if avg_loss == 0.0:
        return 50.0 if avg_gain == 0.0 else 100.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def rate_of_change(values: Sequence[float], n: int) -> float | None:
    """Fractional change over ``n`` periods: ``v[-1] / v[-1-n] - 1``."""
    if n <= 0 or len(values) < n + 1:
        return None
    base = values[-1 - n]
    if base == 0.0:
        return None
    return values[-1] / base - 1.0


def atr(bars: Sequence[Bar], n: int) -> float | None:
    """Wilder's Average True Range over ``n`` periods; needs ``n + 1`` bars."""
    if n <= 0 or len(bars) < n + 1:
        return None
    trs = [
        max(b.high - b.low, abs(b.high - prev.close), abs(b.low - prev.close))
        for prev, b in zip(bars, bars[1:])
    ]
    current = sum(trs[:n]) / n
    for tr in trs[n:]:
        current = (current * (n - 1) + tr) / n
    return current


def zscore(values: Sequence[float], n: int) -> float | None:
    """Z-score of the last value within the last ``n`` values (population stdev; 0 when flat)."""
    if n < 2 or len(values) < n:
        return None
    window = values[-n:]
    sd = _pstdev(window)
    if sd == 0.0:
        return 0.0
    return (window[-1] - sum(window) / n) / sd


def forecast_component(forecast: Forecast) -> float:
    """``clip(expected_return / max(band half-width, eps), -1, 1) * confidence``."""
    ratio = forecast.expected_return / max(forecast.band_half_width, _BAND_EPS)
    return _clip(ratio) * _clip(forecast.confidence, 0.0, 1.0)


def weighted_score(components: dict[str, float], weights: dict[str, float]) -> float:
    """Weighted mean of ``components`` (weights normalized over the keys present), clipped."""
    total = sum(max(weights.get(k, 0.0), 0.0) for k in components)
    if total <= 0.0:
        return 0.0
    return _clip(sum(max(weights.get(k, 0.0), 0.0) * v for k, v in components.items()) / total)


class Strategy:
    """Ensemble of trend, momentum, mean-reversion, volume and (optional) forecast components."""

    def __init__(self, cfg: StrategyConfig) -> None:
        self.cfg = cfg

    @property
    def min_bars(self) -> int:
        """Bars required before ``evaluate`` returns a signal."""
        c = self.cfg
        return max(c.slow_sma, c.momentum_lookback, c.rsi_period) + 1

    def evaluate(self, symbol: str, bars: Sequence[Bar], forecast: Forecast | None = None,
                 now: float | None = None) -> Signal | None:
        """Score ``symbol`` from its bars; ``None`` if there are too few bars or the price is invalid.

        ``now`` lets the volume component pro-rate a bar that is still forming (live feeds return
        the current bucket with only part of its volume).

        ``forecast`` adds the ``forecast`` component; callers pass it only when
        ``ForecastConfig.use_in_strategy`` is set.
        """
        if len(bars) < self.min_bars:
            return None
        closes = [b.close for b in bars]
        price = closes[-1]
        if not math.isfinite(price) or price <= 0.0:
            return None

        rsi_value = rsi(closes, self.cfg.rsi_period)
        rel_volume = self._relative_volume(bars, now)
        components = {
            "trend": self._trend(bars, closes),
            "momentum": self._momentum(closes),
            "mean_reversion": self._mean_reversion(rsi_value),
            "volume": self._volume(closes, rel_volume),
        }
        if forecast is not None:
            components["forecast"] = forecast_component(forecast)
        score = weighted_score(components, self.cfg.weights)
        rounded = {k: round(v, 4) for k, v in components.items()}
        return Signal(
            symbol=symbol,
            score=score,
            price=price,
            reason=self._reason(components, rsi_value, rel_volume, forecast),
            components=rounded,
        )

    def _trend(self, bars: Sequence[Bar], closes: list[float]) -> float:
        """Fast-minus-slow SMA spread measured in ATRs, squashed with tanh."""
        fast = sma(closes, self.cfg.fast_sma)
        slow = sma(closes, self.cfg.slow_sma)
        if fast is None or slow is None or slow <= 0.0:
            return 0.0
        spread = fast - slow
        range_ = atr(bars, self.cfg.rsi_period)
        if range_ and range_ > 0.0:
            return math.tanh(spread / range_)
        return _clip(math.copysign(1.0, spread)) if spread else 0.0

    def _momentum(self, closes: list[float]) -> float:
        """Rate of change scaled by the volatility expected over the lookback, squashed with tanh."""
        n = self.cfg.momentum_lookback
        roc = rate_of_change(closes, n)
        if roc is None:
            return 0.0
        window = closes[-n - 1:]
        returns = [b / a - 1.0 for a, b in zip(window, window[1:]) if a > 0.0]
        vol = _pstdev(returns) * math.sqrt(n)
        if vol > 0.0:
            return math.tanh(roc / vol)
        return _clip(math.copysign(1.0, roc)) if roc else 0.0

    def _mean_reversion(self, rsi_value: float | None) -> float:
        """+1 at the oversold level, 0 midway, -1 at the overbought level (linear, clipped)."""
        if rsi_value is None:
            return 0.0
        lo, hi = self.cfg.rsi_oversold, self.cfg.rsi_overbought
        mid = (lo + hi) / 2.0
        half = (hi - lo) / 2.0
        return _clip((mid - rsi_value) / half) if half > 0.0 else 0.0

    def _relative_volume(self, bars: Sequence[Bar], now: float | None = None) -> float | None:
        """Last bar's volume over the average of the preceding ``slow_sma`` bars.

        A last bar still forming at ``now`` has only part of its volume, so it is scaled up by
        the elapsed share of its interval (at least 10%, so a just-opened bar cannot explode).
        """
        n = self.cfg.slow_sma
        if len(bars) < n + 1:
            return None
        avg = sum(b.volume for b in bars[-n - 1:-1]) / n
        if avg <= 0.0:
            return None
        volume = bars[-1].volume
        spacing = bars[-1].ts - bars[-2].ts
        if now is not None and spacing > 0.0:
            elapsed = (now - bars[-1].ts) / spacing
            if 0.0 <= elapsed < 1.0:
                volume /= max(elapsed, 0.1)
        return volume / avg

    @staticmethod
    def _volume(closes: list[float], rel_volume: float | None) -> float:
        """Above-average volume in the direction of the last close-to-close move."""
        if rel_volume is None or len(closes) < 2:
            return 0.0
        move = closes[-1] - closes[-2]
        if move == 0.0:
            return 0.0
        return math.copysign(_clip(rel_volume - 1.0, 0.0, 1.0), move)

    @staticmethod
    def _reason(components: dict[str, float], rsi_value: float | None, rel_volume: float | None,
                forecast: Forecast | None = None) -> str:
        """Short human summary, e.g. ``trend +0.62, momentum +0.41 | RSI 58, vol 1.3x, fc +1.8%``."""
        ordered = sorted(components.items(), key=lambda kv: abs(kv[1]), reverse=True)
        parts = [f"{name.replace('_', ' ')} {value:+.2f}" for name, value in ordered[:2] if abs(value) >= 0.05]
        stats = []
        if rsi_value is not None:
            stats.append(f"RSI {rsi_value:.0f}")
        if rel_volume is not None:
            stats.append(f"vol {rel_volume:.1f}x")
        if forecast is not None:
            stats.append(f"fc {forecast.expected_return:+.1%}")
        head = ", ".join(parts) if parts else "neutral"
        return f"{head} | {', '.join(stats)}" if stats else head


class AssetStrategies:
    """Routes each symbol to the stock or crypto Strategy by its asset class."""

    def __init__(self, stock: Strategy, crypto: Strategy | None = None) -> None:
        self.stock = stock
        self.crypto = crypto if crypto is not None else stock

    @classmethod
    def from_config(cls, config: Config, stock: Strategy | None = None) -> AssetStrategies:
        """Stock strategy from ``config.strategy`` (or ``stock``); crypto from it merged with ``crypto_strategy``."""
        return cls(stock or Strategy(config.strategy), Strategy(config.crypto_strategy_config()))

    def for_symbol(self, symbol: str) -> Strategy:
        """The Strategy that scores ``symbol``."""
        return self.crypto if asset_class(symbol) == "crypto" else self.stock

    def evaluate(self, symbol: str, bars: Sequence[Bar], forecast: Forecast | None = None,
                 now: float | None = None) -> Signal | None:
        """``for_symbol(symbol).evaluate(symbol, bars, forecast, now)``."""
        return self.for_symbol(symbol).evaluate(symbol, bars, forecast, now)

    def entry_threshold(self, symbol: str) -> float:
        """Minimum score to open ``symbol``."""
        return self.for_symbol(symbol).cfg.entry_threshold

    def exit_threshold(self, symbol: str) -> float:
        """Score at or below which a held ``symbol`` is sold."""
        return self.for_symbol(symbol).cfg.exit_threshold

    @property
    def min_bars(self) -> int:
        """Bars needed for both strategies to produce signals."""
        return max(self.stock.min_bars, self.crypto.min_bars)


def rank(signals: Sequence[Signal]) -> list[Signal]:
    """Signals sorted by score, strongest bullish first."""
    return sorted(signals, key=lambda s: s.score, reverse=True)
