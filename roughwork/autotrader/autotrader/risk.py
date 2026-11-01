"""Risk management: position sizing, protective exits, cooldowns and trading halts.

State (day baseline, peak equity, halts, trade counts, cooldowns, trailing high-water marks)
is persisted in the store under the kv key ``risk_state`` so it survives restarts. Trading
days roll at the US/Eastern calendar date change.

Per-position limits (stops, targets, trailing stops, position caps, cooldowns, minimum order
value) come from ``RiskConfig`` for stocks and ``CryptoRiskConfig`` for crypto pairs; the
account-level limits (daily-loss halt, drawdown kill switch, trade count, cash reserve) are
shared. Crypto positions together may not exceed ``max_crypto_exposure_pct`` of equity.

Volatility-aware sizing: an entry's target value is multiplied by
``min(1, TARGET_DAILY_VOL / daily_vol)``, where ``daily_vol`` is ATR as a fraction of price
scaled from one bar to one trading day by ``sqrt(bars per day)`` (a 6.5 h session for stocks,
24 h for crypto). Calm assets keep their full size; volatile ones are cut proportionally, and
no cap is ever exceeded.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Any

from .config import Config, CryptoRiskConfig, RiskConfig
from .models import Bar, Position, Signal, asset_class
from .store import Store
from .strategy import atr

log = logging.getLogger(__name__)

STATE_KEY = "risk_state"
HALT_DAILY = "daily"
HALT_DRAWDOWN = "drawdown"
HALT_MANUAL = "manual"
HALT_KILL = "kill"  # operator kill switch: halted and liquidating until resume
LIQUIDATING_HALTS: frozenset[str] = frozenset({HALT_DRAWDOWN, HALT_KILL})
CASH_BUFFER = 0.995  # leave room for slippage and rounding when cash is the binding limit

TARGET_DAILY_VOL = 0.02  # daily-equivalent ATR% at which an entry keeps its full size
VOL_ATR_PERIOD = 14
STOCK_SESSION_SECONDS = 6.5 * 3600
CRYPTO_SESSION_SECONDS = 24 * 3600
STOCK_QTY_DECIMALS = 6
CRYPTO_QTY_DECIMALS = 8


def _eastern() -> tzinfo:
    """America/New_York, or a fixed UTC-5 offset if the tz database is unavailable."""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("America/New_York")
    except Exception:  # noqa: BLE001 - missing tzdata must not stop trading
        log.warning("tz database unavailable; using fixed UTC-5 for the trading day")
        return timezone(timedelta(hours=-5))


EASTERN: tzinfo = _eastern()


def trading_day(ts: float) -> str:
    """US/Eastern calendar date (YYYY-MM-DD) for an epoch timestamp."""
    return datetime.fromtimestamp(ts, tz=EASTERN).date().isoformat()


def _finite_positive(x: float | None) -> bool:
    return x is not None and math.isfinite(x) and x > 0.0


def fmt_price(price: float) -> str:
    """Price with precision adapted to its magnitude (``187.42``, ``0.1234``, ``0.00001234``)."""
    if not math.isfinite(price):
        return str(price)
    mag = abs(price)
    if mag >= 1.0 or mag == 0.0:
        return f"{price:.2f}"
    decimals = min(10, 3 - math.floor(math.log10(mag)))  # four significant digits
    return f"{price:.{decimals}f}"


def round_qty(qty: float, decimals: int | None) -> float:
    """Round ``qty`` down to ``decimals`` places (``None`` = whole units); 0.0 for invalid input."""
    if not math.isfinite(qty) or qty <= 0.0:
        return 0.0
    if decimals is None:
        return float(math.floor(qty + 1e-9))
    scale = 10 ** decimals
    return math.floor(qty * scale + 1e-9) / scale


# ----- volatility-aware sizing (pure) ------------------------------------------


def bar_seconds(bars: Sequence[Bar], sample: int = 50) -> float | None:
    """Typical bar spacing: the median positive timestamp gap over the last ``sample`` bars."""
    recent = bars[-sample:]
    gaps = sorted(b.ts - a.ts for a, b in zip(recent, recent[1:]) if b.ts > a.ts)
    if not gaps:
        return None
    mid = len(gaps) // 2
    return gaps[mid] if len(gaps) % 2 else (gaps[mid - 1] + gaps[mid]) / 2.0


def bars_per_day(seconds: float | None, asset: str = "stock") -> float:
    """Bars in one trading day (stocks: 6.5 h session, crypto: 24 h); at least 1."""
    if seconds is None or not math.isfinite(seconds) or seconds <= 0.0:
        return 1.0
    session = CRYPTO_SESSION_SECONDS if asset == "crypto" else STOCK_SESSION_SECONDS
    return max(1.0, session / seconds)


def daily_vol(bars: Sequence[Bar], asset: str = "stock", n: int = VOL_ATR_PERIOD) -> float | None:
    """Daily-equivalent realized volatility: ``ATR(n) / close * sqrt(bars_per_day)``.

    ``None`` when there are fewer than ``n + 1`` bars or the last close is not positive.
    """
    if len(bars) < n + 1:
        return None
    price = bars[-1].close
    range_ = atr(bars, n)
    if range_ is None or not math.isfinite(range_) or not _finite_positive(price):
        return None
    return (range_ / price) * math.sqrt(bars_per_day(bar_seconds(bars), asset))


def vol_scale(bars: Sequence[Bar] | None, asset: str = "stock", target: float = TARGET_DAILY_VOL,
              n: int = VOL_ATR_PERIOD) -> float:
    """Size multiplier ``min(1, target / daily_vol)`` in (0, 1]; 1.0 when volatility is unknown or zero."""
    if not bars or target <= 0.0:
        return 1.0
    vol = daily_vol(bars, asset, n)
    if vol is None or vol <= 0.0:
        return 1.0
    return min(1.0, target / vol)


def exposure_by_class(positions: Mapping[str, Position], prices: Mapping[str, float],
                      equity: float | None = None) -> dict[str, float]:
    """Market value held in stocks and crypto (unpriced positions at cost) and crypto share of equity."""
    totals = {"stock": 0.0, "crypto": 0.0}
    for sym, pos in positions.items():
        price = prices.get(sym)
        mark = price if _finite_positive(price) else pos.avg_price
        if pos.qty > 0 and _finite_positive(mark):
            totals[asset_class(sym)] += pos.qty * mark
    pct = totals["crypto"] / equity if equity and equity > 0.0 else 0.0
    return {"stocks": totals["stock"], "crypto": totals["crypto"], "crypto_pct": pct}


@dataclass(frozen=True)
class AssetLimits:
    """Per-position limits for one asset class; ``qty_decimals`` None follows the fractional flag."""

    asset_class: str
    stop_loss_pct: float
    take_profit_pct: float
    trailing_stop_pct: float
    max_position_pct: float
    max_positions: int
    min_order_value: float
    cooldown_minutes: int
    qty_decimals: int | None = None

    @classmethod
    def for_stocks(cls, cfg: RiskConfig) -> AssetLimits:
        """Stock limits from the shared RiskConfig."""
        return cls("stock", cfg.stop_loss_pct, cfg.take_profit_pct, cfg.trailing_stop_pct,
                   cfg.max_position_pct, cfg.max_positions, cfg.min_order_value, cfg.cooldown_minutes)

    @classmethod
    def for_crypto(cls, cfg: CryptoRiskConfig) -> AssetLimits:
        """Crypto limits; quantities are always fractional to 8 decimals."""
        return cls("crypto", cfg.stop_loss_pct, cfg.take_profit_pct, cfg.trailing_stop_pct,
                   cfg.max_position_pct, cfg.max_positions, cfg.min_order_value, cfg.cooldown_minutes,
                   CRYPTO_QTY_DECIMALS)


@dataclass
class RiskState:
    """Persistent risk bookkeeping."""

    day: str = ""
    day_start_equity: float | None = None
    peak_equity: float | None = None
    last_equity: float | None = None
    halted: bool = False
    halt_kind: str = ""
    halt_reason: str = ""
    rebase: bool = False
    trades_today: int = 0
    last_trade: dict[str, float] = field(default_factory=dict)
    high_water: dict[str, float] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Any) -> RiskState:
        """Rebuild from persisted JSON, ignoring unknown or malformed fields."""
        if not isinstance(data, dict):
            return cls()
        known = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        try:
            return cls(**known)
        except TypeError:
            return cls()


class RiskManager:
    """Applies RiskConfig (stocks, account) and CryptoRiskConfig (crypto) to entries, exits and halts.

    All public methods are thread-safe.
    """

    def __init__(self, cfg: RiskConfig, store: Store, crypto_cfg: CryptoRiskConfig | None = None,
                 *, target_vol: float = TARGET_DAILY_VOL) -> None:
        self.cfg = cfg
        self.crypto_cfg = crypto_cfg if crypto_cfg is not None else CryptoRiskConfig()
        self.store = store
        self.target_vol = target_vol
        # Share the store's lock: risk state is saved and logged to the store under this lock,
        # while the engine calls note_trade inside store transactions. Two separate locks would
        # be taken in opposite orders by the engine and the HTTP thread (kill) and deadlock.
        self._lock = getattr(store, "lock", None) or threading.RLock()
        self._state = RiskState.from_dict(store.get_kv(STATE_KEY))
        self._crypto_exposure = 0.0  # crypto market value at the last update_marks
        self._crypto_reserved = 0.0  # crypto entries sized since then (cleared by update_marks)

    @classmethod
    def from_config(cls, config: Config, store: Store) -> RiskManager:
        """RiskManager for a full Config (stock, account and crypto limits)."""
        return cls(config.risk, store, config.crypto_risk)

    def limits_for(self, symbol: str) -> AssetLimits:
        """Per-position limits that apply to ``symbol``'s asset class."""
        if asset_class(symbol) == "crypto":
            return AssetLimits.for_crypto(self.crypto_cfg)
        return AssetLimits.for_stocks(self.cfg)

    def max_positions_for(self, symbol: str) -> int:
        """Position cap for ``symbol``'s asset class."""
        return self.limits_for(symbol).max_positions

    def _save(self) -> None:
        self.store.set_kv(STATE_KEY, asdict(self._state))

    def _roll_day(self, now: float, equity: float | None) -> None:
        """Start a new trading day if the US/Eastern date changed; clears daily halts.

        Without a current ``equity`` (a trade noted before the day's first ``can_open``) the
        day baseline is left unset, so the next ``can_open`` takes it from live equity instead
        of a stale pre-gap value.
        """
        s = self._state
        today = trading_day(now)
        if s.day == today:
            return
        s.day = today
        s.trades_today = 0
        s.day_start_equity = equity
        if s.halted and s.halt_kind == HALT_DAILY:
            s.halted, s.halt_kind, s.halt_reason = False, "", ""
            self.store.log_event("info", f"new trading day {today}: daily-loss halt cleared", now)

    def _halt(self, kind: str, reason: str, now: float | None = None) -> None:
        s = self._state
        if s.halted and s.halt_kind == kind and s.halt_reason == reason:
            return
        s.halted, s.halt_kind, s.halt_reason = True, kind, reason
        self.store.log_event("warn", f"trading halted: {reason}", now)

    # ----- marks and exits -------------------------------------------------

    def update_marks(self, positions: dict[str, Position], prices: dict[str, float]) -> None:
        """Raise trailing high-water marks to the latest prices and mirror them onto positions.

        Also refreshes the tracked crypto exposure and clears the previous tick's entry reservations.
        """
        with self._lock:
            marks = self._state.high_water
            for sym in [s for s in marks if s not in positions]:
                del marks[sym]
            for sym, pos in positions.items():
                hw = max(marks.get(sym, 0.0), pos.high_water, pos.avg_price)
                price = prices.get(sym)
                if price is not None and _finite_positive(price):
                    hw = max(hw, price)
                marks[sym] = hw
                pos.high_water = hw
            self._crypto_exposure = exposure_by_class(positions, prices)["crypto"]
            self._crypto_reserved = 0.0
            self._save()

    def levels(self, position: Position) -> dict[str, float]:
        """Stop-loss, take-profit and trailing-stop prices for a position (per its asset class)."""
        with self._lock:
            hw = max(self._state.high_water.get(position.symbol, 0.0), position.high_water, position.avg_price)
        lim = self.limits_for(position.symbol)
        avg = position.avg_price
        return {
            "stop": avg * (1.0 - lim.stop_loss_pct),
            "target": avg * (1.0 + lim.take_profit_pct),
            "trail": hw * (1.0 - lim.trailing_stop_pct),
            "high_water": hw,
        }

    def check_exits(self, positions: dict[str, Position], prices: dict[str, float]) -> list[tuple[str, str]]:
        """(symbol, reason) for each position whose price breaches stop-loss, take-profit or trailing stop."""
        exits: list[tuple[str, str]] = []
        for sym, pos in positions.items():
            price = prices.get(sym)
            if pos.qty <= 0 or price is None or not _finite_positive(price):
                continue
            lv = self.levels(pos)
            p, f = fmt_price(price), fmt_price
            if price <= lv["stop"]:
                exits.append((sym, f"stop-loss: {p} <= {f(lv['stop'])}"))
            elif price >= lv["target"]:
                exits.append((sym, f"take-profit: {p} >= {f(lv['target'])}"))
            elif price <= lv["trail"]:
                exits.append((sym, f"trailing-stop: {p} <= {f(lv['trail'])} (high {f(lv['high_water'])})"))
        return exits

    # ----- entry gating ----------------------------------------------------

    def can_open(self, account_equity: float, now: float) -> tuple[bool, str]:
        """Whether new positions may be opened; trips the daily-loss halt or drawdown kill switch."""
        with self._lock:
            s = self._state
            self._roll_day(now, account_equity)
            if s.rebase:
                s.day_start_equity = account_equity
                s.peak_equity = account_equity
                s.rebase = False
            if s.day_start_equity is None:
                s.day_start_equity = account_equity
            s.peak_equity = max(s.peak_equity or account_equity, account_equity)
            s.last_equity = account_equity

            drawdown = _loss_fraction(s.peak_equity, account_equity)
            if drawdown >= self.cfg.max_drawdown_pct and s.halt_kind != HALT_DRAWDOWN:
                # The kill switch is checked under every halt and overrides daily or manual ones.
                self._halt(HALT_DRAWDOWN, f"max drawdown {drawdown:.1%} >= {self.cfg.max_drawdown_pct:.1%} "
                                          "(kill switch; resume to clear)", now)
            elif not s.halted:
                day_loss = _loss_fraction(s.day_start_equity, account_equity)
                if day_loss >= self.cfg.daily_loss_limit_pct:
                    self._halt(HALT_DAILY, f"daily loss {day_loss:.1%} >= {self.cfg.daily_loss_limit_pct:.1%} "
                                           "(clears next trading day)", now)
            self._save()
            if s.halted:
                return False, s.halt_reason
            if s.trades_today >= self.cfg.max_trades_per_day:
                return False, f"trade limit reached ({s.trades_today}/{self.cfg.max_trades_per_day} today)"
            return True, "ok"

    def crypto_headroom(self, equity: float, crypto_exposure: float | None = None) -> float:
        """Value of crypto that may still be bought under ``max_crypto_exposure_pct`` of equity.

        ``crypto_exposure`` defaults to the exposure tracked since the last ``update_marks``
        (marked crypto positions plus entries sized since then).
        """
        with self._lock:
            held = (self._crypto_exposure + self._crypto_reserved
                    if crypto_exposure is None else crypto_exposure)
        return max(0.0, equity * self.crypto_cfg.max_crypto_exposure_pct - held)

    def size_entry(self, signal: Signal, cash_available: float, deployable: float, equity: float,
                   n_positions: int, fractional: bool, *, bars: Sequence[Bar] | None = None,
                   crypto_exposure: float | None = None) -> float:
        """Quantity to buy for ``signal`` (0.0 when no trade is allowed).

        Target value is the asset class's ``max_position_pct`` of equity scaled from 50% (score
        near 0) to 100% (score 1), then by ``vol_scale(bars)`` when bars are given, capped by
        spendable cash after the ``min_cash_reserve_pct`` reserve and, for crypto, by the
        remaining ``max_crypto_exposure_pct`` headroom.

        ``n_positions`` is compared with the signal's asset-class cap, so pass the number of
        open positions in that class. When ``crypto_exposure`` is omitted the tracked exposure
        is used and each sized crypto entry is reserved against the cap until the next
        ``update_marks``. Crypto quantities are always fractional (8 dp); stocks use 6 dp or
        whole shares per ``fractional``.
        """
        lim = self.limits_for(signal.symbol)
        crypto = lim.asset_class == "crypto"
        price = signal.price
        if (n_positions >= lim.max_positions or signal.score <= 0.0
                or not _finite_positive(price) or equity <= 0.0):
            return 0.0
        reserve = equity * self.cfg.min_cash_reserve_pct
        spendable = (min(cash_available, deployable) - reserve) * CASH_BUFFER
        target = equity * lim.max_position_pct * (0.5 + 0.5 * min(signal.score, 1.0))
        target *= vol_scale(bars, lim.asset_class, self.target_vol)
        with self._lock:
            value = min(target, spendable)
            if crypto:
                value = min(value, self.crypto_headroom(equity, crypto_exposure))
            if value <= 0.0:
                return 0.0
            decimals = lim.qty_decimals if lim.qty_decimals is not None else (
                STOCK_QTY_DECIMALS if fractional else None)
            qty = round_qty(value / price, decimals)
            if qty <= 0.0 or qty * price < lim.min_order_value:
                return 0.0
            if crypto and crypto_exposure is None:
                self._crypto_reserved += qty * price
            return qty

    # ----- cooldowns and trade counting -------------------------------------

    def _cooldown_seconds(self, symbol: str) -> float:
        return self.limits_for(symbol).cooldown_minutes * 60.0

    def in_cooldown(self, symbol: str, now: float) -> bool:
        """True if ``symbol`` traded within its asset class's ``cooldown_minutes``."""
        with self._lock:
            last = self._state.last_trade.get(symbol)
        return last is not None and now - last < self._cooldown_seconds(symbol)

    def start_cooldown(self, symbol: str, now: float) -> None:
        """Start ``symbol``'s cooldown without counting a trade (e.g. after a failed submission)."""
        with self._lock:
            self._state.last_trade[symbol] = now
            self._save()

    def note_trade(self, symbol: str, side: str, now: float) -> None:
        """Record a filled trade: counts toward the daily cap and starts the symbol's cooldown."""
        with self._lock:
            s = self._state
            self._roll_day(now, None)
            s.trades_today += 1
            s.last_trade[symbol] = now
            s.last_trade = {k: v for k, v in s.last_trade.items()
                            if k == symbol or now - v < self._cooldown_seconds(k)}
            self._save()
        log.debug("trade noted: %s %s (%d today)", side, symbol, s.trades_today)

    # ----- halts and fund changes -------------------------------------------

    @property
    def halted(self) -> bool:
        """Whether a risk halt is active."""
        with self._lock:
            return self._state.halted

    def halt(self, reason: str, kind: str = HALT_MANUAL) -> None:
        """Manually halt new entries until ``clear_halt``; ``kind`` HALT_KILL also asks for liquidation."""
        with self._lock:
            self._halt(kind, reason)
            self._save()

    @property
    def halt_kind(self) -> str:
        """Kind of the active halt ("" when trading)."""
        with self._lock:
            return self._state.halt_kind if self._state.halted else ""

    @property
    def liquidating(self) -> bool:
        """Whether the active halt requires selling every managed position (drawdown or kill)."""
        return self.halt_kind in LIQUIDATING_HALTS

    def clear_halt(self) -> None:
        """Clear any halt and rebase day-start and peak equity at the next ``can_open``."""
        with self._lock:
            s = self._state
            was = s.halt_reason
            s.halted, s.halt_kind, s.halt_reason = False, "", ""
            s.rebase = True
            self._save()
        if was:
            self.store.log_event("info", f"risk halt cleared (was: {was})")

    def adjust_baselines(self, delta: float) -> None:
        """Shift day-start and peak equity by a deposit (+) or withdrawal (-) so it is not counted as P&L."""
        with self._lock:
            s = self._state
            if s.day_start_equity is not None:
                s.day_start_equity = max(0.0, s.day_start_equity + delta)
            if s.peak_equity is not None:
                s.peak_equity = max(0.0, s.peak_equity + delta)
            if s.last_equity is not None:
                s.last_equity = max(0.0, s.last_equity + delta)
            self._save()

    def status(self) -> dict[str, Any]:
        """JSON-safe summary of limits, baselines, exposure and halt state.

        ``cooldowns`` maps symbol to expiry ts; ``limits`` holds the stock and crypto per-position limits.
        """
        now = time.time()
        c = self.crypto_cfg
        with self._lock:
            s = self._state
            eq = s.last_equity
            crypto_held = self._crypto_exposure + self._crypto_reserved
            cooldowns = {sym: ts + self._cooldown_seconds(sym) for sym, ts in s.last_trade.items()
                         if ts + self._cooldown_seconds(sym) > now}
            return {
                "halted": s.halted,
                "halt_kind": s.halt_kind,
                "halt_reason": s.halt_reason,
                "day": s.day,
                "day_start_equity": s.day_start_equity,
                "peak_equity": s.peak_equity,
                "last_equity": eq,
                "daily_pnl_pct": None if eq is None or not s.day_start_equity
                else eq / s.day_start_equity - 1.0,
                "drawdown_pct": None if eq is None or not s.peak_equity else _loss_fraction(s.peak_equity, eq),
                "trades_today": s.trades_today,
                "max_trades_per_day": self.cfg.max_trades_per_day,
                "daily_loss_limit_pct": self.cfg.daily_loss_limit_pct,
                "max_drawdown_pct": self.cfg.max_drawdown_pct,
                "cooldowns": cooldowns,
                "cooldown_minutes": self.cfg.cooldown_minutes,
                "crypto_cooldown_minutes": c.cooldown_minutes,
                "max_crypto_exposure_pct": c.max_crypto_exposure_pct,
                "crypto_exposure": crypto_held,
                "crypto_exposure_pct": crypto_held / eq if eq else None,
                "target_daily_vol": self.target_vol,
                "limits": {
                    "stock": asdict(AssetLimits.for_stocks(self.cfg)),
                    "crypto": asdict(AssetLimits.for_crypto(c)),
                },
            }


def _loss_fraction(baseline: float | None, equity: float) -> float:
    """Fractional decline from ``baseline`` to ``equity`` (0 when up or baseline unknown)."""
    if not baseline or baseline <= 0.0:
        return 0.0
    return max(0.0, (baseline - equity) / baseline)
