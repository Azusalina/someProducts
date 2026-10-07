"""Separate loopback management, TLS ingest, and public-certificate listeners."""
import hmac
import ipaddress
import json
import re
import secrets
import shutil
import sys
import socket
import ssl
import tempfile
import threading
import time
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode
from . import __version__
from .protocol import InvalidBatch, MAX_BODY
from .sample import sample_points
from .store import Store
from . import relay as relay_config
from .tls import prepare

WEB = Path(__file__).resolve().parents[1] / "web"


class HTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(20)
        return connection, address


class App:
    def __init__(self, data_dir, lan_ip, ui_port=4188, ingest_port=4189, trust_port=8080):
        self.data_dir = Path(data_dir)
        self.lan_ip = str(ipaddress.IPv4Address(lan_ip))
        self.tls = prepare(self.data_dir, self.lan_ip)
        self.store = Store(self.data_dir / "track.sqlite3")
        self.relay = None
        self.relay_lock = threading.Lock()
        self.relay_generation = 0
        self.relay_requested_at = 0
        self.relay_settings = relay_config.load(self.data_dir)
        self.csrf = secrets.token_urlsafe(32)
        self.servers = []
        try:
            for mode, host, port in (("ui", "127.0.0.1", ui_port), ("ingest", self.lan_ip, ingest_port),
                                     ("trust", self.lan_ip, trust_port)):
                server = HTTPServer((host, port), self.handler(mode))
                self.servers.append(server)
                if mode == "ingest":
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    context.minimum_version = ssl.TLSVersion.TLSv1_2
                    context.load_cert_chain(self.tls["cert"], self.tls["key"])
                    server.socket = context.wrap_socket(server.socket, server_side=True)
            self.ui_port, self.ingest_port, self.trust_port = [s.server_port for s in self.servers]
        except BaseException:
            for server in self.servers:
                server.server_close()
            raise
        self.threads = []

    @property
    def url(self):
        return f"http://127.0.0.1:{self.ui_port}"

    def start(self):
        for server in self.servers:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.threads.append(thread)
        return self

    def close(self):
        for server in self.servers:
            if self.threads:
                server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(timeout=5)

    def setup(self):
        receiver = f"https://{self.lan_ip}:{self.ingest_port}/api/overland"
        relay = self.relay
        relay_active = bool(relay and relay[1] > time.monotonic())
        relay_enabled = bool(self.relay_settings.get("enabled"))
        public_url = relay[0] if relay_active else self.relay_settings.get("public_url")
        if relay_enabled:
            receiver = public_url + "/api/overland" if public_url else None
        profile = f"http://{self.lan_ip}:{self.trust_port}/track.mobileconfig"
        return {"receiver": receiver, "relay_active": relay_active, "relay_enabled": relay_enabled,
                "relay_generating": bool(self.relay_requested_at and time.monotonic() - self.relay_requested_at < 120),
                "relay_mode": self.relay_settings["mode"], "lan_receiver": f"https://{self.lan_ip}:{self.ingest_port}/api/overland", "profile": profile, "token": self.tls["config"]["token"],
                "fingerprint": self.tls["fingerprint"], "data_dir": str(self.data_dir), "version": __version__,
                "overland_url": "overland://setup?" + urlencode({"url": receiver,
                    "token": self.tls["config"]["token"], "device_id": "iPhone", "unique_id": "yes"}) if receiver else None}

    def handler(self, mode):
        app = self

        class Handler(BaseHTTPRequestHandler):
            # Never log URLs, request bodies or Authorization headers.
            def log_message(self, *args):
                pass

            def send(self, code, body=b"", mime="application/json; charset=utf-8", filename=None):
                if isinstance(body, (dict, list)):
                    body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
                elif isinstance(body, str):
                    body = body.encode()
                self.send_response(code)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; "
                                 "img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
                if filename:
                    self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.end_headers()
                self.wfile.write(body)

            def local_request(self, mutation=False):
                expected = {f"127.0.0.1:{app.ui_port}", f"localhost:{app.ui_port}"}
                if self.headers.get("Host") not in expected:
                    return False
                origin = self.headers.get("Origin")
                if origin and origin not in {"http://" + host for host in expected}:
                    return False
                if self.headers.get("Sec-Fetch-Site") == "cross-site":
                    return False
                if mutation and not hmac.compare_digest(self.headers.get("X-Track-CSRF", ""), app.csrf):
                    return False
                return ipaddress.ip_address(self.client_address[0]).is_loopback

            def body(self):
                if self.headers.get("Transfer-Encoding"):
                    raise InvalidBatch("Chunked uploads are unsupported")
                try:
                    length = int(self.headers.get("Content-Length", "-1"))
                except ValueError as exc:
                    raise InvalidBatch("Invalid Content-Length") from exc
                if not 0 <= length <= MAX_BODY:
                    raise InvalidBatch("Body must be at most 8 MiB")
                body = self.rfile.read(length)
                if len(body) != length:
                    raise InvalidBatch("Incomplete request")
                return body

            def do_GET(self):
                try:
                    self.get()
                except (ValueError, TypeError) as exc:
                    self.send(400, {"error": str(exc)})
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception:
                    self.send(500, {"error": "Local operation failed"})

            def get(self):
                parsed = urlsplit(self.path)
                path, params = parsed.path, parse_qs(parsed.query)
                if mode == "trust":
                    if path == "/track.mobileconfig":
                        self.send(200, app.tls["profile"], "application/x-apple-aspen-config", "track.mobileconfig")
                    elif path == "/":
                        self.send(200, "<!doctype html><html lang=en><meta name=viewport content='width=device-width'>"
                            "<title>Track · Local Sync</title><h1>Track · Local Sync</h1>"
                            "<p>This page serves only the public certificate for your PC.</p>"
                            "<p><a href='/track.mobileconfig'>Download certificate profile</a></p>"
                            "<p>Install in Settings → General → VPN &amp; Device Management, then enable trust in "
                            "Settings → General → About → Certificate Trust Settings.</p>"
                            f"<p>Compare this SHA-256 fingerprint with the PC setup screen:</p><pre>{app.tls['fingerprint']}</pre>"
                            "<p>No account, VPN or MDM profile is included.</p></html>", "text/html; charset=utf-8")
                    else:
                        self.send(404, {"error": "Not found"})
                    return
                if mode != "ui":
                    self.send(404, {"error": "This port accepts Overland uploads only"})
                    return
                if not self.local_request():
                    self.send(403, {"error": "Local browser access only"})
                    return
                if path == "/api/overview":
                    self.send(200, app.store.overview())
                elif path == "/api/setup":
                    self.send(200, app.setup())
                elif path == "/api/points":
                    one = lambda key, fallback=None: params.get(key, [fallback])[0]
                    day = one("day")
                    if day:
                        date.fromisoformat(day)
                    self.send(200, app.store.points(day=day, device=one("device"), after=int(one("after", "0")),
                        through=int(one("through")) if one("through") is not None else None))
                elif path == "/api/sample":
                    self.send(200, {"points": sample_points()})
                elif path == "/api/backup":
                    with tempfile.TemporaryDirectory() as folder:
                        backup = Path(folder) / "track.sqlite3"
                        app.store.backup(backup)
                        self.send(200, backup.read_bytes(), "application/vnd.sqlite3", "track-backup.sqlite3")
                elif path == "/":
                    index = (WEB / "index.html").read_text(encoding="utf-8").replace("__CSRF__", app.csrf)
                    self.send(200, index, "text/html; charset=utf-8")
                else:
                    allowed = {"/app.js": "text/javascript", "/map.js": "text/javascript",
                               "/geometry.js": "text/javascript", "/i18n.js": "text/javascript",
                               "/style.css": "text/css", "/theme.js": "text/javascript", "/vendor/qrcode.js": "text/javascript",
                               "/icon.svg": "image/svg+xml"}
                    if path in allowed:
                        self.send(200, (WEB / path[1:]).read_bytes(), allowed[path])
                    else:
                        self.send(404, {"error": "Not found"})

            def do_POST(self):
                try:
                    path = urlsplit(self.path).path
                    if mode == "ingest" and path == "/api/overland":
                        expected = "Bearer " + app.tls["config"]["token"]
                        if not hmac.compare_digest(self.headers.get("Authorization", ""), expected):
                            self.send(401, {"error": "Invalid access token"})
                            return
                        mime = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
                        if mime != "application/json":
                            self.send(415, {"error": "Expected application/json"})
                            return
                        app.store.ingest(self.body())
                        # This is intentionally issued only after the FULL-synchronous transaction commits.
                        self.send(200, {"result": "ok"})
                    elif mode == "ui" and self.local_request(mutation=True) and path == "/api/relay":
                        data = json.loads(self.body())
                        with app.relay_lock:
                            url = data.get("url")
                            if data.get("generate"):
                                if app.relay_settings["mode"] == "named":
                                    raise ValueError("A fixed tunnel is configured; temporary generation is unavailable")
                                bundled = Path(__file__).resolve().parents[1] / ".tools" / ("cloudflared.exe" if sys.platform == "win32" else "cloudflared")
                                if not shutil.which("cloudflared") and not bundled.is_file():
                                    self.send(400, {"error": "Install cloudflared first", "code": "relayMissing"})
                                    return
                                if app.relay_requested_at and time.monotonic() - app.relay_requested_at < 15:
                                    self.send(409, {"error": "Generation already requested", "code": "relayBusy"})
                                    return
                                settings = {"enabled": True, "mode": "quick"}
                                relay_config.save(app.data_dir, settings)
                                app.relay_settings = settings
                                app.relay = None
                                app.relay_requested_at = time.monotonic()
                                app.relay_generation += 1
                            elif data.get("disable"):
                                app.relay_settings = {"enabled": False, "mode": "quick"}
                                relay_config.save(app.data_dir, app.relay_settings)
                                app.relay = None
                            elif data.get("configure"):
                                settings = data["configure"]
                                if settings.get("mode") != "named":
                                    raise ValueError("Expected named tunnel configuration")
                                origin = relay_config.public_origin(settings.get("public_url"))
                                config = settings.get("tunnel_config")
                                if not isinstance(config, str) or not Path(config).is_file():
                                    raise ValueError("Tunnel configuration file does not exist")
                                app.relay_settings = {"enabled": True, "mode": "named", "public_url": origin,
                                    "tunnel_config": str(Path(config).resolve())}
                                relay_config.save(app.data_dir, app.relay_settings)
                                app.relay = None
                            elif url is None:
                                app.relay = None
                            elif (app.relay_settings["mode"] == "quick" and relay_config.quick_origin(url)) or (app.relay_settings["mode"] == "named"
                                    and url == app.relay_settings.get("public_url")):
                                settings = {**app.relay_settings, "enabled": True, "public_url": url}
                                if settings != app.relay_settings:
                                    relay_config.save(app.data_dir, settings)
                                    app.relay_settings = settings
                                app.relay = (url, time.monotonic() + 45)
                                app.relay_requested_at = 0
                            else:
                                raise ValueError("Expected configured Named Tunnel or temporary HTTPS origin")
                            self.send(200, {"saved": True})
                    elif mode == "ui" and self.local_request(mutation=True) and path == "/api/note":
                        data = json.loads(self.body())
                        day, text = data.get("day"), data.get("text")
                        date.fromisoformat(day)
                        if not isinstance(text, str) or len(text) > 5000:
                            raise ValueError("Notes are limited to 5000 characters")
                        app.store.note(day, text.strip())
                        self.send(200, {"saved": True})
                    else:
                        self.send(403, {"error": "Access denied"})
                except (InvalidBatch, ValueError, TypeError, AttributeError) as exc:
                    self.send(400, {"error": str(exc)})
                except (BrokenPipeError, ConnectionResetError):
                    pass
                except Exception:
                    self.send(503, {"error": "Batch not acknowledged; retry later"})

        return Handler
