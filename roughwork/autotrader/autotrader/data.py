"""Market data feeds: Yahoo Finance, Coinbase Exchange candles, a synthetic market, and routing."""

from __future__ import annotations

import logging
import math
import random
import threading
import time
import zlib
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import requests

from .config import COINBASE_GRANULARITY, Config
from .models import Bar, asset_class, crypto_pair

if TYPE_CHECKING:
    from .store import Store

log = logging.getLogger(__name__)

INTERVAL_SECONDS: dict[str, int] = {
    "1m": 60, "2m": 120, "5m": 300, "15m": 900, "30m": 1800,
    "60m": 3600, "90m": 5400, "1h": 3600, "6h": 21600, "1d": 86400,
}
SESSION_SECONDS: int = int(6.5 * 3600)
TRADING_DAYS_PER_YEAR: int = 252

# Yahoo range token -> approximate trading days it covers, smallest first.
_YAHOO_RANGES: tuple[tuple[str, int], ...] = (
    ("1d", 1), ("5d", 5), ("1mo", 21), ("3mo", 63), ("6mo", 126),
    ("1y", 252), ("2y", 504), ("5y", 1260), ("10y", 2520), ("max", 10**9),
)
# Yahoo caps how far back each intraday interval may reach (in trading days).
_YAHOO_MAX_DAYS: dict[str, int] = {
    "1m": 5, "2m": 42, "5m": 42, "15m": 42, "30m": 42,
    "60m": 504, "90m": 42, "1h": 504,
}


def interval_seconds(interval: str) -> int:
    """Length of one bar of ``interval`` in seconds (defaults to 5 minutes for unknown tokens)."""
    return INTERVAL_SECONDS.get(interval, 300)


def bars_per_day(interval: str) -> float:
    """Regular-session bars per trading day for ``interval``."""
    if interval == "1d":
        return 1.0
    return SESSION_SECONDS / interval_seconds(interval)


def yahoo_range_for(interval: str, lookback: int) -> str:
    """Smallest Yahoo ``range`` token that covers ``lookback`` bars with headroom for gaps."""
    needed_days = math.ceil(lookback * 1.3 / bars_per_day(interval)) + 1
    cap = _YAHOO_MAX_DAYS.get(interval)
    if cap is not None:
        needed_days = min(needed_days, cap)
    for token, days in _YAHOO_RANGES:
        if days >= needed_days:
            return token
    return "max"


class MarketData(ABC):
    """Source of OHLCV bars and latest prices."""

    @abstractmethod
    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        """Most recent ``lookback`` bars for ``symbol``, oldest first; ``[]`` when unavailable."""

    @abstractmethod
    def get_price(self, symbol: str) -> float | None:
        """Latest trade price for ``symbol`` or ``None`` when unavailable."""

    @abstractmethod
    def refresh(self) -> None:
        """Start a new engine tick: invalidate caches or advance the simulated clock."""

    def last_bar_forming(self, symbol: str) -> bool:
        """Whether this feed's newest bar for ``symbol`` can still be in progress (partial volume)."""
        return False

    def cached_price(self, symbol: str) -> float | None:
        """Latest price already known this tick, without any network request (``None`` if none).

        Order placement runs under locks, so it reads prices here first; the bars every tick
        fetches beforehand include the forming bar, whose close is the latest trade.
        """
        return None


class YahooData(MarketData):
    """Bars from Yahoo Finance's public chart endpoint, cached for the duration of one tick.

    Failed price lookups are cached for the tick too, so an outage costs one request per symbol
    per tick instead of one per caller.
    """

    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    # Yahoo answers 429 to a full browser User-Agent that arrives without browser cookies,
    # but serves the bare "Mozilla/5.0" token (checked 2026-10-28).
    USER_AGENT = "Mozilla/5.0"

    def __init__(self, session: requests.Session | None = None, timeout: float = 10.0) -> None:
        self.session: Any = session if session is not None else requests.Session()
        self.timeout = timeout
        self._lock = threading.Lock()
        self._bars: dict[tuple[str, str, str], list[Bar]] = {}
        self._prices: dict[str, float | None] = {}

    def refresh(self) -> None:
        with self._lock:
            self._bars.clear()
            self._prices.clear()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        if lookback <= 0:
            return []
        key = (symbol.upper(), interval, yahoo_range_for(interval, lookback))
        with self._lock:
            cached = self._bars.get(key)
        if cached is None:
            cached = self._fetch(*key)
            with self._lock:
                self._bars[key] = cached
        return cached[-lookback:]

    def get_price(self, symbol: str) -> float | None:
        sym = symbol.upper()
        with self._lock:
            if sym in self._prices:
                return self._prices[sym]
        bars = self._fetch(sym, "1m", "1d")
        with self._lock:
            price = self._prices.get(sym)
            if price is None and bars:
                price = bars[-1].close
            self._prices[sym] = price  # cache misses too, until the next refresh()
        return price

    def cached_price(self, symbol: str) -> float | None:
        sym = symbol.upper()
        with self._lock:
            price = self._prices.get(sym)
            if price is not None:
                return price
            series = [bars for (s, _, _), bars in self._bars.items() if s == sym and bars]
        return max(series, key=lambda bars: bars[-1].ts)[-1].close if series else None

    def last_bar_forming(self, symbol: str) -> bool:
        return True  # the chart API returns the current bucket

    def _fetch(self, symbol: str, interval: str, range_: str) -> list[Bar]:
        """Download and parse one chart series; logs and returns ``[]`` on any failure."""
        url = self.BASE_URL.format(symbol=symbol.replace(".", "-"))
        params = {"interval": interval, "range": range_, "includePrePost": "false"}
        try:
            resp = self.session.get(
                url, params=params, timeout=self.timeout,
                headers={"User-Agent": self.USER_AGENT, "Accept": "application/json"},
            )
            resp.raise_for_status()
            payload = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("yahoo fetch failed for %s (%s/%s): %s", symbol, interval, range_, exc)
            return []
        bars, price = parse_chart(payload)
        if price is None and bars:
            price = bars[-1].close
        if price is not None:
            with self._lock:
                self._prices[symbol] = price
        if not bars:
            log.info("yahoo returned no bars for %s (%s/%s)", symbol, interval, range_)
        return bars


def _num(value: Any) -> float | None:
    """Coerce a JSON value to a finite float or ``None``."""
    if value is None or isinstance(value, bool):
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def parse_chart(payload: Any) -> tuple[list[Bar], float | None]:
    """Parse a Yahoo chart JSON payload into ascending bars and the meta market price.

    Bars with any missing OHLC value are dropped; a missing volume counts as zero.
    """
    try:
        chart = payload["chart"]
        if chart.get("error"):
            log.warning("yahoo chart error: %s", chart["error"])
            return [], None
        result = chart["result"][0]
    except (KeyError, IndexError, TypeError, AttributeError):
        return [], None
    meta = result.get("meta") or {}
    price = _num(meta.get("regularMarketPrice"))
    stamps = result.get("timestamp") or []
    try:
        quote = result["indicators"]["quote"][0]
    except (KeyError, IndexError, TypeError):
        return [], price
    cols = [quote.get(k) or [] for k in ("open", "high", "low", "close", "volume")]
    by_ts: dict[float, Bar] = {}
    for i, raw_ts in enumerate(stamps):
        ts = _num(raw_ts)
        vals = [_num(col[i]) if i < len(col) else None for col in cols]
        o, h, l, c, v = vals
        if ts is None or o is None or h is None or l is None or c is None:
            continue
        if min(o, h, l, c) <= 0:
            continue
        by_ts[ts] = Bar(ts=ts, open=o, high=max(h, o, c), low=min(l, o, c), close=c,
                        volume=v if v is not None and v >= 0 else 0.0)
    return [by_ts[t] for t in sorted(by_ts)], price


COINBASE_MAX_CANDLES: int = 300   # per request, imposed by the API
COINBASE_MAX_PAGES: int = 10


def _iso(ts: float) -> str:
    """Epoch seconds as an ISO-8601 UTC timestamp accepted by Coinbase."""
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_candles(rows: Any) -> list[Bar]:
    """Coinbase ``[time, low, high, open, close, volume]`` rows (any order) -> ascending bars.

    Rows that are malformed or carry non-positive prices are dropped; duplicates keep the last.
    """
    if not isinstance(rows, list):
        return []
    by_ts: dict[float, Bar] = {}
    for row in rows:
        if not isinstance(row, (list, tuple)) or len(row) < 6:
            continue
        ts, low, high, open_, close, volume = (_num(v) for v in row[:6])
        if ts is None or low is None or high is None or open_ is None or close is None:
            continue
        if min(low, high, open_, close) <= 0:
            continue
        by_ts[ts] = Bar(ts=ts, open=open_, high=max(high, open_, close), low=min(low, open_, close),
                        close=close, volume=volume if volume is not None and volume >= 0 else 0.0)
    return [by_ts[t] for t in sorted(by_ts)]


class CoinbaseData(MarketData):
    """Crypto bars and prices from Coinbase Exchange's public, key-less market-data API.

    Symbols use the canonical ``BASE-QUOTE`` form, which is also Coinbase's product id. A
    USDT/USDC product that does not exist (HTTP 404) falls back to ``BASE-USD`` (logged once).
    Responses are cached for one tick; requests are spaced by ``min_request_interval`` seconds
    to stay under the public rate limit. Every failure is logged and yields ``[]`` / ``None``.
    """

    BASE_URL = "https://api.exchange.coinbase.com"
    USER_AGENT = "autotrader/0.1 (+https://github.com/; market-data client)"

    def __init__(self, session: requests.Session | None = None, timeout: float = 10.0,
                 min_request_interval: float = 0.15, clock: Any = time.time) -> None:
        self.session: Any = session if session is not None else requests.Session()
        self.timeout = timeout
        self.min_request_interval = max(0.0, min_request_interval)
        self.clock = clock
        self._lock = threading.Lock()
        self._throttle_lock = threading.Lock()
        self._last_request = 0.0
        self._bars: dict[tuple[str, int, int], list[Bar]] = {}
        self._prices: dict[str, float | None] = {}
        self._aliases: dict[str, str] = {}

    def refresh(self) -> None:
        with self._lock:
            self._bars.clear()
            self._prices.clear()

    def product_id(self, symbol: str) -> str:
        """Coinbase product id used for ``symbol`` (after any USD fallback)."""
        sym = symbol.upper()
        with self._lock:
            return self._aliases.get(sym, sym)

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        sym = symbol.upper()
        if lookback <= 0 or not self._supported(sym):
            return []
        granularity = COINBASE_GRANULARITY.get(interval)
        if granularity is None:
            log.warning("coinbase: unsupported interval %r for %s (use one of %s)",
                        interval, sym, ", ".join(COINBASE_GRANULARITY))
            return []
        pages = min(COINBASE_MAX_PAGES, math.ceil(lookback / COINBASE_MAX_CANDLES))
        key = (sym, granularity, pages)
        with self._lock:
            cached = self._bars.get(key)
        if cached is None:
            cached = self._fetch_candles(sym, granularity, pages)
            with self._lock:
                self._bars[key] = cached
        return cached[-lookback:]

    def get_price(self, symbol: str) -> float | None:
        sym = symbol.upper()
        if not self._supported(sym):
            return None
        with self._lock:
            if sym in self._prices:
                return self._prices[sym]
        price: float | None = None
        payload = self._get_json(sym, "ticker")
        if isinstance(payload, dict):
            price = _num(payload.get("price"))
            if price is not None and price <= 0:
                price = None
        if price is None:
            price = self._last_cached_close(sym)
        if price is None:
            bars = self.get_bars(sym, "1m", 5)
            price = bars[-1].close if bars else None
        with self._lock:
            self._prices[sym] = price
        return price

    def cached_price(self, symbol: str) -> float | None:
        sym = symbol.upper()
        with self._lock:
            price = self._prices.get(sym)
        return price if price is not None else self._last_cached_close(sym)

    def last_bar_forming(self, symbol: str) -> bool:
        return True  # candles include the in-progress bucket

    @staticmethod
    def _supported(symbol: str) -> bool:
        if asset_class(symbol) == "crypto":
            return True
        log.debug("coinbase: ignoring non-crypto symbol %s", symbol)
        return False

    def _last_cached_close(self, symbol: str) -> float | None:
        """Close of the newest cached bar for ``symbol`` across granularities, if any."""
        with self._lock:
            series = [bars for (sym, _, _), bars in self._bars.items() if sym == symbol and bars]
        if not series:
            return None
        return max(series, key=lambda bars: bars[-1].ts)[-1].close

    def _fetch_candles(self, symbol: str, granularity: int, pages: int) -> list[Bar]:
        """Newest ``pages`` x 300 candles, walking backwards with explicit time windows."""
        if pages <= 1:
            bars = parse_candles(self._get_json(symbol, "candles", {"granularity": str(granularity)}))
        else:
            span = COINBASE_MAX_CANDLES * granularity
            end = float(self.clock())
            end -= end % granularity
            end += granularity              # include the in-progress bucket
            rows: list[Bar] = []
            for _ in range(pages):
                start = end - span
                page = parse_candles(self._get_json(symbol, "candles", {
                    "granularity": str(granularity), "start": _iso(start), "end": _iso(end),
                }))
                if not page:
                    break
                rows = page + rows
                end = start
            bars = parse_candles([[b.ts, b.low, b.high, b.open, b.close, b.volume] for b in rows])
        if not bars:
            log.info("coinbase returned no candles for %s (granularity %ss)", symbol, granularity)
        return bars

    def _throttle(self) -> None:
        if self.min_request_interval <= 0:
            return
        with self._throttle_lock:
            wait = self._last_request + self.min_request_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_request = time.monotonic()

    def _request(self, product: str, endpoint: str, params: dict[str, str] | None) -> tuple[int, Any]:
        """GET ``/products/{product}/{endpoint}``; returns (status, payload) with status 0 on transport errors."""
        self._throttle()
        url = f"{self.BASE_URL}/products/{product}/{endpoint}"
        try:
            resp = self.session.get(url, params=params, timeout=self.timeout,
                                    headers={"User-Agent": self.USER_AGENT, "Accept": "application/json"})
        except requests.RequestException as exc:
            log.warning("coinbase %s request failed for %s: %s", endpoint, product, exc)
            return 0, None
        status = int(getattr(resp, "status_code", 0) or 0)
        if status >= 400:
            return status, None
        try:
            return status, resp.json()
        except ValueError as exc:
            log.warning("coinbase %s returned invalid JSON for %s: %s", endpoint, product, exc)
            return status, None

    def _get_json(self, symbol: str, endpoint: str, params: dict[str, str] | None = None) -> Any:
        """Fetch one endpoint for ``symbol``, applying the USDT/USDC -> USD fallback on 404."""
        product = self.product_id(symbol)
        status, payload = self._request(product, endpoint, params)
        if status == 404 and product == symbol and not symbol.endswith("-USD"):
            base, _quote = crypto_pair(symbol)
            fallback = f"{base}-USD"
            with self._lock:
                self._aliases[symbol] = fallback
            log.warning("coinbase: product %s not found; using %s prices instead", symbol, fallback)
            status, payload = self._request(fallback, endpoint, params)
        if status >= 400:
            log.warning("coinbase %s for %s failed with HTTP %s", endpoint, self.product_id(symbol), status)
            return None
        return payload


def _stable_hash(*parts: object) -> int:
    """Process-independent 32-bit hash (``hash()`` is salted per interpreter run)."""
    return zlib.crc32("|".join(str(p) for p in parts).encode())


@dataclass
class _SymbolSim:
    """Regime-switching price process for one symbol."""

    rng: random.Random
    price: float
    sigma: float                 # baseline per-bar log-return volatility
    base_volume: float
    regime: str = "range"
    regime_left: int = 0
    drift: float = 0.0           # per-bar log drift while trending
    kappa: float = 0.0           # mean-reversion speed while ranging
    anchor: float = 0.0          # mean-reversion target (log price)
    vol_mult: float = 1.0        # volatility clustering state
    crypto: bool = False         # significant-digit price rounding and fractional volume
    bars: deque[Bar] = field(default_factory=deque)

    def _round(self, price: float) -> float:
        """Stocks: 4 dp. Crypto: ~7 significant digits so sub-dollar coins keep their precision."""
        if not self.crypto:
            return round(price, 4)
        return round(price, min(10, max(2, 6 - math.floor(math.log10(price)))))

    def _new_regime(self) -> None:
        r = self.rng.random()
        if r < 0.35:
            self.regime, sign = "uptrend", 1.0
        elif r < 0.65:
            self.regime, sign = "downtrend", -1.0
        else:
            self.regime, sign = "range", 0.0
        self.regime_left = self.rng.randint(40, 140)
        self.drift = sign * self.rng.uniform(0.12, 0.40) * self.sigma
        self.kappa = self.rng.uniform(0.04, 0.15)
        self.anchor = math.log(self.price) + self.rng.gauss(0.0, 2.0 * self.sigma)

    def step(self, ts: float) -> Bar:
        """Advance one bar starting at ``ts`` and return it."""
        if self.regime_left <= 0:
            self._new_regime()
        self.regime_left -= 1
        rng = self.rng
        # GARCH-like clustering: shocks persist, then decay toward 1.
        self.vol_mult = max(0.5, min(3.0, 0.9 * self.vol_mult + 0.125 * abs(rng.gauss(0.0, 1.0))))
        sigma = self.sigma * self.vol_mult
        log_p = math.log(self.price)
        if self.regime == "range":
            mu = self.kappa * (self.anchor - log_p)
        else:
            mu = self.drift
        shock = rng.gauss(0.0, 1.0)
        if rng.random() < 0.01:  # occasional news jump
            shock += rng.choice((-1.0, 1.0)) * rng.uniform(3.0, 6.0)
        ret = mu - 0.5 * sigma * sigma + sigma * shock
        open_ = self.price * math.exp(rng.gauss(0.0, 0.15 * sigma))
        close = open_ * math.exp(ret)
        wick = sigma * 0.6
        high = max(open_, close) * math.exp(abs(rng.gauss(0.0, wick)))
        low = min(open_, close) * math.exp(-abs(rng.gauss(0.0, wick)))
        trend_boost = 1.3 if self.regime != "range" else 1.0
        volume = (self.base_volume * trend_boost * self.vol_mult
                  * (1.0 + abs(ret) / self.sigma)
                  * math.exp(rng.gauss(0.0, 0.35)))
        rnd = self._round
        bar = Bar(ts=ts, open=rnd(open_), high=rnd(high), low=rnd(low), close=rnd(close),
                  volume=round(volume, 4) if self.crypto else float(round(volume)))
        self.price = bar.close
        self.bars.append(bar)
        return bar


# Rough reference prices so synthetic crypto looks familiar; other bases get a hashed price.
_CRYPTO_REF_PRICES: dict[str, float] = {
    "BTC": 95_000.0, "ETH": 3_500.0, "SOL": 180.0, "XRP": 2.4, "DOGE": 0.2, "ADA": 0.7,
    "AVAX": 30.0, "LINK": 18.0, "LTC": 95.0, "BCH": 450.0, "DOT": 6.0, "SHIB": 0.000018,
    "USDT": 1.0, "USDC": 1.0,
}
CRYPTO_VOL_MULT_RANGE: tuple[float, float] = (3.0, 4.0)


class SyntheticData(MarketData):
    """Deterministic offline market: seeded geometric Brownian motion with trend/range regimes.

    Every symbol shares one simulated clock. ``refresh()`` appends exactly one bar to every
    symbol; a symbol first seen later is generated from the start so its path depends only on
    the seed and the symbol, never on when it was first requested. Synthetic time has no
    sessions, so crypto (``BASE-QUOTE``) symbols naturally get bars 24/7; their per-bar
    volatility is 3-4x a typical stock's and prices start near familiar levels.

    With a ``store`` the clock (start time and tick count) is saved on every ``refresh()`` and
    restored on start, so a restarted demo continues its price paths instead of rewinding them
    under a persisted portfolio.
    """

    def __init__(self, seed: int = 42, interval: str = "5m", history: int = 300,
                 start_ts: float | None = None, max_bars: int = 5000, store: Store | None = None) -> None:
        self.seed = seed
        self.interval = interval
        self.bar_seconds = interval_seconds(interval)
        self.history = max(1, history)
        self.max_bars = max(self.history, max_bars)
        if start_ts is None:
            now = time.time()
            start_ts = now - now % self.bar_seconds - self.history * self.bar_seconds
        self.start_ts = float(start_ts)
        self.ticks = 0
        self.store = store
        self._lock = threading.RLock()
        self._sims: dict[str, _SymbolSim] = {}
        self._restore_clock()

    @property
    def clock_key(self) -> str:
        """Store kv key holding this feed's clock."""
        return f"synthetic_clock:{self.interval}"

    def _restore_clock(self) -> None:
        if self.store is None:
            return
        saved = self.store.get_kv(self.clock_key)
        if (isinstance(saved, dict) and saved.get("seed") == self.seed and saved.get("history") == self.history
                and isinstance(saved.get("start_ts"), (int, float)) and isinstance(saved.get("ticks"), int)
                and saved["ticks"] >= 0):
            self.start_ts, self.ticks = float(saved["start_ts"]), int(saved["ticks"])

    def _clock_state(self) -> dict[str, Any]:
        return {"seed": self.seed, "history": self.history, "start_ts": self.start_ts, "ticks": self.ticks}

    @property
    def now_ts(self) -> float:
        """Start time of the most recent bar."""
        return self.start_ts + (self.history + self.ticks - 1) * self.bar_seconds

    def _sim(self, symbol: str) -> _SymbolSim:
        sym = symbol.upper()
        sim = self._sims.get(sym)
        if sim is not None:
            return sim
        h = _stable_hash(self.seed, sym)
        rng = random.Random(h)
        annual_vol = 0.18 + (h % 1000) / 1000 * 0.42           # 18%..60% annualized
        sigma = annual_vol / math.sqrt(TRADING_DAYS_PER_YEAR * bars_per_day(self.interval))
        crypto = asset_class(sym) == "crypto"
        if crypto:
            price, base_volume, sigma = self._crypto_params(sym, sigma)
        else:
            price = 20.0 + (_stable_hash("price", sym) % 48000) / 100.0  # $20..$500
            base_volume = 2_000.0 + (_stable_hash("vol", sym) % 50_000)
        sim = _SymbolSim(rng=rng, price=price, sigma=sigma, base_volume=base_volume,
                         crypto=crypto, bars=deque(maxlen=self.max_bars))
        for i in range(self.history + self.ticks):
            sim.step(self.start_ts + i * self.bar_seconds)
        self._sims[sym] = sim
        return sim

    @staticmethod
    def _crypto_params(symbol: str, stock_sigma: float) -> tuple[float, float, float]:
        """(start price, base volume in coin units, per-bar sigma) for a crypto pair."""
        base, _quote = crypto_pair(symbol)
        price = _CRYPTO_REF_PRICES.get(base)
        if price is None:  # log-uniform between $0.05 and $500
            price = 0.05 * 10_000 ** ((_stable_hash("price", symbol) % 10_000) / 10_000)
        lo, hi = CRYPTO_VOL_MULT_RANGE
        mult = lo + (hi - lo) * (_stable_hash("cvol", symbol) % 1000) / 1000
        notional = 50_000.0 + (_stable_hash("vol", symbol) % 2_000_000)
        return price, notional / price, stock_sigma * mult

    def refresh(self) -> None:
        with self._lock:
            self.ticks += 1
            ts = self.now_ts
            for sim in self._sims.values():
                sim.step(ts)
            state = self._clock_state()
        if self.store is not None:  # written outside the feed lock: callers may hold the store's
            self.store.set_kv(self.clock_key, state)

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        """Most recent bars; ``interval`` is ignored because bars use the feed's own interval."""
        if lookback <= 0:
            return []
        with self._lock:
            bars = self._sim(symbol).bars
            return list(bars)[-lookback:]

    def get_price(self, symbol: str) -> float | None:
        with self._lock:
            return self._sim(symbol).price

    def cached_price(self, symbol: str) -> float | None:
        return self.get_price(symbol)  # local: no network


class RoutedData(MarketData):
    """Sends crypto symbols to ``crypto_feed`` and everything else to ``stock_feed``."""

    def __init__(self, stock_feed: MarketData, crypto_feed: MarketData) -> None:
        self.stock_feed = stock_feed
        self.crypto_feed = crypto_feed

    def feed_for(self, symbol: str) -> MarketData:
        """The underlying feed that serves ``symbol``."""
        return self.crypto_feed if asset_class(symbol.upper()) == "crypto" else self.stock_feed

    def refresh(self) -> None:
        """Refresh both feeds (once, if they are the same object)."""
        self.stock_feed.refresh()
        if self.crypto_feed is not self.stock_feed:
            self.crypto_feed.refresh()

    def get_bars(self, symbol: str, interval: str, lookback: int) -> list[Bar]:
        return self.feed_for(symbol).get_bars(symbol, interval, lookback)

    def get_price(self, symbol: str) -> float | None:
        return self.feed_for(symbol).get_price(symbol)

    def cached_price(self, symbol: str) -> float | None:
        return self.feed_for(symbol).cached_price(symbol)

    def last_bar_forming(self, symbol: str) -> bool:
        return self.feed_for(symbol).last_bar_forming(symbol)


def make_data(cfg: Config, seed: int = 42, store: Store | None = None) -> MarketData:
    """Build the configured feeds: stocks from ``data_source``, crypto from ``crypto_data_source``.

    Synthetic stock and crypto feeds with the same bar interval share one instance (one clock);
    with a ``store`` their clocks persist across restarts.
    """
    history = max(300, cfg.lookback_bars)
    stock: MarketData
    if cfg.data_source == "synthetic":
        stock = SyntheticData(seed=seed, interval=cfg.bar_interval, history=history, store=store)
    else:
        stock = YahooData()
    crypto: MarketData
    if cfg.crypto_data_source == "coinbase":
        crypto = CoinbaseData()
    elif cfg.crypto_data_source == "yahoo":
        crypto = stock if isinstance(stock, YahooData) else YahooData()
    elif isinstance(stock, SyntheticData) and stock.interval == cfg.crypto_bar_interval:
        crypto = stock
    else:
        crypto = SyntheticData(seed=seed, interval=cfg.crypto_bar_interval, history=history, store=store)
    return RoutedData(stock, crypto)
