"""Tests for models, config loading/validation and the SQLite store."""

from __future__ import annotations

import json
import math
import re
import threading
from pathlib import Path
from typing import Any

import pytest

import autotrader
from autotrader.config import (
    DEFAULT_CRYPTO_UNIVERSE,
    DEFAULT_UNIVERSE,
    ROOT,
    Config,
    ConfigError,
    RiskConfig,
    ServerConfig,
    StrategyConfig,
    demo_config,
    load_config,
)
from autotrader.models import (
    Account,
    Bar,
    Fill,
    Order,
    Position,
    Signal,
    asset_class,
    normalize_symbol,
    to_dict,
)
from autotrader.store import Store


def write_cfg(tmp_path: Path, data: Any) -> str:
    path = tmp_path / "config.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


# ---------------------------------------------------------------- models


def test_version() -> None:
    assert autotrader.__version__ == "0.1.0"


def test_position_helpers() -> None:
    p = Position("AAPL", qty=10, avg_price=100.0, opened_ts=0.0)
    assert p.high_water == 0.0
    assert p.market_value(110.0) == pytest.approx(1100.0)
    assert p.unrealized_pnl(110.0) == pytest.approx(100.0)
    assert p.unrealized_pnl(95.0) == pytest.approx(-50.0)


def test_signal_score_is_clipped() -> None:
    assert Signal("X", 3.0, 1.0, "hot").score == 1.0
    assert Signal("X", -7.5, 1.0, "cold").score == -1.0
    assert Signal("X", 0.25, 1.0, "meh").components == {}


def test_order_defaults() -> None:
    o = Order("o1", "MSFT", "buy", 2.0, "new", 1.0)
    assert (o.filled_qty, o.filled_avg_price, o.reason, o.type) == (0.0, None, "", "market")


def test_to_dict_nested_and_json_safe() -> None:
    acct = Account(cash=1.0, equity=float("nan"), buying_power=float("inf"),
                   positions={"AAPL": Position("AAPL", 1.0, 2.0, 3.0)})
    d = to_dict(acct)
    assert d["equity"] is None and d["buying_power"] is None
    assert d["positions"]["AAPL"]["avg_price"] == 2.0
    json.dumps(d)  # must not raise
    bar = to_dict(Bar(1.0, 2.0, 3.0, 0.5, 2.5, 100.0))
    assert set(bar) == {"ts", "open", "high", "low", "close", "volume"}
    assert to_dict({"a": (1, 2), "b": float("-inf")}) == {"a": [1, 2], "b": None}
    with pytest.raises(TypeError):
        to_dict(42)


# ---------------------------------------------------------------- config


def test_defaults_match_contract() -> None:
    cfg = load_config(None)
    assert cfg.mode == "sim" and cfg.initial_fund == 10000.0 and cfg.fund_scope == "allocation"
    assert cfg.data_source == "yahoo" and cfg.bar_interval == "5m"
    assert {"SPY", "QQQ"} <= set(cfg.universe) and len(cfg.universe) >= 25
    assert cfg.risk == RiskConfig()
    assert cfg.strategy.weights == {"trend": 0.35, "momentum": 0.25, "mean_reversion": 0.15, "volume": 0.10,
                                    "forecast": 0.15}
    assert cfg.server == ServerConfig(host="127.0.0.1", port=8765, token=None)
    assert cfg.db_path == str(ROOT / "data" / "autotrader.db")


def test_example_file_mirrors_defaults() -> None:
    example = load_config(str(ROOT / "config.example.json"))
    assert example.to_dict() == Config().to_dict()
    raw = json.loads((ROOT / "config.example.json").read_text(encoding="utf-8"))
    assert raw["universe"] == list(DEFAULT_UNIVERSE)
    assert raw["crypto_universe"] == list(DEFAULT_CRYPTO_UNIVERSE)
    assert set(raw) == set(Config().to_dict())


def test_asset_class_and_normalize_basics() -> None:
    assert asset_class("BTC-USD") == "crypto" and asset_class("AAPL") == "stock"
    assert asset_class("BRK.B") == "stock" and asset_class("BRK-B") == "stock"
    assert normalize_symbol("btc/usd") == "BTC-USD"
    assert normalize_symbol(" aapl ") == "AAPL"
    with pytest.raises(ValueError):
        normalize_symbol("ETH-EUR")


def test_deep_merge_keeps_unspecified_defaults(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "initial_fund": 2500,
        "universe": ["aapl", "brk.b", "AAPL"],
        "risk": {"stop_loss_pct": 0.1},
        "strategy": {"weights": {"trend": 1.0}},
        "server": {"port": 9000},
    }))
    assert cfg.initial_fund == 2500.0 and isinstance(cfg.initial_fund, float)
    assert cfg.universe == ["AAPL", "BRK.B"]
    assert cfg.risk.stop_loss_pct == 0.1 and cfg.risk.max_positions == 8
    assert cfg.strategy.weights == {"trend": 1.0, "momentum": 0.25, "mean_reversion": 0.15, "volume": 0.10,
                                    "forecast": 0.15}
    assert cfg.strategy.fast_sma == 10
    assert cfg.server.port == 9000 and cfg.server.host == "127.0.0.1"


def test_relative_db_path_resolves_against_root(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"db_path": "data/x.db"}))
    assert cfg.db_path == str(ROOT / "data" / "x.db")
    absolute = str(tmp_path / "abs.db")
    assert load_config(write_cfg(tmp_path, {"db_path": absolute})).db_path == absolute


@pytest.mark.parametrize("data, fragment", [
    ({"bogus": 1}, "bogus"),
    ({"risk": {"nope": 1}}, "risk.nope"),
    ({"strategy": {"weights": {"sentiment": 0.5}}}, "sentiment"),
    ({"mode": "yolo"}, "mode"),
    ({"fund_scope": "everything"}, "fund_scope"),
    ({"data_source": "bloomberg"}, "data_source"),
    ({"bar_interval": "7m"}, "bar_interval"),
    ({"initial_fund": 0}, "initial_fund"),
    ({"initial_fund": "lots"}, "initial_fund"),
    ({"poll_seconds": 0}, "poll_seconds"),
    ({"poll_seconds": 1.5}, "poll_seconds"),
    ({"respect_market_hours": 1}, "respect_market_hours"),
    ({"max_positions": 3}, "max_positions"),
    ({"risk": {"max_positions": True}}, "max_positions"),
    ({"risk": {"max_position_pct": 1.5}}, "max_position_pct"),
    ({"risk": {"stop_loss_pct": 0}}, "stop_loss_pct"),
    ({"risk": {"min_cash_reserve_pct": 1.0}}, "min_cash_reserve_pct"),
    ({"risk": "loose"}, "risk"),
    ({"strategy": {"fast_sma": 30, "slow_sma": 10}}, "fast_sma"),
    ({"strategy": {"rsi_oversold": 80}}, "rsi_oversold"),
    ({"strategy": {"exit_threshold": 0.5}}, "exit_threshold"),
    ({"strategy": {"weights": {"trend": 0, "momentum": 0, "mean_reversion": 0, "volume": 0, "forecast": 0}}},
     "weights"),
    ({"strategy": {"weights": {"trend": -1}}}, "weights"),
    ({"universe": []}, "universe"),
    ({"universe": ["GOOD", "B@D"]}, "B@D"),
    ({"universe": ["TOOLONGTICKER"]}, "TOOLONGTICKER"),
    ({"universe": "AAPL"}, "universe"),
    ({"lookback_bars": 20}, "lookback_bars"),
    ({"server": {"port": 70000}}, "server.port"),
    ({"server": {"token": "short"}}, "server.token"),
    ({"slippage_bps": -1}, "slippage_bps"),
])
def test_invalid_configs_raise(tmp_path: Path, data: dict[str, Any], fragment: str) -> None:
    with pytest.raises(ConfigError, match=re.escape(fragment)):
        load_config(write_cfg(tmp_path, data))


def test_loosened_limits_are_allowed(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "risk": {"max_position_pct": 1.0, "daily_loss_limit_pct": 1.0, "max_drawdown_pct": 1.0,
                 "min_cash_reserve_pct": 0.0, "max_trades_per_day": 1000, "cooldown_minutes": 0},
    }))
    assert cfg.risk.max_drawdown_pct == 1.0 and cfg.risk.cooldown_minutes == 0


def test_file_errors(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="cannot read"):
        load_config(str(tmp_path / "missing.json"))
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    with pytest.raises(ConfigError, match="invalid JSON"):
        load_config(str(bad))
    with pytest.raises(ConfigError, match="JSON object"):
        load_config(write_cfg(tmp_path, [1, 2]))


def test_config_error_is_value_error() -> None:
    assert issubclass(ConfigError, ValueError)


def test_demo_config() -> None:
    cfg = demo_config()
    assert cfg.mode == "sim" and cfg.data_source == "synthetic"
    assert cfg.respect_market_hours is False and cfg.poll_seconds == 2
    assert cfg.initial_fund == 10000.0
    assert cfg.db_path == str(ROOT / "data" / "demo.db")
    assert cfg.enable_crypto and cfg.enable_stocks and cfg.crypto_data_source == "synthetic"
    assert cfg.active_universe() == [*cfg.universe, *cfg.crypto_universe]
    # Ticks are 2 s but stand for 5m bars: wall-clock limits must not freeze the demo.
    assert cfg.risk.max_trades_per_day >= 5000
    assert cfg.risk.cooldown_minutes <= 1 and cfg.crypto_risk.cooldown_minutes <= 1


def test_to_dict_round_trips_through_json(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"mode": "alpaca-paper", "server": {"token": "abcdefgh12"}}))
    d = cfg.to_dict()
    assert d["risk"]["stop_loss_pct"] == 0.05 and d["server"]["token"] == "abcdefgh12"
    again = load_config(write_cfg(tmp_path, json.loads(json.dumps(d))))
    assert again == cfg


def test_strategy_config_weights_not_shared() -> None:
    a, b = StrategyConfig(), StrategyConfig()
    a.weights["trend"] = 0.9
    assert b.weights["trend"] == 0.35


def test_demo_cfg_fixture_uses_tmp(demo_cfg: Config, tmp_path: Path) -> None:
    assert demo_cfg.db_path.startswith(str(tmp_path))


# ---------------------------------------------------------------- store


def test_store_creates_parent_dir_and_wal(tmp_path: Path) -> None:
    s = Store(str(tmp_path / "nested" / "dir" / "x.db"))
    try:
        assert (tmp_path / "nested" / "dir").is_dir()
        mode = s._conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"
    finally:
        s.close()


def test_order_upsert_round_trip(store: Store) -> None:
    store.record_order(Order("o1", "AAPL", "buy", 5.0, "new", 100.0, reason="entry"))
    store.record_order(Order("o2", "MSFT", "sell", 1.0, "rejected", 101.0))
    store.record_order(Order("o1", "AAPL", "buy", 5.0, "filled", 100.0, 5.0, 123.45, "entry"))
    orders = store.recent_orders()
    assert [o["id"] for o in orders] == ["o2", "o1"]
    o1 = orders[1]
    assert o1["status"] == "filled" and o1["filled_avg_price"] == 123.45 and o1["type"] == "market"
    assert len(store.recent_orders(limit=1)) == 1


def test_fills_and_realized_pnl(store: Store) -> None:
    assert store.realized_pnl_total() == 0.0
    store.record_fill(Fill("o1", "AAPL", "buy", 5.0, 100.0, 0.0, 10.0))
    store.record_fill(Fill("o2", "AAPL", "sell", 5.0, 110.0, 1.0, 20.0), realized_pnl=49.0)
    store.record_fill(Fill("o3", "MSFT", "sell", 1.0, 90.0, 0.0, 30.0), realized_pnl=-9.5)
    assert store.realized_pnl_total() == pytest.approx(39.5)
    recent = store.recent_fills()
    assert [f["order_id"] for f in recent] == ["o3", "o2", "o1"]
    assert recent[1]["realized_pnl"] == 49.0 and recent[1]["commission"] == 1.0
    since = store.fills_since(20.0)
    assert [f["order_id"] for f in since] == ["o2", "o3"]
    assert store.recent_fills(limit=2)[0]["order_id"] == "o3"


def test_equity_curve_oldest_first_and_limited(store: Store) -> None:
    for i in range(10):
        store.record_equity(float(i), 1000.0 + i, 500.0, 1000.0)
    curve = store.equity_curve()
    assert [p["ts"] for p in curve] == [float(i) for i in range(10)]
    assert set(curve[0]) == {"ts", "equity", "cash", "allocation"}
    last3 = store.equity_curve(limit=3)
    assert [p["ts"] for p in last3] == [7.0, 8.0, 9.0]


def test_events(store: Store) -> None:
    store.log_event("info", "started", ts=1.0)
    store.log_event("trade", "BUY AAPL", ts=2.0)
    store.log_event("warn", "no data")
    events = store.recent_events()
    assert events[0]["message"] == "no data" and events[0]["ts"] > 2.0
    assert [e["level"] for e in events] == ["warn", "trade", "info"]
    assert len(store.recent_events(limit=1)) == 1
    with pytest.raises(ValueError):
        store.log_event("debug", "nope")


def test_kv_round_trip(store: Store) -> None:
    assert store.get_kv("missing") is None
    assert store.get_kv("missing", {"x": 1}) == {"x": 1}
    store.set_kv("state", {"cash": 1.5, "positions": {"AAPL": [1, 2]}})
    assert store.get_kv("state") == {"cash": 1.5, "positions": {"AAPL": [1, 2]}}
    store.set_kv("state", 3)
    assert store.get_kv("state") == 3
    store.set_kv("pos", Position("AAPL", 1.0, 2.0, 3.0, 4.0))
    assert store.get_kv("pos")["high_water"] == 4.0
    store.set_kv("flag", None)
    assert store.get_kv("flag", "default") is None


def test_store_persists_across_reopen(tmp_path: Path) -> None:
    path = str(tmp_path / "p.db")
    s = Store(path)
    s.set_kv("net_deposits", 250.0)
    s.record_fill(Fill("o1", "AAPL", "sell", 1.0, 10.0, 0.0, 1.0), realized_pnl=3.0)
    s.close()
    s2 = Store(path)
    try:
        assert s2.get_kv("net_deposits") == 250.0
        assert s2.realized_pnl_total() == 3.0
    finally:
        s2.close()


def test_store_concurrent_writes(store: Store) -> None:
    def worker(n: int) -> None:
        for i in range(50):
            store.log_event("info", f"{n}-{i}")
            store.record_equity(float(i), 1.0, 1.0, 1.0)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(store.recent_events(limit=1000)) == 200
    assert len(store.equity_curve(limit=1000)) == 200
    assert not math.isnan(store.realized_pnl_total())
