#!/usr/bin/env python3
import argparse
import os
import signal
import threading
from pathlib import Path

from autotrade.engine import Engine
from autotrade.server import create_server
from autotrade.store import Store


def main():
    parser = argparse.ArgumentParser(description="Local crypto monitor and wallet-based automated trading dashboard")
    parser.add_argument("--mode", choices=["demo", "paper", "live"], default="demo")
    parser.add_argument("--port", type=int, default=4386)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parent / "data")
    args = parser.parse_args()
    os.umask(0o077)
    args.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    # flock prevents two processes from driving the same account ledger.
    import fcntl
    lock_file = (args.data_dir / "server.lock").open("a+")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error("Another autotrade process is using this data directory.")
    store = Store(args.data_dir / "autotrade.sqlite3")
    engine = Engine(store, args.mode)
    server = create_server(engine, args.port)
    controller = server.controller
    if args.mode == "demo":
        engine.safe_cycle()
    def stop(signum, frame):
        engine.stop_requested.set()
        controller.shutdown.set()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    threading.Thread(target=controller.scheduler, name="autotrade-monitor", daemon=True).start()
    print(f"Autotrade · {args.mode.upper()} · http://127.0.0.1:{server.server_port}", flush=True)
    print("Automation starts paused. Keep this process running for monitoring and automated exits.", flush=True)
    try:
        server.serve_forever(poll_interval=.25)
    finally:
        controller.shutdown.set()
        engine.stop_requested.set()
        # Finish any in-flight network operation and persist a paused snapshot.
        with controller.gate:
            engine.pause()
            server.server_close()
            store.close()
        lock_file.close()


if __name__ == "__main__":
    main()
