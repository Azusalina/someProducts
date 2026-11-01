"""Core domain dataclasses shared by every module."""

from __future__ import annotations

import dataclasses
import math
import re
from dataclasses import dataclass, field
from typing import Any

ORDER_SIDES: frozenset[str] = frozenset({"buy", "sell"})
ORDER_STATUSES: frozenset[str] = frozenset(
    {"new", "accepted", "filled", "partially_filled", "rejected", "canceled"}
)

ASSET_CLASSES: frozenset[str] = frozenset({"stock", "crypto"})
CRYPTO_QUOTES: tuple[str, ...] = ("USDT", "USDC", "USD")  # longest first for suffix matching
CRYPTO_RE: re.Pattern[str] = re.compile(r"^([A-Z0-9]{2,10})-(USD|USDT|USDC)$")
STOCK_RE: re.Pattern[str] = re.compile(r"^[A-Z][A-Z.\-]{0,9}$")
_PAIR_RE: re.Pattern[str] = re.compile(r"^([A-Z0-9]{2,10})[-/]([A-Z0-9]{3,5})$")

# Bases recognised in separator-less pairs such as "BTCUSD" (Alpaca's position format).
KNOWN_CRYPTO_BASES: frozenset[str] = frozenset({
    "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "BCH", "DOT", "MATIC",
    "POL", "UNI", "SHIB", "ATOM", "XLM", "AAVE", "ALGO", "NEAR", "FIL", "ETC", "TRX", "APT",
    "ARB", "OP", "SUI", "PEPE", "MKR", "CRV", "GRT", "BAT", "SUSHI", "YFI", "XTZ", "USDT", "USDC",
})


def asset_class(symbol: str) -> str:
    """'crypto' for canonical BASE-QUOTE pairs (quote USD/USDT/USDC), otherwise 'stock'."""
    return "crypto" if CRYPTO_RE.match(symbol) else "stock"


def crypto_pair(symbol: str) -> tuple[str, str]:
    """Split a canonical crypto symbol into (base, quote); ValueError if it is not one."""
    m = CRYPTO_RE.match(symbol)
    if not m:
        raise ValueError(f"not a crypto symbol: {symbol!r}")
    return m.group(1), m.group(2)


def normalize_symbol(s: str) -> str:
    """Canonicalize a user-typed symbol; raise ValueError if invalid or ambiguous.

    Crypto: "btc-usd", "BTC/USD" and "BTCUSD" (known bases only) -> "BTC-USD".
    Stocks: uppercased tickers such as "AAPL", "BRK.B", "BRK-B"; a bare base like "BTC"
    stays a stock ticker. Rejected: a separator-less string ending in a crypto quote with an
    unknown base (e.g. "FOOUSD", ambiguous) and pairs with other quotes (e.g. "ETH-EUR").
    """
    if not isinstance(s, str):
        raise ValueError(f"symbol must be a string, got {type(s).__name__}")
    sym = s.strip().upper()
    if not sym:
        raise ValueError("symbol must not be empty")
    pair = _PAIR_RE.match(sym)
    if pair:
        base, quote = pair.groups()
        if quote not in CRYPTO_QUOTES:
            raise ValueError(f"unsupported crypto quote currency in {s!r} (use USD, USDT or USDC)")
        return f"{base}-{quote}"
    if "/" in sym:
        raise ValueError(f"invalid crypto pair: {s!r} (expected BASE/QUOTE, e.g. BTC/USD)")
    for quote in CRYPTO_QUOTES:
        base = sym[: -len(quote)]
        if sym.endswith(quote) and len(base) >= 2 and base.isalnum():
            if base in KNOWN_CRYPTO_BASES:
                return f"{base}-{quote}"
            raise ValueError(f"ambiguous symbol {s!r}: write crypto as {base}-{quote}")
    if not STOCK_RE.match(sym):
        raise ValueError(f"invalid symbol: {s!r}")
    return sym


@dataclass
class Bar:
    """One OHLCV candle; ``ts`` is the bar's start time in epoch seconds."""

    ts: float
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class Position:
    """An open long position."""

    symbol: str
    qty: float
    avg_price: float
    opened_ts: float
    high_water: float = 0.0

    def market_value(self, price: float) -> float:
        """Current value of the position at ``price``."""
        return self.qty * price

    def unrealized_pnl(self, price: float) -> float:
        """Profit or loss versus average cost at ``price``."""
        return (price - self.avg_price) * self.qty


@dataclass
class Order:
    """A broker order and its fill state."""

    id: str
    symbol: str
    side: str
    qty: float
    status: str
    submitted_ts: float
    filled_qty: float = 0.0
    filled_avg_price: float | None = None
    reason: str = ""
    type: str = "market"


@dataclass
class Fill:
    """An execution against an order."""

    order_id: str
    symbol: str
    side: str
    qty: float
    price: float
    commission: float
    ts: float


@dataclass
class CashFlow:
    """Cash moved into (+) or out of (-) the broker account outside trading (deposit, withdrawal, journal)."""

    id: str
    ts: float
    amount: float
    kind: str = ""


@dataclass
class Account:
    """Broker account balances and positions."""

    cash: float
    equity: float
    buying_power: float
    positions: dict[str, Position]


@dataclass
class Signal:
    """A strategy verdict for one symbol; ``score`` in [-1, 1], positive is bullish."""

    symbol: str
    score: float
    price: float
    reason: str
    components: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.score = max(-1.0, min(1.0, float(self.score)))


def _json_safe(value: Any) -> Any:
    """Recursively convert a value into JSON-serializable primitives."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json_safe(v) for v in value]
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _json_safe(dataclasses.asdict(value))
    if value is None or isinstance(value, (str, int, bool)):
        return value
    return str(value)


def to_dict(obj: Any) -> dict[str, Any]:
    """Convert a dataclass (or dict) into a JSON-safe dict; non-finite floats become None."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return _json_safe(dataclasses.asdict(obj))
    if isinstance(obj, dict):
        return _json_safe(obj)
    raise TypeError(f"to_dict expects a dataclass instance or dict, got {type(obj).__name__}")
