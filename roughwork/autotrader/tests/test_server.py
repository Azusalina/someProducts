"""In-process tests for the dashboard HTTP server driving a real Engine (SyntheticData + PaperBroker)."""

from __future__ import annotations

import http.client
import json
import os
import stat
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from autotrader.broker import PaperBroker
from autotrader.config import Config, ServerConfig
from autotrader.data import SyntheticData
from autotrader.engine import Engine
from autotrader.models import Fill, Order
from autotrader.server import (
    INDEX_PATH,
    MAX_BODY_BYTES,
    TOKEN_PLACEHOLDER,
    allowed_hosts,
    load_or_create_token,
    make_server,
)
from autotrader.store import Store
from autotrader import server as server_mod

TOKEN = "test-token-0123456789abcdef"


class Client:
    """Minimal raw HTTP client so tests control every header."""

    def __init__(self, port: int) -> None:
        self.port = port

    def request(self, method: str, path: str, body: bytes | str | dict | None = None,
                headers: dict[str, str] | None = None, token: str | None = TOKEN,
                host: str | None = None) -> tuple[int, dict[str, str], bytes]:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            hdrs: dict[str, str] = {"Host": host or f"127.0.0.1:{self.port}"}
            if token is not None:
                hdrs["X-Auth-Token"] = token
            payload: bytes | None = None
            if isinstance(body, dict):
                payload = json.dumps(body).encode()
                hdrs["Content-Type"] = "application/json"
            elif isinstance(body, str):
                payload = body.encode()
            elif body is not None:
                payload = body
            hdrs.update(headers or {})
            conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            for key, value in hdrs.items():
                conn.putheader(key, value)
            if payload is not None and "Content-Length" not in hdrs:
                conn.putheader("Content-Length", str(len(payload)))
            conn.endheaders()
            if payload is not None:
                try:
                    conn.send(payload)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            resp = conn.getresponse()
            return resp.status, {k.lower(): v for k, v in resp.getheaders()}, resp.read()
        finally:
            conn.close()

    def json(self, method: str, path: str, body: Any = None, **kw: Any) -> tuple[int, Any]:
        status, _, raw = self.request(method, path, body, **kw)
        return status, json.loads(raw)


@pytest.fixture
def engine(demo_cfg: Config, store: Store) -> Engine:
    """A real engine on synthetic data and the paper broker; not ticked yet (cash == initial fund)."""
    data = SyntheticData(seed=7, interval=demo_cfg.bar_interval)
    broker = PaperBroker(store, data.get_price, demo_cfg.initial_fund, slippage_bps=demo_cfg.slippage_bps)
    return Engine(demo_cfg, data, broker, store)


def messages(store: Store) -> list[str]:
    return [e["message"] for e in store.recent_events(500)]


@pytest.fixture
def client(engine: Engine) -> Iterator[Client]:
    server = make_server(engine, ServerConfig(host="127.0.0.1", port=0), TOKEN)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        yield Client(server.server_address[1])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


GET_ROUTES = ["/api/state", "/api/equity", "/api/trades", "/api/events", "/api/config"]
POST_ROUTES = ["/api/control", "/api/universe", "/api/fund"]


# ---- auth & guards ------------------------------------------------------------------------

@pytest.mark.parametrize("path", GET_ROUTES)
def test_get_routes_require_token(client: Client, path: str) -> None:
    status, data = client.json("GET", path, token=None)
    assert status == 401
    assert "error" in data


@pytest.mark.parametrize("path", POST_ROUTES)
def test_post_routes_require_token(client: Client, engine: Engine, path: str) -> None:
    universe, allocation = engine.universe, engine.allocation()
    status, data = client.json("POST", path, {"action": "pause"}, token=None)
    assert status == 401 and "error" in data
    assert not engine.paused and engine.universe == universe and engine.allocation() == allocation


@pytest.mark.parametrize("path", GET_ROUTES + POST_ROUTES + ["/api/nope"])
def test_wrong_token_is_401(client: Client, path: str) -> None:
    method = "POST" if path in POST_ROUTES else "GET"
    status, data = client.json(method, path, {"action": "pause"} if method == "POST" else None,
                               token="wrong-token-xxxxxxxx")
    assert status == 401
    assert data == {"error": "invalid auth token"}


@pytest.mark.parametrize("host", ["evil.example.com", "evil.example.com:8765", "127.0.0.2", ""])
def test_bad_host_is_403(client: Client, host: str) -> None:
    status, data = client.json("GET", "/api/state", host=host or " ")
    assert status == 403
    assert data["error"] == "host not allowed"


def test_bad_host_blocks_index_too(client: Client) -> None:
    status, _, body = client.request("GET", "/", token=None, host="attacker.test")
    assert status == 403
    assert TOKEN.encode() not in body


@pytest.mark.parametrize("host", ["localhost:1234", "127.0.0.1", "[::1]:8765", "LOCALHOST"])
def test_loopback_hosts_allowed(client: Client, host: str) -> None:
    status, _ = client.json("GET", "/api/state", host=host)
    assert status == 200


def test_allowed_hosts_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server_mod, "local_host_names", lambda: frozenset({"mybox", "192.168.1.5"}))
    assert "192.168.1.5" in allowed_hosts(ServerConfig(host="192.168.1.5"))
    assert "[fe80::1]" in allowed_hosts(ServerConfig(host="fe80::1"))
    for wildcard in ("0.0.0.0", "::", "[::]"):
        hosts = allowed_hosts(ServerConfig(host=wildcard, allowed_hosts=["trader.lan"]))
        assert {"127.0.0.1", "localhost", "[::1]", "mybox", "192.168.1.5", "trader.lan"} <= hosts
        assert "rebind.attacker.com" not in hosts and wildcard not in hosts


def test_local_host_names_are_host_header_values() -> None:
    names = server_mod.local_host_names()
    assert all(n == n.lower() and " " not in n for n in names)
    assert all(n.startswith("[") for n in names if ":" in n)


def serve(engine: Engine, cfg: ServerConfig, token: str = TOKEN) -> tuple[Any, threading.Thread]:
    server = make_server(engine, cfg, token)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    return server, thread


def test_wildcard_bind_keeps_the_dns_rebinding_guard(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server_mod, "local_host_names", lambda: frozenset({"mybox"}))
    server, thread = serve(engine, ServerConfig(host="0.0.0.0", port=0))
    try:
        c = Client(server.server_address[1])
        status, _, body = c.request("GET", "/", token=None, host="rebind.attacker.com")
        assert status == 403 and TOKEN.encode() not in body
        status, data = c.json("POST", "/api/control", {"action": "pause"}, host="rebind.attacker.com")
        assert status == 403 and data["error"] == "host not allowed"
        assert not engine.paused
        assert c.json("GET", "/api/state", host=f"mybox:{c.port}")[0] == 200
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_remote_clients_must_present_the_token_to_load_the_page(
        engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server_mod, "_is_loopback_client", lambda address: False)
    server, thread = serve(engine, ServerConfig(host="127.0.0.1", port=0))
    try:
        c = Client(server.server_address[1])
        status, _, body = c.request("GET", "/", token=None)
        assert status == 401 and TOKEN.encode() not in body and b"?token=" in body
        assert c.request("GET", "/?token=wrong-token-xxxx", token=None)[0] == 401
        status, headers, _ = c.request("GET", f"/?token={TOKEN}", token=None)
        assert status == 303 and headers["location"] == "/"
        cookie = headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=Strict" in cookie and TOKEN not in cookie
        session = cookie.split(";", 1)[0]
        status, _, body = c.request("GET", "/", token=None, headers={"Cookie": session})
        assert status == 200 and f'const TOKEN = "{TOKEN}";'.encode() in body
        forged = session.split("=", 1)[0] + "=" + "0" * 64
        assert c.request("GET", "/", token=None, headers={"Cookie": forged})[0] == 401
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_no_cors_headers(client: Client) -> None:
    status, headers, _ = client.request("GET", "/api/state", headers={"Origin": "http://evil.test"})
    assert status == 200
    assert not any(k.startswith("access-control-") for k in headers)


# ---- body validation ----------------------------------------------------------------------

def test_bad_json_is_400(client: Client, engine: Engine) -> None:
    status, data = client.json("POST", "/api/control", "{not json",
                               headers={"Content-Type": "application/json"})
    assert status == 400 and data["error"] == "invalid JSON body"
    assert not engine.paused


def test_non_object_json_is_400(client: Client) -> None:
    status, data = client.json("POST", "/api/control", "[1, 2]", headers={"Content-Type": "application/json"})
    assert status == 400 and "object" in data["error"]


def test_body_too_large_is_413(client: Client, engine: Engine) -> None:
    big = json.dumps({"symbols": ["A"] * (MAX_BODY_BYTES // 4)}).encode()
    assert len(big) > MAX_BODY_BYTES
    status, data = client.json("POST", "/api/universe", big, headers={"Content-Type": "application/json"})
    assert status == 413 and "error" in data
    assert engine.universe == list(engine.config.universe)


def test_wrong_content_type_is_415(client: Client) -> None:
    status, data = client.json("POST", "/api/control", json.dumps({"action": "pause"}),
                               headers={"Content-Type": "text/plain"})
    assert status == 415 and "error" in data


def test_content_type_with_charset_accepted(client: Client, engine: Engine) -> None:
    status, _ = client.json("POST", "/api/control", json.dumps({"action": "pause"}),
                            headers={"Content-Type": "application/json; charset=utf-8"})
    assert status == 200
    assert engine.paused


def test_missing_content_length_is_411(client: Client) -> None:
    status, data = client.json("POST", "/api/control", headers={"Content-Type": "application/json"})
    assert status == 411 and "error" in data


# ---- routing ------------------------------------------------------------------------------

def test_pause_and_resume_drive_engine(client: Client, engine: Engine) -> None:
    status, data = client.json("POST", "/api/control", {"action": "pause"})
    assert status == 200 and data["ok"] is True and data["action"] == "pause"
    assert engine.paused and data["state"]["status"] == "paused"
    status, data = client.json("POST", "/api/control", {"action": "resume"})
    assert status == 200 and not engine.paused and data["state"]["status"] == "running"


def test_liquidate_sells_everything(client: Client, engine: Engine, store: Store) -> None:
    engine.tick()
    assert engine.snapshot()["positions"], "first demo tick should open positions"
    status, data = client.json("POST", "/api/control", {"action": "liquidate"})
    assert status == 200 and data["state"]["positions"] == []
    assert data["state"]["status"] == "running"
    assert any("liquidation (dashboard request)" in m for m in messages(store))


def test_kill_liquidates_and_halts_until_resume(client: Client, engine: Engine, store: Store) -> None:
    engine.tick()
    status, data = client.json("POST", "/api/control", {"action": "kill"})
    assert status == 200 and data["state"]["status"] == "halted"
    assert data["state"]["positions"] == []
    assert "dashboard request" in data["state"]["halt_reason"]
    assert any("kill switch engaged: dashboard request" in m for m in messages(store))
    status, data = client.json("POST", "/api/control", {"action": "resume"})
    assert status == 200 and data["state"]["status"] == "running"


def test_unknown_control_action_is_400(client: Client, engine: Engine) -> None:
    status, data = client.json("POST", "/api/control", {"action": "explode"})
    assert status == 400 and "action" in data["error"]
    assert not engine.paused


def test_universe_routes_to_engine(client: Client, engine: Engine) -> None:
    status, data = client.json("POST", "/api/universe", {"symbols": ["nvda", " amd "]})
    assert status == 200
    assert data == {"ok": True, "universe": ["NVDA", "AMD"]}
    assert engine.universe == ["NVDA", "AMD"]
    assert engine.snapshot()["universe"] == ["NVDA", "AMD"]


@pytest.mark.parametrize("body", [{"symbols": "AAPL"}, {"symbols": [1, 2]}, {}])
def test_universe_rejects_bad_shape(client: Client, engine: Engine, body: dict) -> None:
    status, _ = client.json("POST", "/api/universe", body)
    assert status == 400
    assert engine.universe == list(engine.config.universe)


def test_universe_engine_validation_error_is_400(client: Client) -> None:
    status, data = client.json("POST", "/api/universe", {"symbols": ["BAD$"]})
    assert status == 400 and data["error"].startswith("invalid ticker")


def test_fund_deposit_and_withdraw(client: Client, engine: Engine) -> None:
    status, data = client.json("POST", "/api/fund", {"delta": 500})
    assert status == 200 and data == {"ok": True, "allocation": 10500.0}
    assert engine.broker.get_account().cash == pytest.approx(10500.0)
    status, data = client.json("POST", "/api/fund", {"delta": -1500.5})
    assert status == 200 and data["allocation"] == pytest.approx(8999.5)
    assert engine.allocation() == pytest.approx(8999.5)
    assert engine.snapshot()["pnl"]["today"] == pytest.approx(0.0)


@pytest.mark.parametrize("delta", ["100", True, None, 0])
def test_fund_rejects_bad_delta(client: Client, engine: Engine, delta: Any) -> None:
    status, _ = client.json("POST", "/api/fund", {"delta": delta})
    assert status == 400
    assert engine.allocation() == pytest.approx(10000.0)


def test_fund_rejects_non_finite(client: Client) -> None:
    status, _ = client.json("POST", "/api/fund", '{"delta": NaN}', headers={"Content-Type": "application/json"})
    assert status == 400


def test_fund_overdraw_is_400(client: Client) -> None:
    status, data = client.json("POST", "/api/fund", {"delta": -1e9})
    assert status == 400 and "cannot withdraw" in data["error"]


def test_state_is_json_safe(client: Client, engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    real_snapshot = engine.snapshot
    monkeypatch.setattr(engine, "snapshot", lambda: {**real_snapshot(), "ratio": float("nan")})
    status, headers, raw = client.request("GET", "/api/state")
    assert status == 200
    assert headers["content-type"].startswith("application/json")
    assert headers["cache-control"] == "no-store"
    data = json.loads(raw)
    assert data["account"]["equity"] == pytest.approx(10000.0)
    assert data["ratio"] is None


def test_state_after_ticks_has_dashboard_keys(client: Client, engine: Engine) -> None:
    for _ in range(3):
        engine.tick()
    status, data = client.json("GET", "/api/state")
    assert status == 200
    assert data["status"] == "running" and data["mode"] == "sim" and data["is_live"] is False
    assert {"equity", "cash", "deployable"} <= data["bot"].keys()
    assert {"today", "realized_total", "unrealized", "total"} <= data["pnl"].keys()
    assert data["positions"] and data["signals"]
    for pos in data["positions"]:
        assert {"symbol", "qty", "avg_price", "price", "market_value", "unrealized_pnl",
                "unrealized_pct", "stop", "target", "trail"} <= pos.keys()
    for sig in data["signals"]:
        assert {"symbol", "score", "price", "reason", "components"} <= sig.keys()
    status, trades = client.json("GET", "/api/trades")
    assert status == 200 and trades["fills"] and trades["orders"]
    status, curve = client.json("GET", "/api/equity")
    assert status == 200 and len(curve["points"]) == 3


def test_equity_trades_events(client: Client, store: Store) -> None:
    for i in range(5):
        store.record_equity(1000.0 + i, 10000.0 + i, 5000.0, 10000.0)
    store.record_order(Order("o1", "AAPL", "buy", 2.0, "filled", 1000.0, 2.0, 150.0, "entry"))
    store.record_fill(Fill("o1", "AAPL", "buy", 2.0, 150.0, 0.0, 1000.0))
    store.log_event("trade", "BUY 2 AAPL @ 150.00")

    status, data = client.json("GET", "/api/equity?limit=3")
    assert status == 200 and [p["equity"] for p in data["points"]] == [10002.0, 10003.0, 10004.0]
    status, data = client.json("GET", "/api/trades?limit=10")
    assert status == 200 and data["fills"][0]["symbol"] == "AAPL" and data["orders"][0]["id"] == "o1"
    status, data = client.json("GET", "/api/events")
    assert status == 200 and data["events"][0]["message"] == "BUY 2 AAPL @ 150.00"


def test_equity_max_points_downsamples_keeping_both_ends(client: Client, store: Store) -> None:
    for i in range(100):
        store.record_equity(1000.0 + i, 10000.0 + i, 5000.0, 10000.0)
    status, data = client.json("GET", "/api/equity?limit=1000&max_points=10")
    eq = [p["equity"] for p in data["points"]]
    assert status == 200 and len(eq) == 10 and eq[0] == 10000.0 and eq[-1] == 10099.0
    assert eq == sorted(eq)
    assert server_mod.downsample([{"v": 1}], 5) == [{"v": 1}]


@pytest.mark.parametrize("query", ["limit=abc", "limit=0", "limit=-5", "max_points=1", "max_points=x"])
def test_bad_limit_is_400(client: Client, query: str) -> None:
    status, _ = client.json("GET", f"/api/equity?{query}")
    assert status == 400


def test_config_redacts_token(client: Client, engine: Engine) -> None:
    engine.config.server.token = "super-secret-token"
    status, data = client.json("GET", "/api/config")
    assert status == 200
    assert data["mode"] == "sim"
    assert data["server"]["token"] == "***"
    assert engine.config.server.token == "super-secret-token"


def test_unknown_api_route_404_and_wrong_method_405(client: Client) -> None:
    assert client.json("GET", "/api/missing")[0] == 404
    assert client.json("GET", "/api/control")[0] == 405
    assert client.json("POST", "/api/state", {"x": 1})[0] == 405


def test_engine_exception_is_500_json(client: Client, engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    def broken() -> dict[str, Any]:
        raise RuntimeError("broker unavailable")

    monkeypatch.setattr(engine, "snapshot", broken)
    status, data = client.json("GET", "/api/state")
    assert status == 500 and data == {"error": "broker unavailable"}


def test_unknown_path_is_404(client: Client) -> None:
    status, data = client.json("GET", "/nope", token=None)
    assert status == 404 and data["error"] == "not found"


# ---- dashboard ----------------------------------------------------------------------------

def test_index_injects_token(client: Client) -> None:
    status, headers, body = client.request("GET", "/", token=None)
    assert status == 200
    assert headers["content-type"].startswith("text/html")
    assert "frame-ancestors 'none'" in headers["content-security-policy"]
    html = body.decode()
    assert f'const TOKEN = "{TOKEN}";' in html
    assert TOKEN_PLACEHOLDER not in html


def test_index_token_is_escaped(engine: Engine) -> None:
    hostile = 'abc"</script><b>'
    server = make_server(engine, ServerConfig(host="127.0.0.1", port=0), hostile)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        status, _, body = Client(server.server_address[1]).request("GET", "/", token=None)
    finally:
        server.shutdown()
        server.server_close()
    html = body.decode()
    assert status == 200
    assert "</script><b>" not in html.split("const TOKEN", 1)[1].split(";", 1)[0]
    assert 'const TOKEN = "abc\\"\\u003c/script\\u003e\\u003cb\\u003e";' in html


def test_dashboard_template_contract() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    assert f'const TOKEN = "{TOKEN_PLACEHOLDER}";' in html
    assert "X-Auth-Token" in html
    assert "prefers-color-scheme: dark" in html
    for route in ("/api/state", "/api/equity", "/api/trades", "/api/events",
                  "/api/control", "/api/universe", "/api/fund"):
        assert route in html
    for key in ("bot.equity", "bot.cash", "bot.deployable", "pnl.realized_total", "pnl.unrealized",
                "pnl.today", "pnl.total", "s.entry_block", "s.halt_reason", "s.last_tick_ts", "p.avg_price",
                "p.unrealized_pnl", "p.market_value", "p.stop", "p.target", "p.trail"):
        assert key in html, key
    assert "http://" not in html.replace("http://www.w3.org", "") and "https://" not in html


def test_make_server_requires_token(engine: Engine) -> None:
    with pytest.raises(ValueError):
        make_server(engine, ServerConfig(host="127.0.0.1", port=0), "")


# ---- token persistence --------------------------------------------------------------------

def test_load_or_create_token_persists(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    token = load_or_create_token(data_dir)
    assert len(token) >= 32
    path = data_dir / "token"
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    assert load_or_create_token(data_dir) == token


def test_load_or_create_token_prefers_configured(tmp_path: Path) -> None:
    assert load_or_create_token(tmp_path, configured="configured-token") == "configured-token"
    assert not (tmp_path / "token").exists()


def test_load_or_create_token_replaces_short_token(tmp_path: Path) -> None:
    (tmp_path / "token").write_text("short\n")
    token = load_or_create_token(tmp_path)
    assert token != "short" and len(token) >= 32


def test_server_allowed_hosts_config_is_validated() -> None:
    from autotrader.config import ConfigError, from_dict

    cfg = from_dict({"server": {"host": "0.0.0.0", "allowed_hosts": ["Trader.LAN", "192.168.1.5", "::1"]}})
    assert cfg.server.allowed_hosts == ["trader.lan", "192.168.1.5", "::1"]
    for bad in (["*"], ["evil.com:80"], ["ab:80"], ["[::1"], [""], ["a b"]):
        with pytest.raises(ConfigError):
            from_dict({"server": {"allowed_hosts": bad}})
