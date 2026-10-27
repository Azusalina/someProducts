import copy
import math
import os
import threading
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN

from .broker import BrokerError, PublicFeed, TOKENS, demo_market, timestamp
from .dex import BaseDex
from .config import DEFAULTS, validate

TERMINAL = {"filled", "canceled", "expired", "rejected", "replaced"}


def dec(value):
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("Non-finite monetary value.")
    return result


def utc():
    return datetime.now(timezone.utc).isoformat()


def fresh_state():
    return {"config": validate(DEFAULTS), "cash": "1000", "positions": {}, "orders": [],
            "events": [], "history": [], "quotes": {}, "account": None, "account_id": None,
            "tick": 30, "running": False, "halt": None, "high": 1000.0,
            "day": None, "day_equity": 1000.0, "last_scan": None, "market_open": False,
            "next_open": None, "realized": "0", "fees": "0", "initialized": False, "closing": False}


class Engine:
    def __init__(self, store, mode="demo", broker=None):
        if mode not in {"demo", "paper", "live"}:
            raise ValueError("Invalid mode")
        self.store, self.mode = store, mode
        self.broker = broker if broker is not None else (None if mode == "demo" else BaseDex() if mode == "live" else PublicFeed())
        self.lock = threading.RLock()
        self.stop_requested = threading.Event()
        self.s = store.load(mode) or fresh_state()
        self.s["config"] = validate(self.s["config"])
        if self.mode == "live":
            self.broker.orders = self.s["orders"]
        self.s["running"] = False
        self.s["closing"] = False
        self.public = {}
        self.event("info", "Server started. Automation is paused until you start it.")
        self.save()

    def event(self, level, message):
        self.s["events"].append({"time": utc(), "level": level, "message": message})
        self.s["events"] = self.s["events"][-400:]

    def equity(self):
        return float(dec(self.s["cash"]) + sum(
            dec(p["qty"]) * dec(self.s["quotes"].get(sym, {}).get("price", p["avg"]))
            for sym, p in self.s["positions"].items()))

    def save(self):
        self.store.save(self.mode, self.s)
        self.publish()

    def publish(self):
        s = copy.deepcopy(self.s)
        equity = self.equity()
        positions = []
        for symbol, position in s["positions"].items():
            price = s["quotes"].get(symbol, {}).get("price")
            qty, avg = float(position["qty"]), float(position["avg"])
            positions.append({"symbol": symbol, "qty": qty, "avg": avg, "price": price,
                "value": qty * price if price else None,
                "pnl": qty * (price - avg) if price else None,
                "pnl_pct": (price / avg - 1) * 100 if price else None})
        for q in s["quotes"].values():
            q.pop("closes", None)
        self.public = {**s, "mode": self.mode, "positions": positions, "equity": equity,
            "cash": float(s["cash"]), "realized": float(s["realized"]), "fees": float(s["fees"]),
            "pnl": equity - s["config"]["capital"],
            "drawdown": max(0, (1 - equity / s["high"]) * 100),
            "day_pnl": equity - s["day_equity"],
            "orders_today": sum(o["day"] == self.day() for o in s["orders"]),
            "orders": list(reversed(s["orders"][-100:])), "events": list(reversed(s["events"][-100:])),
            "connected": self.mode != "live" or self.broker.connected,
            "live_unlocked": os.environ.get("AUTOTRADE_ALLOW_LIVE") == "YES",
            "broker_host": self.broker.base if self.broker else None,
            "wallet_address": s["account_id"] if self.mode == "live" else None,
            "gas_eth": sum(float(o.get("gas_eth", 0)) for o in s["orders"]),
            "account_id": None, "history": s["history"][-3000:]}
        if self.public["account"]:
            self.public["account"]["id"] = "…" + str(self.public["account"]["id"])[-6:]

    def snapshot(self):
        return copy.deepcopy(self.public)

    def day(self):
        return datetime.now(timezone.utc).date().isoformat()

    def unresolved(self):
        return [o for o in self.s["orders"] if o["status"] not in TERMINAL]

    def apply_fill(self, order, qty, price, fee=0):
        """Apply a newly observed fill delta exactly once, using decimal arithmetic."""
        qty, price, fee = dec(qty), dec(price), dec(fee)
        if qty <= 0 or price <= 0 or fee < 0:
            raise BrokerError("Invalid fill received.")
        symbol, side = order["symbol"], order["side"]
        position = self.s["positions"].get(symbol, {"qty": "0", "avg": "0"})
        old_qty, avg = dec(position["qty"]), dec(position["avg"])
        money = qty * price
        if side == "buy":
            avg = (old_qty * avg + money) / (old_qty + qty)
            self.s["cash"] = str(dec(self.s["cash"]) - money - fee)
            self.s["realized"] = str(dec(self.s["realized"]) - fee)
            self.s["positions"][symbol] = {"qty": str(old_qty + qty), "avg": str(avg)}
        else:
            if qty > old_qty:
                raise BrokerError("Sell fill exceeds the app's recorded holding. Reconcile in the wallet or block explorer.")
            self.s["cash"] = str(dec(self.s["cash"]) + money - fee)
            self.s["realized"] = str(dec(self.s["realized"]) + qty * (price - avg) - fee)
            if old_qty == qty:
                self.s["positions"].pop(symbol, None)
            else:
                self.s["positions"][symbol]["qty"] = str(old_qty - qty)
        self.s["fees"] = str(dec(self.s["fees"]) + fee)

    def update_order(self, order, remote):
        if not isinstance(remote, dict) or not isinstance(remote.get("id"), str) or not isinstance(remote.get("status"), str):
            raise BrokerError("Malformed broker order response; reconciliation required.")
        qty = dec(remote.get("filled_qty") or 0)
        previous_qty = dec(order.get("filled_qty", 0))
        avg = dec(remote.get("filled_avg_price") or 0)
        if qty < 0 or (qty > 0 and avg <= 0):
            raise BrokerError("Invalid broker fill quantities or prices.")
        total = qty * avg
        previous_total = dec(order.get("filled_total", 0))
        if qty < previous_qty or total < previous_total:
            raise BrokerError("Broker fill history moved backwards; manual reconciliation required.")
        if qty > previous_qty:
            self.apply_fill(order, qty - previous_qty, (total - previous_total) / (qty - previous_qty))
        order.update({"filled_qty": str(qty), "filled_total": str(total),
                      "fill_price": float(avg) if qty else None, "status": remote["status"],
                      "broker_id": remote["id"]})
        for key in ("gas_eth", "block_number", "block_hash"):
            if key in remote:
                order[key] = remote[key]

    def reconcile(self):
        account = self.broker.account()
        if self.s["account_id"] and self.s["account_id"] != account["id"]:
            raise BrokerError("The trading wallet changed. Use a separate data directory for each account.")
        self.s["account_id"] = account["id"]
        self.s["account"] = account
        for order in self.s["orders"]:
            if order.get("block_hash") and not order.get("finalized"):
                order["finalized"] = self.broker.verify_receipt(order)
        for order in self.unresolved():
            remote = self.broker.order(order["client_id"])
            if remote:
                self.update_order(order, remote)
                self.save()
            else:
                # A 404 after a failed POST does not prove an order cannot appear later.
                order["status"] = "unknown"
        remote_open = self.broker.open_orders()
        known = {o["client_id"] for o in self.s["orders"]}
        if any(o.get("client_order_id") not in known for o in remote_open):
            raise BrokerError("This wallet has transactions outside the app. Use a dedicated wallet.")
        if self.unresolved():
            return
        remote_positions = {p["symbol"]: dec(p["qty"]) for p in self.broker.positions()}
        local_positions = {s: dec(p["qty"]) for s, p in self.s["positions"].items()}
        if set(remote_positions) != set(local_positions) or any(
                abs(q - local_positions.get(s, 0)) > Decimal("0.000000000000000001") for s, q in remote_positions.items()):
            raise BrokerError("Wallet token balances differ from the app ledger (outside transfer or trade). Trading stopped; reconcile in the wallet or block explorer.")

    def check_account(self):
        a = self.s["account"]
        if a["status"] != "ACTIVE" or a["blocked"]:
            raise BrokerError("The trading wallet is not available.")
        if not all(math.isfinite(a[k]) for k in ("cash", "equity")):
            raise BrokerError("Invalid account balance.")

    def configure(self, changes):
        with self.lock:
            if self.s["running"] or self.s.get("closing") or self.unresolved():
                raise ValueError("Pause automation and resolve pending orders before editing settings.")
            cfg = validate({**self.s["config"], **changes})
            if cfg["capital"] != self.s["config"]["capital"]:
                if self.s["initialized"] or self.s["orders"] or self.s["positions"]:
                    raise ValueError("Capital is fixed after the first start. Use a fresh data directory for a new allocation.")
                self.s["cash"] = str(cfg["capital"])
                self.s["high"] = self.s["day_equity"] = cfg["capital"]
                self.s["history"] = []
            self.s["config"] = cfg
            self.event("info", "Strategy and capital settings saved.")
            self.save()

    def start(self, confirmation=""):
        with self.lock:
            if self.s["halt"]:
                raise ValueError("A risk stop is latched. Review it and reset the risk baseline before restarting.")
            if self.mode == "live":
                if os.environ.get("AUTOTRADE_ALLOW_LIVE") != "YES":
                    raise ValueError("Live trading is locked by the server environment.")
                if confirmation != "START LIVE CRYPTO TRADING":
                    raise ValueError("Type START LIVE CRYPTO TRADING to authorize this live strategy and allocation.")
            self.cycle(execute=False)
            if self.mode == "live":
                self.check_account()
                if self.unresolved():
                    raise ValueError("Pending or unknown orders must be resolved before starting.")
                if not self.s["initialized"] and self.s["account"]["cash"] < self.s["config"]["capital"]:
                    raise ValueError("The allocated capital exceeds available wallet USDC.")
                for symbol in self.s["config"]["symbols"]:
                    self.broker.asset(symbol)
            self.s["initialized"] = True
            self.stop_requested.clear()
            self.s["running"] = True
            self.event("info", "Automation started. Entries and exits are authorized within the saved allocation.")
            self.save()

    def pause(self):
        self.stop_requested.set()
        with self.lock:
            self.s["running"] = False
            self.s["closing"] = False
            self.event("warning", "Automation paused. Holdings remain open; automated exits are paused too.")
            self.save()

    def stop_cancel(self):
        self.stop_requested.set()
        with self.lock:
            self.s["running"] = False
            self.s["closing"] = False
            self.save()
            if self.mode == "live":
                self.reconcile()
            self.event("warning", "Automation stopped. Broadcast transactions may still confirm; they are not canceled. Holdings remain in the wallet.")
            self.save()

    def reset_risk(self, confirmation):
        with self.lock:
            if confirmation != "RESET RISK BASELINE" or self.s["running"]:
                raise ValueError("Pause first and type RESET RISK BASELINE.")
            previous = self.s["halt"]
            self.s["halt"] = None
            self.s["high"] = self.s["day_equity"] = self.equity()
            self.s["day"] = self.day()
            self.event("warning", f"Risk baseline explicitly reset at ${self.equity():.2f}. Previous stop: {previous}.")
            self.save()

    def submit(self, symbol, side, reason, notional=None, qty=None):
        if self.stop_requested.is_set():
            return
        if self.mode == "live":
            self.broker.asset(symbol)
            self.check_account()
        if self.stop_requested.is_set():
            return
        order = {"client_id": "cat-" + uuid.uuid4().hex, "time": utc(), "day": self.day(),
                 "symbol": symbol, "side": side, "reason": reason, "status": "submitting",
                 "notional": notional, "qty": str(qty) if qty is not None else None,
                 "filled_qty": "0", "filled_total": "0", "fill_price": None}
        body = {"symbol": symbol, "side": side, "client_order_id": order["client_id"],
                "notional": notional, "qty": str(qty) if qty is not None else None}
        prepared = None
        if self.mode == "live":
            quote = self.s["quotes"][symbol]
            def check_reference():
                age = (datetime.now(timezone.utc) - timestamp(quote["time"])).total_seconds()
                if not quote.get("fresh") or not -5 <= age <= 120:
                    raise BrokerError("Crypto reference price expired during transaction preparation. No transaction was broadcast.")
            check_reference()
            prepared = self.broker.prepare(body, self.s["config"], self.s["quotes"][symbol]["price"])
            check_reference()
            order.update(prepared["metadata"])
            if order["kind"] == "approval":
                order.update(side="approve", reason="Finite token allowance to the fixed Uniswap router")
            used_gas = sum(dec(o.get("gas_eth", o.get("gas_estimate_eth", 0)))
                           for o in self.s["orders"] if o["day"] == self.day())
            if used_gas + dec(order["gas_estimate_eth"]) > dec(self.s["config"]["daily_gas_eth"]):
                raise BrokerError("Daily ETH gas budget would be exceeded. Automation paused.")
            if self.stop_requested.is_set():
                return
        self.s["orders"].append(order)
        self.save()  # Durable nonce and signed hash MUST precede network broadcast.
        if self.stop_requested.is_set():
            order["status"] = "canceled"
            self.save()
            return
        if self.mode != "live":
            price = dec(self.s["quotes"][symbol]["price"]) * (Decimal("1.0005") if side == "buy" else Decimal("0.9995"))
            precision = Decimal(1).scaleb(-TOKENS[symbol]["decimals"])
            quantity = (dec(notional) / price).quantize(precision, rounding=ROUND_DOWN) if side == "buy" else dec(qty)
            fee = quantity * price * Decimal("0.003")
            self.apply_fill(order, quantity, price, fee)
            order.update({"status": "filled", "filled_qty": str(quantity), "filled_total": str(quantity * price),
                          "fill_price": float(price), "fee": float(fee)})
        else:
            try:
                self.update_order(order, self.broker.submit(body, prepared))
            except BrokerError as exc:
                order["status"] = "unknown"
                self.s["running"] = False
                self.event("error", str(exc) + " Automation paused; no automatic resubmission.")
                self.save()
                raise
        self.event("trade", f"{side.upper()} {symbol}: {reason} · {order['status']}")
        self.save()

    def cycle(self, execute=True):
        with self.lock:
            cfg = self.s["config"]
            if self.mode == "live":
                self.reconcile()
            symbols = list(dict.fromkeys(cfg["symbols"] + list(self.s["positions"])))
            if self.mode == "demo":
                self.s["tick"] += 1
                quotes, opened, next_open = demo_market(symbols, self.s["tick"], cfg["slow"])
            else:
                quotes, opened, next_open = self.broker.market(symbols, cfg["slow"])
            self.s["quotes"], self.s["market_open"], self.s["next_open"] = quotes, opened, next_open
            self.s["last_scan"] = utc()
            for symbol, q in quotes.items():
                closes = q.get("closes", [])
                if q.get("error") or len(closes) < cfg["slow"]:
                    q.update(signal="WAIT", reason=q.get("error", "Not enough completed hourly candles"))
                    continue
                q["fast"] = sum(closes[-cfg["fast"]:]) / cfg["fast"]
                q["slow"] = sum(closes[-cfg["slow"]:]) / cfg["slow"]
                if q["fast"] > q["slow"] and q["price"] > q["slow"]:
                    q.update(signal="BUY", reason="Fast average above slow; price above slow")
                else:
                    q.update(signal="WAIT", reason="Trend does not meet entry rules")
                if not q["fresh"]:
                    q.update(signal="STALE", reason="Reference price older than 120s, missing hourly candles, or stale history")
            equity = self.equity()
            self.s["high"] = max(equity, self.s["high"])
            if self.s["day"] != self.day():
                self.s["day"], self.s["day_equity"] = self.day(), equity
                if self.s["halt"] == "Daily loss limit":
                    self.s["halt"] = None
            self.s["history"].append({"t": utc(), "value": round(equity, 4)})
            self.s["history"] = self.s["history"][-5000:]
            self.save()
            if execute and self.s.get("closing"):
                if self.stop_requested.is_set() or self.unresolved():
                    return
                for symbol, position in list(self.s["positions"].items()):
                    if not quotes[symbol].get("fresh"):
                        raise BrokerError("A held token has stale prices; closing stopped.")
                    self.submit(symbol, "sell", "User requested close", qty=position["qty"])
                    if self.unresolved():
                        return
                if not self.s["positions"]:
                    self.s["closing"] = False
                    self.stop_requested.set()
                    self.event("info", "All app positions closed. Automation remains paused.")
                self.s["history"][-1]["value"] = round(self.equity(), 4)
                self.save()
                return
            if not execute or not self.s["running"] or self.stop_requested.is_set():
                return
            if self.mode == "live":
                self.check_account()
            if any(not quotes[s].get("fresh") for s in self.s["positions"]):
                raise BrokerError("A held token has stale or missing prices. Automation paused.")
            day_loss = (1 - equity / self.s["day_equity"]) * 100
            drawdown = (1 - equity / self.s["high"]) * 100
            if day_loss >= cfg["daily_loss_pct"] or drawdown >= cfg["drawdown_pct"]:
                self.s["halt"] = "Daily loss limit" if day_loss >= cfg["daily_loss_pct"] else "Maximum drawdown"
                self.s["running"] = False
                self.event("error", self.s["halt"] + ". Automation stopped; holdings remain open. Review wallet holdings.")
                self.save()
                return
            if not opened or self.unresolved():
                return
            sold = set()
            # Exits precede entries. Order-count cap applies to entries only.
            for symbol, position in list(self.s["positions"].items()):
                q = quotes[symbol]
                change = (q["price"] / float(position["avg"]) - 1) * 100
                reason = ("Stop loss" if change <= -cfg["stop_pct"] else
                          "Take profit" if change >= cfg["take_pct"] else
                          "Trend exit" if q.get("fast") is not None and q["fast"] <= q["slow"] else None)
                if reason:
                    self.submit(symbol, "sell", reason, qty=position["qty"])
                    sold.add(symbol)
                    if self.unresolved():
                        return
            for symbol in cfg["symbols"]:
                q = quotes[symbol]
                if q.get("signal") != "BUY" or symbol in self.s["positions"] or symbol in sold:
                    continue
                if sum(o["day"] == self.day() for o in self.s["orders"]) >= cfg["max_orders_day"]:
                    break
                # One entry per symbol per UTC date prevents minute-by-minute churn.
                if any(o["symbol"] == symbol and o["side"] == "buy" and o["day"] == self.day() for o in self.s["orders"]):
                    continue
                equity = self.equity()
                invested = equity - float(self.s["cash"])
                available = min(float(self.s["cash"]), equity * cfg["invested_pct"] / 100 - invested)
                if self.mode == "live":
                    self.s["account"] = self.broker.account()
                    self.check_account()
                    available = min(available, self.s["account"]["cash"])
                # Reserve 0.5% for modeled fees / market execution differences.
                amount = math.floor(min(equity * cfg["position_pct"] / 100, available) / 1.005 * 100) / 100
                if amount >= max(1, min(25, cfg["capital"] * .01)):
                    self.submit(symbol, "buy", "Hourly trend entry", notional=amount)
                    if self.unresolved():
                        return
            self.s["history"][-1]["value"] = round(self.equity(), 4)
            self.save()

    def safe_cycle(self):
        try:
            self.cycle()
        except Exception as exc:
            with self.lock:
                self.s["running"] = False
                self.s["closing"] = False
                message = str(exc) if isinstance(exc, (ValueError, BrokerError)) else "Unexpected engine error; inspect the local server log."
                self.event("error", message)
                self.save()
            if not isinstance(exc, (ValueError, BrokerError)):
                import traceback
                traceback.print_exc()

    def flatten(self, confirmation):
        self.stop_requested.set()
        with self.lock:
            self.s["running"] = False
            self.save()
            if confirmation != "CLOSE ALL APP POSITIONS":
                raise ValueError("Type CLOSE ALL APP POSITIONS to submit market sells.")
            self.cycle(execute=False)
            if self.unresolved():
                raise ValueError("Resolve or cancel all pending orders before closing holdings.")
            if self.mode == "live":
                self.check_account()
            self.s["closing"] = True
            self.stop_requested.clear()
            self.save()
            self.cycle()
