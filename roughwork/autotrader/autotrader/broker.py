"""Brokers: an exact internal paper broker, an Alpaca REST broker, and the market clock."""

from __future__ import annotations

import logging
import math
import os
import re
import threading
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import requests

from .config import LIVE_CONFIRMATION_PHRASE, Config, ConfigError
from .models import CRYPTO_QUOTES, ORDER_SIDES, Account, CashFlow, Fill, Order, Position, asset_class
from .store import Store

if TYPE_CHECKING:
    from .data import MarketData

log = logging.getLogger(__name__)

EPS: float = 1e-9
FRACTION_DP: int = 6
CRYPTO_FRACTION_DP: int = 8
ALPACA_CRYPTO_DP: int = 9
ROUND_GUARD: float = 1e-3  # float-error guard, in units of the last kept decimal
PAPER_STATE_KEY: str = "paper_state"
ALPACA_PENDING_KEY: str = "alpaca_pending"
ENV_KEY_ID: str = "APCA_API_KEY_ID"
ENV_SECRET: str = "APCA_API_SECRET_KEY"
ALPACA_PAPER_URL: str = "https://paper-api.alpaca.markets"
ALPACA_LIVE_URL: str = "https://api.alpaca.markets"

NYSE_HOLIDAYS: frozenset[date] = frozenset(date.fromisoformat(d) for d in (
    "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
    "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
))
# NYSE early closes (13:00 ET). Like the holidays above, extend this list each year.
NYSE_EARLY_CLOSES: frozenset[date] = frozenset(date.fromisoformat(d) for d in (
    "2025-07-03", "2025-11-28", "2025-12-24",
    "2026-11-27", "2026-12-24",
    "2027-11-26",
))
SESSION_OPEN_MIN: int = 9 * 60 + 30
SESSION_CLOSE_MIN: int = 16 * 60
EARLY_CLOSE_MIN: int = 13 * 60

# Any BASE-QUOTE / BASE/QUOTE pair shape, including quotes we cannot trade (e.g. ETH-EUR).
_ANY_PAIR_RE: re.Pattern[str] = re.compile(r"^([A-Z0-9]{2,10})[-/]([A-Z0-9]{3,5})$")


class BrokerError(RuntimeError):
    """Raised when a broker cannot complete a request; ``status`` is the HTTP status, if any."""

    def __init__(self, message: str, *args: object, status: int | None = None) -> None:
        super().__init__(message, *args)
        self.status = status


class AmbiguousOrderError(BrokerError):
    """An order submission whose outcome is unknown (timeout or 5xx): it may exist at the broker.

    ``client_order_id`` identifies it for a later ``find_order_by_client_id`` lookup.
    """

    def __init__(self, message: str, client_order_id: str) -> None:
        super().__init__(message)
        self.client_order_id = client_order_id


# --------------------------------------------------------------------------- market clock

def _nth_sunday(year: int, month: int, n: int) -> date:
    first = date(year, month, 1)
    return first + timedelta(days=(6 - first.weekday()) % 7 + 7 * (n - 1))


def _eastern_by_rule(now_utc: datetime) -> datetime:
    """US Eastern wall time from UTC using the post-2007 DST rule (zoneinfo fallback)."""
    year = now_utc.year
    dst_start = datetime.combine(_nth_sunday(year, 3, 2), datetime.min.time(), timezone.utc) + timedelta(hours=7)
    dst_end = datetime.combine(_nth_sunday(year, 11, 1), datetime.min.time(), timezone.utc) + timedelta(hours=6)
    offset = -4 if dst_start <= now_utc < dst_end else -5
    return (now_utc + timedelta(hours=offset)).replace(tzinfo=None)


def to_eastern(now_utc: datetime) -> datetime:
    """Naive America/New_York wall time for an aware (or naive-as-UTC) datetime."""
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    now_utc = now_utc.astimezone(timezone.utc)
    try:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            return now_utc.astimezone(ZoneInfo("America/New_York")).replace(tzinfo=None)
        except ZoneInfoNotFoundError:
            pass
    except ImportError:
        pass
    return _eastern_by_rule(now_utc)


def us_market_open(now_utc: datetime | None = None) -> bool:
    """True during the NYSE regular session (09:30-16:00 ET, Mon-Fri; 13:00 on early-close days;
    closed on full-day holidays)."""
    et = to_eastern(now_utc or datetime.now(timezone.utc))
    if et.weekday() >= 5 or et.date() in NYSE_HOLIDAYS:
        return False
    minute = et.hour * 60 + et.minute
    close = EARLY_CLOSE_MIN if et.date() in NYSE_EARLY_CLOSES else SESSION_CLOSE_MIN
    return SESSION_OPEN_MIN <= minute < close


def market_open_for(symbol: str, now: datetime | None = None) -> bool:
    """Crypto trades 24/7; stocks follow the NYSE regular session."""
    return True if asset_class(symbol) == "crypto" else us_market_open(now)


# --------------------------------------------------------------------------- helpers

def round_qty(qty: float, fractional: bool, dp: int = FRACTION_DP) -> float:
    """Round a quantity down: to ``dp`` decimals when fractional, else to whole units."""
    if not math.isfinite(qty) or qty <= 0:
        return 0.0
    if not fractional:
        return float(math.floor(qty + EPS))
    scale = 10 ** dp
    return math.floor(qty * scale + ROUND_GUARD) / scale


def canonical_symbol(symbol: str) -> str:
    """Uppercase and trim a symbol, turning a "BASE/QUOTE" pair into "BASE-QUOTE"."""
    sym = symbol.strip().upper()
    return sym.replace("/", "-") if _ANY_PAIR_RE.match(sym) else sym


def _format_qty(qty: float, dp: int) -> str:
    return f"{qty:.{dp}f}".rstrip("0").rstrip(".")


def _new_order_id() -> str:
    return uuid.uuid4().hex


def _valid_price(price: float | None) -> bool:
    return price is not None and math.isfinite(price) and price > 0


# --------------------------------------------------------------------------- interface

class Broker(ABC):
    """Common broker interface used by the engine."""

    name: str = "broker"
    is_live: bool = False

    @abstractmethod
    def get_account(self) -> Account:
        """Cash, equity, buying power and positions."""

    @abstractmethod
    def get_positions(self) -> dict[str, Position]:
        """Open positions keyed by symbol."""

    @abstractmethod
    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", *,
                     cost_basis: float | None = None) -> Order:
        """Submit a market order; returns the order in its current state.

        ``cost_basis`` (sells) is the average cost the fill's realized P&L is measured against;
        None uses the broker's own average cost for the whole position.
        """

    @abstractmethod
    def get_order(self, order_id: str) -> Order | None:
        """Look up an order by id, or None if unknown."""

    def find_order_by_client_id(self, client_order_id: str, reason: str = "",
                                cost_basis: float | None = None) -> Order | None:
        """Resolve an ambiguous submission: the order with ``client_order_id``, or None if none exists.

        A found order is tracked for fills like a normally submitted one. Brokers that never
        raise AmbiguousOrderError have nothing to resolve and return None.
        """
        return None

    def cancel_order(self, order_id: str) -> bool:
        """Request cancellation of an open order; True if the broker accepted the request.

        Brokers that fill every order immediately have nothing open to cancel and return False.
        """
        return False

    def cash_flows(self, since: float) -> list[CashFlow]:
        """Deposits, withdrawals and cash journals booked at the broker since ``since`` (epoch s).

        Used in ``full_account`` scope so outside transfers are not mistaken for trading P&L.
        Brokers whose cash only moves through the engine report none.
        """
        return []

    @abstractmethod
    def is_market_open(self, symbol: str | None = None) -> bool:
        """Whether ``symbol`` is tradable now; None means the stock session (crypto is always open)."""


# --------------------------------------------------------------------------- paper broker

class PaperBroker(Broker):
    """Internal simulator: immediate market fills at price +/- slippage, exact cost-basis accounting.

    Buy commissions are folded into average cost, so a flat book always satisfies
    ``cash == starting cash + net deposits + sum(realized P&L)``. Crypto pairs are always
    tradable, always fractional (8 dp) and use ``crypto_slippage_bps``.
    """

    name = "paper"
    is_live = False

    def __init__(
        self,
        store: Store,
        price_fn: Callable[[str], float | None],
        initial_cash: float,
        commission: float = 0.0,
        slippage_bps: float = 5.0,
        fractional: bool = True,
        market_hours_fn: Callable[[], bool] | None = None,
        crypto_slippage_bps: float = 10.0,
    ) -> None:
        self.store = store
        self.price_fn = price_fn
        self.commission = float(commission)
        self.slippage_bps = float(slippage_bps)
        self.crypto_slippage_bps = float(crypto_slippage_bps)
        self.fractional = fractional
        self.market_hours_fn = market_hours_fn or us_market_open
        self._lock = threading.RLock()
        self._orders: dict[str, Order] = {}
        self._marks: dict[str, float] = {}  # last valid price per symbol; feed outages value at it
        self._cash, self._positions = self._restore(float(initial_cash))

    # ---- persistence
    def _restore(self, initial_cash: float) -> tuple[float, dict[str, Position]]:
        state = self.store.get_kv(PAPER_STATE_KEY)
        if not isinstance(state, dict):
            self.store.set_kv(PAPER_STATE_KEY, {"cash": initial_cash, "positions": {}})
            return initial_cash, {}
        positions = {
            sym: Position(
                symbol=sym,
                qty=float(p["qty"]),
                avg_price=float(p["avg_price"]),
                opened_ts=float(p.get("opened_ts", 0.0)),
                high_water=float(p.get("high_water", 0.0)),
            )
            for sym, p in state.get("positions", {}).items()
        }
        marks = state.get("marks")
        if isinstance(marks, dict):
            self._marks = {str(k): float(v) for k, v in marks.items()
                           if isinstance(v, (int, float)) and _valid_price(float(v))}
        return float(state["cash"]), positions

    def _persist(self) -> None:
        self.store.set_kv(PAPER_STATE_KEY, {
            "cash": self._cash,
            "positions": {s: p for s, p in self._positions.items()},
            "marks": {s: m for s, m in self._marks.items() if s in self._positions},
        })

    def _mark(self, symbol: str) -> tuple[float | None, bool]:
        """(live price, else last valid price or None, whether the stored mark changed)."""
        price = self.price_fn(symbol)
        with self._lock:
            if _valid_price(price):
                changed = self._marks.get(symbol) != float(price)  # type: ignore[arg-type]
                self._marks[symbol] = float(price)  # type: ignore[arg-type]
                return float(price), changed  # type: ignore[arg-type]
            return self._marks.get(symbol), False

    @contextmanager
    def atomic(self) -> Iterator[None]:
        """Hold the broker and one store transaction, so a caller can book an order with its fill.

        Lock order is broker, then store; the block must not wait on another thread.
        """
        with self._lock, self.store.transaction():
            yield

    # ---- queries
    @property
    def cash(self) -> float:
        """Current simulated cash balance."""
        with self._lock:
            return self._cash

    def adjust_cash(self, delta: float) -> float:
        """Deposit (+) or withdraw (-) simulated cash; returns the new balance."""
        with self._lock:
            if not math.isfinite(delta):
                raise BrokerError("cash adjustment must be a finite number")
            if self._cash + delta < -EPS:
                raise BrokerError(f"cannot withdraw {-delta:.2f}: only {self._cash:.2f} cash available")
            self._cash = max(0.0, self._cash + delta)
            self._persist()
            return self._cash

    def get_positions(self) -> dict[str, Position]:
        with self._lock:
            return {s: Position(**vars(p)) for s, p in self._positions.items()}

    def get_account(self) -> Account:
        with self._lock:
            positions = self.get_positions()
            cash = self._cash
        value = 0.0
        moved = False
        for sym, pos in positions.items():
            price, changed = self._mark(sym)
            moved = moved or changed
            value += pos.market_value(price if price is not None else pos.avg_price)
        if moved:  # keep last-known marks across restarts, so an outage then does not value at cost
            with self._lock:
                self._persist()
        return Account(cash=cash, equity=cash + value, buying_power=cash, positions=positions)

    def get_order(self, order_id: str) -> Order | None:
        with self._lock:
            order = self._orders.get(order_id)
        if order is not None:
            return Order(**vars(order))
        for row in self.store.recent_orders(limit=1000):
            if row["id"] == order_id:
                return Order(**row)
        return None

    def is_market_open(self, symbol: str | None = None) -> bool:
        if symbol is not None and asset_class(canonical_symbol(symbol)) == "crypto":
            return True
        return bool(self.market_hours_fn())

    def _precision(self, symbol: str) -> tuple[bool, int]:
        """(fractional, decimals) for ``symbol``: crypto is always fractional to 8 dp."""
        if asset_class(symbol) == "crypto":
            return True, CRYPTO_FRACTION_DP
        return self.fractional, FRACTION_DP

    # ---- orders
    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", *,
                     cost_basis: float | None = None) -> Order:
        symbol = canonical_symbol(symbol)
        now = time.time()
        fractional, dp = self._precision(symbol)
        with self._lock:
            order = Order(id=_new_order_id(), symbol=symbol, side=side,
                          qty=round_qty(float(qty), fractional, dp), status="new",
                          submitted_ts=now, reason=reason)
            problem = self._check(order)
            if problem:
                order.status = "rejected"
                order.reason = f"{reason}; rejected: {problem}" if reason else f"rejected: {problem}"
                log.info("paper order rejected %s %s %s: %s", side, qty, symbol, problem)
            else:
                self._fill(order, now, cost_basis)
            self._orders[order.id] = order
            self.store.record_order(order)
            return Order(**vars(order))

    def _check(self, order: Order) -> str:
        """Return a rejection reason, or '' if the order may fill (sets a provisional fill price)."""
        if order.side not in ORDER_SIDES:
            return f"invalid side {order.side!r}"
        if order.qty <= 0:
            return "quantity must be positive"
        ref = self.price_fn(order.symbol)
        if not _valid_price(ref):
            return f"no price for {order.symbol}"
        self._marks[order.symbol] = float(ref)  # type: ignore[arg-type]
        crypto = asset_class(order.symbol) == "crypto"
        slip = (self.crypto_slippage_bps if crypto else self.slippage_bps) / 10_000.0
        price = ref * (1 + slip) if order.side == "buy" else ref * (1 - slip)
        if order.side == "buy":
            cost = order.qty * price + self.commission
            if cost > self._cash + EPS:
                return f"insufficient cash: need {cost:.2f}, have {self._cash:.2f}"
        else:
            held = self._positions[order.symbol].qty if order.symbol in self._positions else 0.0
            if order.qty > held + EPS:
                if held > 0 and order.qty - held < 10 ** -self._precision(order.symbol)[1]:
                    order.qty = held
                else:
                    return f"cannot sell {order.qty:g} {order.symbol}: holding {held:g}"
            if self._cash + order.qty * price - self.commission < -EPS:
                return "proceeds do not cover commission"
        order.filled_avg_price = price
        return ""

    def _fill(self, order: Order, now: float, cost_basis: float | None = None) -> None:
        price = float(order.filled_avg_price or 0.0)
        qty = order.qty
        realized = 0.0
        if order.side == "buy":
            self._cash -= qty * price + self.commission
            pos = self._positions.get(order.symbol)
            if pos is None:
                self._positions[order.symbol] = Position(
                    symbol=order.symbol, qty=qty, avg_price=(qty * price + self.commission) / qty,
                    opened_ts=now, high_water=price)
            else:
                new_qty = pos.qty + qty
                pos.avg_price = (pos.qty * pos.avg_price + qty * price + self.commission) / new_qty
                pos.qty = new_qty
                pos.high_water = max(pos.high_water, price)
        else:
            pos = self._positions[order.symbol]
            self._cash += qty * price - self.commission
            basis = float(cost_basis) if _valid_price(cost_basis) else pos.avg_price
            realized = (price - basis) * qty - self.commission
            pos.qty -= qty
            if pos.qty <= EPS:
                del self._positions[order.symbol]
        order.status = "filled"
        order.filled_qty = qty
        self._persist()
        self.store.record_fill(
            Fill(order_id=order.id, symbol=order.symbol, side=order.side, qty=qty,
                 price=price, commission=self.commission, ts=now),
            realized_pnl=realized,
        )


# --------------------------------------------------------------------------- alpaca broker

# Only filled, canceled, expired, replaced and rejected are final at Alpaca: a pending_cancel order
# can still fill and a done_for_day order may resume, so both stay open (accepted / partially_filled).
_ALPACA_STATUS: dict[str, str] = {
    "new": "new", "accepted": "accepted", "filled": "filled",
    "partially_filled": "partially_filled", "rejected": "rejected", "canceled": "canceled",
    "pending_new": "accepted", "accepted_for_bidding": "accepted", "calculated": "accepted",
    "held": "accepted", "pending_replace": "accepted", "stopped": "accepted", "suspended": "accepted",
    "pending_cancel": "accepted", "done_for_day": "accepted",
    "expired": "canceled", "replaced": "canceled",
}
_TERMINAL: frozenset[str] = frozenset({"filled", "rejected", "canceled"})
_AMBIGUOUS_STATUS: int = 500  # 5xx and up: the order may or may not have been accepted
_NOT_CANCELABLE: frozenset[int] = frozenset({404, 422})  # unknown order / already final


CASH_ACTIVITY_TYPES: tuple[str, ...] = ("CSD", "CSW", "JNLC")
ACTIVITY_PAGE_SIZE: int = 100
ACTIVITY_MAX_PAGES: int = 5


def _activity_ts(row: dict[str, Any]) -> float:
    """Epoch time of an account activity (its transaction time, else its date at 00:00 UTC)."""
    when = row.get("transaction_time") or row.get("date")
    if isinstance(when, str) and len(when) == 10:
        when = f"{when}T00:00:00Z"
    return _parse_ts(when)


def _num(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if math.isfinite(out) else default


def _parse_ts(value: Any) -> float:
    if not isinstance(value, str) or not value:
        return time.time()
    text = value.replace("Z", "+00:00")
    if "." in text:  # Alpaca sends nanoseconds; trim to microseconds
        head, _, tail = text.partition(".")
        n = len(tail) - len(tail.lstrip("0123456789"))
        text = f"{head}.{tail[:n][:6].ljust(6, '0')}{tail[n:]}"
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return time.time()


def to_alpaca_symbol(symbol: str) -> str:
    """Alpaca order symbol: "BTC-USD" -> "BTC/USD"; stocks unchanged; other quotes rejected."""
    sym = canonical_symbol(symbol)
    pair = _ANY_PAIR_RE.match(sym)
    if pair and pair.group(2) not in CRYPTO_QUOTES:
        raise BrokerError(f"Alpaca crypto supports only USD, USDT or USDC quotes, not {symbol!r}")
    return sym.replace("-", "/") if asset_class(sym) == "crypto" else sym


def from_alpaca_symbol(raw: str, alpaca_asset_class: str | None = None) -> str | None:
    """Canonical symbol for an Alpaca symbol ("BTCUSD"/"BTC/USD" -> "BTC-USD"); None if untradable here."""
    sym = str(raw).strip().upper()
    crypto = str(alpaca_asset_class or "").lower() == "crypto" or "/" in sym
    if not crypto:
        return sym or None
    pair = _ANY_PAIR_RE.match(sym)
    if pair:
        base, quote = pair.groups()
    else:
        match = next((q for q in CRYPTO_QUOTES if sym.endswith(q) and len(sym) - len(q) >= 2), None)
        if match is None:
            return None
        base, quote = sym[: -len(match)], match
    candidate = f"{base}-{quote}"
    return candidate if asset_class(candidate) == "crypto" else None


class AlpacaBroker(Broker):
    """Alpaca Trading API v2 broker (paper or live). Credentials come from the caller.

    When a store is given, orders are recorded and fills are reconciled into it, with a sell's
    realized P&L measured against the caller's ``cost_basis`` (the engine's own ledger cost in
    allocation scope) or, without one, Alpaca's account-wide average entry price. Crypto pairs
    are sent as "BASE/QUOTE" good-til-canceled orders with up to 9 decimal places, and
    crypto positions are mapped back to canonical "BASE-QUOTE" symbols.
    """

    def __init__(
        self,
        key_id: str,
        secret: str,
        paper: bool,
        fractional: bool = True,
        *,
        session: Any = None,
        store: Store | None = None,
        timeout: float = 10.0,
    ) -> None:
        if not key_id or not secret:
            raise BrokerError("Alpaca key id and secret are required")
        self.paper = paper
        self.is_live = not paper
        self.name = "alpaca-paper" if paper else "alpaca-live"
        self.base_url = ALPACA_PAPER_URL if paper else ALPACA_LIVE_URL
        self.fractional = fractional
        self.timeout = timeout
        self.store = store
        self.session = session if session is not None else requests.Session()
        self.session.headers.update({
            "APCA-API-KEY-ID": key_id,
            "APCA-API-SECRET-KEY": secret,
            "Accept": "application/json",
        })
        self._lock = threading.RLock()
        self._opened: dict[str, float] = {}
        self._skipped: set[str] = set()
        self._pending: dict[str, dict[str, Any]] = (
            dict(store.get_kv(ALPACA_PENDING_KEY, {}) or {}) if store is not None else {}
        )

    # ---- transport
    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None,
                 allow_404: bool = False, ambiguous_id: str | None = None) -> Any:
        """Send one request; with ``ambiguous_id`` a transport error or 5xx raises AmbiguousOrderError."""
        url = f"{self.base_url}{path}"
        try:
            resp = self.session.request(method, url, json=payload, timeout=self.timeout)
        except requests.RequestException as exc:
            message = f"Alpaca {method} {path} failed: {exc}"
            if ambiguous_id is not None:
                raise AmbiguousOrderError(message, ambiguous_id) from exc
            raise BrokerError(message) from exc
        if allow_404 and resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            try:
                body = resp.json()
                message = body.get("message") if isinstance(body, dict) else None
            except ValueError:
                message = None
            text = f"Alpaca {resp.status_code}: {message or resp.text or 'request failed'}"
            if ambiguous_id is not None and resp.status_code >= _AMBIGUOUS_STATUS:
                raise AmbiguousOrderError(text, ambiguous_id)
            raise BrokerError(text, status=resp.status_code)
        if resp.status_code == 204 or not resp.content:
            return None
        try:
            return resp.json()
        except ValueError as exc:
            raise BrokerError(f"Alpaca {method} {path}: invalid JSON response") from exc

    # ---- parsing
    def _order_from(self, data: dict[str, Any], reason: str = "") -> Order:
        filled_avg = data.get("filled_avg_price")
        raw_symbol = str(data.get("symbol", ""))
        symbol = from_alpaca_symbol(raw_symbol, data.get("asset_class")) or raw_symbol.upper()
        filled_qty = _num(data.get("filled_qty"))
        status = _ALPACA_STATUS.get(str(data.get("status", "")), "accepted")
        if status in ("new", "accepted") and filled_qty > EPS:
            status = "partially_filled"
        return Order(
            id=str(data.get("id", "")),
            symbol=symbol,
            side=str(data.get("side", "")),
            qty=_num(data.get("qty")),
            status=status,
            submitted_ts=_parse_ts(data.get("submitted_at") or data.get("created_at")),
            filled_qty=filled_qty,
            filled_avg_price=None if filled_avg in (None, "") else _num(filled_avg),
            reason=reason,
            type=str(data.get("type") or "market"),
        )

    # ---- interface
    def get_positions(self) -> dict[str, Position]:
        rows = self._request("GET", "/v2/positions") or []
        now = time.time()
        out: dict[str, Position] = {}
        with self._lock:
            for row in rows:
                raw = str(row.get("symbol", ""))
                sym = from_alpaca_symbol(raw, row.get("asset_class"))
                qty = _num(row.get("qty"))
                if sym is None:
                    if raw not in self._skipped:
                        self._skipped.add(raw)
                        log.warning("ignoring Alpaca position %r: unsupported crypto pair", raw)
                    continue
                if abs(qty) <= EPS:
                    continue
                opened = self._opened.setdefault(sym, now)
                out[sym] = Position(symbol=sym, qty=qty, avg_price=_num(row.get("avg_entry_price")),
                                    opened_ts=opened, high_water=_num(row.get("current_price")))
            for sym in list(self._opened):
                if sym not in out:
                    del self._opened[sym]
        return out

    def get_account(self) -> Account:
        self._reconcile()
        data = self._request("GET", "/v2/account") or {}
        if data.get("trading_blocked") or data.get("account_blocked"):
            log.warning("Alpaca account is blocked from trading")
        return Account(
            cash=_num(data.get("cash")),
            equity=_num(data.get("equity")),
            buying_power=_num(data.get("buying_power")),
            positions=self.get_positions(),
        )

    def submit_order(self, symbol: str, side: str, qty: float, reason: str = "", *,
                     cost_basis: float | None = None) -> Order:
        """POST a market order. A timeout or 5xx is looked up once by client_order_id before
        AmbiguousOrderError is raised, so an order Alpaca did accept is not lost."""
        symbol = canonical_symbol(symbol)
        if side not in ORDER_SIDES:
            raise BrokerError(f"invalid order side {side!r}")
        order_symbol = to_alpaca_symbol(symbol)
        crypto = asset_class(symbol) == "crypto"
        dp = ALPACA_CRYPTO_DP if crypto else FRACTION_DP
        rounded = round_qty(float(qty), crypto or self.fractional, dp)
        if rounded <= 0:
            order = Order(id=_new_order_id(), symbol=symbol, side=side, qty=0.0, status="rejected",
                          submitted_ts=time.time(),
                          reason=f"{reason}; rejected: quantity rounds to zero" if reason
                          else "rejected: quantity rounds to zero")
            if self.store is not None:
                self.store.record_order(order)
            return order
        avg_cost = self._sell_basis(symbol, cost_basis) if side == "sell" else 0.0
        client_id = f"autotrader-{_new_order_id()}"
        payload = {
            "symbol": order_symbol,
            "qty": _format_qty(rounded, dp),
            "side": side,
            "type": "market",
            "time_in_force": "gtc" if crypto else "day",
            "client_order_id": client_id,
        }
        try:
            data = self._request("POST", "/v2/orders", payload=payload, ambiguous_id=client_id)
        except AmbiguousOrderError as exc:
            try:
                data = self._lookup_client_order(client_id)
            except BrokerError:
                data = None
            if data is None:
                raise
            log.warning("Alpaca accepted order %s despite: %s", client_id, exc)
        return self._track(self._order_from(data or {}, reason), symbol, reason, avg_cost)

    def _sell_basis(self, symbol: str, cost_basis: float | None) -> float:
        """Average cost a sell's realized P&L is measured against (the caller's, else Alpaca's)."""
        if _valid_price(cost_basis):
            return float(cost_basis)  # type: ignore[arg-type]
        held = self.get_positions().get(symbol)
        return held.avg_price if held else 0.0

    def _track(self, order: Order, symbol: str, reason: str, avg_cost: float) -> Order:
        """Start reconciling ``order``'s fills into the store (when there is one)."""
        if not order.symbol:
            order.symbol = symbol
        if self.store is not None:
            with self._lock:
                self._pending.setdefault(order.id, {"reason": reason, "avg_cost": avg_cost,
                                                    "filled_qty": 0.0, "filled_value": 0.0})
            self._absorb(order)
        return order

    def _lookup_client_order(self, client_order_id: str) -> dict[str, Any] | None:
        """Raw order JSON for ``client_order_id``; None when Alpaca has no such order."""
        data = self._request("GET", f"/v2/orders:by_client_order_id?client_order_id={client_order_id}",
                             allow_404=True)
        return data if isinstance(data, dict) and data.get("id") else None

    def find_order_by_client_id(self, client_order_id: str, reason: str = "",
                                cost_basis: float | None = None) -> Order | None:
        data = self._lookup_client_order(client_order_id)
        if data is None:
            return None
        order = self._order_from(data, reason)
        avg_cost = self._sell_basis(order.symbol, cost_basis) if order.side == "sell" else 0.0
        return self._track(order, order.symbol, reason, avg_cost)

    def cancel_order(self, order_id: str) -> bool:
        """DELETE /v2/orders/{id}; False when the order is unknown (404) or no longer cancelable (422).

        Transport errors and other statuses raise BrokerError, so the caller retries the cancel
        instead of treating an open buy as handled.
        """
        try:
            self._request("DELETE", f"/v2/orders/{order_id}")
        except BrokerError as exc:
            if exc.status not in _NOT_CANCELABLE:
                raise
            log.warning("Alpaca cancel of order %s refused: %s", order_id, exc)
            return False
        return True

    def cash_flows(self, since: float) -> list[CashFlow]:
        """Non-trade cash activities (CSD deposits, CSW withdrawals, JNLC journals) since ``since``.

        Alpaca dates these activities by day, so the query starts one day earlier; callers
        de-duplicate by ``CashFlow.id``.
        """
        after = (datetime.fromtimestamp(since, timezone.utc) - timedelta(days=1)).date().isoformat()
        base = (f"/v2/account/activities?activity_types={','.join(CASH_ACTIVITY_TYPES)}"
                f"&after={after}&direction=asc&page_size={ACTIVITY_PAGE_SIZE}")
        flows: list[CashFlow] = []
        token = ""
        for _ in range(ACTIVITY_MAX_PAGES):
            rows = self._request("GET", base + (f"&page_token={token}" if token else "")) or []
            if not isinstance(rows, list):
                raise BrokerError("Alpaca account activities: unexpected response")
            for row in rows:
                if isinstance(row, dict) and row.get("id"):
                    flows.append(CashFlow(id=str(row["id"]), ts=_activity_ts(row),
                                          amount=_num(row.get("net_amount")),
                                          kind=str(row.get("activity_type", ""))))
            if len(rows) < ACTIVITY_PAGE_SIZE:
                break
            token = str(rows[-1].get("id", "")) if isinstance(rows[-1], dict) else ""
            if not token:
                break
        return flows

    def get_order(self, order_id: str) -> Order | None:
        data = self._request("GET", f"/v2/orders/{order_id}", allow_404=True)
        if data is None:
            return None
        with self._lock:
            reason = str(self._pending.get(order_id, {}).get("reason", ""))
        order = self._order_from(data, reason)
        if self.store is not None and order_id in self._pending:
            self._absorb(order)
        return order

    def is_market_open(self, symbol: str | None = None) -> bool:
        if symbol is not None and asset_class(canonical_symbol(symbol)) == "crypto":
            return True
        try:
            data = self._request("GET", "/v2/clock") or {}
        except BrokerError as exc:
            log.warning("Alpaca clock unavailable (%s); using the static NYSE calendar", exc)
            return us_market_open()
        return bool(data.get("is_open"))

    # ---- fill reconciliation
    def _reconcile(self) -> None:
        """Poll pending orders and record any new fills."""
        with self._lock:
            ids = list(self._pending)
        for oid in ids:
            try:
                self.get_order(oid)
            except BrokerError as exc:
                log.warning("could not refresh Alpaca order %s: %s", oid, exc)

    def _absorb(self, order: Order) -> None:
        """Record the order and any fill increment since the last observation."""
        assert self.store is not None
        with self._lock:
            info = self._pending.get(order.id)
            if info is None:
                return
            self.store.record_order(order)
            prev_qty = float(info["filled_qty"])
            new_qty = order.filled_qty
            if new_qty > prev_qty + EPS and order.filled_avg_price is not None:
                total_value = new_qty * order.filled_avg_price
                delta_qty = new_qty - prev_qty
                price = (total_value - float(info["filled_value"])) / delta_qty
                realized = (price - float(info["avg_cost"])) * delta_qty if order.side == "sell" else 0.0
                self.store.record_fill(
                    Fill(order_id=order.id, symbol=order.symbol, side=order.side, qty=delta_qty,
                         price=price, commission=0.0, ts=time.time()),
                    realized_pnl=realized,
                )
                info["filled_qty"] = new_qty
                info["filled_value"] = total_value
            if order.status in _TERMINAL:
                del self._pending[order.id]
            self.store.set_kv(ALPACA_PENDING_KEY, self._pending)


# --------------------------------------------------------------------------- factory

def _paper_price_fn(data: MarketData) -> Callable[[str], float | None]:
    """Paper fills read the tick's cached price first: they run under the broker and store
    locks, and a network round trip there would stall every dashboard request."""
    cached_fn = getattr(data, "cached_price", None)  # duck-typed feeds may not have it

    def price(symbol: str) -> float | None:
        cached = cached_fn(symbol) if cached_fn is not None else None
        return cached if cached is not None else data.get_price(symbol)
    return price


def make_broker(config: Config, store: Store, data: MarketData) -> Broker:
    """Build the broker for ``config.mode``; refuses live trading without explicit confirmation and keys."""
    if config.mode == "sim":
        return PaperBroker(
            store,
            _paper_price_fn(data),
            config.initial_fund,
            commission=config.commission_per_trade,
            slippage_bps=config.slippage_bps,
            fractional=config.fractional,
            crypto_slippage_bps=config.crypto_slippage_bps,
        )
    if config.mode not in ("alpaca-paper", "alpaca-live"):
        raise ConfigError(f"unknown mode: {config.mode!r}")
    live = config.mode == "alpaca-live"
    problems: list[str] = []
    if live and config.live_confirmation != LIVE_CONFIRMATION_PHRASE:
        problems.append(
            f'config "live_confirmation" must be exactly "{LIVE_CONFIRMATION_PHRASE}" to trade real money')
    key_id = os.environ.get(ENV_KEY_ID, "").strip()
    secret = os.environ.get(ENV_SECRET, "").strip()
    missing = [name for name, val in ((ENV_KEY_ID, key_id), (ENV_SECRET, secret)) if not val]
    if missing:
        problems.append(f"environment variable(s) {', '.join(missing)} must be set for {config.mode}")
    if problems:
        raise ConfigError(f"refusing to start in {config.mode} mode: " + "; ".join(problems))
    return AlpacaBroker(key_id, secret, paper=not live, fractional=config.fractional, store=store)
