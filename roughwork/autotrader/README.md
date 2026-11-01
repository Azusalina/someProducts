# AutoTrader

## What is it?

AutoTrader watches stocks and crypto and trades them on its own. You give it a fund and it decides what to buy and sell, when, and how much, with no per-trade approval. Stocks trade during NYSE hours and crypto (Coinbase prices) trades 24/7. Every position has a stop-loss, a take-profit and a trailing stop. A daily-loss halt and a drawdown kill switch protect the whole account. For every symbol it also predicts the coming price trend, and the dashboard charts that prediction as a pale dashed line after the real prices. It runs in a built-in simulator by default and can also trade through Alpaca, either paper or live. Details are in [description.md](description.md).

## How to use

**Risk notice:** automated trading can lose money, including all of the fund you give it. The trend forecast is a statistical projection, not a guarantee. Start with the demo or the simulator, then move to Alpaca paper. Use live mode only with money you can afford to lose.

**Prerequisites:** Python 3 (built and tested on 3.14) with the `requests` package. No other installation is needed. Run all commands from this folder.

**Quick demo (offline):** run `python3 run.py --demo`. It uses synthetic stock and crypto prices, the internal paper broker and a $10,000 fund. It ignores market hours and runs a cycle every 2 seconds. Demo state goes to `data/demo.db`, separate from real runs.

**Real data, simulated money:** run `python3 run.py`. It takes stock prices from Yahoo Finance and crypto prices from Coinbase (both public, no keys), and trades them in the internal paper broker. A cycle runs every 60 seconds. Stocks trade only during the NYSE session. Crypto trades around the clock.

**Dashboard:** on startup the terminal prints the dashboard URL (by default <http://127.0.0.1:8765/>) and an API token. Open the URL in a browser. The page already includes the token. Scripts must send the token in the `X-Auth-Token` header, for example `curl -H "X-Auth-Token: <token>" http://127.0.0.1:8765/api/state`. The token is stored in `data/token`. Press Ctrl-C to stop.

**What the dashboard shows:** mode badge (LIVE in red), status, NYSE and Crypto 24/7 market pills, equity, cash, allocation, today's and total P&L, crypto exposure against its limit, and the equity curve. It has positions, signals, recent trades and event log tables, with All / Stocks / Crypto filters. Click any symbol to open it in the **Chart** panel. The chart shows recent prices, the predicted continuation as a pale dashed line, the likely range as a pale band, and, for held symbols, the average price, stop and target lines. A light/dark toggle sits at the top right.

**Controls:**
- **Pause / Resume:** Pause stops new entries and signal-based exits, but stop-loss, take-profit and trailing stops stay active. Resume also clears any halt, including the kill switch.
- **Liquidate all:** sells every position the bot manages, after you confirm. A stock that cannot trade while the market is closed is sold when it opens.
- **Kill switch:** liquidates everything, after you confirm, and blocks new trades until you press Resume.
- **Deposit / Withdraw:** changes the allocation the bot may use. In sim mode this also moves the paper cash.
- **Universe:** edit the stock list (`AAPL, BRK.B`) and the crypto list (`BTC-USD`; `BTC/USD` is also accepted), then save.

**Command-line options:** `--config PATH` (by default `./config.json` is used when it exists), `--demo`, `--once` (runs one cycle, prints a JSON summary and exits), `--no-server` (no dashboard) and `--port N`.

**Configuration:** run `cp config.example.json config.json` and edit the copy. It lists every key with its default. Leave out any key you don't need to change. Unknown keys and out-of-range values stop the program with a clear error. The key settings are:
- `initial_fund`: the fund you hand the bot (default 10000).
- `fund_scope`: `"allocation"` (default) or `"full_account"`. With `"allocation"`, the bot only uses its own fund plus realized P&L and deposits, and only manages positions it opened. With `"full_account"`, it uses the whole broker balance and manages every position.
- `enable_stocks` / `enable_crypto`, `universe`, `crypto_universe`, `bar_interval` / `crypto_bar_interval`, and `poll_seconds`.
- `risk`: limits for stocks and the account. Defaults: stop-loss 5%, take-profit 15%, trailing stop 7%, at most 20% of equity per position and 8 positions, a 5% cash reserve, a 5% daily-loss halt, a 25% drawdown kill switch and 40 trades per day.
- `crypto_risk`: limits for crypto positions. Defaults: stop-loss 8%, take-profit 25%, trailing stop 10%, 15% per position, 5 positions, and all crypto together capped at 50% of equity (`max_crypto_exposure_pct`).
- `strategy` / `crypto_strategy`: indicator settings, entry and exit thresholds, and component weights.
- `forecast`: the trend prediction. Defaults: on, `horizon_bars` 12 and `use_in_strategy` true. Set `use_in_strategy` to false to keep the forecast on the charts without letting it affect trades.

All limits can be loosened, but each one stays in force.

**Alpaca paper trading:** create an Alpaca paper account and set its API keys in the environment. Then set `"mode": "alpaca-paper"` and a database of its own, `"db_path": "data/autotrader-alpaca-paper.db"`, in `config.json`. Each mode needs its own database: AutoTrader refuses to open one mode's database in another, so simulated positions and profits are never mistaken for real ones.

```sh
export APCA_API_KEY_ID=your-key-id
export APCA_API_SECRET_KEY=your-secret
python3 run.py
```

Alpaca executes both stocks and crypto (USD, USDT or USDC pairs).

**Alpaca live trading (real money):** set `"mode": "alpaca-live"`, give it its own `db_path` (for example `data/autotrader-alpaca-live.db`), and add this line to `config.json`, written exactly as shown:

```json
"live_confirmation": "I ACCEPT REAL-MONEY RISK"
```

Set the same environment variables using your live keys. If the phrase or either key is missing, AutoTrader refuses to start and says why. Keep `config.json` and your keys private.

**Tests:** run `python3 -m pytest -q`. The tests are offline and use only synthetic data and the paper broker. Two dashboard formatting tests also need Node.js and are skipped without it.

**Removal:** stop the program and delete this folder. All state (database, log and token) is in `data/` inside it. Nothing is installed elsewhere. If you added the Alpaca variables to a shell profile, remove them there.
