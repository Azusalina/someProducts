"""Stdlib HTTP dashboard and token-protected JSON API for a running Engine."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import math
import os
import secrets
import socket
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from http.cookies import CookieError, SimpleCookie
from typing import Any
from urllib.parse import parse_qs, urlsplit

from .config import ServerConfig
from .engine import CHART_DEFAULT_BARS, Engine, EngineBusy, clamp_chart_bars
from .models import asset_class, to_dict

log = logging.getLogger(__name__)

WEB_DIR: Path = Path(__file__).resolve().parent / "web"
INDEX_PATH: Path = WEB_DIR / "index.html"
TOKEN_PLACEHOLDER: str = "__AUTOTRADER_TOKEN__"
TOKEN_HEADER: str = "X-Auth-Token"
MAX_BODY_BYTES: int = 64 * 1024
LOOPBACK_HOSTS: frozenset[str] = frozenset({"127.0.0.1", "localhost", "[::1]"})
WILDCARD_HOSTS: frozenset[str] = frozenset({"0.0.0.0", "[::]"})
COOKIE_NAME: str = "autotrader_session"
CONTROL_ACTIONS: frozenset[str] = frozenset({"pause", "resume", "liquidate", "kill"})
CONTROL_REASON: str = "dashboard request"
UNIVERSE_CLASSES: frozenset[str] = frozenset({"stock", "crypto"})

_LIMITS: dict[str, tuple[int, int]] = {  # route -> (default, maximum)
    "/api/equity": (2000, 200_000),  # long ranges are meant to be read with max_points
    "/api/trades": (100, 1000),
    "/api/events": (200, 2000),
}

def downsample(points: list[dict], max_points: int | None) -> list[dict]:
    """At most ``max_points`` evenly spaced points, always keeping the first and the newest."""
    if max_points is None or len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(i * step)] for i in range(max_points)]


_HTML_HEADERS: dict[str, str] = {
    "Content-Security-Policy": (
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'none'"
    ),
    "X-Frame-Options": "DENY",
}


_LOGIN_HTML: bytes = (
    b"<!doctype html><meta charset=utf-8><title>AutoTrader</title>"
    b"<p>This dashboard is not on this machine's loopback address. Open it once as "
    b"<code>/?token=&lt;API token&gt;</code> using the token printed when AutoTrader started "
    b"(or saved in <code>data/token</code>).</p>"
)


class ApiError(Exception):
    """An error that maps directly onto an HTTP status and JSON message."""

    def __init__(self, status: HTTPStatus, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def load_or_create_token(data_dir: str | Path, configured: str | None = None) -> str:
    """Return ``configured`` if set, else the token persisted in ``data_dir/token`` (created 0600)."""
    if configured:
        return configured
    directory = Path(data_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "token"
    try:
        existing = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        existing = ""
    if len(existing) >= 16:
        os.chmod(path, 0o600)
        return existing
    token = secrets.token_urlsafe(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(token + "\n")
    os.chmod(path, 0o600)
    return token


def _normalize_host(header: str) -> str:
    """Strip the port from a Host header value and lowercase it."""
    host = header.strip().lower()
    if host.startswith("["):
        end = host.find("]")
        return host[: end + 1] if end != -1 else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def _host_literal(host: str) -> str:
    """Lowercase ``host`` as it appears in a Host header (IPv6 addresses bracketed)."""
    host = host.strip().lower()
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    return host


def is_loopback_host(host: str) -> bool:
    """Whether ``host`` (a bind address or name) only accepts connections from this machine."""
    name = host.strip().lower().strip("[]")
    if name == "localhost":
        return True
    try:
        return ipaddress.ip_address(name).is_loopback
    except ValueError:
        return False


def _is_loopback_client(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    return (mapped or ip).is_loopback


def local_host_names() -> frozenset[str]:
    """This machine's host name and interface addresses, as Host header values (no network traffic)."""
    names: set[str] = set()
    try:
        hostname = socket.gethostname().strip().lower()
    except OSError:
        hostname = ""
    if hostname:
        names |= {hostname, f"{hostname}.local"}
        try:
            for info in socket.getaddrinfo(hostname, None):
                names.add(str(info[4][0]))
        except OSError:
            pass
    for family, probe in ((socket.AF_INET, "192.0.2.1"), (socket.AF_INET6, "2001:db8::1")):
        try:  # connecting a UDP socket picks the outbound interface without sending anything
            with socket.socket(family, socket.SOCK_DGRAM) as sock:
                sock.connect((probe, 9))
                names.add(str(sock.getsockname()[0]))
        except OSError:
            pass
    return frozenset(_host_literal(n.split("%", 1)[0]) for n in names if n)


def allowed_hosts(cfg: ServerConfig) -> frozenset[str]:
    """Host header values accepted for ``cfg``: loopback names, the bind host and ``allowed_hosts``.

    A wildcard bind (0.0.0.0 / ::) accepts this machine's own name and addresses instead of the
    bind host, never an arbitrary Host, so DNS rebinding stays blocked.
    """
    configured = _host_literal(cfg.host)
    extra = {_host_literal(h) for h in cfg.allowed_hosts}
    if configured in WILDCARD_HOSTS:
        return LOOPBACK_HOSTS | local_host_names() | extra
    return LOOPBACK_HOSTS | {configured} | extra


def dashboard_cookie(token: str) -> str:
    """Cookie value proving a browser loaded the dashboard with the token (derived, not the token)."""
    return hmac.new(token.encode("utf-8"), b"autotrader-dashboard", hashlib.sha256).hexdigest()


def _render_index(token: str) -> bytes:
    """Read the dashboard and inject the token as a JS/HTML-safe string literal body."""
    literal = json.dumps(token)[1:-1].replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return INDEX_PATH.read_text(encoding="utf-8").replace(TOKEN_PLACEHOLDER, literal).encode("utf-8")


def _with_asset_class(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tag store rows (fills, orders) with the asset class of their symbol."""
    return [{**row, "asset_class": asset_class(str(row.get("symbol", "")))} for row in rows]


def _redacted_config(engine: Engine) -> dict[str, Any]:
    """The engine config as a dict with secrets removed."""
    data = to_dict(engine.config.to_dict())
    server = data.get("server")
    if isinstance(server, dict) and server.get("token"):
        server["token"] = "***"
    return data


class DashboardServer(ThreadingHTTPServer):
    """Threading HTTP server carrying the engine, token and host allow-list."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], engine: Engine, cfg: ServerConfig, token: str) -> None:
        if ":" in address[0]:
            self.address_family = socket.AF_INET6
        super().__init__(address, DashboardHandler)
        self.engine = engine
        self.cfg = cfg
        self.token = token
        self.hosts = allowed_hosts(cfg)
        if not is_loopback_host(cfg.host):
            log.warning("dashboard bound to %s: reachable from other machines; remote browsers must "
                        "open /?token=<API token> once (Host names accepted: %s)",
                        cfg.host, ", ".join(sorted(self.hosts)))


class DashboardHandler(BaseHTTPRequestHandler):
    """Routes dashboard and API requests; every /api route requires the auth token."""

    server: DashboardServer
    server_version = "AutoTrader"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - stdlib signature
        log.debug("%s %s", self.address_string(), format % args)

    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        self._dispatch("POST")

    def _dispatch(self, method: str) -> None:
        self._body_consumed = method != "POST"
        try:
            self._check_host()
            url = urlsplit(self.path)
            if url.path.startswith("/api/") or url.path == "/api":
                self._check_token()
                payload = self._route_api(method, url.path, parse_qs(url.query))
                self._send_json(HTTPStatus.OK, payload)
            elif method == "GET" and url.path in ("/", "/index.html"):
                self._index(parse_qs(url.query))
            elif method == "GET" and url.path == "/favicon.ico":
                self._send(HTTPStatus.NO_CONTENT, b"", "image/x-icon")
            else:
                raise ApiError(HTTPStatus.NOT_FOUND, "not found")
        except ApiError as exc:
            self._send_error(exc.status, exc.message)
        except EngineBusy as exc:
            self._send_error(HTTPStatus.SERVICE_UNAVAILABLE, str(exc))
        except ValueError as exc:
            self._send_error(HTTPStatus.BAD_REQUEST, str(exc) or "invalid request")
        except Exception as exc:  # engine/broker failures must not kill the handler thread
            log.exception("API request failed: %s %s", method, self.path)
            self._send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc) or type(exc).__name__)

    def _send_error(self, status: HTTPStatus, message: str) -> None:
        """Send a JSON error; drop the connection if an unread request body remains."""
        if not self._body_consumed:
            self.close_connection = True
        self._send_json(status, {"error": message})

    # ---- guards -------------------------------------------------------------------------

    def _check_host(self) -> None:
        host = _normalize_host(self.headers.get("Host", ""))
        if host not in self.server.hosts:
            raise ApiError(HTTPStatus.FORBIDDEN, "host not allowed")

    def _index(self, query: dict[str, list[str]]) -> None:
        """Serve the dashboard; the token is embedded only for local or already-authenticated browsers.

        A remote browser opens ``/?token=...`` once: it gets an HttpOnly SameSite=Strict session
        cookie and a redirect to ``/`` (dropping the token from the address bar).
        """
        token = self.server.token
        supplied = (query.get("token") or [""])[0]
        if supplied:
            if not hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8")):
                raise ApiError(HTTPStatus.UNAUTHORIZED, "invalid auth token")
            cookie = f"{COOKIE_NAME}={dashboard_cookie(token)}; Path=/; HttpOnly; SameSite=Strict"
            self._send(HTTPStatus.SEE_OTHER, b"", "text/plain; charset=utf-8",
                       {"Location": "/", "Set-Cookie": cookie})
            return
        if not (_is_loopback_client(self.client_address[0]) or self._has_session_cookie()):
            self._send(HTTPStatus.UNAUTHORIZED, _LOGIN_HTML, "text/html; charset=utf-8", _HTML_HEADERS)
            return
        self._send(HTTPStatus.OK, _render_index(token), "text/html; charset=utf-8", _HTML_HEADERS)

    def _has_session_cookie(self) -> bool:
        try:
            jar = SimpleCookie(self.headers.get("Cookie", ""))
        except CookieError:
            return False
        morsel = jar.get(COOKIE_NAME)
        return morsel is not None and hmac.compare_digest(
            morsel.value.encode("utf-8"), dashboard_cookie(self.server.token).encode("utf-8"))

    def _check_token(self) -> None:
        supplied = self.headers.get(TOKEN_HEADER, "")
        if not supplied:
            raise ApiError(HTTPStatus.UNAUTHORIZED, "missing auth token")
        if not hmac.compare_digest(supplied.encode("utf-8"), self.server.token.encode("utf-8")):
            raise ApiError(HTTPStatus.UNAUTHORIZED, "invalid auth token")

    def _read_json(self) -> dict[str, Any]:
        ctype = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            raise ApiError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json")
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ApiError(HTTPStatus.LENGTH_REQUIRED, "Content-Length required")
        try:
            length = int(raw_length)
        except ValueError:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid Content-Length") from None
        if length < 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid Content-Length")
        if length > MAX_BODY_BYTES:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, f"body exceeds {MAX_BODY_BYTES} bytes")
        body = self.rfile.read(length)
        self._body_consumed = True
        try:
            data = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(HTTPStatus.BAD_REQUEST, "invalid JSON body") from None
        if not isinstance(data, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "JSON body must be an object")
        return data

    # ---- routes -------------------------------------------------------------------------

    def _route_api(self, method: str, path: str, query: dict[str, list[str]]) -> dict[str, Any]:
        engine = self.server.engine
        get_routes = {"/api/state", "/api/equity", "/api/trades", "/api/events", "/api/config", "/api/chart"}
        post_routes = {"/api/control", "/api/universe", "/api/fund"}
        if path not in get_routes | post_routes:
            raise ApiError(HTTPStatus.NOT_FOUND, "unknown API route")
        if (method == "GET") != (path in get_routes):
            raise ApiError(HTTPStatus.METHOD_NOT_ALLOWED, f"{method} not allowed on {path}")

        if path == "/api/state":
            return engine.snapshot()
        if path == "/api/config":
            return _redacted_config(engine)
        if path == "/api/chart":
            return self._chart(engine, query)
        if method == "GET":
            store = engine.store
            limit = self._limit(path, query)
            if path == "/api/equity":
                return {"points": downsample(store.equity_curve(limit), self._max_points(query))}
            if path == "/api/trades":
                return {"fills": _with_asset_class(store.recent_fills(limit)),
                        "orders": _with_asset_class(store.recent_orders(limit))}
            return {"events": store.recent_events(limit)}

        body = self._read_json()
        if path == "/api/control":
            return self._control(engine, body)
        if path == "/api/universe":
            return self._universe(engine, body)
        delta = body.get("delta")
        if isinstance(delta, bool) or not isinstance(delta, (int, float)) or not math.isfinite(delta):
            raise ApiError(HTTPStatus.BAD_REQUEST, "delta must be a finite number")
        if delta == 0:
            raise ApiError(HTTPStatus.BAD_REQUEST, "delta must not be zero")
        return {"ok": True, "allocation": engine.adjust_fund(float(delta))}

    @staticmethod
    def _control(engine: Engine, body: dict[str, Any]) -> dict[str, Any]:
        action = body.get("action")
        if action not in CONTROL_ACTIONS:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"action must be one of {sorted(CONTROL_ACTIONS)}")
        if action == "pause":
            engine.pause()
        elif action == "resume":
            engine.resume()
        elif action == "liquidate":
            engine.liquidate(CONTROL_REASON)
        else:
            engine.kill(CONTROL_REASON)
        return {"ok": True, "action": action, "state": engine.snapshot()}

    @staticmethod
    def _universe(engine: Engine, body: dict[str, Any]) -> dict[str, Any]:
        """Replace the whole universe, or only one class when ``asset_class`` is "stock" or "crypto"."""
        symbols = body.get("symbols")
        if not isinstance(symbols, list) or not all(isinstance(s, str) for s in symbols):
            raise ApiError(HTTPStatus.BAD_REQUEST, "symbols must be a list of strings")
        cls = body.get("asset_class")
        if cls is not None and cls not in UNIVERSE_CLASSES:
            raise ApiError(HTTPStatus.BAD_REQUEST, f"asset_class must be one of {sorted(UNIVERSE_CLASSES)}")
        return {"ok": True, "universe": engine.set_universe(symbols, cls)}

    @staticmethod
    def _chart(engine: Engine, query: dict[str, list[str]]) -> dict[str, Any]:
        """Bars + forecast for ``?symbol=`` (400 if missing/invalid, 404 without data); ``bars`` clamped."""
        symbol = (query.get("symbol") or [""])[0].strip()
        if not symbol:
            raise ApiError(HTTPStatus.BAD_REQUEST, "symbol is required")
        n = CHART_DEFAULT_BARS
        raw = query.get("bars")
        if raw:
            try:
                n = int(raw[0])
            except ValueError:
                raise ApiError(HTTPStatus.BAD_REQUEST, "bars must be an integer") from None
        try:
            payload = engine.chart(symbol, clamp_chart_bars(n))
        except ValueError as exc:
            raise ApiError(HTTPStatus.BAD_REQUEST, str(exc) or "invalid symbol") from None
        if "error" in payload:
            raise ApiError(HTTPStatus.NOT_FOUND, str(payload["error"]))
        return payload

    @staticmethod
    def _max_points(query: dict[str, list[str]]) -> int | None:
        values = query.get("max_points")
        if not values:
            return None
        try:
            n = int(values[0])
        except ValueError:
            raise ApiError(HTTPStatus.BAD_REQUEST, "max_points must be an integer") from None
        if n < 2:
            raise ApiError(HTTPStatus.BAD_REQUEST, "max_points must be >= 2")
        return min(n, 10_000)

    @staticmethod
    def _limit(path: str, query: dict[str, list[str]]) -> int:
        default, maximum = _LIMITS[path]
        values = query.get("limit")
        if not values:
            return default
        try:
            limit = int(values[0])
        except ValueError:
            raise ApiError(HTTPStatus.BAD_REQUEST, "limit must be an integer") from None
        if limit < 1:
            raise ApiError(HTTPStatus.BAD_REQUEST, "limit must be >= 1")
        return min(limit, maximum)

    # ---- responses ----------------------------------------------------------------------

    def _send_json(self, status: HTTPStatus, payload: Any) -> None:
        safe = to_dict(payload) if isinstance(payload, dict) else payload
        body = json.dumps(safe, separators=(",", ":"), allow_nan=False, default=str).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _send(self, status: HTTPStatus, body: bytes, ctype: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if body:
            self.wfile.write(body)


def make_server(engine: Engine, cfg: ServerConfig, token: str) -> ThreadingHTTPServer:
    """Bind a dashboard server for ``engine`` on ``cfg.host:cfg.port`` (port 0 picks a free one)."""
    if not token:
        raise ValueError("a non-empty auth token is required")
    host = cfg.host.strip().strip("[]")
    return DashboardServer((host, cfg.port), engine, cfg, token)
