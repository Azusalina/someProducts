from __future__ import annotations
import argparse
import json
import locale
import os
from pathlib import Path
import signal
import sys

from . import __version__
from .config import ConfigError, default_path, init_config, load_config
from .display import plain
from .engine import Engine


def main(argv=None):
    parser = argparse.ArgumentParser(description="Turn this terminal into a live Monitor dashboard. q returns to your shell.")
    parser.add_argument("--version", action="version", version="monitor-cli " + __version__)
    parser.add_argument("-c", "--config", type=Path, help="TOML configuration (default: $XDG_CONFIG_HOME/monitor-cli/config.toml)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--init-config", action="store_true", help="create an example configuration without overwriting an existing file")
    mode.add_argument("--check-config", action="store_true", help="validate configuration and exit without collecting telemetry")
    mode.add_argument("--once", action="store_true", help="print one plain-text snapshot")
    mode.add_argument("--json", action="store_true", help="print one JSON snapshot")
    parser.add_argument("--timeout", type=float, default=3.0, help="initial snapshot wait in seconds, 0.2–30 (default: 3)")
    args = parser.parse_args(argv)
    if not 0.2 <= args.timeout <= 30:
        parser.error("--timeout must be between 0.2 and 30 seconds")
    path = args.config if args.config is not None else default_path()
    try:
        if args.init_config:
            init_config(path)
            print(f"Created {path.expanduser().absolute()}")
            return 0
        config = load_config(path, required=args.config is not None or args.check_config)
        if args.check_config:
            print(f"Configuration valid: {config.path}")
            return 0
        if not sys.platform.startswith("linux"):
            raise ConfigError("monitor-cli currently requires Linux (/proc and /sys)")
        def interrupt(signum, frame):
            raise KeyboardInterrupt
        old_signal = signal.signal(signal.SIGTERM, interrupt)
        try:
            if args.once or args.json or not (sys.stdin.isatty() and sys.stdout.isatty()):
                engine = Engine(config)
                try:
                    engine.start()
                    engine.wait_initial(args.timeout)
                    snapshot = engine.snapshot()
                    print(json.dumps(snapshot, ensure_ascii=True, allow_nan=False) if args.json else plain(config, snapshot))
                finally:
                    engine.close()
            else:
                if os.environ.get("TERM", "dumb") == "dumb":
                    raise ConfigError("Use a terminal with TERM set, or run monitor-cli --once")
                locale.setlocale(locale.LC_ALL, "")
                try:
                    from . import tui
                except ImportError as error:
                    raise ConfigError(f"Python curses support is required: {error}") from error
                try:
                    tui.run(config, required=args.config is not None)
                except tui.curses.error as error:
                    raise ConfigError(f"Terminal initialization/display failed: {error}") from error
        finally:
            signal.signal(signal.SIGTERM, old_signal)
        return 0
    except KeyboardInterrupt:
        return 0
    except (ConfigError, OSError, ValueError) as error:
        print(f"monitor-cli: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
