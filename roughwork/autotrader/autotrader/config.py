"""Configuration dataclasses, JSON loading, deep-merge and validation."""

from __future__ import annotations

import dataclasses
import ipaddress
import json
import re
import types
import typing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .models import asset_class, normalize_symbol

ROOT: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = ROOT / "data"

MODES: frozenset[str] = frozenset({"sim", "alpaca-paper", "alpaca-live"})
FUND_SCOPES: frozenset[str] = frozenset({"allocation", "full_account"})
DATA_SOURCES: frozenset[str] = frozenset({"yahoo", "synthetic"})
CRYPTO_DATA_SOURCES: frozenset[str] = frozenset({"coinbase", "yahoo", "synthetic"})
BAR_INTERVALS: frozenset[str] = frozenset({"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d"})
# Coinbase Exchange candle granularities (seconds) by interval name.
COINBASE_GRANULARITY: dict[str, int] = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "60m": 3600, "6h": 21600, "1d": 86400,
}
CRYPTO_BAR_INTERVALS: dict[str, frozenset[str]] = {
    "coinbase": frozenset(COINBASE_GRANULARITY),
    "yahoo": BAR_INTERVALS,
    "synthetic": BAR_INTERVALS | frozenset(COINBASE_GRANULARITY),
}
WEIGHT_KEYS: frozenset[str] = frozenset({"trend", "momentum", "mean_reversion", "volume", "forecast"})
LIVE_CONFIRMATION_PHRASE: str = "I ACCEPT REAL-MONEY RISK"
TICKER_RE: re.Pattern[str] = re.compile(r"^[A-Z.\-]{1,10}$")

DEFAULT_UNIVERSE: tuple[str, ...] = (
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "V",
    "MA", "UNH", "XOM", "JNJ", "PG", "HD", "COST", "LLY", "WMT", "BAC",
    "KO", "PEP", "NFLX", "AMD", "CRM", "SPY", "QQQ",
)
DEFAULT_CRYPTO_UNIVERSE: tuple[str, ...] = (
    "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD",
    "ADA-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "BCH-USD",
)


class ConfigError(ValueError):
    """Raised for unreadable, unknown or out-of-range configuration."""


@dataclass
class RiskConfig:
    """Position sizing, exit and halt limits (all fractions of equity unless noted)."""

    max_position_pct: float = 0.20
    max_positions: int = 8
    min_cash_reserve_pct: float = 0.05
    stop_loss_pct: float = 0.05
    take_profit_pct: float = 0.15
    trailing_stop_pct: float = 0.07
    daily_loss_limit_pct: float = 0.05
    max_drawdown_pct: float = 0.25
    max_trades_per_day: int = 40
    min_order_value: float = 1.0
    cooldown_minutes: int = 30


@dataclass
class CryptoRiskConfig:
    """Per-position limits for crypto; account-level halts stay in RiskConfig."""

    stop_loss_pct: float = 0.08
    take_profit_pct: float = 0.25
    trailing_stop_pct: float = 0.10
    max_position_pct: float = 0.15
    max_positions: int = 5
    max_crypto_exposure_pct: float = 0.50
    min_order_value: float = 1.0
    cooldown_minutes: int = 60


def _default_weights() -> dict[str, float]:
    return {"trend": 0.35, "momentum": 0.25, "mean_reversion": 0.15, "volume": 0.10, "forecast": 0.15}


def _default_crypto_strategy() -> dict[str, Any]:
    return {"rsi_oversold": 25.0, "rsi_overbought": 75.0, "entry_threshold": 0.40}


@dataclass
class StrategyConfig:
    """Indicator periods, thresholds and ensemble weights (normalized over the components present)."""

    fast_sma: int = 10
    slow_sma: int = 30
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    momentum_lookback: int = 20
    entry_threshold: float = 0.35
    exit_threshold: float = -0.20
    weights: dict[str, float] = field(default_factory=_default_weights)


@dataclass
class ForecastConfig:
    """Price-trend projection (damped Holt + log-linear OLS ensemble) settings."""

    enabled: bool = True
    horizon_bars: int = 12
    window: int = 60
    min_bars: int = 40
    band_z: float = 1.28
    flat_threshold: float = 0.002
    backtest_steps: int = 72
    use_in_strategy: bool = True
    alpha: float | None = None
    beta: float | None = None
    phi: float = 0.9


@dataclass
class ServerConfig:
    """Dashboard HTTP server settings."""

    host: str = "127.0.0.1"
    port: int = 8765
    token: str | None = None
    allowed_hosts: list[str] = field(default_factory=list)  # extra Host header names (e.g. a LAN name)


@dataclass
class Config:
    """Top-level application configuration."""

    mode: str = "sim"
    initial_fund: float = 10000.0
    fund_scope: str = "allocation"
    enable_stocks: bool = True
    enable_crypto: bool = True
    data_source: str = "yahoo"
    universe: list[str] = field(default_factory=lambda: list(DEFAULT_UNIVERSE))
    bar_interval: str = "5m"
    crypto_data_source: str = "coinbase"
    crypto_universe: list[str] = field(default_factory=lambda: list(DEFAULT_CRYPTO_UNIVERSE))
    crypto_bar_interval: str = "5m"
    lookback_bars: int = 120
    poll_seconds: int = 60
    respect_market_hours: bool = True
    allow_short: bool = False
    fractional: bool = True
    commission_per_trade: float = 0.0
    slippage_bps: float = 5.0
    crypto_slippage_bps: float = 10.0
    live_confirmation: str = ""
    db_path: str = "data/autotrader.db"
    risk: RiskConfig = field(default_factory=RiskConfig)
    crypto_risk: CryptoRiskConfig = field(default_factory=CryptoRiskConfig)
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    crypto_strategy: dict[str, Any] = field(default_factory=_default_crypto_strategy)
    forecast: ForecastConfig = field(default_factory=ForecastConfig)
    server: ServerConfig = field(default_factory=ServerConfig)

    def __post_init__(self) -> None:
        self.db_path = resolve_path(self.db_path)

    def to_dict(self) -> dict[str, Any]:
        """Plain JSON-safe dict of the full configuration."""
        return dataclasses.asdict(self)

    def active_universe(self) -> list[str]:
        """Stock universe (if enabled) followed by crypto universe (if enabled), de-duplicated."""
        symbols: list[str] = []
        if self.enable_stocks:
            symbols.extend(self.universe)
        if self.enable_crypto:
            symbols.extend(self.crypto_universe)
        return list(dict.fromkeys(symbols))

    def crypto_strategy_config(self) -> StrategyConfig:
        """``strategy`` with ``crypto_strategy`` overrides applied (weights merge key by key)."""
        merged = dataclasses.asdict(self.strategy)
        for key, value in self.crypto_strategy.items():
            if key == "weights" and isinstance(value, dict):
                merged["weights"] = {**merged["weights"], **value}
            else:
                merged[key] = value
        return _build(StrategyConfig, merged, "crypto_strategy.")


def resolve_path(path: str) -> str:
    """Resolve a relative path against the project ROOT; ':memory:' passes through."""
    if path == ":memory:":
        return path
    p = Path(path).expanduser()
    return str(p if p.is_absolute() else (ROOT / p).resolve())


def _deep_merge(base: dict[str, Any], override: dict[str, Any], path: str = "") -> dict[str, Any]:
    """Merge ``override`` into a copy of ``base``; keys absent from ``base`` raise ConfigError."""
    merged = dict(base)
    for key, value in override.items():
        where = f"{path}{key}"
        if key not in base:
            raise ConfigError(f"unknown config key: {where}")
        if isinstance(base[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(base[key], value, f"{where}.")
        else:
            merged[key] = value
    return merged


def _coerce(value: Any, hint: Any, where: str) -> Any:
    """Check ``value`` against a type hint, coercing ints to floats where allowed."""
    if hint is Any:
        return value
    origin = typing.get_origin(hint)
    if origin in (typing.Union, types.UnionType):
        args = typing.get_args(hint)
        if value is None and type(None) in args:
            return None
        inner = [a for a in args if a is not type(None)]
        return _coerce(value, inner[0], where)
    if dataclasses.is_dataclass(hint):
        if not isinstance(value, dict):
            raise ConfigError(f"{where} must be an object")
        return _build(hint, value, f"{where}.")
    if hint is bool:
        if not isinstance(value, bool):
            raise ConfigError(f"{where} must be true or false")
        return value
    if hint is int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ConfigError(f"{where} must be an integer")
        return value
    if hint is float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ConfigError(f"{where} must be a number")
        return float(value)
    if hint is str:
        if not isinstance(value, str):
            raise ConfigError(f"{where} must be a string")
        return value
    if origin is list:
        if not isinstance(value, list):
            raise ConfigError(f"{where} must be a list")
        (item_hint,) = typing.get_args(hint)
        return [_coerce(v, item_hint, f"{where}[{i}]") for i, v in enumerate(value)]
    if origin is dict:
        if not isinstance(value, dict):
            raise ConfigError(f"{where} must be an object")
        _, val_hint = typing.get_args(hint)
        return {str(k): _coerce(v, val_hint, f"{where}.{k}") for k, v in value.items()}
    raise ConfigError(f"{where}: unsupported type {hint!r}")


def _build[T](cls: type[T], data: dict[str, Any], prefix: str = "") -> T:
    """Construct dataclass ``cls`` from a dict, type-checking every field."""
    hints = typing.get_type_hints(cls)
    names = {f.name for f in dataclasses.fields(cls)}  # type: ignore[arg-type]
    unknown = set(data) - names
    if unknown:
        raise ConfigError(f"unknown config key: {prefix}{sorted(unknown)[0]}")
    kwargs = {k: _coerce(v, hints[k], f"{prefix}{k}") for k, v in data.items()}
    return cls(**kwargs)


def _require(cond: bool, message: str) -> None:
    if not cond:
        raise ConfigError(message)


def _validate_risk(r: RiskConfig) -> None:
    for name in ("max_position_pct", "stop_loss_pct", "trailing_stop_pct",
                 "daily_loss_limit_pct", "max_drawdown_pct"):
        v = getattr(r, name)
        _require(0.0 < v <= 1.0, f"risk.{name} must be in (0, 1]: {v}")
    _require(0.0 < r.take_profit_pct <= 10.0, f"risk.take_profit_pct must be in (0, 10]: {r.take_profit_pct}")
    _require(0.0 <= r.min_cash_reserve_pct < 1.0, f"risk.min_cash_reserve_pct out of range: {r.min_cash_reserve_pct}")
    _require(1 <= r.max_positions <= 500, f"risk.max_positions out of range: {r.max_positions}")
    _require(1 <= r.max_trades_per_day <= 10000, f"risk.max_trades_per_day out of range: {r.max_trades_per_day}")
    _require(r.min_order_value >= 0.0, f"risk.min_order_value must be >= 0: {r.min_order_value}")
    _require(0 <= r.cooldown_minutes <= 7 * 24 * 60, f"risk.cooldown_minutes out of range: {r.cooldown_minutes}")


def _validate_crypto_risk(r: CryptoRiskConfig) -> None:
    for name in ("max_position_pct", "stop_loss_pct", "trailing_stop_pct", "max_crypto_exposure_pct"):
        v = getattr(r, name)
        _require(0.0 < v <= 1.0, f"crypto_risk.{name} must be in (0, 1]: {v}")
    _require(0.0 < r.take_profit_pct <= 10.0,
             f"crypto_risk.take_profit_pct must be in (0, 10]: {r.take_profit_pct}")
    _require(1 <= r.max_positions <= 500, f"crypto_risk.max_positions out of range: {r.max_positions}")
    _require(r.min_order_value >= 0.0, f"crypto_risk.min_order_value must be >= 0: {r.min_order_value}")
    _require(0 <= r.cooldown_minutes <= 7 * 24 * 60,
             f"crypto_risk.cooldown_minutes out of range: {r.cooldown_minutes}")


def _validate_strategy(s: StrategyConfig, name: str = "strategy") -> None:
    _require(1 <= s.fast_sma < s.slow_sma <= 1000, f"{name} requires 1 <= fast_sma < slow_sma <= 1000")
    _require(2 <= s.rsi_period <= 500, f"{name}.rsi_period out of range: {s.rsi_period}")
    _require(0.0 <= s.rsi_oversold < s.rsi_overbought <= 100.0,
             f"{name} requires 0 <= rsi_oversold < rsi_overbought <= 100")
    _require(1 <= s.momentum_lookback <= 1000, f"{name}.momentum_lookback out of range: {s.momentum_lookback}")
    _require(0.0 < s.entry_threshold <= 1.0, f"{name}.entry_threshold out of range: {s.entry_threshold}")
    _require(-1.0 <= s.exit_threshold < s.entry_threshold,
             f"{name} requires -1 <= exit_threshold < entry_threshold")
    unknown = set(s.weights) - WEIGHT_KEYS
    _require(not unknown, f"unknown {name} weight: {sorted(unknown)[0] if unknown else ''}")
    _require(all(w >= 0.0 for w in s.weights.values()), f"{name} weights must be >= 0")
    _require(sum(s.weights.values()) > 0.0, f"{name} weights must not all be zero")


def _validate_forecast(f: ForecastConfig) -> None:
    _require(1 <= f.horizon_bars <= 500, f"forecast.horizon_bars out of range: {f.horizon_bars}")
    _require(10 <= f.min_bars <= f.window <= 5000,
             f"forecast requires 10 <= min_bars <= window <= 5000: {f.min_bars}, {f.window}")
    _require(0.0 < f.band_z <= 10.0, f"forecast.band_z must be in (0, 10]: {f.band_z}")
    _require(0.0 <= f.flat_threshold < 1.0, f"forecast.flat_threshold must be in [0, 1): {f.flat_threshold}")
    _require(0 <= f.backtest_steps <= 1000, f"forecast.backtest_steps out of range: {f.backtest_steps}")
    for name in ("alpha", "beta"):
        v = getattr(f, name)
        _require(v is None or 0.0 < v <= 1.0, f"forecast.{name} must be null or in (0, 1]: {v}")
    _require(0.0 < f.phi <= 1.0, f"forecast.phi must be in (0, 1]: {f.phi}")


_HOST_RE = re.compile(r"[a-z0-9][a-z0-9.-]{0,252}")


def _valid_host_name(host: str) -> bool:
    """A DNS name / IPv4 address, or an IPv6 address (optionally bracketed); never a port."""
    if ":" not in host:
        return bool(_HOST_RE.fullmatch(host))
    try:
        ipaddress.IPv6Address(host.removeprefix("[").removesuffix("]"))
    except ValueError:
        return False
    return host.startswith("[") == host.endswith("]")


def _validate_server(s: ServerConfig) -> None:
    _require(bool(s.host.strip()), "server.host must not be empty")
    _require(1 <= s.port <= 65535, f"server.port out of range: {s.port}")
    _require(s.token is None or len(s.token) >= 8, "server.token must be at least 8 characters")
    cleaned: list[str] = []
    for name in s.allowed_hosts:
        host = name.strip().lower()
        _require(_valid_host_name(host),
                 f"server.allowed_hosts entries must be host names or IP addresses without a port: {name!r}")
        cleaned.append(host)
    s.allowed_hosts = list(dict.fromkeys(cleaned))


def _clean_symbols(raw_symbols: list[str], field_name: str, want: str) -> list[str]:
    """Normalize and de-duplicate symbols, requiring each to be of asset class ``want``."""
    out: list[str] = []
    for raw in raw_symbols:
        try:
            sym = normalize_symbol(raw)
        except ValueError as exc:
            raise ConfigError(f"invalid symbol in {field_name}: {raw!r} ({exc})") from exc
        if asset_class(sym) != want:
            hint = "crypto_universe" if want == "stock" else "universe"
            raise ConfigError(f"{field_name} accepts {want} symbols only: {raw!r} belongs in {hint}")
        if sym not in out:
            out.append(sym)
    return out


def _validate_crypto_strategy(cfg: Config) -> StrategyConfig:
    """Type-check the crypto overrides, store them coerced, and validate the merged strategy."""
    merged = cfg.crypto_strategy_config()
    clean: dict[str, Any] = {}
    for key, value in cfg.crypto_strategy.items():
        if key == "weights":
            _require(isinstance(value, dict), "crypto_strategy.weights must be an object")
            clean[key] = {k: merged.weights[k] for k in value}
        else:
            clean[key] = getattr(merged, key)
    cfg.crypto_strategy = clean
    _validate_strategy(merged, "crypto_strategy")
    return merged


def validate(cfg: Config) -> Config:
    """Range-check a Config in place (normalizing symbols); return it or raise ConfigError."""
    _require(cfg.mode in MODES, f"mode must be one of {sorted(MODES)}: {cfg.mode!r}")
    _require(cfg.fund_scope in FUND_SCOPES, f"fund_scope must be one of {sorted(FUND_SCOPES)}: {cfg.fund_scope!r}")
    _require(cfg.data_source in DATA_SOURCES,
             f"data_source must be one of {sorted(DATA_SOURCES)}: {cfg.data_source!r}")
    _require(cfg.bar_interval in BAR_INTERVALS,
             f"bar_interval must be one of {sorted(BAR_INTERVALS)}: {cfg.bar_interval!r}")
    _require(cfg.crypto_data_source in CRYPTO_DATA_SOURCES,
             f"crypto_data_source must be one of {sorted(CRYPTO_DATA_SOURCES)}: {cfg.crypto_data_source!r}")
    allowed = CRYPTO_BAR_INTERVALS[cfg.crypto_data_source]
    _require(cfg.crypto_bar_interval in allowed,
             f"crypto_bar_interval for {cfg.crypto_data_source} must be one of {sorted(allowed)}: "
             f"{cfg.crypto_bar_interval!r}")
    _require(cfg.enable_stocks or cfg.enable_crypto, "enable_stocks and enable_crypto cannot both be false")
    _require(cfg.initial_fund > 0.0, f"initial_fund must be > 0: {cfg.initial_fund}")
    _require(1 <= cfg.poll_seconds <= 86400, f"poll_seconds out of range: {cfg.poll_seconds}")
    _require(cfg.commission_per_trade >= 0.0, f"commission_per_trade must be >= 0: {cfg.commission_per_trade}")
    _require(0.0 <= cfg.slippage_bps <= 1000.0, f"slippage_bps out of range: {cfg.slippage_bps}")
    _require(0.0 <= cfg.crypto_slippage_bps <= 1000.0, f"crypto_slippage_bps out of range: {cfg.crypto_slippage_bps}")
    _require(bool(cfg.db_path), "db_path must not be empty")

    cfg.universe = _clean_symbols(cfg.universe, "universe", "stock")
    cfg.crypto_universe = _clean_symbols(cfg.crypto_universe, "crypto_universe", "crypto")
    _require(bool(cfg.universe) or not cfg.enable_stocks, "universe must contain at least one ticker")
    _require(bool(cfg.crypto_universe) or not cfg.enable_crypto,
             "crypto_universe must contain at least one pair while enable_crypto is true")

    _validate_risk(cfg.risk)
    _validate_crypto_risk(cfg.crypto_risk)
    _validate_strategy(cfg.strategy)
    crypto = _validate_crypto_strategy(cfg)
    _validate_forecast(cfg.forecast)
    _validate_server(cfg.server)

    need = max(max(s.slow_sma, s.momentum_lookback, s.rsi_period) for s in (cfg.strategy, crypto)) + 1
    _require(need <= cfg.lookback_bars <= 5000,
             f"lookback_bars must be between {need} (longest indicator + 1) and 5000: {cfg.lookback_bars}")
    _require(not cfg.forecast.enabled or cfg.lookback_bars >= cfg.forecast.min_bars,
             f"lookback_bars must be >= forecast.min_bars ({cfg.forecast.min_bars}) while forecasting "
             f"is enabled: {cfg.lookback_bars}")
    return cfg


def _defaults_dict() -> dict[str, Any]:
    data = Config().to_dict()
    data["db_path"] = "data/autotrader.db"
    return data


def _merge_crypto_strategy(base: dict[str, Any], override: Any) -> dict[str, Any]:
    """Layer user crypto_strategy overrides over the default overrides (weights merged)."""
    if not isinstance(override, dict):
        raise ConfigError("crypto_strategy must be an object")
    merged = dict(base)
    for key, value in override.items():
        if key == "weights" and isinstance(value, dict) and isinstance(merged.get("weights"), dict):
            merged["weights"] = {**merged["weights"], **value}
        else:
            merged[key] = value
    return merged


def from_dict(data: dict[str, Any]) -> Config:
    """Deep-merge ``data`` over the defaults, build and validate a Config."""
    if not isinstance(data, dict):
        raise ConfigError("config must be a JSON object")
    data = dict(data)
    crypto_override = data.pop("crypto_strategy", None)
    merged = _deep_merge(_defaults_dict(), data)
    if crypto_override is not None:
        merged["crypto_strategy"] = _merge_crypto_strategy(merged["crypto_strategy"], crypto_override)
    return validate(_build(Config, merged))


def load_config(path: str | None) -> Config:
    """Load defaults deep-merged with the JSON file at ``path`` (defaults only if None)."""
    if path is None:
        return validate(Config())
    try:
        text = Path(path).expanduser().read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"cannot read config file {path}: {exc}") from exc
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"invalid JSON in {path}: {exc}") from exc
    return from_dict(data)


def demo_config() -> Config:
    """Offline demo: simulated broker, synthetic stock and crypto data, no market hours, fast polling.

    Every 2 s tick adds a synthetic 5m bar, so the wall-clock trade cap and cooldowns are scaled
    down to match; otherwise the demo would hit the daily cap within minutes and stop trading.
    """
    return validate(Config(
        mode="sim",
        data_source="synthetic",
        crypto_data_source="synthetic",
        respect_market_hours=False,
        poll_seconds=2,
        initial_fund=10000.0,
        db_path="data/demo.db",
        risk=RiskConfig(max_trades_per_day=10000, cooldown_minutes=1),
        crypto_risk=CryptoRiskConfig(cooldown_minutes=1),
    ))
