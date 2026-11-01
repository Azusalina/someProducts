"""Trading loop: market data -> signals -> risk -> orders, plus operator controls and the dashboard snapshot.

Fund accounting
---------------
``fund_scope == "allocation"``: the bot owns a ledger of the units it bought (kv ``bot_positions``)
and only manages those. Its capital is ``initial_fund + realized P&L + net deposits``; its free cash is
that capital minus the cost basis of its ledger and any pending buys, capped by the broker's real cash.

Sells are booked at the ledger's cost basis (passed to the broker as ``cost_basis``), so units the user
holds in the same symbol never leak into the bot's realized P&L. Units sold outside the bot leave the
ledger as a withdrawal, and the fund the ledger started with is persisted (kv ``initial_fund``): editing
``initial_fund`` between runs is applied as a deposit or withdrawal. Every such cash movement shifts the
risk baselines, so it never counts as trading profit or loss.

``fund_scope == "full_account"``: the bot manages every long position in the account and may spend all
of the account's cash; its capital is the broker equity. Deposits and withdrawals made at the broker are
read from its account activity each tick and shift the risk baselines the same way.

Order safety
------------
A submission whose outcome is unknown (timeout or 5xx) is kept as an unresolved order: its symbol stays
busy and in cooldown, a buy's value stays reserved, and it is looked up by client order id each tick
until found or confirmed absent. ``MAX_SUBMIT_ERRORS`` consecutive submission failures halt new entries.
The kill switch cancels open buys and keeps liquidating every tick until resume. Liquidating a position
whose market is closed (or that has an order in flight) is deferred until it can trade.

Locking
-------
One RLock guards engine state. ``tick()`` reads bars, prices, the account and cash activity outside it,
so a slow feed only holds the lock while orders are placed. Operator controls wait at most
``CONTROL_WAIT_SECONDS`` for a busy cycle and are otherwise queued: pause and kill take effect at once
(a running cycle checks them before every order), a queued liquidation stops the cycle placing further
orders, and queued controls run in order before the cycle finishes. ``snapshot()`` serves the last
snapshot (``busy: true``) if the lock stays held past ``SNAPSHOT_WAIT_SECONDS``.

Asset classes
-------------
Stocks (``universe``) trade only while the NYSE session is open when ``respect_market_hours`` is set;
crypto pairs (``crypto_universe``, "BASE-QUOTE") trade on every tick, 24/7, with their own bar interval,
strategy thresholds (``crypto_strategy`` overrides) and per-position risk limits. Exits for held
positions run whenever their market is open, so crypto stops keep working overnight and at weekends.
The engine is "market_closed" only when no enabled asset class can trade.

Forecasts
---------
Each tick projects the next ``forecast.horizon_bars`` bars for every fetched symbol (active universe
plus held positions) from the bars already fetched, caches the latest Forecast per symbol, and, when
``forecast.use_in_strategy`` is set, feeds it to the strategy's ``forecast`` component. ``chart()``
serves recent bars plus that projection for the dashboard, fetching unknown symbols on demand.
"""

from __future__ import annotations

import contextlib
import logging
import math
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import asdict, dataclass
from typing import Any

from . import __version__
from .broker import PAPER_STATE_KEY, AmbiguousOrderError, Broker, BrokerError, PaperBroker
from .config import Config, ConfigError
from .data import MarketData
from .forecast import Forecast, Forecaster
from .models import Account, Bar, Order, Position, Signal, asset_class, normalize_symbol, to_dict
from .risk import HALT_KILL, HALT_MANUAL, RiskManager, exposure_by_class, fmt_price, trading_day
from .store import Store
from .strategy import Strategy, rank

log = logging.getLogger(__name__)

EPS: float = 1e-9
MAX_UNIVERSE: int = 200
# Alpaca charges crypto fees in the coin bought, so the broker holds slightly fewer units than
# were filled. A crypto shortfall up to this fraction is a fee folded into the cost basis.
CRYPTO_FEE_TOLERANCE: float = 0.01
SNAPSHOT_SIGNALS: int = 2 * MAX_UNIVERSE  # every active + held symbol; the dashboard slices
TERMINAL_STATUSES: frozenset[str] = frozenset({"filled", "rejected", "canceled"})
UNIVERSE_CLASSES: frozenset[str] = frozenset({"stock", "crypto"})
CHART_DEFAULT_BARS: int = 120
CHART_MIN_BARS: int = 20
CHART_MAX_BARS: int = 500

KV_LEDGER = "bot_positions"
KV_PENDING = "pending_orders"
KV_PAUSED = "engine_paused"
KV_UNIVERSE = "universe"
KV_DEPOSITS = "net_deposits"
KV_DAY = "engine_day"
KV_UNRESOLVED = "unresolved_orders"
KV_LIQUIDATE = "deferred_liquidations"
KV_FUND = "initial_fund"
KV_FLOWS = "cash_flows_seen"
KV_DB_MODE = "db_mode"

MAX_SUBMIT_ERRORS: int = 3  # consecutive submission failures that halt new entries
UNRESOLVED_MAX_MISSES: int = 3  # "no such order" answers before an ambiguous submission is dropped
CASH_FLOW_LOOKBACK: float = 3 * 86400.0  # window of broker cash activity re-read each tick
MAX_SEEN_FLOWS: int = 1000  # cash-activity ids remembered so each flow is applied once
CONTROL_WAIT_SECONDS: float = 2.0  # how long liquidate/kill wait for a busy cycle before queueing
SNAPSHOT_WAIT_SECONDS: float = 1.0  # how long snapshot() waits before serving the last one
INTERRUPTING_CONTROLS: frozenset[str] = frozenset({"liquidate", "kill"})  # stop a busy cycle's orders


class EngineStopped(Exception):
    """Raised inside a cycle when ``run_forever``'s stop event is set (the cycle is abandoned)."""


class EngineBusy(RuntimeError):
    """A change could not be applied because a trading cycle held the engine for too long."""


@dataclass
class Holding:
    """Units the bot bought itself, at average cost including the buy commission."""

    qty: float
    avg_price: float
    opened_ts: float


@dataclass
class PendingOrder:
    """An order the engine is still watching for fills (only non-immediate brokers leave these)."""

    symbol: str
    side: str
    qty: float
    ref_price: float
    avg_cost: float
    reason: str
    applied_qty: float = 0.0
    applied_value: float = 0.0
    cancel_requested: bool = False


@dataclass
class UnresolvedOrder:
    """A submission whose outcome is unknown (timeout or 5xx); keyed by its client order id."""

    symbol: str
    side: str
    qty: float
    ref_price: float
    avg_cost: float
    reason: str
    submitted_ts: float
    misses: int = 0


@dataclass(frozen=True)
class Markets:
    """Which asset classes may trade this tick (crypto is always open)."""

    stocks: bool
    crypto: bool = True

    def allows(self, symbol: str) -> bool:
        """Whether ``symbol``'s market is open."""
        return self.crypto if _is_crypto(symbol) else self.stocks


def _finite_positive(x: float | None) -> bool:
    return x is not None and math.isfinite(x) and x > 0.0


def _is_crypto(symbol: str) -> bool:
    return asset_class(symbol) == "crypto"


def clamp_chart_bars(n: int) -> int:
    """Clamp a requested chart length to ``CHART_MIN_BARS..CHART_MAX_BARS``."""
    return max(CHART_MIN_BARS, min(CHART_MAX_BARS, int(n)))


def forecast_brief(fc: Forecast | None) -> dict[str, Any] | None:
    """The headline numbers of a forecast for table rows (None without one)."""
    if fc is None:
        return None
    return {"direction": fc.direction, "expected_return": fc.expected_return, "confidence": fc.confidence,
            "hit_rate": fc.hit_rate, "horizon": fc.horizon}


def forecast_payload(fc: Forecast | None) -> dict[str, Any] | None:
    """Full chart projection: points plus summary statistics (None without one)."""
    if fc is None:
        return None
    return {"points": [{"ts": p.ts, "mid": p.mid, "lo": p.lo, "hi": p.hi} for p in fc.points],
            "expected_return": fc.expected_return, "direction": fc.direction, "confidence": fc.confidence,
            "hit_rate": fc.hit_rate, "horizon": fc.horizon, "method": fc.method,
            "generated_ts": fc.generated_ts}


def _restore_list(saved: dict[str, Any], key: str, config_key: str, configured: list[str]) -> list[str]:
    """The saved list under ``key`` if it was saved against the same configured list, else ``configured``."""
    symbols = saved.get(key)
    if saved.get(config_key) == list(configured) and isinstance(symbols, list):
        return [str(s) for s in symbols]
    return list(configured)


def claim_store_mode(store: Store, config: Config) -> None:
    """Bind the database to ``config.mode`` on first use; refuse a database another mode wrote.

    A sim ledger, sim fills and sim deposits read as real ones in an Alpaca mode: the bot would
    adopt the user's own shares as its positions and spend sim profits as real allocation.
    A database from before this check is recognised as sim by its paper-broker state.
    """
    owner = store.get_kv(KV_DB_MODE)
    if owner is None and store.get_kv(PAPER_STATE_KEY) is not None:
        owner = "sim"
    if owner is None:
        store.set_kv(KV_DB_MODE, config.mode)
    elif owner != config.mode:
        raise ConfigError(
            f"database {config.db_path} holds {owner} state; refusing to use it in {config.mode} mode. "
            f'Set "db_path" to a separate file for this mode, e.g. "data/autotrader-{config.mode}.db".')
    elif store.get_kv(KV_DB_MODE) is None:
        store.set_kv(KV_DB_MODE, owner)


class Engine:
    """Runs trading cycles against a broker and exposes thread-safe operator controls."""

    def __init__(
        self,
        config: Config,
        data: MarketData,
        broker: Broker,
        store: Store,
        strategy: Strategy | None = None,
        risk: RiskManager | None = None,
        crypto_strategy: Strategy | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        claim_store_mode(store, config)
        self.config = config
        self.data = data
        self.broker = broker
        self.store = store
        self.strategy = strategy or Strategy(config.strategy)
        self.crypto_strategy = crypto_strategy or Strategy(config.crypto_strategy_config())
        self.risk = risk or RiskManager.from_config(config, store)
        self.forecaster = Forecaster(config.forecast)
        self._clock = clock
        self._lock = threading.RLock()
        self._tick_lock = threading.Lock()
        self._is_paper = isinstance(broker, PaperBroker)

        self._stocks, self._crypto = self._load_universe()
        self._paused = bool(store.get_kv(KV_PAUSED, False))
        self._ledger: dict[str, Holding] = {
            sym: Holding(**h) for sym, h in (store.get_kv(KV_LEDGER, {}) or {}).items()
        }
        self._pending: dict[str, PendingOrder] = {
            oid: PendingOrder(**p) for oid, p in (store.get_kv(KV_PENDING, {}) or {}).items()
        }
        self._unresolved: dict[str, UnresolvedOrder] = {
            cid: UnresolvedOrder(**u) for cid, u in (store.get_kv(KV_UNRESOLVED, {}) or {}).items()
        }
        self._liquidations: dict[str, str] = dict(store.get_kv(KV_LIQUIDATE, {}) or {})
        self._submit_errors = 0
        self._signals: dict[str, Signal] = {}
        self._forecasts: dict[str, Forecast] = {}
        self._bars: dict[str, list[Bar]] = {}
        self._prices: dict[str, float] = {}
        self._account: Account | None = None
        self._managed: dict[str, Position] = {}
        self._market_open: bool | None = None
        self._stocks_open: bool | None = None
        self._entry_block: str | None = None
        self._data_ok = True
        self._requests: list[tuple[str, str]] = []  # queued (action, reason) operator controls
        self._requests_lock = threading.Lock()
        self._stop_event: threading.Event | None = None
        self._account_version = 0  # bumped by every order and fund change (invalidates account reads)
        self._last_snapshot: dict[str, Any] | None = None
        self.last_tick_ts: float | None = None
        self.next_tick_ts: float | None = None
        self.tick_count = 0
        if config.allow_short:
            self._event("warn", "allow_short is not supported yet; trading long-only")
        self._sync_initial_fund()

    # ------------------------------------------------------------------ persistence helpers

    def _event(self, level: str, message: str) -> None:
        getattr(log, {"trade": "info", "warn": "warning"}.get(level, level))(message)
        self.store.log_event(level, message, self._clock())

    def _load_universe(self) -> tuple[list[str], list[str]]:
        """Dashboard-edited (stocks, crypto) lists; each reverts to config.json once its config list changes."""
        saved = self.store.get_kv(KV_UNIVERSE)
        saved = saved if isinstance(saved, dict) else {}
        return (_restore_list(saved, "symbols", "config", self.config.universe),
                _restore_list(saved, "crypto", "crypto_config", self.config.crypto_universe))

    def _save_ledger(self) -> None:
        self.store.set_kv(KV_LEDGER, {s: asdict(h) for s, h in self._ledger.items()})

    def _save_pending(self) -> None:
        self.store.set_kv(KV_PENDING, {oid: asdict(p) for oid, p in self._pending.items()})

    def _save_unresolved(self) -> None:
        self.store.set_kv(KV_UNRESOLVED, {cid: asdict(u) for cid, u in self._unresolved.items()})

    def _save_liquidations(self) -> None:
        self.store.set_kv(KV_LIQUIDATE, dict(self._liquidations))

    def _net_deposits(self) -> float:
        return float(self.store.get_kv(KV_DEPOSITS, 0.0) or 0.0)

    def _shift_baselines(self, delta: float) -> None:
        """Move the risk baselines and today's P&L baseline by a cash flow so it is not counted as P&L."""
        self.risk.adjust_baselines(delta)
        rec = self.store.get_kv(KV_DAY)
        if isinstance(rec, dict):
            rec["equity"] = float(rec.get("equity", 0.0)) + delta
            self.store.set_kv(KV_DAY, rec)

    def _sync_initial_fund(self) -> None:
        """Apply an ``initial_fund`` edited since the last run as a deposit or withdrawal.

        Paper cash (sim) and the risk baselines move with it, so a smaller fund does not read as a
        drawdown and a larger one is backed by cash. Raises ConfigError when the change cannot be
        applied (a negative allocation, or more paper cash withdrawn than is free).
        """
        fund = float(self.config.initial_fund)
        saved = self.store.get_kv(KV_FUND)
        if isinstance(saved, bool) or not isinstance(saved, (int, float)):
            self.store.set_kv(KV_FUND, fund)
            return
        previous = float(saved)
        delta = fund - previous
        if abs(delta) <= EPS:
            return
        if self._full_account and not self._is_paper:
            self.store.set_kv(KV_FUND, fund)  # capital is the broker equity; nothing to move
            return
        problem = (f"initial_fund changed from {previous:.2f} to {fund:.2f} since the last run, "
                   f"but the {-delta:.2f} withdrawal cannot be applied")
        advice = f"set initial_fund back to {previous:.2f} and withdraw from the dashboard"
        if not self._full_account and self.allocation() < -EPS:
            raise ConfigError(f"{problem}: the allocation would be {self.allocation():.2f}; {advice}")
        if self._is_paper:
            cash = self.broker.get_account().cash
            if delta < 0 and -delta > cash + EPS:
                raise ConfigError(f"{problem}: only {cash:.2f} paper cash is free; {advice} "
                                  "after selling positions")
            self.broker.adjust_cash(delta)  # type: ignore[attr-defined]
        self._shift_baselines(delta)
        self.store.set_kv(KV_FUND, fund)
        verb = "deposit" if delta > 0 else "withdrawal"
        self._event("info", f"initial_fund changed from {previous:.2f} to {fund:.2f}; "
                            f"applied as a {verb} of {abs(delta):.2f}")

    def _read_cash_flows(self, now: float) -> list[Any] | None:
        """full_account on an external broker: its recent cash activity (None if not applicable or on error).

        A broker error is logged and retried next tick.
        """
        if not self._full_account or self._is_paper:
            return None
        try:
            return self.broker.cash_flows(now - CASH_FLOW_LOOKBACK)
        except BrokerError as exc:
            log.warning("could not read broker cash activity: %s", exc)
            return None

    def _absorb_cash_flows(self, flows: list[Any] | None) -> None:
        """Shift risk baselines by deposits/withdrawals made at the broker (from ``_read_cash_flows``).

        The first look only records the flows already present (they are in the baselines).
        """
        if flows is None:
            return
        saved = self.store.get_kv(KV_FLOWS)
        if not isinstance(saved, list):
            self.store.set_kv(KV_FLOWS, list(dict.fromkeys(f.id for f in flows)))
            return
        seen = [str(i) for i in saved]
        known = set(seen)
        for flow in flows:
            if flow.id in known:
                continue
            known.add(flow.id)
            seen.append(flow.id)
            if abs(flow.amount) <= EPS:
                continue
            self._shift_baselines(flow.amount)
            verb = "deposit" if flow.amount > 0 else "withdrawal"
            self._event("info", f"broker {verb} of {abs(flow.amount):.2f} detected ({flow.kind or 'cash'}); "
                                "risk baselines adjusted so it is not counted as P&L")
        if len(seen) != len(saved):
            self.store.set_kv(KV_FLOWS, seen[-MAX_SEEN_FLOWS:])

    # ------------------------------------------------------------------ per-asset-class settings

    def strategy_for(self, symbol: str) -> Strategy:
        """The crypto strategy for crypto pairs, the stock strategy otherwise."""
        return self.crypto_strategy if _is_crypto(symbol) else self.strategy

    def _interval_for(self, symbol: str) -> str:
        return self.config.crypto_bar_interval if _is_crypto(symbol) else self.config.bar_interval

    def _active_universe(self) -> list[str]:
        symbols = [*(self._stocks if self.config.enable_stocks else ()),
                   *(self._crypto if self.config.enable_crypto else ())]
        return list(dict.fromkeys(symbols))

    # ------------------------------------------------------------------ fund accounting

    @property
    def _full_account(self) -> bool:
        return self.config.fund_scope == "full_account"

    def allocation(self) -> float:
        """Capital the bot may deploy: initial fund + realized P&L + net deposits (broker equity in full_account)."""
        with self._lock:
            if self._full_account:
                account = self._account or self.broker.get_account()
                return account.equity
            total = self.config.initial_fund + self.store.realized_pnl_total() + self._net_deposits()
            return max(0.0, total)

    def _pending_buy_reserve(self, crypto_only: bool = False) -> float:
        """Value held back for buys in flight: unfilled tracked orders and unresolved submissions."""
        tracked = sum(max(0.0, p.qty - p.applied_qty) * p.ref_price for p in self._pending.values()
                      if p.side == "buy" and (not crypto_only or _is_crypto(p.symbol)))
        unknown = sum(u.qty * u.ref_price for u in self._unresolved.values()
                      if u.side == "buy" and (not crypto_only or _is_crypto(u.symbol)))
        return tracked + unknown

    def _invested(self) -> float:
        return sum(h.qty * h.avg_price for h in self._ledger.values())

    def deployable_cash(self, account: Account) -> float:
        """Cash the bot may spend on new entries right now."""
        with self._lock:
            broker_cash = account.cash - self._pending_buy_reserve()
            if self._full_account:
                return max(0.0, broker_cash)
            own_cash = self.allocation() - self._invested() - self._pending_buy_reserve()
            return max(0.0, min(broker_cash, own_cash))

    def _bot_equity(self, account: Account, managed: dict[str, Position]) -> float:
        if self._full_account:
            return account.equity
        unrealized = sum(p.unrealized_pnl(self._price_of(s, p)) for s, p in managed.items())
        return self.allocation() + unrealized

    def _bot_cash(self, account: Account) -> float:
        if self._full_account:
            return account.cash
        return self.allocation() - self._invested()

    def _price_of(self, symbol: str, pos: Position | None = None) -> float:
        price = self._prices.get(symbol)
        if _finite_positive(price):
            return float(price)  # type: ignore[arg-type]
        return pos.avg_price if pos is not None else 0.0

    def _exposure(self, managed: dict[str, Position], equity: float | None) -> dict[str, float]:
        marks = {s: self._price_of(s, p) for s, p in managed.items()}
        return exposure_by_class(managed, marks, equity)

    # ------------------------------------------------------------------ positions

    def _pending_symbols(self) -> set[str]:
        """Symbols with an order in flight (tracked, or submitted with an unknown outcome)."""
        return {p.symbol for p in self._pending.values()} | {u.symbol for u in self._unresolved.values()}

    def _managed_positions(self, account: Account) -> dict[str, Position]:
        """Long positions the bot manages: all of them in full_account, else its own ledger capped by holdings."""
        held = {s: p for s, p in account.positions.items() if p.qty > EPS}
        if self._full_account:
            return {s: Position(s, p.qty, p.avg_price, p.opened_ts, p.high_water) for s, p in held.items()}
        out: dict[str, Position] = {}
        for sym, h in self._ledger.items():
            broker_pos = held.get(sym)
            qty = min(h.qty, broker_pos.qty if broker_pos else 0.0)
            if qty > EPS:
                hw = broker_pos.high_water if broker_pos else 0.0
                out[sym] = Position(sym, qty, h.avg_price, h.opened_ts, hw)
        return out

    def _reconcile_ledger(self, account: Account) -> None:
        """Shrink ledger entries the broker no longer holds (sold outside the bot) as a withdrawal.

        The allocation drops by the units' cost, which leaves the bot's free cash unchanged. The
        risk and today's-P&L baselines drop by the units' last market value, which is how much the
        bot's equity falls. So neither the halts nor today's P&L count the withdrawal as a loss.
        """
        busy = self._pending_symbols()
        changed = False
        for sym, h in list(self._ledger.items()):
            if sym in busy:
                continue
            broker_pos = account.positions.get(sym)
            held = broker_pos.qty if broker_pos and broker_pos.qty > 0 else 0.0
            if held + EPS >= h.qty:
                continue
            removed = h.qty - held
            if self._full_account:
                # The sale proceeds stay in the account, so equity is unchanged; real cash flows
                # reach the baselines through broker.cash_flows(). Only trim the ledger.
                if held > EPS:
                    h.qty = held
                else:
                    del self._ledger[sym]
                changed = True
                continue
            if _is_crypto(sym) and held > EPS and removed <= h.qty * CRYPTO_FEE_TOLERANCE:
                # a fee taken in coin: same total cost over fewer units, so no withdrawal
                h.avg_price = h.qty * h.avg_price / held
                h.qty = held
                log.info("%s: %g units short at the broker treated as a fee", sym, removed)
                changed = True
                continue
            cost = removed * h.avg_price
            value = removed * self._price_of(sym, Position(sym, removed, h.avg_price, h.opened_ts))
            self.store.set_kv(KV_DEPOSITS, self._net_deposits() - cost)
            self._shift_baselines(-value)
            self._event("warn", f"{sym}: {removed:g} bot units no longer held at the broker; "
                                f"treated as withdrawn at cost {cost:.2f} (market value {value:.2f})")
            if held > EPS:
                h.qty = held
            else:
                del self._ledger[sym]
            changed = True
        if changed:
            self._save_ledger()

    # ------------------------------------------------------------------ orders

    def _submit(self, symbol: str, side: str, qty: float, reason: str, now: float,
                avg_cost: float = 0.0) -> Order | None:
        """Submit a market order, start tracking it, and apply any immediate fill.

        Sells carry the ledger cost as ``cost_basis`` in allocation scope. A submission with an
        unknown outcome is kept as unresolved (symbol busy and in cooldown) and resolved by
        ``_resolve_unresolved``; repeated failures halt new entries.
        """
        self._account_version += 1
        atomic = self.broker.atomic() if self._is_paper else contextlib.nullcontext()  # type: ignore[attr-defined]
        with atomic:  # a paper order, its fill and the ledger entry commit together or not at all
            return self._submit_order(symbol, side, qty, reason, now, avg_cost)

    def _submit_order(self, symbol: str, side: str, qty: float, reason: str, now: float,
                      avg_cost: float) -> Order | None:
        basis = avg_cost if side == "sell" and not self._full_account and avg_cost > 0 else None
        try:
            order = self.broker.submit_order(symbol, side, qty, reason=reason, cost_basis=basis)
        except AmbiguousOrderError as exc:
            ref = self._price_of(symbol)
            self._unresolved[exc.client_order_id] = UnresolvedOrder(symbol, side, qty, ref, avg_cost, reason, now)
            self._save_unresolved()
            self.risk.start_cooldown(symbol, now)
            self._event("error", f"{side.upper()} {qty:g} {symbol}: outcome unknown ({exc}); "
                                 f"tracking client order {exc.client_order_id} until the broker confirms it")
            self._note_submit_error()
            return None
        except BrokerError as exc:
            self._event("error", f"{side.upper()} {qty:g} {symbol} failed: {exc}")
            self._note_submit_error()
            return None
        self._submit_errors = 0
        if order.status == "rejected":
            self._event("warn", f"{side.upper()} {qty:g} {symbol} rejected: {order.reason}")
            return order
        with self.store.transaction():  # trade count, tracking and ledger land together
            self.risk.note_trade(symbol, side, now)
            ref = self._price_of(symbol) or (order.filled_avg_price or 0.0)
            self._pending[order.id] = PendingOrder(symbol, side, order.qty, ref, avg_cost, reason)
            self._apply_order(order, now)
        return order

    def _apply_order(self, order: Order, now: float) -> None:
        """Fold any new fill quantity of a tracked order into the ledger; stop tracking terminal orders."""
        p = self._pending.get(order.id)
        if p is None:
            return
        self._account_version += 1
        delta = order.filled_qty - p.applied_qty
        if delta > EPS:
            avg = order.filled_avg_price if _finite_positive(order.filled_avg_price) else p.ref_price
            total_value = order.filled_qty * float(avg)
            price = (total_value - p.applied_value) / delta
            first_fill = p.applied_qty <= EPS
            p.applied_qty, p.applied_value = order.filled_qty, total_value
            self._book_fill(p, delta, price, now, first_fill)
        if order.status in TERMINAL_STATUSES:
            del self._pending[order.id]
            if order.status != "filled":
                self._event("warn", f"{p.side.upper()} {p.symbol} order {order.status} "
                                    f"after filling {p.applied_qty:g}/{p.qty:g}")
        self._save_pending()

    def _book_fill(self, p: PendingOrder, qty: float, price: float, now: float, first_fill: bool) -> None:
        if p.side == "buy":
            commission = self.config.commission_per_trade if first_fill else 0.0
            h = self._ledger.get(p.symbol)
            if h is None:
                self._ledger[p.symbol] = Holding(qty, (qty * price + commission) / qty, now)
            else:
                new_qty = h.qty + qty
                h.avg_price = (h.qty * h.avg_price + qty * price + commission) / new_qty
                h.qty = new_qty
            pnl_text = ""
        else:
            h = self._ledger.get(p.symbol)
            cost = h.avg_price if h else p.avg_cost
            pnl_text = f", P&L {(price - cost) * qty:+.2f}" if cost > 0 else ""
            if h is not None:
                h.qty -= qty
                if h.qty <= EPS:
                    del self._ledger[p.symbol]
        self._save_ledger()
        self._event("trade", f"{p.side.upper()} {qty:g} {p.symbol} @ {fmt_price(price)}{pnl_text} — {p.reason}")

    def _note_submit_error(self) -> None:
        """Count a failed submission; ``MAX_SUBMIT_ERRORS`` in a row halt new entries until resume."""
        self._submit_errors += 1
        if self._submit_errors >= MAX_SUBMIT_ERRORS and not self.risk.halted:
            self.risk.halt(f"{self._submit_errors} consecutive order submission errors; "
                           "check the broker connection, then resume", HALT_MANUAL)

    def _resolve_unresolved(self, now: float) -> None:
        """Look up each unknown-outcome submission by client order id and track it once found."""
        changed = False
        for cid, u in list(self._unresolved.items()):
            basis = u.avg_cost if u.side == "sell" and not self._full_account and u.avg_cost > 0 else None
            try:
                order = self.broker.find_order_by_client_id(cid, u.reason, cost_basis=basis)
            except BrokerError as exc:
                log.warning("could not look up client order %s: %s", cid, exc)
                continue
            changed = True
            if order is None:
                u.misses += 1
                if u.misses >= UNRESOLVED_MAX_MISSES:
                    del self._unresolved[cid]
                    self._event("warn", f"{u.side.upper()} {u.qty:g} {u.symbol}: the broker has no order "
                                        f"{cid}; treating it as never placed")
                continue
            del self._unresolved[cid]
            self.risk.note_trade(u.symbol, u.side, now)
            self._pending[order.id] = PendingOrder(u.symbol, u.side, order.qty or u.qty, u.ref_price,
                                                   u.avg_cost, u.reason)
            self._event("warn", f"{u.side.upper()} {u.symbol}: order {cid} found at the broker "
                                f"({order.status}); now tracked")
            self._apply_order(order, now)
        if changed:
            self._save_unresolved()

    def _poll_pending(self, now: float) -> None:
        self._resolve_unresolved(now)
        for oid in list(self._pending):
            try:
                order = self.broker.get_order(oid)
            except BrokerError as exc:
                log.warning("could not refresh order %s: %s", oid, exc)
                continue
            if order is None:
                p = self._pending.pop(oid)
                self._save_pending()
                self._event("warn", f"order {oid} for {p.symbol} is unknown to the broker; no longer tracked")
            else:
                self._apply_order(order, now)

    def _sell(self, pos: Position, reason: str, now: float) -> Order | None:
        return self._submit(pos.symbol, "sell", pos.qty, reason, now, avg_cost=pos.avg_price)

    def _cancel_pending_buys(self, reason: str) -> list[str]:
        """Ask the broker to cancel every open buy (once per order); returns their symbols."""
        symbols: list[str] = []
        for oid, p in self._pending.items():
            if p.side != "buy":
                continue
            symbols.append(p.symbol)
            if p.cancel_requested:
                continue
            try:
                accepted = self.broker.cancel_order(oid)
            except BrokerError as exc:  # retried on the next liquidation pass
                log.warning("cancel of order %s failed: %s", oid, exc)
                continue
            p.cancel_requested = True
            if accepted:
                self._event("warn", f"BUY {p.symbol}: cancel requested ({reason})")
        self._save_pending()
        return symbols + [u.symbol for u in self._unresolved.values() if u.side == "buy"]

    def _defer_liquidation(self, symbols: list[str], reason: str) -> None:
        for sym in symbols:
            self._liquidations.setdefault(sym, reason)
        self._save_liquidations()

    def _forced_sells(self, tradable: dict[str, Position], managed: dict[str, Position],
                      busy: set[str]) -> dict[str, str]:
        """Deferred liquidations that can run now (symbol -> reason); drops finished ones."""
        done = [s for s in self._liquidations if s not in managed and s not in busy]
        for sym in done:
            del self._liquidations[sym]
        if done:
            self._save_liquidations()
        return {s: r for s, r in self._liquidations.items() if s in tradable and s not in busy}

    # ------------------------------------------------------------------ the trading cycle

    def _check_markets(self) -> Markets:
        """Stocks follow the NYSE session (when respected); crypto is always open."""
        if not self.config.respect_market_hours:
            return Markets(stocks=True)
        try:
            return Markets(stocks=bool(self.broker.is_market_open()))
        except Exception as exc:  # noqa: BLE001 - an unknown clock means do not trade stocks
            log.warning("market clock unavailable (%s); treating the stock market as closed", exc)
            return Markets(stocks=False)

    def _any_open(self, markets: Markets) -> bool:
        """Whether some enabled asset class can trade (held positions of a disabled class still exit)."""
        return (self.config.enable_stocks and markets.stocks) or (self.config.enable_crypto and markets.crypto)

    def _fetch_bars(self, symbols: list[str]) -> dict[str, list[Bar]]:
        out: dict[str, list[Bar]] = {}
        for sym in symbols:
            self._check_stop()
            try:
                out[sym] = self.data.get_bars(sym, self._interval_for(sym), self.config.lookback_bars)
            except Exception as exc:  # noqa: BLE001 - one bad feed must not stop the cycle
                log.warning("bars for %s failed: %s", sym, exc)
                out[sym] = []
        return out

    def tick(self) -> dict[str, Any]:
        """Run one cycle: refresh data, manage exits, open entries, record equity; returns a summary.

        Bars, prices, the account and cash activity are read outside the engine lock, so a slow
        feed or broker never blocks the dashboard or the operator controls.
        """
        with self._tick_lock:
            now = self._clock()
            self.data.refresh()
            markets = self._check_markets()
            with self._lock:
                applied = self._apply_requests(now)  # controls queued while the last cycle was busy
                self._poll_pending(now)
                universe = self._active_universe()
                ledger = set(self._ledger)
                version = self._account_version
            held = self._held_symbols(ledger)
            bars = self._fetch_bars(list(dict.fromkeys([*universe, *held])))
            prices = self._fetch_prices([s for s in held if not bars.get(s)])
            account = self.broker.get_account()  # paper marks come from the feed's warmed cache
            flows = self._read_cash_flows(now)
            forecasts = self._forecast_all(bars, now)
            self._check_stop()
            with self._lock:
                if self._account_version != version:  # an order or fund change landed meanwhile
                    account = self.broker.get_account()
                self._reconcile_ledger(account)
                self._absorb_cash_flows(flows)
                return self._cycle(now, markets, bars, forecasts, account, prices, applied)

    def _check_stop(self) -> None:
        if self._stop_event is not None and self._stop_event.is_set():
            raise EngineStopped("stop requested")

    def _held_symbols(self, ledger: set[str]) -> list[str]:
        """Symbols of the long positions the bot manages, from the broker's positions."""
        held = [s for s, p in self.broker.get_positions().items() if p.qty > EPS]
        return held if self._full_account else [s for s in held if s in ledger]

    def _fetch_prices(self, symbols: list[str]) -> dict[str, float]:
        """Latest prices for held symbols that returned no bars (feeds cache misses for the tick)."""
        out: dict[str, float] = {}
        for sym in symbols:
            self._check_stop()
            try:
                price = self.data.get_price(sym)
            except Exception as exc:  # noqa: BLE001 - a bad feed must not stop the cycle
                log.warning("price for %s failed: %s", sym, exc)
                continue
            if _finite_positive(price):
                out[sym] = float(price)  # type: ignore[arg-type]
        return out

    def _interrupt_block(self) -> str | None:
        """Why a running cycle must stop placing orders now (shutdown or a queued control), if so."""
        if self._stop_event is not None and self._stop_event.is_set():
            return "shutting down"
        with self._requests_lock:
            liquidating = any(action in INTERRUPTING_CONTROLS for action, _ in self._requests)
        return "operator liquidation pending" if liquidating else None

    def _predict(self, symbol: str, bars: list[Bar], now: float) -> Forecast | None:
        """Forecast for ``symbol`` (None when disabled, too little data, or the model fails)."""
        if not self.config.forecast.enabled or not bars:
            return None
        try:
            return self.forecaster.predict(symbol, bars, now=now)
        except Exception as exc:  # noqa: BLE001 - a bad series must not stop the cycle
            log.warning("forecast failed for %s: %s", symbol, exc)
            return None

    def _forecast_all(self, bars: dict[str, list[Bar]], now: float) -> dict[str, Forecast]:
        """Forecasts for every symbol with enough bars (pure computation, run outside the engine lock)."""
        out: dict[str, Forecast] = {}
        for sym, series in bars.items():
            if (fc := self._predict(sym, series, now)) is not None:
                out[sym] = fc
        return out

    def _evaluate(self, bars: dict[str, list[Bar]],
                  forecasts: dict[str, Forecast] | None = None, now: float | None = None) -> dict[str, Signal]:
        """Signals per symbol; forecasts feed the strategy only when ``forecast.use_in_strategy``.

        ``now`` is passed on only for feeds whose newest bar can still be forming.
        """
        use = self.config.forecast.use_in_strategy and forecasts is not None
        forming = getattr(self.data, "last_bar_forming", None)
        signals: dict[str, Signal] = {}
        for sym, series in bars.items():
            try:
                fc = forecasts.get(sym) if use and forecasts is not None else None
                at = now if now is not None and forming is not None and forming(sym) else None
                sig = self.strategy_for(sym).evaluate(sym, series, fc, at)
            except Exception as exc:  # noqa: BLE001 - skip the symbol, keep trading the rest
                log.warning("strategy failed for %s: %s", sym, exc)
                continue
            if sig is not None:
                signals[sym] = sig
        return signals

    def _note_markets(self, markets: Markets, any_open: bool) -> None:
        """Log stock-session transitions once each (crypto never closes)."""
        if (self.config.respect_market_hours and self.config.enable_stocks
                and markets.stocks != self._stocks_open):
            if markets.stocks:
                text = "stock market open: trading stocks"
            elif self.config.enable_crypto:
                text = "stock market closed: stocks monitoring only; crypto keeps trading 24/7"
            else:
                text = "market closed: monitoring only"
            self._event("info", text)
        self._stocks_open, self._market_open = markets.stocks, any_open

    def _cycle(self, now: float, markets: Markets, bars: dict[str, list[Bar]],
               forecasts: dict[str, Forecast], account: Account, prices: dict[str, float],
               early: list[Order]) -> dict[str, Any]:
        self._forecasts = dict(forecasts)
        self._bars = {sym: series for sym, series in bars.items() if series}
        managed = self._managed_positions(account)
        for sym, series in bars.items():
            if series and _finite_positive(series[-1].close):
                self._prices[sym] = series[-1].close
        self._prices.update(prices)

        signals = self._evaluate(bars, self._forecasts, now)
        self._signals = signals
        with_data = sum(1 for series in bars.values() if series)
        if bool(with_data) != self._data_ok and bars:
            self._data_ok = bool(with_data)
            self._event("info" if with_data else "error",
                        "market data restored" if with_data
                        else f"no market data for any of {len(bars)} symbols; no new signals until it returns")

        priced = {s: self._prices[s] for s in managed if s in self._prices}
        self.risk.update_marks(managed, priced)

        any_open = self._any_open(markets)
        self._note_markets(markets, any_open)

        self._roll_day(now, self._bot_equity(account, managed))
        orders: list[Order] = list(early)
        block: str | None = None
        traded = any_open or any(markets.allows(s) for s in managed)
        if traded:
            traded_orders, block = self._trade(now, account, managed, signals, priced, bars, markets)
            orders += traded_orders
        applied = self._apply_requests(now)  # controls queued while this cycle was busy
        orders += applied
        if traded or applied:
            account = self.broker.get_account()
            managed = self._managed_positions(account)
        if not any_open:
            block = "market closed"
        if block != self._entry_block and block not in (None, "market closed"):
            self._event("info", f"new entries blocked: {block}")
        self._entry_block = block

        self._account, self._managed = account, managed
        equity = self._bot_equity(account, managed)
        allocation = self.allocation()
        self.store.record_equity(now, equity, self._bot_cash(account), allocation)
        self.last_tick_ts = now
        self.tick_count += 1
        return to_dict({
            "ts": now,
            "status": self._status(),
            "market_open": any_open,
            "markets": self._markets_dict(markets),
            "symbols": len(bars),
            "symbols_with_data": with_data,
            "signals": len(signals),
            "forecasts": len(self._forecasts),
            "top_signals": [{"symbol": s.symbol, "score": round(s.score, 4), "asset_class": asset_class(s.symbol)}
                            for s in rank(list(signals.values()))[:5]],
            "orders": [self._order_brief(o) for o in orders],
            "entry_block": block,
            "equity": equity,
            "cash": self._bot_cash(account),
            "allocation": allocation,
            "positions": len(managed),
            "exposure": self._exposure(managed, equity),
        })

    def _trade(self, now: float, account: Account, managed: dict[str, Position], signals: dict[str, Signal],
               priced: dict[str, float], bars: dict[str, list[Bar]],
               markets: Markets) -> tuple[list[Order], str | None]:
        """Exits first (protective, then signal), then ranked entries, each only where its market is open.

        Returns the orders and any account-wide entry block.
        """
        orders: list[Order] = []
        busy = self._pending_symbols()
        exited: set[str] = set()
        tradable = {s: p for s, p in managed.items() if markets.allows(s)}

        for sym, reason in self.risk.check_exits(tradable, priced):
            if (why := self._interrupt_block()) is not None:
                return orders, why
            if sym in busy or sym in exited:
                continue
            if (order := self._sell(tradable[sym], reason, now)) is not None:
                orders.append(order)
                exited.add(sym)

        for sym, reason in self._forced_sells(tradable, managed, busy).items():
            if sym not in exited and (order := self._sell(tradable[sym], f"liquidate: {reason}", now)) is not None:
                orders.append(order)
                exited.add(sym)

        if not self._paused:
            for sym, pos in tradable.items():
                if (why := self._interrupt_block()) is not None:
                    return orders, why
                sig = signals.get(sym)
                if self._paused or sym in busy or sym in exited or sig is None:
                    continue
                if sig.score <= self.strategy_for(sym).cfg.exit_threshold:
                    reason = f"signal exit {sig.score:+.2f}: {sig.reason}"
                    if (order := self._sell(pos, reason, now)) is not None:
                        orders.append(order)
                        exited.add(sym)

        if exited:  # filled sells are now realized in allocation(): value the rest from the same state
            account = self.broker.get_account()
            managed = self._managed_positions(account)
        equity = self._bot_equity(account, managed)
        ok, why = self.risk.can_open(equity, now)
        if not ok and self.risk.liquidating:  # drawdown kill switch or operator kill
            self._cancel_pending_buys(why)
            remaining = {s: p for s, p in tradable.items() if s not in exited and s not in busy}
            if remaining:
                self._event("error", f"kill switch: {why}; liquidating")
                orders.extend(o for o in (self._sell(p, f"kill switch: {why}", now)
                                          for p in remaining.values()) if o is not None)
        if self._paused:
            return orders, "paused"
        if not ok:
            return orders, why
        if not self._any_open(markets):
            return orders, None
        entries, block = self._enter(now, managed, signals, bars, markets, equity, busy | exited)
        return orders + entries, block

    def _enter(self, now: float, managed: dict[str, Position], signals: dict[str, Signal],
               bars: dict[str, list[Bar]], markets: Markets, equity: float,
               skip: set[str]) -> tuple[list[Order], str | None]:
        """Open new positions in score order across both asset classes; returns orders and any entry block."""
        block: str | None = None
        account = self.broker.get_account()
        cash = account.cash
        deployable = self.deployable_cash(account)
        held = self._managed_positions(account)
        new_buys = {p.symbol for p in self._pending.values() if p.side == "buy" and p.symbol not in managed}
        # a buy whose submit timed out may have been accepted: it counts toward the cap too
        new_buys |= {u.symbol for u in self._unresolved.values() if u.side == "buy" and u.symbol not in managed}
        counts = {"stock": 0, "crypto": 0}
        for sym in [*held, *new_buys]:
            counts[asset_class(sym)] += 1
        crypto_exposure = self._exposure(held, equity)["crypto"] + self._pending_buy_reserve(crypto_only=True)
        universe = set(self._active_universe())
        full: set[str] = set()
        orders: list[Order] = []
        for sig in rank(list(signals.values())):
            if (why := self._interrupt_block()) is not None or self._paused:
                block = why or "paused"
                break
            sym = sig.symbol
            cls = asset_class(sym)
            if sig.score < self.strategy_for(sym).cfg.entry_threshold or cls in full:
                continue
            if (sym not in universe or sym in managed or sym in skip or sym in self._liquidations
                    or not markets.allows(sym)):
                continue
            cap = self.risk.max_positions_for(sym)
            if counts[cls] >= cap:
                full.add(cls)
                continue
            if self.risk.in_cooldown(sym, now):
                continue
            ok, why = self.risk.can_open(equity, now)
            if not ok:
                block = why
                break
            qty = self.risk.size_entry(sig, cash, deployable, equity, counts[cls], self._fractional_for(sym),
                                       bars=bars.get(sym), crypto_exposure=crypto_exposure)
            if qty <= 0:
                continue
            order = self._submit(sym, "buy", qty, f"entry {sig.score:+.2f}: {sig.reason}", now)
            if order is None:
                continue
            orders.append(order)
            if order.status != "rejected":
                spent = order.qty * sig.price
                cash -= spent
                deployable -= spent
                counts[cls] += 1
                if cls == "crypto":
                    crypto_exposure += spent
                skip.add(sym)
        if full and block is None and len(full) == self._enabled_classes():
            block = "max positions reached (" + ", ".join(f"{c} {self._class_cap(c)}" for c in sorted(full)) + ")"
        return orders, block

    def _fractional_for(self, symbol: str) -> bool:
        return True if _is_crypto(symbol) else self.config.fractional

    def _enabled_classes(self) -> int:
        return int(self.config.enable_stocks) + int(self.config.enable_crypto)

    def _class_cap(self, cls: str) -> int:
        return self.config.crypto_risk.max_positions if cls == "crypto" else self.config.risk.max_positions

    @staticmethod
    def _order_brief(order: Order) -> dict[str, Any]:
        return {"id": order.id, "symbol": order.symbol, "asset_class": asset_class(order.symbol),
                "side": order.side, "qty": order.qty, "status": order.status, "filled_qty": order.filled_qty,
                "price": order.filled_avg_price, "reason": order.reason}

    def _roll_day(self, now: float, equity: float) -> None:
        day = trading_day(now)
        rec = self.store.get_kv(KV_DAY)
        if not isinstance(rec, dict) or rec.get("day") != day:
            self.store.set_kv(KV_DAY, {"day": day, "equity": equity})

    def run_forever(self, stop: threading.Event) -> None:
        """Tick every ``poll_seconds`` until ``stop`` is set; tick errors are logged, never fatal."""
        with self._lock:
            n_stocks, n_crypto = len(self._stocks), len(self._crypto)
        classes = [f"{n_stocks} stocks"] if self.config.enable_stocks else []
        classes += [f"{n_crypto} crypto pairs"] if self.config.enable_crypto else []
        self._event("info", f"engine started: {self.config.mode} via {self.broker.name}, "
                            f"{' + '.join(classes)}, every {self.config.poll_seconds}s")
        self._stop_event = stop
        while not stop.is_set():
            started = time.time()
            with self._lock:
                self.next_tick_ts = None
            try:
                self.tick()
            except EngineStopped:
                break
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                log.exception("tick failed")
                try:
                    self.store.log_event("error", f"tick failed: {exc}")
                except Exception:  # noqa: BLE001 - store may be closing
                    pass
            with self._lock:
                self.next_tick_ts = started + self.config.poll_seconds
            stop.wait(max(0.0, started + self.config.poll_seconds - time.time()))
        log.info("engine stopped")

    # ------------------------------------------------------------------ operator controls

    def _refresh_cache(self) -> None:
        account = self.broker.get_account()
        self._account, self._managed = account, self._managed_positions(account)

    @contextlib.contextmanager
    def _locked(self, what: str) -> Iterator[None]:
        """Hold the engine lock, or raise EngineBusy after ``CONTROL_WAIT_SECONDS`` of a busy cycle."""
        if not self._lock.acquire(timeout=CONTROL_WAIT_SECONDS):
            raise EngineBusy(f"a trading cycle is busy; {what} was not applied, try again shortly")
        try:
            yield
        finally:
            self._lock.release()

    def _control(self, action: str, reason: str) -> list[Order]:
        """Run an operator control now, or queue it if a cycle holds the lock past ``CONTROL_WAIT_SECONDS``.

        Controls queued earlier run first, so they always apply in the order they were given.
        Returns the orders placed (none when queued).
        """
        if not self._lock.acquire(timeout=CONTROL_WAIT_SECONDS):
            with self._requests_lock:
                self._requests.append((action, reason))
            self._event("warn", f"{action} queued: a trading cycle is busy; it runs before that cycle "
                                "places another order")
            return []
        try:
            now = self._clock()
            return self._apply_requests(now) + self._run_control(action, reason, now)
        finally:
            self._lock.release()

    def _apply_requests(self, now: float) -> list[Order]:
        """Run the controls queued while a cycle was busy, in order (call with the lock held)."""
        with self._requests_lock:
            requests, self._requests = self._requests, []
        orders: list[Order] = []
        for action, reason in requests:
            orders += self._run_control(action, reason, now)
        return orders

    def _run_control(self, action: str, reason: str, now: float) -> list[Order]:
        """Apply one operator control (lock held); returns any orders it placed."""
        if action == "pause":
            self._paused = True
            self.store.set_kv(KV_PAUSED, True)
            self._event("warn", "paused by operator (protective stops remain active)")
        elif action == "resume":
            self._paused = False
            self.store.set_kv(KV_PAUSED, False)
            if self.risk.liquidating and self._liquidations:
                self._liquidations.clear()  # resuming after a kill cancels its deferred sales
                self._save_liquidations()
            if self.risk.halted:
                self.risk.clear_halt()
            self._submit_errors = 0
            self._event("info", "resumed by operator")
        elif action == "kill":
            self.risk.halt(f"kill switch: {reason}", HALT_KILL)
            self._event("error", f"kill switch engaged: {reason}")
            return self._liquidate(reason, now)
        elif action == "liquidate":
            return self._liquidate(reason, now)
        else:
            raise ValueError(f"unknown control {action!r}")
        return []

    def pause(self) -> None:
        """Stop opening positions and signal exits; protective stops stay active.

        Takes effect at once, even while a cycle is placing orders.
        """
        self._paused = True
        self._control("pause", "")

    def resume(self) -> None:
        """Resume trading and clear any halt, including the kill switch."""
        self._control("resume", "")

    def _liquidate(self, reason: str, now: float) -> list[Order]:
        self._poll_pending(now)
        markets = self._check_markets()
        buys = self._cancel_pending_buys(reason)
        account = self.broker.get_account()
        busy = self._pending_symbols()
        managed = self._managed_positions(account)
        now_sell = {s: p for s, p in managed.items() if s not in busy and markets.allows(s)}
        deferred = sorted((set(managed) - set(now_sell)) | set(buys))
        orders = [o for o in (self._sell(p, f"liquidate: {reason}", now) for p in now_sell.values())
                  if o is not None]
        if deferred:
            self._defer_liquidation(deferred, reason)
        text = f"liquidation ({reason}): {len(orders)} sell order(s)"
        if deferred:
            text += (f"; deferred until their market opens or open orders settle: {', '.join(deferred)}")
        self._event("warn", text)
        self._refresh_cache()
        return orders

    def liquidate(self, reason: str = "operator liquidation") -> list[dict[str, Any]]:
        """Sell every managed position at market; returns the submitted orders.

        Open buys are cancelled. Positions whose market is closed, or that have an order in
        flight, are deferred and sold on the first tick where they can trade (as are any
        cancelled buys that filled first). While a cycle is busy the liquidation is queued and
        runs before that cycle places another order (the result is then empty).
        """
        return [self._order_brief(o) for o in self._control("liquidate", reason)]

    def kill(self, reason: str = "operator kill switch") -> list[dict[str, Any]]:
        """Halt new entries and liquidate everything; keeps liquidating every tick until resume.

        The halt takes effect at once, even while a cycle is placing orders.
        """
        self.risk.halt(f"kill switch: {reason}", HALT_KILL)
        return [self._order_brief(o) for o in self._control("kill", reason)]

    def adjust_fund(self, delta: float) -> float:
        """Deposit (+) or withdraw (-) from the bot's allocation; sim also moves paper cash. Returns the new allocation."""
        if isinstance(delta, bool) or not isinstance(delta, (int, float)) or not math.isfinite(delta) or delta == 0:
            raise ValueError("delta must be a non-zero finite number")
        delta = float(delta)
        with self._locked("the fund change"):
            if self._full_account and not self._is_paper:
                raise ValueError("full_account scope uses the whole broker balance; deposit or withdraw "
                                 "at the broker instead (transfers there are read from the account "
                                 "activity and are not counted as P&L)")
            account = self.broker.get_account()
            if not self._full_account and self.allocation() + delta < -EPS:
                raise ValueError(f"cannot withdraw {-delta:.2f}: allocation is {self.allocation():.2f}")
            if self._is_paper:
                if delta < 0 and -delta > account.cash + EPS:
                    raise ValueError(f"cannot withdraw {-delta:.2f}: only {account.cash:.2f} paper cash is free")
                try:
                    self.broker.adjust_cash(delta)  # type: ignore[attr-defined]
                except BrokerError as exc:
                    raise ValueError(str(exc)) from exc
            self._account_version += 1
            self.store.set_kv(KV_DEPOSITS, self._net_deposits() + delta)
            self._shift_baselines(delta)
            self._refresh_cache()
            allocation = self.allocation()
            verb = "deposit" if delta > 0 else "withdrawal"
            self._event("info", f"fund {verb} {abs(delta):.2f}; allocation now {allocation:.2f}")
            return allocation

    def set_universe(self, symbols: list[str], asset_class: str | None = None) -> list[str]:
        """Replace the watched symbols; returns the new stock list followed by the crypto list.

        Accepts stock tickers ("aapl", "BRK.B") and crypto pairs ("BTC-USD", "btc/usd", "BTCUSD").
        With ``asset_class`` None the list replaces both classes; with "stock" or "crypto" it
        replaces only that class (an empty list then clears it). Raises ValueError on invalid,
        ambiguous or disabled-class symbols, or if no enabled symbol would remain.
        """
        if not isinstance(symbols, (list, tuple)):
            raise ValueError("symbols must be a list of tickers or crypto pairs")
        if asset_class is not None and asset_class not in UNIVERSE_CLASSES:
            raise ValueError(f"asset_class must be one of {sorted(UNIVERSE_CLASSES)} or omitted")
        clean: list[str] = []
        for raw in symbols:
            if not isinstance(raw, str):
                raise ValueError(f"invalid symbol: {raw!r}")
            try:
                sym = normalize_symbol(raw)
            except ValueError as exc:
                detail = str(exc)
                if detail.startswith("invalid symbol") or detail.startswith("symbol must"):
                    detail = (f"{raw!r} (stocks: letters, '.' or '-', up to 10 characters; "
                              "crypto: BASE-QUOTE with USD, USDT or USDC)")
                raise ValueError(f"invalid ticker or crypto pair: {detail}") from None
            if asset_class is not None and ("crypto" if _is_crypto(sym) else "stock") != asset_class:
                raise ValueError(f"{sym} is not a {asset_class} symbol")
            if sym not in clean:
                clean.append(sym)
        stocks = [s for s in clean if not _is_crypto(s)]
        crypto = [s for s in clean if _is_crypto(s)]
        if stocks and not self.config.enable_stocks:
            raise ValueError("stock trading is disabled (enable_stocks is false)")
        if crypto and not self.config.enable_crypto:
            raise ValueError("crypto trading is disabled (enable_crypto is false)")
        with self._locked("the universe change"):
            if asset_class == "stock":
                crypto = list(self._crypto)
            elif asset_class == "crypto":
                stocks = list(self._stocks)
            active = (stocks if self.config.enable_stocks else []) + (crypto if self.config.enable_crypto else [])
            if not active:
                raise ValueError("universe must contain at least one ticker or crypto pair")
            if len(stocks) + len(crypto) > MAX_UNIVERSE:
                raise ValueError(f"universe is limited to {MAX_UNIVERSE} symbols")
            self._stocks, self._crypto = stocks, crypto
            self.store.set_kv(KV_UNIVERSE, {
                "symbols": stocks, "config": list(self.config.universe),
                "crypto": crypto, "crypto_config": list(self.config.crypto_universe),
            })
            self._event("info", f"universe set to {len(stocks)} stocks and {len(crypto)} crypto pairs: "
                                f"{', '.join(stocks + crypto) or 'none'}")
            return stocks + crypto

    @property
    def universe(self) -> list[str]:
        """The watched stock tickers (mirrors ``Config.universe``)."""
        with self._lock:
            return list(self._stocks)

    @property
    def crypto_universe(self) -> list[str]:
        """The watched crypto pairs (mirrors ``Config.crypto_universe``)."""
        with self._lock:
            return list(self._crypto)

    def active_universe(self) -> list[str]:
        """Symbols scanned for entries: enabled stocks followed by enabled crypto pairs."""
        with self._lock:
            return self._active_universe()

    @property
    def paused(self) -> bool:
        """Whether the operator paused trading."""
        return self._paused

    # ------------------------------------------------------------------ snapshot

    def _status(self) -> str:
        if self.risk.halted:
            return "halted"
        if self._paused:
            return "paused"
        if self._market_open is False:
            return "market_closed"
        return "running"

    def _markets_dict(self, markets: Markets | None) -> dict[str, Any]:
        stocks_open = markets.stocks if markets else self._stocks_open
        return {
            "stocks": {"open": stocks_open, "enabled": self.config.enable_stocks,
                       "respect_hours": self.config.respect_market_hours},
            "crypto": {"open": True, "enabled": self.config.enable_crypto},
        }

    def _position_row(self, sym: str, pos: Position) -> dict[str, Any]:
        price = self._price_of(sym, pos)
        levels = self.risk.levels(pos)
        return {
            "symbol": sym, "asset_class": asset_class(sym), "qty": pos.qty, "avg_price": pos.avg_price,
            "price": price, "market_value": pos.market_value(price), "unrealized_pnl": pos.unrealized_pnl(price),
            "unrealized_pct": (price / pos.avg_price - 1.0) if pos.avg_price > 0 else None,
            "stop": levels["stop"], "target": levels["target"], "trail": levels["trail"],
            "high_water": levels["high_water"], "opened_ts": pos.opened_ts,
        }

    def snapshot(self) -> dict[str, Any]:
        """JSON-safe dashboard state.

        If a cycle holds the lock past ``SNAPSHOT_WAIT_SECONDS`` the last snapshot is served with
        ``busy: true`` and the current status, pause and halt flags.
        """
        if not self._lock.acquire(timeout=SNAPSHOT_WAIT_SECONDS):
            cached = self._last_snapshot
            if cached is not None:
                return self._busy_snapshot(cached)
            self._lock.acquire()
        try:
            snap = self._build_snapshot()
            self._last_snapshot = snap
            return snap
        finally:
            self._lock.release()

    def _busy_snapshot(self, cached: dict[str, Any]) -> dict[str, Any]:
        """``cached`` refreshed with the flags that change without the engine lock."""
        with self._requests_lock:
            queued = [action for action, _ in self._requests]
        risk_status = self.risk.status()
        return to_dict({**cached, "ts": time.time(), "busy": True, "queued_controls": queued,
                        "status": self._status(), "paused": self._paused,
                        "halt_reason": risk_status.get("halt_reason") or None,
                        "liquidating": self.risk.liquidating, "risk": risk_status})

    def _build_snapshot(self) -> dict[str, Any]:
        with self._lock:
            if self._account is None:
                try:
                    self._refresh_cache()
                except Exception as exc:  # noqa: BLE001 - show what we can
                    log.warning("snapshot could not reach broker: %s", exc)
            account = self._account
            managed = self._managed
            risk_status = self.risk.status()
            positions = [self._position_row(sym, pos) for sym, pos in sorted(managed.items())]
            unrealized = sum(p["unrealized_pnl"] for p in positions)
            realized = self.store.realized_pnl_total()
            equity = self._bot_equity(account, managed) if account else None
            day = self.store.get_kv(KV_DAY)
            today = (equity - float(day["equity"])) if equity is not None and isinstance(day, dict) else 0.0
            signals = [{**to_dict(s), "asset_class": asset_class(s.symbol),
                        "forecast": forecast_brief(self._forecasts.get(s.symbol))}
                       for s in rank(list(self._signals.values()))[:SNAPSHOT_SIGNALS]]
            allocation = self.allocation() if account or not self._full_account else None
            exposure = {**self._exposure(managed, equity),
                        "crypto_limit_pct": self.config.crypto_risk.max_crypto_exposure_pct}
            return to_dict({
                "version": __version__,
                "ts": time.time(),
                "busy": False,
                "queued_controls": [],
                "status": self._status(),
                "paused": self._paused,
                "halt_reason": risk_status.get("halt_reason") or None,
                "mode": self.config.mode,
                "is_live": bool(self.broker.is_live),
                "broker": self.broker.name,
                "fund_scope": self.config.fund_scope,
                "account": ({"cash": account.cash, "equity": account.equity,
                             "buying_power": account.buying_power} if account else None),
                "allocation": allocation,
                "net_deposits": self._net_deposits(),
                "bot": {
                    "equity": equity,
                    "cash": self._bot_cash(account) if account else None,
                    "deployable": self.deployable_cash(account) if account else None,
                },
                "pnl": {"today": today, "realized_total": realized, "unrealized": unrealized,
                        "total": realized + unrealized},
                "positions": positions,
                "signals": signals,
                "universe": list(self._stocks),
                "crypto_universe": list(self._crypto),
                "active_universe": self._active_universe(),
                "markets": self._markets_dict(None),
                "exposure": exposure,
                "limits": {
                    "stocks": {"max_positions": self.config.risk.max_positions,
                               "entry_threshold": self.strategy.cfg.entry_threshold,
                               "exit_threshold": self.strategy.cfg.exit_threshold},
                    "crypto": {"max_positions": self.config.crypto_risk.max_positions,
                               "entry_threshold": self.crypto_strategy.cfg.entry_threshold,
                               "exit_threshold": self.crypto_strategy.cfg.exit_threshold,
                               "max_exposure_pct": self.config.crypto_risk.max_crypto_exposure_pct},
                },
                "risk": risk_status,
                "forecast": {"enabled": self.config.forecast.enabled,
                             "horizon_bars": self.config.forecast.horizon_bars,
                             "use_in_strategy": self.config.forecast.use_in_strategy},
                "entry_block": self._entry_block,
                "market_open": self._market_open,
                "respect_market_hours": self.config.respect_market_hours,
                "pending_orders": len(self._pending),
                "unresolved_orders": len(self._unresolved),
                "liquidating": self.risk.liquidating,
                "deferred_liquidations": sorted(self._liquidations),
                "poll_seconds": self.config.poll_seconds,
                "tick_count": self.tick_count,
                "last_tick_ts": self.last_tick_ts,
                "next_tick_ts": self.next_tick_ts,
            })

    # ------------------------------------------------------------------ chart

    def chart(self, symbol: str, bars: int = CHART_DEFAULT_BARS) -> dict[str, Any]:
        """Recent bars, the price forecast and any managed position for one symbol (JSON-safe).

        ``symbol`` is normalized like the universe editor ("btc/usd" -> "BTC-USD"); an invalid one
        raises ValueError. Symbols seen on the last tick reuse its bars and cached forecast; others
        (or requests longer than ``lookback_bars``) are fetched on demand from the data feed.
        Returns ``{"error": ...}`` when the feed has no bars for the symbol.
        """
        sym = normalize_symbol(symbol)
        n = clamp_chart_bars(bars)
        with self._lock:
            series = self._bars.get(sym)
            forecast = self._forecasts.get(sym)
        if not series or n > self.config.lookback_bars:
            try:
                series = self.data.get_bars(sym, self._interval_for(sym), max(n, self.config.lookback_bars))
            except Exception as exc:  # noqa: BLE001 - a feed failure means "no data" for the chart
                log.warning("chart bars for %s failed: %s", sym, exc)
                series = []
            forecast = self._predict(sym, series, self._clock())
        series = [b for b in series if _finite_positive(b.close)]
        if not series:
            return {"error": f"no market data for {sym}"}
        with self._lock:
            pos = self._managed.get(sym)
            position: dict[str, float] | None = None
            if pos is not None:
                lv = self.risk.levels(pos)
                position = {"qty": pos.qty, "avg_price": pos.avg_price,
                            "stop": lv["stop"], "target": lv["target"], "trail": lv["trail"]}
        return to_dict({
            "symbol": sym,
            "asset_class": asset_class(sym),
            "interval": self._interval_for(sym),
            "bars": [asdict(b) for b in series[-n:]],
            "forecast": forecast_payload(forecast),
            "position": position,
        })
