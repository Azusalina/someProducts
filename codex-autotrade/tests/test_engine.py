import copy
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from autotrade.broker import BrokerError, demo_market
from autotrade.config import validate
from autotrade.engine import Engine, dec
from autotrade.store import Store


class FakeBroker:
    connected = True
    base = "Base test double"

    def __init__(self):
        self.records = {}
        self.remote_positions = []
        self.foreign_orders = []
        self.submissions = 0
        self.timeout = False
        self.opened = True
        self.stale = False
        self.cash = 50000
        self.account_id = "test-account"

    def account(self):
        return {"id": self.account_id, "status": "ACTIVE", "cash": self.cash, "equity": self.cash, "blocked": False}

    def positions(self):
        return self.remote_positions

    def open_orders(self):
        return self.foreign_orders + [o for o in self.records.values() if o["status"] not in {"filled", "canceled"}]

    def order(self, client_id):
        return self.records.get(client_id)

    def asset(self, symbol):
        return {"tradable": True, "fractionable": True}

    def market(self, symbols, slow):
        quotes, _, _ = demo_market(symbols, 32, slow)
        for q in quotes.values():
            q["fresh"] = not self.stale
        return quotes, self.opened, None

    def prepare(self, body, cfg, price):
        return {"metadata": {"kind": "swap", "tx_hash": "0x" + body["client_order_id"][4:] * 2, "nonce": self.submissions, "gas_estimate_eth": "0.00001"}, "raw": b"test"}

    def submit(self, body, prepared):
        self.submissions += 1
        if self.timeout:
            raise BrokerError("Timed out")
        order = {"id": "broker-" + body["client_order_id"], "client_order_id": body["client_order_id"],
                 "status": "new", "filled_qty": "0", "filled_avg_price": None}
        self.records[body["client_order_id"]] = order
        return copy.deepcopy(order)

    def cancel(self, order_id):
        for o in self.records.values():
            if o["id"] == order_id:
                o["status"] = "canceled"


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"AUTOTRADE_ALLOW_LIVE": "YES"})
        self.environment.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "test.sqlite3")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()
        self.environment.stop()

    def demo(self):
        return Engine(self.store)

    def paper(self):
        broker = FakeBroker()
        return Engine(self.store, "live", broker), broker

    def test_demo_respects_cash_exposure_and_single_daily_entry(self):
        e = self.demo()
        e.configure({"invested_pct": 100, "position_pct": 100})
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        self.assertGreaterEqual(float(e.s["cash"]), 0)
        self.assertTrue(e.s["positions"])
        before = len(e.s["orders"])
        e.cycle()
        self.assertEqual(len(e.s["orders"]), before)
        self.assertLessEqual(sum(float(o["filled_total"]) + o["fee"] for o in e.s["orders"]), 1000)

    def test_round_trip_accounting_and_fees(self):
        e = self.demo()
        buy = {"symbol": "WETH", "side": "buy"}
        e.apply_fill(buy, "2", "100", "1")
        e.apply_fill(buy, "2", "120", "1")
        self.assertEqual(dec(e.s["positions"]["WETH"]["avg"]), dec("110"))
        e.apply_fill({"symbol": "WETH", "side": "sell"}, "4", "130", "2")
        self.assertEqual(dec(e.s["cash"]), dec("1076"))
        self.assertEqual(dec(e.s["realized"]), dec("76"))
        self.assertEqual(dec(e.s["fees"]), dec("4"))
        self.assertFalse(e.s["positions"])

    def test_partial_sale_preserves_smallest_token_quantities(self):
        e = self.demo()
        e.apply_fill({"symbol": "WETH", "side": "buy"}, "0.000000001", "3200")
        e.apply_fill({"symbol": "WETH", "side": "sell"}, "0.000000000999999999", "3200")
        self.assertEqual(dec(e.s["positions"]["WETH"]["qty"]), dec("0.000000000000000001"))
        with self.assertRaises(BrokerError):
            e.apply_fill({"symbol": "WETH", "side": "sell"}, "0.000000000000000002", "3200")
        e.apply_fill({"symbol": "WETH", "side": "sell"}, "0.000000000000000001", "3200")
        self.assertFalse(e.s["positions"])

    def test_cumulative_partial_fills_applied_once(self):
        e, _ = self.paper()
        order = {"symbol": "WETH", "side": "buy", "filled_qty": "0", "filled_total": "0"}
        first = {"id": "b1", "status": "partially_filled", "filled_qty": "2", "filled_avg_price": "100"}
        e.update_order(order, first)
        e.update_order(order, first)
        self.assertEqual(dec(e.s["cash"]), dec("800"))
        e.update_order(order, {**first, "status": "filled", "filled_qty": "3", "filled_avg_price": "110"})
        self.assertEqual(dec(e.s["cash"]), dec("670"))
        self.assertEqual(dec(e.s["positions"]["WETH"]["qty"]), dec("3"))
        self.assertEqual(dec(e.s["positions"]["WETH"]["avg"]), dec("110"))

    def test_timeout_and_restart_never_resubmit_unknown_order(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        broker.timeout = True
        e.safe_cycle()
        self.assertEqual(broker.submissions, 1)
        self.assertFalse(e.s["running"])
        client_id = e.s["orders"][0]["client_id"]
        self.assertEqual(e.s["orders"][0]["status"], "unknown")
        e = Engine(self.store, "live", broker)
        with self.assertRaisesRegex(ValueError, "Pending"):
            e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        self.assertEqual(broker.submissions, 1)
        # Later the broker reveals the order actually filled. Apply once across scans/restarts.
        broker.records[client_id] = {"id": "b1", "client_order_id": client_id, "status": "filled", "filled_qty": "2", "filled_avg_price": "100"}
        broker.remote_positions = [{"symbol": e.s["orders"][0]["symbol"], "qty": "2"}]
        e.cycle()
        e = Engine(self.store, "live", broker)
        e.cycle()
        self.assertEqual(dec(e.s["cash"]), dec("800"))
        self.assertEqual(broker.submissions, 1)

    def test_pending_order_reserves_all_new_submissions(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        e.cycle()
        self.assertEqual(broker.submissions, 1)
        self.assertEqual(len(e.unresolved()), 1)

    def test_restart_preserves_holdings_and_pauses(self):
        e = self.demo()
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        cash, positions = e.s["cash"], copy.deepcopy(e.s["positions"])
        e = Engine(self.store)
        self.assertFalse(e.s["running"])
        self.assertEqual(e.s["cash"], cash)
        self.assertEqual(e.s["positions"], positions)

    def test_foreign_holdings_orders_and_account_changes_block(self):
        e, broker = self.paper()
        broker.remote_positions = [{"symbol": "CBBTC", "qty": "1"}]
        with self.assertRaisesRegex(BrokerError, "balances differ"):
            e.start("START LIVE CRYPTO TRADING")
        broker.remote_positions = []
        broker.foreign_orders = [{"client_order_id": "someone-else"}]
        with self.assertRaisesRegex(BrokerError, "outside"):
            e.start("START LIVE CRYPTO TRADING")
        broker.foreign_orders = []
        broker.account_id = "another-account"
        with self.assertRaisesRegex(BrokerError, "wallet changed"):
            e.start("START LIVE CRYPTO TRADING")
        self.assertEqual(broker.submissions, 0)

    def test_no_broker_margin_or_capital_above_cash(self):
        e, broker = self.paper()
        broker.cash = 50
        with self.assertRaisesRegex(ValueError, "exceeds"):
            e.start("START LIVE CRYPTO TRADING")
        self.assertEqual(broker.submissions, 0)

    def test_stale_data_and_closed_market_never_enter(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        broker.stale = True
        e.cycle()
        self.assertEqual(broker.submissions, 0)
        broker.stale = False
        broker.opened = False
        e.cycle()
        self.assertEqual(broker.submissions, 0)

    def test_stop_interrupt_prevents_submission(self):
        e = self.demo()
        e.start("START LIVE CRYPTO TRADING")
        e.stop_requested.set()
        e.cycle()
        self.assertFalse(e.s["orders"])

    def test_loss_stop_latches_and_keeps_holdings(self):
        e = self.demo()
        e.start("START LIVE CRYPTO TRADING")
        e.s["cash"] = "800"
        e.cycle()
        self.assertFalse(e.s["running"])
        self.assertIsNotNone(e.s["halt"])
        with self.assertRaisesRegex(ValueError, "risk stop"):
            e.start("START LIVE CRYPTO TRADING")
        e.reset_risk("RESET RISK BASELINE")
        self.assertIsNone(e.s["halt"])
        self.assertEqual(e.s["high"], 800)

    def test_removed_symbol_remains_exit_managed_and_cap_does_not_block_exit(self):
        e = self.demo()
        e.configure({"symbols": ["WETH"], "max_orders_day": 1})
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        self.assertIn("WETH", e.s["positions"])
        e.pause()
        e.configure({"symbols": ["CBBTC"]})
        e.s["positions"]["WETH"]["avg"] = "9000"
        e.s["high"] = e.equity()
        e.s["day_equity"] = e.equity()
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        self.assertNotIn("WETH", e.s["positions"])
        self.assertEqual(e.s["orders"][-1]["side"], "sell")

    def test_capital_is_fixed_after_first_start(self):
        e = self.demo()
        e.configure({"capital": 2000})
        self.assertEqual(float(e.s["cash"]), 2000)
        e.start("START LIVE CRYPTO TRADING")
        e.pause()
        with self.assertRaisesRegex(ValueError, "fixed"):
            e.configure({"capital": 4000})

    def test_live_requires_env_and_phrase(self):
        e = Engine(self.store, "live", FakeBroker())
        with patch.dict(os.environ, {"AUTOTRADE_ALLOW_LIVE": "NO"}):
            with self.assertRaisesRegex(ValueError, "locked"):
                e.start("START LIVE CRYPTO TRADING")
        with patch.dict(os.environ, {"AUTOTRADE_ALLOW_LIVE": "YES"}):
            with self.assertRaisesRegex(ValueError, "Type"):
                e.start("")

    def test_invalid_config_and_malformed_fill_do_not_mutate_cash(self):
        for data in ({"capital": float('nan')}, {"capital": True}, {"fast": 20, "slow": 5},
                     {"interval": 14}, {"symbols": ["<script>"]}, {"fast": 3.5}, {"alien": 1}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                validate(data)
        e, _ = self.paper()
        before = e.s["cash"]
        with self.assertRaises(BrokerError):
            e.update_order({"symbol": "WETH", "side": "buy"}, {"filled_qty": "1", "filled_avg_price": "100"})
        self.assertEqual(e.s["cash"], before)

    def test_flatten_requires_confirmation_and_stays_paused(self):
        e = self.demo()
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        with self.assertRaisesRegex(ValueError, "Type"):
            e.flatten("")
        e.flatten("CLOSE ALL APP POSITIONS")
        self.assertFalse(e.s["positions"])
        self.assertFalse(e.s["running"])

    def test_stop_preserves_broadcast_transactions(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        e.cycle()
        e.stop_cancel()
        self.assertFalse(e.s["running"])
        self.assertTrue(e.unresolved())
        self.assertEqual(e.s["orders"][0]["status"], "new")

    def test_signed_hash_is_durable_before_broadcast_and_stop_during_prepare_wins(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        original = broker.submit
        def inspect(body, prepared):
            saved = self.store.load("live")["orders"][-1]
            self.assertEqual(saved["tx_hash"], prepared["metadata"]["tx_hash"])
            self.assertNotIn("raw", saved)
            return original(body, prepared)
        broker.submit = inspect
        e.cycle()
        self.assertEqual(broker.submissions, 1)
        e.stop_cancel()
        # A second isolated ledger tests a stop arriving while a transaction is being prepared.
        other = Store(Path(self.tmp.name) / "other.sqlite3")
        try:
            b = FakeBroker()
            e2 = Engine(other, "live", b)
            e2.start("START LIVE CRYPTO TRADING")
            prepare = b.prepare
            def interrupted(*args):
                result = prepare(*args)
                e2.stop_requested.set()
                return result
            b.prepare = interrupted
            e2.cycle()
            self.assertEqual(b.submissions, 0)
            self.assertFalse(e2.s["orders"])
        finally:
            other.close()

    def test_finite_approval_has_no_position_fill(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        base_prepare = broker.prepare
        def approval(*args):
            p = base_prepare(*args)
            p["metadata"]["kind"] = "approval"
            return p
        broker.prepare = approval
        e.cycle()
        order = e.s["orders"][-1]
        self.assertEqual(order["side"], "approve")
        broker.records[order["client_id"]].update(status="filled", gas_eth="0.000001")
        e.reconcile()
        self.assertEqual(dec(e.s["cash"]), dec("1000"))
        self.assertFalse(e.s["positions"])
        self.assertEqual(order["gas_eth"], "0.000001")

    def test_daily_gas_budget_blocks_broadcast(self):
        e, broker = self.paper()
        e.configure({"daily_gas_eth": 0.000001})
        e.start("START LIVE CRYPTO TRADING")
        e.safe_cycle()
        self.assertEqual(broker.submissions, 0)
        self.assertFalse(e.s["running"])
        self.assertIn("gas budget", e.s["events"][-1]["message"])

    def test_reference_expiring_during_preparation_blocks_broadcast(self):
        e, broker = self.paper()
        e.start("START LIVE CRYPTO TRADING")
        original = broker.prepare
        def slow_prepare(body, cfg, price):
            result = original(body, cfg, price)
            e.s["quotes"][body["symbol"]]["time"] = "2000-01-01T00:00:00+00:00"
            return result
        broker.prepare = slow_prepare
        e.safe_cycle()
        self.assertEqual(broker.submissions, 0)
        self.assertFalse(e.s["orders"])
        self.assertFalse(e.s["running"])
        self.assertIn("expired", e.s["events"][-1]["message"])


if __name__ == "__main__":
    unittest.main()
