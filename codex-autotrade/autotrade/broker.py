"""Public crypto reference prices and deterministic offline simulation."""
import json
import math
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

TOKENS = {
    "WETH": {"address": "0x4200000000000000000000000000000000000006", "decimals": 18, "product": "ETH-USD"},
    "CBBTC": {"address": "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "decimals": 8, "product": "BTC-USD"},
}
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"
QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"


class BrokerError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def positive(value, name):
    value = float(value)
    if not math.isfinite(value) or value <= 0:
        raise BrokerError(f"Invalid {name} returned by data provider.")
    return value


class PublicFeed:
    connected = True
    base = "Coinbase public reference data / no trading account"

    def get(self, path):
        req = urllib.request.Request("https://api.exchange.coinbase.com" + path,
            headers={"User-Agent": "LocalAutotrade/1.0", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                return json.loads(response.read(1000000))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise BrokerError("Public crypto price feed is unavailable; no orders will be submitted.") from None

    def market(self, symbols, slow):
        result = {}
        now = datetime.now(timezone.utc)
        for symbol in symbols:
            product = TOKENS[symbol]["product"]
            raw = self.get(f"/products/{product}/candles?granularity=3600")
            ticker = self.get(f"/products/{product}/ticker")
            bars = sorted([b for b in raw if b[0] + 3600 <= now.timestamp()], key=lambda b: b[0])[-max(slow + 5, 25):]
            closes = [positive(b[4], "hourly close") for b in bars]
            price = positive(ticker["price"], "reference price")
            age = (now - timestamp(ticker["time"])).total_seconds()
            contiguous = all(bars[i][0] - bars[i - 1][0] == 3600 for i in range(1, len(bars)))
            history_fresh = bool(bars) and now.timestamp() - bars[-1][0] <= 7200
            previous = bars[-25][4] if len(bars) >= 25 else None
            result[symbol] = {"symbol": symbol, "price": price, "closes": closes,
                "history": [{"t": datetime.fromtimestamp(b[0], timezone.utc).isoformat(), "value": float(b[4])} for b in bars],
                "change": (price / previous - 1) * 100 if previous else None,
                "time": ticker["time"], "fresh": -5 <= age <= 120 and contiguous and history_fresh,
                "source": f"Coinbase {product} reference · USDC ≈ USD assumption"}
        return result, True, None


def demo_market(symbols, tick, slow):
    bases = {"WETH": 3200, "CBBTC": 85000}
    now = datetime.now(timezone.utc)
    quotes = {}
    for symbol in symbols:
        seed = sum((i + 1) * ord(c) for i, c in enumerate(symbol))
        base = bases[symbol]
        def at(n):
            return base * (1 + .025 * math.sin(n / 12 + seed % 7) + .01 * math.sin(n / 4 + seed % 3) + .0003 * n)
        prices = [round(at(tick + n - slow - 5), 4) for n in range(slow + 5)]
        price = round(at(tick), 4)
        quotes[symbol] = {"symbol": symbol, "price": price, "closes": prices,
            "history": [{"t": (now - timedelta(hours=len(prices) - i)).isoformat(), "value": p} for i, p in enumerate(prices)],
            "change": (price / prices[0] - 1) * 100, "time": now.isoformat(), "fresh": True,
            "source": "Synthetic crypto demo / USDC"}
    return quotes, True, None
