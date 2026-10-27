import math
import re

DEFAULTS = {
    "capital": 1000.0, "symbols": ["WETH", "CBBTC"],
    "fast": 5, "slow": 20, "position_pct": 45.0, "invested_pct": 95.0,
    "stop_pct": 5.0, "take_pct": 12.0, "daily_loss_pct": 3.0,
    "drawdown_pct": 10.0, "max_orders_day": 12, "interval": 60,
    "slippage_bps": 50, "max_deviation_bps": 200, "max_gas_eth": 0.0003, "daily_gas_eth": 0.003,
}


def validate(data):
    unknown = set(data) - set(DEFAULTS)
    if unknown:
        raise ValueError("Unknown configuration fields: " + ", ".join(sorted(unknown)))
    cfg = {**DEFAULTS, **data}
    symbols = cfg["symbols"]
    if isinstance(symbols, str):
        symbols = re.split(r"[\s,]+", symbols.upper().strip())
    if not isinstance(symbols, list) or not 1 <= len(symbols) <= 2:
        raise ValueError("Choose WETH, CBBTC, or both.")
    if any(s not in ("WETH", "CBBTC") for s in symbols):
        raise ValueError("Supported Base tokens: WETH and CBBTC (Coinbase wrapped BTC).")
    cfg["symbols"] = list(dict.fromkeys(symbols))
    bounds = {"capital": (25, 100000000), "fast": (2, 50), "slow": (3, 100),
              "position_pct": (1, 100), "invested_pct": (1, 100), "stop_pct": (0.1, 50),
              "take_pct": (0.1, 200), "daily_loss_pct": (0.1, 50), "drawdown_pct": (0.1, 80),
              "max_orders_day": (1, 100), "interval": (15, 3600),
              "slippage_bps": (1, 300), "max_deviation_bps": (10, 500),
              "max_gas_eth": (0.000001, 0.01), "daily_gas_eth": (0.000001, 0.1)}
    ints = {"fast", "slow", "max_orders_day", "interval", "slippage_bps", "max_deviation_bps"}
    for key, (low, high) in bounds.items():
        value = cfg[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"{key} must be a finite number.")
        if not low <= value <= high or (key in ints and int(value) != value):
            raise ValueError(f"{key} must be {'an integer ' if key in ints else ''}between {low} and {high}.")
        cfg[key] = int(value) if key in ints else float(value)
    if cfg["fast"] >= cfg["slow"]:
        raise ValueError("The fast average must be shorter than the slow average.")
    return cfg
