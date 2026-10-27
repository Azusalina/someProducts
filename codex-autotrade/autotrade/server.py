import csv
import hmac
import io
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .broker import BrokerError

WEB = Path(__file__).resolve().parent.parent / "web"


class Controller:
    def __init__(self, engine):
        self.engine = engine
        self.gate = threading.Lock()
        self.status_lock = threading.Lock()
        self.busy = None
        self.error = None
        self.pending_stop = None
        self.serial = 0
        self.shutdown = threading.Event()

    def snapshot(self):
        result = self.engine.snapshot()
        with self.status_lock:
            result["operation"] = {"busy": self.busy, "error": self.error, "serial": self.serial}
        return result

    def submit(self, action, data, automatic=False):
        if action in {"pause", "stop"}:
            self.engine.stop_requested.set()
        with self.status_lock:
            if not self.gate.acquire(blocking=False):
                if action in {"pause", "stop"}:
                    # Stop wins over pause, and is honored before the worker releases its gate.
                    if self.pending_stop != "stop":
                        self.pending_stop = action
                    return
                raise ValueError("Another operation is in progress. Wait for it to finish.")
            self.busy, self.error = action, None
        def work():
            try:
                if action == "scan":
                    self.engine.cycle()
                elif action == "start":
                    if self.engine.mode == "live" and data.get("config") != self.engine.snapshot()["config"]:
                        raise ValueError("The reviewed mandate differs from saved settings. Reopen the start dialog and review the current allocation.")
                    self.engine.start(data.get("confirmation", ""))
                elif action == "pause":
                    self.engine.pause()
                elif action == "stop":
                    self.engine.stop_cancel()
                elif action == "settings":
                    self.engine.configure(data)
                elif action == "flatten":
                    self.engine.flatten(data.get("confirmation", ""))
                elif action == "reset-risk":
                    self.engine.reset_risk(data.get("confirmation", ""))
                else:
                    raise ValueError("Unknown action.")
            except Exception as exc:
                error = str(exc) if isinstance(exc, (ValueError, BrokerError)) else "Unexpected server error; inspect the server log."
                with self.engine.lock:
                    self.engine.s["running"] = False
                    self.engine.s["closing"] = False
                    self.engine.event("error", error)
                    self.engine.save()
                with self.status_lock:
                    self.error = error
                if not isinstance(exc, (ValueError, BrokerError)):
                    import traceback
                    traceback.print_exc()
            finally:
                # Hold status_lock while choosing pending stop so no stop is lost in the handoff.
                while True:
                    with self.status_lock:
                        pending, self.pending_stop = self.pending_stop, None
                        if pending is None:
                            self.busy = None
                            self.serial += 1
                            self.gate.release()
                            break
                    try:
                        self.engine.stop_cancel() if pending == "stop" else self.engine.pause()
                    except Exception as exc:
                        with self.status_lock:
                            self.error = str(exc) if isinstance(exc, (ValueError, BrokerError)) else "Stop operation failed. Check wallet transactions directly."
                        with self.engine.lock:
                            self.engine.s["running"] = False
                            self.engine.event("error", self.error)
                            self.engine.save()
        threading.Thread(target=work, name="autotrade-operation", daemon=True).start()

    def scheduler(self):
        while not self.shutdown.wait(self.engine.snapshot()["config"]["interval"]):
            if self.engine.mode == "live" and not self.engine.broker.connected:
                continue
            try:
                self.submit("scan", {}, automatic=True)
            except ValueError:
                pass


def create_server(engine, port=4386):
    controller = Controller(engine)
    token = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        server_version = "Autotrade/1.0"

        def log_message(self, fmt, *args):
            # No request bodies, query strings, broker credentials or auth headers in logs.
            pass

        def reply(self, code, body, content_type="application/json", download=None):
            if content_type == "application/json":
                body = json.dumps(body, allow_nan=False).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
            if download:
                self.send_header("Content-Disposition", f'attachment; filename="{download}"')
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def allowed(self, auth=False):
            port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            if self.headers.get("Host") not in hosts:
                self.reply(403, {"error": "Loopback Host required."})
                return False
            origin = self.headers.get("Origin")
            if origin and origin not in {"http://" + host for host in hosts}:
                self.reply(403, {"error": "Cross-origin request denied."})
                return False
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                self.reply(403, {"error": "Cross-site request denied."})
                return False
            if auth and not hmac.compare_digest(self.headers.get("X-Autotrade-Token", ""), token):
                self.reply(403, {"error": "Refresh the dashboard to renew the session token."})
                return False
            return True

        def do_GET(self):
            if not self.allowed():
                return
            path = urlsplit(self.path).path
            if path == "/api/session":
                self.reply(200, {"token": token})
            elif path == "/api/state":
                if self.allowed(auth=True):
                    self.reply(200, controller.snapshot())
            elif path == "/api/export":
                if not self.allowed(auth=True):
                    return
                # Export full durable history, not only the UI's most recent hundred.
                with engine.lock:
                    orders = list(engine.s["orders"])
                output = io.StringIO()
                fields = ["time", "symbol", "side", "status", "notional", "qty", "filled_qty", "fill_price", "reason", "client_id"]
                writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(orders)
                self.reply(200, output.getvalue(), "text/csv; charset=utf-8", "autotrade-orders.csv")
            elif path in {"/", "/app.js", "/style.css"}:
                filename = {"/": "index.html", "/app.js": "app.js", "/style.css": "style.css"}[path]
                content_type = {"/": "text/html; charset=utf-8", "/app.js": "text/javascript; charset=utf-8", "/style.css": "text/css; charset=utf-8"}[path]
                self.reply(200, (WEB / filename).read_bytes(), content_type)
            else:
                self.reply(404, {"error": "Not found"})

        def do_POST(self):
            if not self.allowed(auth=True):
                return
            path = urlsplit(self.path).path
            action = path.removeprefix("/api/")
            if not path.startswith("/api/") or action not in {"scan", "start", "pause", "stop", "settings", "flatten", "reset-risk"}:
                self.reply(404, {"error": "Unknown action"})
                return
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                self.reply(415, {"error": "JSON body required"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 16384:
                    raise ValueError("Request must be between 1 and 16384 bytes.")
                self.connection.settimeout(5)
                def reject(value):
                    raise ValueError("Non-finite JSON value")
                data = json.loads(self.rfile.read(length), parse_constant=reject)
                if not isinstance(data, dict):
                    raise ValueError("Expected a JSON object.")
                if action == "settings":
                    # Validate shape/types before launching a background mutation.
                    from .config import validate
                    validate({**engine.snapshot()["config"], **data})
                controller.submit(action, data)
                self.reply(202, {"accepted": True})
            except (ValueError, UnicodeError) as exc:
                self.reply(400, {"error": str(exc)})
            except (TimeoutError, OSError):
                self.reply(408, {"error": "Request body timed out"})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.controller = controller
    return server
