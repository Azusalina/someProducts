"""Tests for crypto symbols (asset_class, normalize_symbol) and the crypto config additions."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from autotrader.config import (
    COINBASE_GRANULARITY,
    DEFAULT_CRYPTO_UNIVERSE,
    DEFAULT_UNIVERSE,
    ROOT,
    Config,
    ConfigError,
    CryptoRiskConfig,
    StrategyConfig,
    demo_config,
    load_config,
)
from autotrader.models import asset_class, crypto_pair, normalize_symbol


def write_cfg(tmp_path: Path, data: Any) -> str:
    path = tmp_path / "config.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


# ---------------------------------------------------------------- symbols


@pytest.mark.parametrize("symbol, expected", [
    ("BTC-USD", "crypto"), ("ETH-USDT", "crypto"), ("SOL-USDC", "crypto"), ("1INCH-USD", "crypto"),
    ("AAPL", "stock"), ("BRK.B", "stock"), ("BRK-B", "stock"), ("SPY", "stock"),
    ("BTC", "stock"), ("ETH-EUR", "stock"), ("btc-usd", "stock"), ("B-USD", "stock"),
])
def test_asset_class(symbol: str, expected: str) -> None:
    assert asset_class(symbol) == expected


@pytest.mark.parametrize("raw, expected", [
    ("BTC-USD", "BTC-USD"),
    ("btc-usd", "BTC-USD"),
    ("BTC/USD", "BTC-USD"),
    (" eth/usdt ", "ETH-USDT"),
    ("btcusd", "BTC-USD"),
    ("ETHUSDT", "ETH-USDT"),
    ("SOLUSDC", "SOL-USDC"),
    ("USDCUSD", "USDC-USD"),
    ("1INCH-USD", "1INCH-USD"),
    ("aapl", "AAPL"),
    ("brk.b", "BRK.B"),
    ("BRK-B", "BRK-B"),
    ("BTC", "BTC"),
    ("V", "V"),
    ("LINK", "LINK"),
])
def test_normalize_symbol_accepts(raw: str, expected: str) -> None:
    assert normalize_symbol(raw) == expected


@pytest.mark.parametrize("raw, fragment", [
    ("", "empty"),
    ("   ", "empty"),
    ("ETH-EUR", "quote"),
    ("BTC/EUR", "quote"),
    ("FOOUSD", "ambiguous"),
    ("BTC/", "pair"),
    ("A/USD", "pair"),
    ("B@D", "invalid"),
    ("TOOLONGTICKER", "invalid"),
    (".AB", "invalid"),
    ("AB1", "invalid"),
])
def test_normalize_symbol_rejects(raw: str, fragment: str) -> None:
    with pytest.raises(ValueError, match=fragment):
        normalize_symbol(raw)


def test_normalize_symbol_rejects_non_string() -> None:
    with pytest.raises(ValueError):
        normalize_symbol(42)  # type: ignore[arg-type]


def test_normalized_crypto_is_classified_crypto() -> None:
    for raw in ("btc/usd", "ethusdt", "DOGE-USD"):
        assert asset_class(normalize_symbol(raw)) == "crypto"


def test_crypto_pair() -> None:
    assert crypto_pair("BTC-USD") == ("BTC", "USD")
    assert crypto_pair("ETH-USDT") == ("ETH", "USDT")
    with pytest.raises(ValueError):
        crypto_pair("AAPL")


# ---------------------------------------------------------------- config defaults


def test_crypto_defaults() -> None:
    cfg = load_config(None)
    assert cfg.enable_stocks is True and cfg.enable_crypto is True
    assert cfg.crypto_universe == list(DEFAULT_CRYPTO_UNIVERSE)
    assert cfg.crypto_universe[:2] == ["BTC-USD", "ETH-USD"] and len(cfg.crypto_universe) == 10
    assert cfg.crypto_data_source == "coinbase" and cfg.crypto_bar_interval == "5m"
    assert cfg.crypto_slippage_bps == 10.0
    assert cfg.crypto_risk == CryptoRiskConfig(
        stop_loss_pct=0.08, take_profit_pct=0.25, trailing_stop_pct=0.10, max_position_pct=0.15,
        max_positions=5, max_crypto_exposure_pct=0.50, min_order_value=1.0, cooldown_minutes=60)
    assert all(asset_class(s) == "crypto" for s in cfg.crypto_universe)
    assert all(asset_class(s) == "stock" for s in cfg.universe)


def test_active_universe_combinations(tmp_path: Path) -> None:
    both = load_config(None)
    assert both.active_universe() == [*DEFAULT_UNIVERSE, *DEFAULT_CRYPTO_UNIVERSE]
    stocks = load_config(write_cfg(tmp_path, {"enable_crypto": False}))
    assert stocks.active_universe() == list(DEFAULT_UNIVERSE)
    crypto = load_config(write_cfg(tmp_path, {"enable_stocks": False}))
    assert crypto.active_universe() == list(DEFAULT_CRYPTO_UNIVERSE)


def test_active_universe_dedupes_and_keeps_order() -> None:
    cfg = Config(universe=["MSFT", "AAPL", "MSFT"], crypto_universe=["ETH-USD", "BTC-USD", "ETH-USD"])
    assert cfg.active_universe() == ["MSFT", "AAPL", "ETH-USD", "BTC-USD"]


def test_demo_config_crypto() -> None:
    cfg = demo_config()
    assert cfg.crypto_data_source == "synthetic" and cfg.data_source == "synthetic"
    assert cfg.enable_crypto and cfg.respect_market_hours is False
    assert set(DEFAULT_CRYPTO_UNIVERSE) <= set(cfg.active_universe())


def test_example_file_contains_crypto_settings() -> None:
    raw = json.loads((ROOT / "config.example.json").read_text(encoding="utf-8"))
    defaults = Config().to_dict()
    for key in ("enable_stocks", "enable_crypto", "crypto_universe", "crypto_data_source",
                "crypto_bar_interval", "crypto_slippage_bps", "crypto_risk", "crypto_strategy"):
        assert raw[key] == defaults[key], key


# ---------------------------------------------------------------- merging & normalization


def test_crypto_universe_normalized_and_deduped(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "crypto_universe": ["btc/usd", "BTC-USD", "ethusdt", "sol-usdc"],
    }))
    assert cfg.crypto_universe == ["BTC-USD", "ETH-USDT", "SOL-USDC"]


def test_crypto_risk_partial_override(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"crypto_risk": {"stop_loss_pct": 0.12, "max_positions": 3}}))
    assert cfg.crypto_risk.stop_loss_pct == 0.12 and cfg.crypto_risk.max_positions == 3
    assert cfg.crypto_risk.take_profit_pct == 0.25 and cfg.crypto_risk.cooldown_minutes == 60
    assert cfg.risk.stop_loss_pct == 0.05


def test_crypto_strategy_default_overrides() -> None:
    cfg = load_config(None)
    s = cfg.crypto_strategy_config()
    assert isinstance(s, StrategyConfig)
    assert (s.rsi_oversold, s.rsi_overbought, s.entry_threshold) == (25.0, 75.0, 0.40)
    assert s.fast_sma == cfg.strategy.fast_sma and s.weights == cfg.strategy.weights
    assert cfg.strategy.rsi_oversold == 30.0  # base strategy untouched


def test_crypto_strategy_user_overrides_merge(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "strategy": {"slow_sma": 40},
        "crypto_strategy": {"fast_sma": 5, "rsi_oversold": 20, "weights": {"volume": 0.5}},
    }))
    assert cfg.crypto_strategy == {"rsi_oversold": 20.0, "rsi_overbought": 75.0, "entry_threshold": 0.40,
                                   "fast_sma": 5, "weights": {"volume": 0.5}}
    assert isinstance(cfg.crypto_strategy["rsi_oversold"], float)
    s = cfg.crypto_strategy_config()
    assert (s.fast_sma, s.slow_sma, s.rsi_oversold, s.rsi_overbought) == (5, 40, 20.0, 75.0)
    assert s.weights == {"trend": 0.35, "momentum": 0.25, "mean_reversion": 0.15, "volume": 0.5, "forecast": 0.15}
    assert cfg.strategy.fast_sma == 10 and cfg.strategy.weights["volume"] == 0.10


def test_crypto_strategy_inherits_base_strategy(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"strategy": {"rsi_period": 21}, "crypto_strategy": {}}))
    assert cfg.crypto_strategy_config().rsi_period == 21


def test_crypto_only_config_allows_empty_stock_universe(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"enable_stocks": False, "universe": []}))
    assert cfg.universe == [] and cfg.active_universe() == list(DEFAULT_CRYPTO_UNIVERSE)


def test_stock_only_config_allows_empty_crypto_universe(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {"enable_crypto": False, "crypto_universe": []}))
    assert cfg.crypto_universe == [] and cfg.active_universe() == list(DEFAULT_UNIVERSE)


@pytest.mark.parametrize("source, interval", [
    ("coinbase", "1m"), ("coinbase", "1h"), ("coinbase", "6h"), ("coinbase", "1d"),
    ("yahoo", "2m"), ("yahoo", "90m"), ("synthetic", "6h"), ("synthetic", "30m"),
])
def test_crypto_intervals_per_source(tmp_path: Path, source: str, interval: str) -> None:
    cfg = load_config(write_cfg(tmp_path, {"crypto_data_source": source, "crypto_bar_interval": interval}))
    assert cfg.crypto_bar_interval == interval


def test_coinbase_granularities_are_supported_values() -> None:
    assert set(COINBASE_GRANULARITY.values()) == {60, 300, 900, 3600, 21600, 86400}


def test_round_trip_with_crypto(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "crypto_universe": ["BTC/USD", "DOGE-USD"],
        "crypto_strategy": {"weights": {"trend": 0.6}},
        "crypto_risk": {"max_crypto_exposure_pct": 0.8},
    }))
    again = load_config(write_cfg(tmp_path, json.loads(json.dumps(cfg.to_dict()))))
    assert again == cfg


# ---------------------------------------------------------------- validation errors


@pytest.mark.parametrize("data, fragment", [
    ({"enable_crypto": "yes"}, "enable_crypto"),
    ({"enable_stocks": 0}, "enable_stocks"),
    ({"enable_stocks": False, "enable_crypto": False}, "both be false"),
    ({"crypto_data_source": "binance"}, "crypto_data_source"),
    ({"crypto_bar_interval": "7m"}, "crypto_bar_interval"),
    ({"crypto_data_source": "coinbase", "crypto_bar_interval": "30m"}, "crypto_bar_interval"),
    ({"crypto_data_source": "yahoo", "crypto_bar_interval": "6h"}, "crypto_bar_interval"),
    ({"crypto_universe": "BTC-USD"}, "crypto_universe"),
    ({"crypto_universe": []}, "crypto_universe"),
    ({"crypto_universe": ["AAPL"]}, "crypto_universe"),
    ({"crypto_universe": ["ETH-EUR"]}, "ETH-EUR"),
    ({"crypto_universe": ["FOOUSD"]}, "FOOUSD"),
    ({"universe": ["AAPL", "BTC-USD"]}, "BTC-USD"),
    ({"universe": ["btc/usd"]}, "crypto_universe"),
    ({"crypto_slippage_bps": -1}, "crypto_slippage_bps"),
    ({"crypto_slippage_bps": 5000}, "crypto_slippage_bps"),
    ({"crypto_risk": {"bogus": 1}}, "crypto_risk.bogus"),
    ({"crypto_risk": "tight"}, "crypto_risk"),
    ({"crypto_risk": {"stop_loss_pct": 0}}, "crypto_risk.stop_loss_pct"),
    ({"crypto_risk": {"max_position_pct": 1.5}}, "crypto_risk.max_position_pct"),
    ({"crypto_risk": {"max_crypto_exposure_pct": 0}}, "crypto_risk.max_crypto_exposure_pct"),
    ({"crypto_risk": {"max_crypto_exposure_pct": 1.01}}, "crypto_risk.max_crypto_exposure_pct"),
    ({"crypto_risk": {"take_profit_pct": 11}}, "crypto_risk.take_profit_pct"),
    ({"crypto_risk": {"max_positions": 0}}, "crypto_risk.max_positions"),
    ({"crypto_risk": {"max_positions": 2.5}}, "crypto_risk.max_positions"),
    ({"crypto_risk": {"cooldown_minutes": -1}}, "crypto_risk.cooldown_minutes"),
    ({"crypto_risk": {"min_order_value": -1}}, "crypto_risk.min_order_value"),
    ({"crypto_risk": {"daily_loss_limit_pct": 0.1}}, "crypto_risk.daily_loss_limit_pct"),
    ({"crypto_strategy": {"bogus": 1}}, "crypto_strategy.bogus"),
    ({"crypto_strategy": "wide"}, "crypto_strategy"),
    ({"crypto_strategy": {"fast_sma": "fast"}}, "crypto_strategy.fast_sma"),
    ({"crypto_strategy": {"fast_sma": 50}}, "crypto_strategy"),
    ({"crypto_strategy": {"rsi_oversold": 80}}, "crypto_strategy"),
    ({"crypto_strategy": {"exit_threshold": 0.5}}, "crypto_strategy"),
    ({"crypto_strategy": {"weights": {"sentiment": 1}}}, "sentiment"),
    ({"crypto_strategy": {"weights": "heavy"}}, "crypto_strategy.weights"),
    ({"crypto_strategy": {"slow_sma": 200}}, "lookback_bars"),
])
def test_invalid_crypto_configs_raise(tmp_path: Path, data: dict[str, Any], fragment: str) -> None:
    with pytest.raises(ConfigError, match=re.escape(fragment)):
        load_config(write_cfg(tmp_path, data))


def test_loosened_crypto_limits_allowed(tmp_path: Path) -> None:
    cfg = load_config(write_cfg(tmp_path, {
        "crypto_risk": {"max_position_pct": 1.0, "max_crypto_exposure_pct": 1.0, "cooldown_minutes": 0,
                        "stop_loss_pct": 1.0, "take_profit_pct": 10.0, "min_order_value": 0.0},
    }))
    assert cfg.crypto_risk.max_crypto_exposure_pct == 1.0 and cfg.crypto_risk.cooldown_minutes == 0
