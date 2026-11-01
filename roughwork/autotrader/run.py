#!/usr/bin/env python3
"""AutoTrader command-line entry point: build the engine, run it, and serve the dashboard."""

from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from autotrader import __version__  # noqa: E402
from autotrader.broker import BrokerError, make_broker  # noqa: E402
from autotrader.config import DATA_DIR, Config, ConfigError, demo_config, load_config  # noqa: E402
from autotrader.data import MarketData, make_data  # noqa: E402
from autotrader.engine import Engine, claim_store_mode  # noqa: E402
from autotrader.server import is_loopback_host, load_or_create_token, make_server  # noqa: E402
from autotrader.store import Store  # noqa: E402

log = logging.getLogger("autotrader")

SHUTDOWN_WAIT_SECONDS: float = 60.0  # how long Ctrl-C waits for an in-flight cycle to finish


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="AutoTrader: autonomous stock and crypto monitor and trader with a local dashboard.",
    )
    parser.add_argument("--config", metavar="PATH",
                        help="JSON config file (default: ./config.json if present, else built-in defaults)")
    parser.add_argument("--demo", action="store_true",
                        help="offline demo: simulated broker, synthetic prices, no market hours")
    parser.add_argument("--once", action="store_true", help="run a single cycle, print a JSON summary, exit")
    parser.add_argument("--no-server", action="store_true", help="do not start the dashboard server")
    parser.add_argument("--port", type=int, metavar="N", help="dashboard port (overrides config)")
    parser.add_argument("--version", action="version", version=f"AutoTrader {__version__}")
    return parser.parse_args(argv)


def setup_logging() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for handler in (logging.StreamHandler(sys.stderr),
                    logging.FileHandler(DATA_DIR / "autotrader.log", encoding="utf-8")):
        handler.setFormatter(fmt)
        root.addHandler(handler)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def build_config(args: argparse.Namespace) -> Config:
    if args.demo:
        if args.config:
            raise ConfigError("--demo and --config are mutually exclusive")
        cfg = demo_config()
    else:
        path = args.config
        if path is None and (ROOT / "config.json").is_file():
            path = str(ROOT / "config.json")
        cfg = load_config(path)
    if args.port is not None:
        if not 1 <= args.port <= 65535:
            raise ConfigError(f"--port out of range: {args.port}")
        cfg.server.port = args.port
    return cfg


def build_data(cfg: Config, store: Store | None = None) -> MarketData:
    """Routed feed: stocks from ``data_source``, crypto from ``crypto_data_source``.

    With a ``store`` synthetic feeds persist their clock, so a restarted demo continues its
    price paths under the saved portfolio instead of rewinding them.
    """
    return make_data(cfg, store=store)


def describe_markets(cfg: Config) -> str:
    """Short summary of the enabled asset classes and their data sources."""
    parts = []
    if cfg.enable_stocks:
        parts.append(f"stocks via {cfg.data_source}")
    if cfg.enable_crypto:
        parts.append(f"crypto 24/7 via {cfg.crypto_data_source}")
    return ", ".join(parts)


def dashboard_url(host: str, port: int) -> str:
    shown = "127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    if ":" in shown and not shown.startswith("["):
        shown = f"[{shown}]"
    return f"http://{shown}:{port}/"


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    setup_logging()
    try:
        cfg = build_config(args)
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    store = Store(cfg.db_path)
    close_store = True
    try:
        data = build_data(cfg, store)
        try:
            claim_store_mode(store, cfg)  # before the broker writes any state into the database
            broker = make_broker(cfg, store, data)
            engine = Engine(cfg, data, broker, store)
        except (ConfigError, BrokerError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        if broker.is_live:
            log.warning("LIVE TRADING: real money at risk (allocation %.2f, scope %s)",
                        engine.allocation(), cfg.fund_scope)
        if args.once:
            print(json.dumps(engine.tick(), indent=2))
            return 0
        code, close_store = serve(engine, cfg, args.no_server)
        return code
    finally:
        if close_store:
            store.close()


def serve(engine: Engine, cfg: Config, no_server: bool) -> tuple[int, bool]:
    """Run the engine thread (and dashboard) until Ctrl-C or SIGTERM.

    Returns (exit code, whether the engine thread stopped). The engine stops at its next
    checkpoint (between symbols or orders); if it is still running after
    ``SHUTDOWN_WAIT_SECONDS`` the store must stay open, since closing it under a cycle could
    split an order's writes.
    """
    stop = threading.Event()

    def request_stop(signum: int, _frame: object) -> None:
        print(f"\nstopping ({signal.Signals(signum).name})...", file=sys.stderr, flush=True)
        stop.set()

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, request_stop)  # also covers shells that start background jobs with SIGINT ignored
    worker = threading.Thread(target=engine.run_forever, args=(stop,), name="engine", daemon=True)

    server = None
    if not no_server:
        token = load_or_create_token(DATA_DIR, cfg.server.token)
        try:
            server = make_server(engine, cfg.server, token)
        except OSError as exc:
            print(f"error: cannot listen on {cfg.server.host}:{cfg.server.port}: {exc}", file=sys.stderr)
            return 1, True
        threading.Thread(target=server.serve_forever, name="dashboard", daemon=True).start()
        print(f"AutoTrader {__version__} [{cfg.mode}; {describe_markets(cfg)}] "
              f"dashboard: {dashboard_url(cfg.server.host, cfg.server.port)}")
        print(f"API token: {token}")
        if not is_loopback_host(cfg.server.host):
            print(f"Other devices: open http://<this machine>:{cfg.server.port}/?token=<API token> once "
                  "(the page is not served to remote browsers without it)")
    else:
        print(f"AutoTrader {__version__} [{cfg.mode}; {describe_markets(cfg)}] running without dashboard")
    print("Press Ctrl-C to stop.", flush=True)

    worker.start()
    try:
        while not stop.wait(0.5):
            pass
    finally:
        stop.set()
        if server is not None:
            server.shutdown()
            server.server_close()
        worker.join(timeout=SHUTDOWN_WAIT_SECONDS)
    if worker.is_alive():
        log.error("engine cycle still running after %.0fs; exiting without closing the database "
                  "(SQLite discards any unfinished order transaction)", SHUTDOWN_WAIT_SECONDS)
        return 1, False
    return 0, True


if __name__ == "__main__":
    sys.exit(main())
