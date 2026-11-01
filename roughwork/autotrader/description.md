# AutoTrader — description

Detailed reference for AutoTrader 0.1.0. For setup and everyday use, see [README.md](README.md).

## Features

- **Autonomous, discretionary trading of a fund.** The bot gets an initial fund and full control over it. Each cycle it scans its universe, scores every symbol, and decides on its own what to buy, how much, and when to exit. Nothing waits for approval.
- **Two asset classes.**
  - **Stocks:** 25 liquid US large caps plus SPY and QQQ. They trade only during the NYSE regular session while `respect_market_hours` is on.
  - **Crypto:** 10 major `BASE-USD` pairs. They trade on every cycle, 24/7.
  - Each class has its own bar interval, strategy thresholds and per-position risk limits. Crypto stops keep running overnight and at weekends.
- **Ensemble strategy.** Trend, momentum, mean reversion, volume confirmation and the trend forecast each give a score in [-1, 1]. The weighted mean of these scores decides entries and exits.
- **Trend forecast.** A damped Holt plus log-linear regression ensemble projects the next 12 bars for every symbol. It includes an uncertainty band, a walk-forward hit rate and a confidence value. The dashboard draws the projection as a pale dashed continuation after the real prices. The strategy can also use it as one of its components.
- **Layered risk control.**
  - Each position has a stop-loss, take-profit and trailing stop.
  - Position size depends on signal strength and volatility.
  - Position-count caps, a cash reserve and a cap on total crypto exposure limit how much is deployed.
  - Per-symbol cooldowns and a daily trade cap limit how often it trades.
  - A daily-loss halt and a max-drawdown kill switch protect the account.
- **Three execution modes.**
  - `sim`: internal paper broker, the default.
  - `alpaca-paper`: Alpaca paper trading.
  - `alpaca-live`: real money. It needs both API keys and an exact confirmation phrase.
- **Fund scopes.** `allocation` gives the bot its own sub-ledger inside a larger account. `full_account` lets it manage the whole broker account.
- **Local dashboard.** A single-page dashboard, served by a stdlib HTTP server, shows KPIs, the equity curve, a price and forecast chart, positions, signals, trades and events. It also has the operator controls: pause, resume, liquidate, kill switch, deposit or withdraw, and universe editing.
- **Persistence.** All state lives in one SQLite file: orders, fills, equity history, events, the bot's ledger, risk baselines and paper broker state. A restart continues where the bot left off.
- **Dependencies.** The standard library plus `requests`. There is no web framework and no numeric library.

## Architecture

### Module map

| Module | Responsibility |
|---|---|
| `run.py` | CLI entry. It parses flags, sets up logging (stderr and `data/autotrader.log`), and builds the Store, data feed, broker and Engine. It then starts the engine thread and the dashboard server, and shuts down cleanly on Ctrl-C or SIGTERM. |
| `autotrader/models.py` | Dataclasses `Bar`, `Position`, `Order`, `Fill`, `CashFlow`, `Account` and `Signal` (score clipped to [-1, 1]). Also `asset_class()`, `normalize_symbol()`, `crypto_pair()` and the JSON-safe `to_dict()`. |
| `autotrader/config.py` | `Config` and nested `RiskConfig`, `CryptoRiskConfig`, `StrategyConfig`, `ForecastConfig` and `ServerConfig`. Also the deep-merge loader, type checks, range validation, `demo_config()`, and `ROOT` / `DATA_DIR`. |
| `autotrader/store.py` | `Store`: SQLite in WAL mode, thread-safe, holding orders, fills, equity, events and a JSON key/value table. |
| `autotrader/data.py` | `MarketData` interface. Implementations: `YahooData` (stocks), `CoinbaseData` (crypto) and `SyntheticData` (offline). `RoutedData` sends each symbol to the right feed by asset class, and `make_data()` builds the feeds from config. |
| `autotrader/broker.py` | `Broker` interface, `PaperBroker` (simulator), `AlpacaBroker` (REST v2) and `make_broker()`, which enforces the live-mode gate. Also the NYSE clock `us_market_open()` and `market_open_for()`, plus symbol mapping to and from Alpaca. |
| `autotrader/strategy.py` | Pure indicators (`sma`, `ema`, `rsi`, `rate_of_change`, `atr`, `zscore`), `Strategy.evaluate()`, `AssetStrategies` and `rank()`. |
| `autotrader/forecast.py` | Pure, deterministic `Forecaster.predict()`, returning a `Forecast` made of `ForecastPoint`s. |
| `autotrader/risk.py` | `RiskManager`: protective exits, entry gating (halts), volatility-aware sizing, crypto exposure cap, cooldowns, and the trading day in US/Eastern. |
| `autotrader/engine.py` | `Engine`: the trading cycle, fund accounting, order tracking, operator controls, `snapshot()` and `chart()`. One RLock guards all state, and a separate lock makes ticks run one at a time. |
| `autotrader/server.py` | `make_server()`, a `ThreadingHTTPServer` with token auth, a Host allow-list and the JSON API. Also `load_or_create_token()`. |
| `autotrader/web/index.html` | The dashboard: vanilla JS, CSS and inline SVG in one file, with no external assets. |

Data flow: `MarketData → Forecaster → Strategy → RiskManager → Broker`. The `Engine` orchestrates the cycle and the `Store` persists everything. The server only reads `Engine.snapshot()`, `Engine.chart()` and the store, and calls the Engine's control methods.

### Tick lifecycle (`Engine.tick`)

1. **Refresh.** `data.refresh()` clears the per-tick caches, or advances the synthetic clock by one bar.
2. **Markets.** If `respect_market_hours` is on, `broker.is_market_open()` decides whether stocks are open. The paper broker uses the static NYSE calendar and Alpaca uses `/v2/clock`. If the clock fails, stocks count as closed. Crypto is always open.
3. **Orders and account.**
   - Poll orders still in flight, and look up any submission whose outcome is unknown.
   - Read the account.
   - In `allocation` scope, reconcile the bot's ledger: units sold outside the bot count as a withdrawal.
   - In `full_account` scope on Alpaca, absorb deposits and withdrawals made at the broker.
4. **Bars.** Fetch `lookback_bars` bars for the active universe plus every managed position. Stocks use `bar_interval` and crypto uses `crypto_bar_interval`.
5. **Forecasts.** Run `Forecaster.predict()` on every fetched series, outside the engine lock, and cache the latest forecast per symbol.
6. **Signals.** Run `Strategy.evaluate()` per symbol. Crypto symbols use the crypto strategy. The forecast is passed in when `forecast.use_in_strategy` is true.
7. **Marks.** Raise each position's trailing high-water mark to the latest price, refresh the tracked crypto exposure, and roll the day baseline when the US/Eastern date changes.
8. **Trade.** This runs only when an enabled class is open or a held position's market is open.
   1. Protective exits (stop-loss, take-profit, trailing stop) for positions whose market is open.
   2. Deferred liquidations that can now run.
   3. Signal exits, where score ≤ `exit_threshold`. These are skipped while paused.
   4. `can_open()`, which may trip the daily-loss halt or the drawdown kill switch. A kill switch or drawdown halt cancels open buys and sells every tradable position.
   5. Entries, in score order across both classes. A symbol needs score ≥ its class's `entry_threshold`. It must be in the universe, not held, not busy or being liquidated, and its market must be open. Its class must be under its position cap, and the symbol must not be in cooldown. `can_open` is checked again, and `size_entry` decides the quantity.
9. **Record.** Write one equity point (bot equity, bot cash, allocation) and return a JSON summary. The summary contains status, markets, symbol, signal and forecast counts, the top 5 signals, orders, any entry block, equity, cash, allocation, position count and exposure.

`run_forever(stop)` runs a tick every `poll_seconds`. An exception in a tick is logged and recorded as an `error` event, and the loop continues.

### Locking and operator controls

- **Network outside the lock.** Steps 3–5 read bars, prices, the account and broker cash activity without the engine lock, so a slow or failing feed never blocks the dashboard. The account is read again under the lock only if an order or fund change landed in the meantime. Yahoo and Coinbase cache failed lookups for the rest of the tick, so an outage costs one request per symbol per tick.
- **Controls never hang.** Pause, Resume, Liquidate and Kill wait at most 2 s (`CONTROL_WAIT_SECONDS`) for a busy cycle. After that they are queued and logged as `… queued`, and the request returns at once.
  - Pause and the kill switch's halt take effect immediately. A running cycle checks them before every order.
  - A queued liquidation or kill stops the running cycle from placing further orders, then runs before the cycle finishes.
  - Queued controls always run in the order they were given, before any control that comes later.
- **Snapshot.** If the lock stays held for more than 1 s (`SNAPSHOT_WAIT_SECONDS`), `/api/state` serves the last snapshot with `busy: true`, the current status, pause and halt flags, and the names in `queued_controls`.
- **Fund and universe changes.** If a cycle holds the lock for more than 2 s, these are refused with HTTP 503 (`EngineBusy`) instead of hanging. Retry them.

### Shutdown

Ctrl-C or SIGTERM sets the stop event. A running cycle checks it between symbols and before each order, and abandons the cycle there. `run.py` waits up to 60 s (`SHUTDOWN_WAIT_SECONDS`) for the engine thread to finish. If the thread is still running after that, the process exits with code 1 and leaves the database open. Each order's broker, fill and ledger writes form one SQLite transaction, so SQLite discards a half-written order instead of keeping a position the bot no longer tracks.

## Strategy methodology

Every indicator returns its value for the latest bar, or nothing when there are too few bars. A signal needs `max(slow_sma, momentum_lookback, rsi_period) + 1` bars, which is 31 with the defaults.

| Component | Formula | Meaning |
|---|---|---|
| `trend` | `tanh((SMA(fast) − SMA(slow)) / ATR(rsi_period))` | Fast/slow SMA spread measured in ATRs (defaults 10/30). |
| `momentum` | `tanh(ROC(n) / (σ₁ · √n))`, n = `momentum_lookback` (20) | Rate of change relative to the volatility expected over the lookback. σ₁ is the population stdev of one-bar returns. |
| `mean_reversion` | `clip((mid − RSI) / half, −1, 1)`, mid and half from `rsi_oversold` / `rsi_overbought` | Wilder RSI(14). +1 at the oversold level (30), 0 at mid (50), −1 at the overbought level (70). |
| `volume` | `sign(last move) · clip(relVol − 1, 0, 1)` | Above-average volume confirms the direction of the last close-to-close move. relVol is the last volume divided by the mean of the previous `slow_sma` bars. |
| `forecast` | `clip(expected_return / max(band half-width, 1e‑6), −1, 1) · confidence` | Projected move relative to its own uncertainty, discounted by confidence. Present only when a forecast exists and `use_in_strategy` is true. |

- **Score.** `score = Σ wₖ·cₖ / Σ wₖ`, taken over the components present for that symbol, then clipped to [-1, 1]. A missing component (for example, no forecast yet) spreads its weight over the others instead of shrinking the score. Default weights: trend 0.35, momentum 0.25, mean_reversion 0.15, volume 0.10, forecast 0.15.
- **Thresholds.**
  - Stocks enter at score ≥ 0.35 and exit at score ≤ −0.20.
  - Crypto uses the stock strategy merged with `crypto_strategy`. The defaults widen RSI to 25/75 and raise the entry threshold to 0.40. Weights merge key by key.
- **Reason text.** Each signal carries a short human summary, such as `trend +0.99, mean reversion -1.00 | RSI 79, vol 0.7x, fc +0.9%`. It appears in the dashboard and in order reasons.

## Trend forecast

The forecaster (`autotrader/forecast.py`) is pure and deterministic. It uses only the standard library and works on log closes over the last `forecast.window` (60) bars. It needs at least `min_bars` (40) valid, non-constant closes.

1. **Damped-trend Holt smoothing.** The h-step forecast is `level + (φ + φ² + … + φʰ)·trend`, with φ = 0.9. When `alpha` and `beta` are null, they come from a grid search that minimizes the one-step-ahead squared error. The alpha grid is {0.1, 0.2, 0.3, 0.5, 0.7, 0.9} and the beta grid is {0.01, 0.05, 0.1, 0.2, 0.3}.
2. **Least-squares log-linear regression.** Fits `log(close) = a + b·t`.
3. **Blend.** The two models are weighted by inverse mean-squared error: Holt's one-step errors against the regression's in-sample residuals. The weight on Holt is `mse_ols / (mse_holt + mse_ols)`, or 0.5 each when both are about zero. The central path is `mid[h] = exp(blend[h])` for h = 1..`horizon_bars` (12).
4. **Band.** `mid · exp(±band_z · σ · √h)`, where σ is the RMS of Holt's one-step log residuals. With `band_z` = 1.28 this is roughly an 80% central interval, if the errors were normal. Future timestamps are spaced by the median bar gap.
5. **Expected return and direction.** `expected_return = mid[last] / last_close − 1`. The direction is `flat` when |expected_return| < `flat_threshold` (0.2%), otherwise `up` or `down`.
6. **Hit rate.** This is walk-forward directional accuracy. At each of the last `backtest_steps` (72) points that have a full `window` of history before them and `horizon` real bars after them (49 points with the default 120 bars), the model is refit on the data up to that point. The sign of its predicted 12-bar move is then compared with what actually happened. Points where either move is exactly zero are skipped. Each refit runs its own alpha/beta grid search on its own history, so no parameter is tuned on bars after the point being tested. Neighbouring points share 11 of their 12 realized bars, so `scored` points are worth only about `scored / 12` independent trials. The rate is shrunk toward a coin flip with those effective trials, `(hits/12 + 3) / (scored/12 + 6)` (`HIT_RATE_PRIOR = 6` pseudo-trials at 50%), so one persistent random swing cannot claim skill: a perfect backtest over 120 bars reads about 0.70. Measured on 300 random walks with no drift, 0.3% reach confidence 0.3; genuine trends average about 0.39. Only full-window points are scored, so a point's history never shifts as the bar window slides and its memoized prediction is reused on every later cycle (about 0.5 s per cycle for 37 symbols; about 3 s on the first cycle). With no scored points it is 0.5. Each point's prediction depends only on its own history window, so it is memoized and fitted once, and each tick only fits the newest point.
7. **Confidence.** `clip((hit_rate − 0.5)·2, 0, 1) · clip(1 − band_rel_width, 0, 1)`, where `band_rel_width = (hi − lo) / mid` at the last step. A model that does no better than a coin flip, or whose band is as wide as the price, gets zero confidence.

**On the dashboard.** In the Chart panel, the real price is drawn in the strong series colour up to a vertical "now" divider. The projection continues from the last real close as a pale dashed line. The light theme uses the accent at 45% opacity and the dark theme at 55%. The lo–hi band is a pale translucent area (12% / 15%), and the forecast region is lightly tinted. Each theme has its own forecast colour tokens, so the pale marks stay visible on both backgrounds. The caption reads, for example, *"Forecast ↗ +1.8% over next 12 bars · confidence 0.42 · hit-rate 61% — statistical projection, not a guarantee"*. The Signals table has an "Outlook" column with a pale arrow and the expected %. Hovering or tapping the chart shows the time and price, or the forecast mid/lo/hi.

**In the strategy.** The `forecast` component carries 15% of the default weight. Its value is already discounted by confidence, so a low-skill forecast contributes close to zero. Setting `use_in_strategy: false` keeps the charts but takes the forecast out of trading decisions. Setting `enabled: false` turns forecasting off entirely.

**Limits.**
- This is an extrapolation of recent price drift. It knows nothing about news, earnings, order books or fundamentals.
- The band assumes roughly stable, roughly normal errors, which crypto jumps and gaps routinely violate.
- A hit rate over 30 points is noisy: one standard error is about ±9 percentage points.
- On synthetic demo data, the forecast reflects the simulator's regimes, not any real market.

## Risk model

Limits come from `risk` (stocks and account-wide) and `crypto_risk` (crypto positions). All of them can be configured, and none of them can be switched off.

**Per-position limits.** The stock defaults come from `risk` and the crypto defaults from `crypto_risk`.

| Limit | Stocks | Crypto |
|---|---|---|
| Stop-loss below average cost | 5% | 8% |
| Take-profit above average cost | 15% | 25% |
| Trailing stop below the high-water mark | 7% | 10% |
| Max position size (share of equity) | 20% | 15% |
| Max open positions in the class | 8 | 5 |
| Minimum order value | $1 | $1 |
| Cooldown after a trade in the symbol | 30 min | 60 min |
| Total exposure cap | n/a | 50% of equity across all crypto (`max_crypto_exposure_pct`) |

The high-water mark is the highest of the average cost and every price seen since entry. It is persisted, so trailing stops survive restarts.

**Account-wide limits.** These live in `risk` and are shared by both classes.

| Limit | Default | Effect |
|---|---|---|
| `daily_loss_limit_pct` | 5% | Loss from the day-start equity halts new entries. The halt clears at the next US/Eastern trading day. |
| `max_drawdown_pct` | 25% | Decline from peak equity trips the **kill switch**. New entries stop, open buys are cancelled, and every managed position is sold, and sold again every tick, until Resume. |
| `max_trades_per_day` | 40 | Every submitted, non-rejected order counts. Reaching the cap blocks entries for the rest of the day, while exits still run. |
| `min_cash_reserve_pct` | 5% | Share of equity that entries never spend. |

Three consecutive order-submission failures also halt new entries (a `manual` halt) until Resume.

**Resume.** Resume clears every halt kind (daily, drawdown, manual, kill). It also cancels deferred liquidations left by a kill, and resets the day-start and peak baselines to the current equity.

**Entry sizing** (`RiskManager.size_entry`). The bot first computes a target value and then caps it:

1. Start with `target = equity · max_position_pct · (0.5 + 0.5·score)`. This is half the cap for a marginal signal and the full cap at score 1.
2. Multiply by the volatility scale `min(1, 0.02 / daily_vol)`. Here `daily_vol = ATR(14)/close · √(bars per day)`, with 6.5 h per day for stocks and 24 h for crypto. Calm assets keep their full size and volatile ones shrink in proportion. The 2% target is `TARGET_DAILY_VOL` in `risk.py`.
3. Cap by spendable cash: `(min(cash, deployable) − equity·min_cash_reserve_pct) · 0.995`, which leaves room for slippage.
4. For crypto, also cap by the remaining exposure headroom: `equity·max_crypto_exposure_pct − (crypto market value + crypto buys in flight)`.
5. Round the quantity down. Crypto uses 8 decimals. Stocks use 6 decimals when `fractional` is true, otherwise whole shares. The order is dropped if its value falls below `min_order_value`.

**Equity used for risk.** In `allocation` scope this is the bot's own equity (allocation plus unrealized P&L of its positions). In `full_account` scope it is the broker equity. Deposits, withdrawals, edits to `initial_fund` and units removed outside the bot all shift the day-start and peak baselines by the same amount. So a transfer is never mistaken for a trading loss or gain.

## Fund-scope semantics

**`allocation`** (the default) gives the bot a sub-ledger:

- **Capital:** `allocation = initial_fund + realized P&L + net deposits`.
- **Free cash:** the allocation minus the cost of the bot's own holdings (kv `bot_positions`) and minus buys in flight. It never exceeds the broker's real cash.
- **What it manages:** only units it bought. A position you already hold in the same symbol is never sold, and never counted in the bot's P&L. Sells are booked against the ledger's cost basis.
- **Units missing at the broker:** in `allocation` scope, if units the bot bought are no longer held there, they are treated as a withdrawal at cost. In `full_account` scope the sale proceeds stay in the account, so the ledger entry is only trimmed; the risk baselines move only for real deposits and withdrawals reported by the broker. The exception is a crypto shortfall of at most 1% (`CRYPTO_FEE_TOLERANCE`). Alpaca takes crypto fees in the coin bought, so such a gap is a fee: the ledger keeps the same total cost over the fewer units (a higher average cost), and the fee shows up in realized P&L when the position is sold.
- **Changed `initial_fund`:** an `initial_fund` edited between runs is applied as a deposit or withdrawal. Startup is refused if that would make the allocation negative, or (in sim) would need more paper cash than is free.

**`full_account`** gives the bot the whole account:

- It manages every long position in the account and may spend all of its cash. Its capital is the broker equity.
- On Alpaca, deposits, withdrawals and journals (activity types CSD, CSW, JNLC) are read every tick, and the risk baselines shift by them.
- The dashboard's deposit and withdraw buttons return an error in this scope, because transfers happen at the broker. In sim they still move paper cash.

## Brokers and execution

### `sim`: `PaperBroker`

- **Fills.** Market orders fill immediately at the feed price, plus `slippage_bps` (5) on buys or minus it on sells. Crypto uses `crypto_slippage_bps` (10). `commission_per_trade` (default 0) is charged per order and folded into the average cost.
- **Rejections.** An order is rejected when there is no price, cash is insufficient, it sells more than is held, or its quantity is not positive.
- **Precision.** Stock quantities round down to 6 decimals, or to whole shares when `fractional` is false. Crypto is always fractional, to 8 decimals.
- **Persistence.** Cash, positions and last valid prices are kept in kv `paper_state` and restored on restart. Orders and fills are recorded with realized P&L measured against the average cost, or against the engine's ledger cost in `allocation` scope.

### `alpaca-paper` / `alpaca-live`: `AlpacaBroker`

- **Credentials.** Read from `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`.
- **Hosts.** `https://paper-api.alpaca.markets` for paper and `https://api.alpaca.markets` for live.
- **Endpoints.** `/v2/account`, `/v2/positions`, `POST /v2/orders`, `GET`/`DELETE /v2/orders/{id}`, `/v2/orders:by_client_order_id`, `/v2/clock` and `/v2/account/activities`.
- **Orders.** All orders are market orders.
  - Stocks: `time_in_force: "day"`, with up to 6 decimals when fractional.
  - Crypto: sent as `BTC/USD` with `time_in_force: "gtc"` and up to 9 decimals. Only USD, USDT and USDC quotes are accepted; any other quote raises `BrokerError`. Crypto positions returned as `BTCUSD` or `BTC/USD` are mapped back to `BTC-USD`.
- **Order states.** Pending, accepted and partially filled orders are tracked until they reach a final state. Each fill increment is recorded as it arrives, and nothing counts as filled early. `pending_cancel` and `done_for_day` count as still open.
- **Unknown outcomes.** Every order carries a `client_order_id` (`autotrader-<hex>`). After a timeout or 5xx, the order is looked up by that id. If it isn't found, the engine keeps it as unresolved: the symbol stays busy and in cooldown, and a buy's value stays reserved. It is looked up again each tick and dropped after 3 "not found" answers.
- **Errors.** API errors raise `BrokerError` with Alpaca's message.

### One database per mode (`claim_store_mode`)

The first run binds its database to the configured mode (kv `db_mode`; a database written before this check is recognised as `sim` by its `paper_state`). Opening it in another mode stops with a config error that suggests a separate `db_path`. Otherwise a sim ledger, sim fills and sim deposits would be read as real in an Alpaca mode: the bot would adopt the user's own shares as its positions and spend simulated profit as real allocation.

### Live-mode gate (`make_broker`)

`alpaca-live` starts only when two conditions hold:

- `live_confirmation` is exactly `I ACCEPT REAL-MONEY RISK`.
- Both environment keys are set.

Otherwise startup fails with a `ConfigError` that lists every missing item, and `run.py` exits with code 2. `alpaca-paper` needs only the keys.

When live, the terminal logs a warning and the dashboard shows a red LIVE badge and banner. Confirmation dialogs also add a real-money warning.

## Market data

- **`YahooData` (stocks; crypto fallback).**
  - Source: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`, called with the bare `Mozilla/5.0` User-Agent and a 10 s timeout. (Yahoo answers 429 to a full Chrome User-Agent sent without browser cookies; the bare token is served, checked 2026-10-28.)
  - Range: chosen as the smallest Yahoo range that covers `lookback_bars`, within Yahoo's intraday history caps.
  - Cleaning: bars with null or non-positive values are dropped.
  - Caching and errors: responses, including failures, are cached for one tick. Errors are logged and return `[]` or `None`.
  - Symbols: `BRK.B` is requested as `BRK-B`.
- **`CoinbaseData` (crypto, default).**
  - Source: the public Coinbase Exchange API, with no key. Candles come from `/products/{BASE-QUOTE}/candles?granularity=…` (60, 300, 900, 3600, 21600 or 86400 s).
  - Bars: rows arrive as `[time, low, high, open, close, volume]`, newest first, and are turned into ascending bars trimmed to the lookback. More than 300 bars are fetched by paging backwards, up to 10 pages.
  - Price: from `/products/{id}/ticker`, falling back to the last cached close.
  - Throttling and caching: requests are spaced 0.15 s apart and responses are cached per tick.
  - Missing products: a USDT or USDC product that returns 404 falls back to `BASE-USD`, logged once.
- **`SyntheticData` (offline demo and tests).**
  - Deterministic for a given seed (42 in `run.py`). It uses geometric Brownian motion with trend and range regimes (35% up, 30% down, 35% range, each lasting 40–140 bars), volatility clustering and occasional jumps.
  - Each stock gets a hashed annual volatility of 18–60% and a price of $20–$500. Crypto pairs start near familiar prices (BTC about 95,000, DOGE about 0.2) with 3–4× the volatility.
  - Every `refresh()` appends one bar to every symbol, around the clock.
- **`RoutedData`.** Sends crypto symbols to the crypto feed and everything else to the stock feed, and refreshes both.

## Configuration reference

The configuration is built from the defaults, deep-merged with the JSON file:

- An unknown key at any level is a `ConfigError`, and so is a wrong type. Integers must be integers; floats also accept integers.
- `crypto_strategy` is layered over its default overrides. To restore RSI 30/70 for crypto, set those keys explicitly.
- Symbols are normalized: lowercase is uppercased, and `btc/usd` becomes `BTC-USD`. Stock symbols in `crypto_universe`, or crypto symbols in `universe`, are rejected.
- `config.example.json` mirrors every default.

| Key | Default | Allowed |
|---|---|---|
| `mode` | `"sim"` | `sim`, `alpaca-paper`, `alpaca-live` |
| `initial_fund` | `10000.0` | > 0 |
| `fund_scope` | `"allocation"` | `allocation`, `full_account` |
| `enable_stocks` / `enable_crypto` | `true` / `true` | not both false |
| `data_source` | `"yahoo"` | `yahoo`, `synthetic` (stocks) |
| `universe` | AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO JPM V MA UNH XOM JNJ PG HD COST LLY WMT BAC KO PEP NFLX AMD CRM SPY QQQ | stock tickers (letters, `.`, `-`, ≤ 10 chars); ≥ 1 if stocks enabled |
| `bar_interval` | `"5m"` | `1m 2m 5m 15m 30m 60m 90m 1h 1d` |
| `crypto_data_source` | `"coinbase"` | `coinbase`, `yahoo`, `synthetic` |
| `crypto_universe` | BTC ETH SOL XRP DOGE ADA AVAX LINK LTC BCH (all `-USD`) | `BASE-QUOTE` with USD/USDT/USDC; ≥ 1 if crypto enabled |
| `crypto_bar_interval` | `"5m"` | Coinbase: `1m 5m 15m 1h 60m 6h 1d`; Yahoo: as `bar_interval`; synthetic: either set |
| `lookback_bars` | `120` | longest indicator + 1 (31) … 5000, and ≥ `forecast.min_bars` while forecasting |
| `poll_seconds` | `60` | 1 … 86400 |
| `respect_market_hours` | `true` | stocks trade only in the NYSE session |
| `allow_short` | `false` | shorting is not implemented; `true` only logs a warning and stays long-only |
| `fractional` | `true` | fractional stock quantities (crypto is always fractional) |
| `commission_per_trade` | `0.0` | ≥ 0 (paper broker) |
| `slippage_bps` / `crypto_slippage_bps` | `5.0` / `10.0` | 0 … 1000 (paper broker) |
| `live_confirmation` | `""` | must equal `I ACCEPT REAL-MONEY RISK` for `alpaca-live` |
| `db_path` | `"data/autotrader.db"` | relative paths resolve against the project folder |
| `risk.*` | see Risk model | `*_pct` in (0, 1] except `take_profit_pct` (0, 10] and `min_cash_reserve_pct` [0, 1); `max_positions` 1–500; `max_trades_per_day` 1–10000; `min_order_value` ≥ 0; `cooldown_minutes` 0–10080 |
| `crypto_risk.*` | see Risk model | same ranges; `max_crypto_exposure_pct` in (0, 1] |
| `strategy.*` | 10 / 30 / 14 / 30 / 70 / 20 / 0.35 / −0.20 | 1 ≤ `fast_sma` < `slow_sma` ≤ 1000; `rsi_period` 2–500; 0 ≤ oversold < overbought ≤ 100; `momentum_lookback` 1–1000; `entry_threshold` (0, 1]; −1 ≤ `exit_threshold` < entry |
| `strategy.weights` | trend .35, momentum .25, mean_reversion .15, volume .10, forecast .15 | known keys only, ≥ 0, not all zero |
| `crypto_strategy` | `{"rsi_oversold": 25, "rsi_overbought": 75, "entry_threshold": 0.40}` | any `strategy` field; validated after merging |
| `forecast.enabled` / `use_in_strategy` | `true` / `true` | booleans |
| `forecast.horizon_bars` | `12` | 1 … 500 |
| `forecast.window` / `min_bars` | `60` / `40` | 10 ≤ `min_bars` ≤ `window` ≤ 5000 |
| `forecast.band_z` | `1.28` | (0, 10] |
| `forecast.flat_threshold` | `0.002` | [0, 1) |
| `forecast.backtest_steps` | `72` | 0 … 1000 |
| `forecast.alpha` / `beta` | `null` / `null` | null (grid search) or (0, 1] |
| `forecast.phi` | `0.9` | (0, 1] |
| `server.host` / `port` | `"127.0.0.1"` / `8765` | non-empty / 1–65535 |
| `server.token` | `null` | null (generated) or ≥ 8 chars |

`--demo` uses `demo_config()`. It is the defaults with `mode: sim`, synthetic stock and crypto data, `respect_market_hours: false`, `poll_seconds: 2`, `initial_fund: 10000` and `db_path: data/demo.db`. Each 2 s tick adds a synthetic 5m bar, so the wall-clock limits are scaled down too: `risk.max_trades_per_day: 10000` and 1-minute cooldowns for stocks and crypto (otherwise the demo would hit the 40-trade daily cap within minutes and stop opening positions). `--demo` and `--config` are mutually exclusive, and `--port` overrides `server.port`.

## Persistence

All state is in one SQLite database: `data/autotrader.db`, or `data/demo.db` for the demo. It runs in WAL mode with synchronous NORMAL, behind one lock, so it is safe to use from several threads.

| Table | Columns |
|---|---|
| `orders` | `id` PK, `symbol`, `side`, `qty`, `status`, `submitted_ts`, `filled_qty`, `filled_avg_price`, `reason`, `type` (upserted by id) |
| `fills` | `id`, `order_id`, `symbol`, `side`, `qty`, `price`, `commission`, `ts`, `realized_pnl` |
| `equity` | `id`, `ts`, `equity`, `cash`, `allocation` (one row per tick) |
| `events` | `id`, `ts`, `level` (`info` / `warn` / `error` / `trade`), `message` |
| `kv` | `key` PK, `value` (JSON) |

| kv key | Owner | Contents |
|---|---|---|
| `paper_state` | PaperBroker | cash, positions, last valid marks |
| `alpaca_pending` | AlpacaBroker | orders still being reconciled for fills |
| `risk_state` | RiskManager | trading day, day-start, peak and last equity; halt flag, kind and reason; trades today; last trade per symbol (cooldowns); trailing high-water marks |
| `bot_positions` | Engine | the bot's own ledger (qty, average cost, opened ts) |
| `pending_orders` | Engine | orders being watched for fills |
| `unresolved_orders` | Engine | submissions with an unknown outcome, by client order id |
| `deferred_liquidations` | Engine | symbols to sell once their market opens |
| `engine_paused` | Engine | pause flag |
| `universe` | Engine | dashboard-edited stock and crypto lists, plus the config lists they were edited against. A list reverts to the config once the config list changes. |
| `net_deposits` | Engine | cumulative deposits minus withdrawals |
| `initial_fund` | Engine | fund at the last run, used to detect edits |
| `engine_day` | Engine | day and day-start equity, for today's P&L |
| `cash_flows_seen` | Engine | broker cash-activity ids already applied (`full_account` on Alpaca) |
| `synthetic_clock:<interval>` | SyntheticData | seed, history, start time and tick count. Saved on every `refresh()` when a store is passed to the feed, as `run.py` does, so a restarted demo continues its price paths. |

Other files in `data/`: `token` (dashboard token, mode 0600) and `autotrader.log`.

## HTTP API reference

The server is bound to `server.host:server.port`, by default `127.0.0.1:8765`.

**Authentication.** Every `/api/*` request needs the `X-Auth-Token` header. Every POST needs `Content-Type: application/json`, a `Content-Length` header and a body of at most 64 KB.

**Responses.** Responses are JSON. Errors have the form `{"error": "..."}` with a matching status code:

| Status | Cause |
|---|---|
| 400 | Bad input |
| 401 | Missing or invalid token |
| 403 | Host header not allowed |
| 404 | Unknown route, or no data for a chart |
| 405 | Wrong method |
| 411 | Missing `Content-Length` |
| 413 | Body too large |
| 415 | Wrong content type |
| 500 | Engine or broker failure |

**Routes.**

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /` (or `/index.html`) | — | Dashboard HTML with the token injected. No token needed. |
| `GET /api/state` | — | `Engine.snapshot()` (see below) |
| `GET /api/equity` | `limit` (default 2000, max 200000); `max_points` (2–10000) thins the result to evenly spaced points, keeping the first and newest | `{"points": [{ts, equity, cash, allocation}]}`, oldest first |
| `GET /api/trades` | `limit` (default 100, max 1000) | `{"fills": [...], "orders": [...]}`, newest first, each row with `asset_class` |
| `GET /api/events` | `limit` (default 200, max 2000) | `{"events": [{ts, level, message}]}`, newest first |
| `GET /api/config` | — | The effective configuration, with `server.token` shown as `***` |
| `GET /api/chart` | `symbol` (required, normalized), `bars` (default 120, clamped 20–500) | `{symbol, asset_class, interval, bars: [{ts, open, high, low, close, volume}], forecast: {points: [{ts, mid, lo, hi}], expected_return, direction, confidence, hit_rate, horizon, method, generated_ts} or null, position: {qty, avg_price, stop, target, trail} or null}`. An invalid symbol gives 400; no data gives 404. |
| `POST /api/control` | `{"action": "pause" \| "resume" \| "liquidate" \| "kill"}` | `{"ok": true, "action", "state": snapshot}` |
| `POST /api/universe` | `{"symbols": [...], "asset_class": "stock" \| "crypto" (optional)}` | `{"ok": true, "universe": [stocks..., crypto...]}`. Without `asset_class` both lists are replaced; with it, only that class. At most 200 symbols. |
| `POST /api/fund` | `{"delta": number}` (non-zero; + deposit, − withdraw) | `{"ok": true, "allocation": number}` |

**Chart data.** A symbol not seen on the last tick, or a request for more than `lookback_bars` bars, is fetched from the feed on demand and gets a fresh forecast.

**Snapshot fields** (`/api/state`):

| Group | Fields |
|---|---|
| Identity and status | `version`, `ts`, `status` (`running` \| `paused` \| `halted` \| `market_closed`), `paused`, `halt_reason`, `mode`, `is_live`, `broker`, `fund_scope` |
| Money | `account` {cash, equity, buying_power}, `allocation`, `net_deposits`, `bot` {equity, cash, deployable} |
| P&L | `pnl` {today, realized_total, unrealized, total} |
| Positions | `positions[]`: symbol, asset_class, qty, avg_price, price, market_value, unrealized_pnl, unrealized_pct, stop, target, trail, high_water, opened_ts |
| Signals | `signals[]`: every active and held symbol (ranked by score), each with symbol, score, price, reason, components, asset_class, and `forecast` {direction, expected_return, confidence, hit_rate, horizon} |
| Universe | `universe`, `crypto_universe`, `active_universe` |
| Markets | `markets` {stocks: {open, enabled, respect_hours}, crypto: {open: true, enabled}}, `market_open`, `respect_market_hours` |
| Exposure and limits | `exposure` {stocks, crypto, crypto_pct, crypto_limit_pct}, `limits` (per class: max_positions, entry and exit thresholds, crypto max exposure), `risk` (the RiskManager status) |
| Forecast settings | `forecast` {enabled, horizon_bars, use_in_strategy} |
| Engine state | `entry_block`, `pending_orders`, `unresolved_orders`, `liquidating`, `deferred_liquidations`, `poll_seconds`, `tick_count`, `last_tick_ts`, `next_tick_ts`, `busy` (true when a busy cycle made this a cached snapshot), `queued_controls` |

`status` is `market_closed` only when no enabled asset class can trade. With crypto enabled this never happens.

## Security model

- **Loopback by default.** The server binds `127.0.0.1`.
- **Host check.** The `Host` header must be `127.0.0.1`, `localhost`, `[::1]`, the configured host, or a name in `server.allowed_hosts`. Anything else gets 403, including on `GET /`. This guards against DNS rebinding. A wildcard bind (`0.0.0.0`, `::`) accepts this machine's own host name and interface addresses in place of the bind host. It never accepts an arbitrary Host.
- **Token.** The token is `server.token` when set, or 32 random bytes (URL-safe) saved in `data/token` with mode 0600. A stored token shorter than 16 characters is replaced. Every API request is checked against it with a constant-time comparison (`hmac.compare_digest`).
- **Who gets the page.** Browsers connecting from this machine get the dashboard with the token embedded. A browser on another machine first gets a short "open `/?token=…`" page with status 401. Opening `/?token=<API token>` once sets an HttpOnly, SameSite=Strict session cookie and redirects to `/`. The cookie is derived from the token and is not the token itself. Other websites in your browser cannot read the token: there are no CORS headers, and the custom header forces a preflight that fails.
- **Response headers.** The HTML response sends `Content-Security-Policy: default-src 'none'` (inline script and style only, `connect-src 'self'`, `frame-ancestors 'none'`) and `X-Frame-Options: DENY`. All responses send `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- **Request limits and output safety.** POST bodies are limited to 64 KB of JSON. The token is escaped before it is injected into the page. Non-finite numbers are turned into `null` before JSON encoding.
- **Secrets.** Alpaca keys are read only from the environment. They are never written to the config, database or logs. `/api/config` hides `server.token`.
- **Money safety.**
  - Real money needs both keys and the exact confirmation phrase.
  - Liquidate and kill ask for confirmation in the dashboard.
  - Orders whose outcome is unknown stay reserved instead of being forgotten, so a timeout cannot cause a double buy.

## Dashboard

`autotrader/web/index.html` is a single file with no external assets and a system font stack. It polls `/api/state` every 3 s, and every 15 s after a 401. It also loads the equity, trades and events data, and refreshes the open chart.

| Area | Contents |
|---|---|
| Header | Mode badge (red LIVE in live mode) and a live banner. Status pill. NYSE open/closed and Crypto 24/7 pills. Tick timing. Pause/Resume, Liquidate all, Kill switch. Theme toggle. |
| KPIs | Equity, cash, allocation, today's P&L, total P&L, and crypto exposure with a meter against its limit |
| Equity chart | Equity and allocation curves (1H / 1D / 1W / All) with a tooltip. It requests enough points for the selected range (one per tick, up to the server's 20000). |
| Chart panel | Price and pale forecast, as described above. The x-axis is by bar index, not wall-clock time, so nights and weekends take no width and the forecast keeps its share of the plot; labels still show each bar's time. Stock forecast tooltips show "+N bars ahead" instead of a clock time. Symbol box. 60 / 120 / 240 bars. Opens the last viewed symbol, otherwise the top signal. |
| Tables | Positions (qty, average, price, unrealized P&L %, stop/target/trail), Signals (top 15 by score plus every held symbol; score, Outlook, component bars), Recent trades and Event log. All / Stocks / Crypto tabs filter the tables. |
| Settings | Deposit/withdraw, separate stock and crypto universe editors, and risk status |

- **Badges and number formats.** Every row has a STOCK or CRYPTO badge. Crypto quantities show up to 8 decimals. Prices use adaptive precision, for example DOGE 0.1234.
- **Themes.** Light and dark themes use CSS custom properties on `:root`. They follow `prefers-color-scheme`, and a toggle overrides it.
- **Layout.** Numbers use tabular figures, and the layout works at 375 px width.
- **Saved preferences.** Theme, filter, chart range, chart symbol and bar count are kept in `localStorage`, guarded so the page still works without it.

## File inventory

| Path | Lines | Purpose |
|---|---|---|
| `README.md` | — | What it is and how to use it |
| `description.md` | — | This document |
| `run.py` | 167 | CLI entry point |
| `config.example.json` | — | Every config key with its default |
| `.gitignore` | — | Ignores `data/`, `config.json`, `__pycache__/`, `.pytest_cache/` |
| `autotrader/__init__.py` | 3 | `__version__ = "0.1.0"` |
| `autotrader/models.py` | 190 | Domain dataclasses and symbol rules |
| `autotrader/config.py` | 463 | Configuration and validation |
| `autotrader/store.py` | 195 | SQLite persistence |
| `autotrader/data.py` | 638 | Yahoo, Coinbase, synthetic and routed feeds |
| `autotrader/broker.py` | 829 | Paper and Alpaca brokers, market clock, live gate |
| `autotrader/strategy.py` | 272 | Indicators and the ensemble strategy |
| `autotrader/forecast.py` | 312 | Trend forecaster |
| `autotrader/risk.py` | 532 | Risk manager |
| `autotrader/engine.py` | 1253 | Trading loop, controls, snapshot, chart |
| `autotrader/server.py` | 353 | HTTP server and JSON API |
| `autotrader/web/index.html` | 1540 | Dashboard |
| `tests/` | 5,929 total | 18 test modules plus `conftest.py` (see Validation results) |
| `data/` | runtime | Created at startup: `autotrader.db` / `demo.db`, `token`, `autotrader.log` |

## Assumptions and limitations

- **Data quality and timing.**
  - Yahoo's chart endpoint is unofficial. It can be delayed, rate limited, return gaps, or change without notice.
  - Coinbase's public API is rate limited; requests are spaced 0.15 s apart.
  - Bars are fetched once per `poll_seconds` (60 s by default). The bot reacts to completed polls, not to ticks.
- **Execution.**
  - Market orders only: no limit, stop or bracket orders, and no extended-hours trading.
  - Stops are checked by the bot each cycle, not held at the broker. A gap or a stopped bot can produce exits far beyond the stop level.
  - The simulator fills at the last price plus or minus fixed slippage, with no order-book depth, spread or partial fills.
- **Long only.** `allow_short` is accepted but not implemented.
- **Market calendar.**
  - The static NYSE calendar has full-day holidays and 13:00 ET early closes (`NYSE_EARLY_CLOSES`) for 2025–2027 only; extend both lists each year. Sim mode outside those years treats holidays as trading days.
  - Alpaca modes use `/v2/clock` and fall back to the static calendar only when the clock fails.
- **Venue mismatch.** Crypto prices come from Coinbase, but in Alpaca modes crypto is executed at Alpaca. The two venues' prices can differ slightly.
- **Forecast.** The forecast is a statistical projection of recent drift, not a prediction of events, and not a guarantee. Its confidence and hit rate are computed from a short window and are themselves noisy.
- **Strategy.** The strategy's parameters are reasonable defaults. They have not been optimized or backtested on historical market data, and past behaviour on synthetic data says nothing about real returns.
- **Fund scope.** In `allocation` scope the bot trusts its own ledger. Manual trades in the same symbols are tolerated, but they reduce the bot's units only when the broker no longer holds them.
- **Demo continuity.** The synthetic clock is saved in `data/demo.db`, so a restarted `--demo` continues the price paths under the saved portfolio. Synthetic time does not catch up with time spent stopped. Delete `data/demo.db` for a clean demo. A restart replays every synthetic bar since the demo first started, so after days of running the first cycle after a restart takes noticeably longer (about 27 s after one day of 2 s ticks); deleting `data/demo.db` resets it.
- **Orders under the lock.** Orders are still placed while the engine lock is held. With a slow broker, a busy cycle can make controls queue and the dashboard show a `busy` snapshot until it finishes.
- **Single process.** One engine per database. The dashboard is meant for one local operator.

## Development and testing

- **Style.** Python 3.14, standard library plus `requests`. The code uses typed dataclasses, small modules and short docstrings. Do not add web frameworks or numeric libraries.
- **Tests.** Run `python3 -m pytest -q` from the project folder.
  - The suite is fully offline. It uses `SyntheticData`, `PaperBroker`, stub HTTP sessions for Yahoo, Coinbase and Alpaca, and temporary databases. `tests/conftest.py` puts the project root on `sys.path` and provides the `store` and `demo_cfg` fixtures.
  - The two tests in `test_dashboard_format.py` run the dashboard's number formatters under Node.js and are skipped when `node` is missing.
- **Smoke test.** `python3 run.py --demo --once` runs one cycle and prints its JSON summary.
- **Adding a config key.** Add the field to the dataclass in `config.py` with its default, then add a range check in `validate()` and a line in `config.example.json`. The loader rejects unknown keys, so the example file must stay in sync with the dataclasses.
- **Adding a strategy component.** Return a value in [-1, 1] from `Strategy.evaluate()`, add its name to `COMPONENTS` and `WEIGHT_KEYS`, and give it a default weight. Weights are normalized over the components present.
- **Adding a broker.** Implement the `Broker` interface. Keep `is_live` accurate, and route creation through `make_broker()` so the live gate keeps applying.

## Validation results

Run on 2026-10-29 with Python 3.14.8 on Linux.

**Test suite:** `python3 -m pytest -q` gave **631 passed**, 0 failed, 0 skipped (about 7 minutes; the engine modules run hundreds of synthetic ticks).

| Test module | Tests |
|---|---|
| `test_broker.py` | 68 |
| `test_concurrency.py` | 10 |
| `test_crypto_broker.py` | 34 |
| `test_crypto_config.py` | 101 |
| `test_crypto_data.py` | 30 |
| `test_crypto_engine.py` | 16 |
| `test_crypto_risk.py` | 23 |
| `test_dashboard_format.py` | 2 |
| `test_data.py` | 23 |
| `test_engine.py` | 33 |
| `test_engine_safety.py` | 17 |
| `test_forecast_engine.py` | 37 |
| `test_forecast.py` | 48 |
| `test_foundation.py` | 56 |
| `test_order_safety.py` | 21 |
| `test_risk.py` | 20 |
| `test_server.py` | 74 |
| `test_strategy.py` | 18 |

**Demo cycle:** `python3 run.py --demo --once` on a fresh `data/demo.db` exited with code 0.

| Measure | Result |
|---|---|
| Symbols | 37 (27 stocks + 10 crypto pairs), all with data |
| Signals and forecasts | 37 each |
| Status | `running`; stocks and crypto both open (market hours ignored in the demo) |
| Orders | 11 entry buys filled on the first cycle |
| Equity / allocation / cash | $9,996.88 / $10,000.00 / $4,103.46 |
| Exposure | stocks $5,543.30, crypto $350.12 (3.5% of equity, limit 50%) |

**Running demo:** after about 40 s (`python3 run.py --demo --port 8799`), status was `running` with 11 positions across stocks and crypto, all 37 signals in the snapshot and no entry block. The dashboard was checked in headless Chromium at 1440 px and 390 px: KPIs, equity curve, the price chart with its pale dashed forecast and band after the "now" divider, avg/stop/trail/target lines, and the tables all rendered.

**Real data:** one `--once` cycle in sim mode with `respect_market_hours: true`, Yahoo stocks (AAPL, MSFT, SPY) and Coinbase crypto (BTC, ETH, SOL, DOGE), run at 02:53 ET on a Tuesday. All 7 symbols returned bars, signals and forecasts. NYSE read as closed, so stocks were monitored only: AAPL scored +0.44, above the 0.35 entry threshold, and was correctly not bought. Crypto stayed tradable; the best score (DOGE +0.27) was below the crypto entry threshold of 0.40, so no order was placed. This run found and fixed the Yahoo User-Agent 429 issue.

**15-minute real-data run:** sim mode with the default lists (27 stocks + 10 crypto pairs), `respect_market_hours: true`, `poll_seconds: 60`, from about 05:00 ET (NYSE closed). It completed 15 cycles with no errors and no Yahoo rate limiting. No stock orders were placed (market closed). It made 5 crypto entries on live Coinbase prices: LINK, XRP, ETH, DOGE and AVAX, at scores +0.48 to +0.52, each about $710–$890 (7–9% of the $10,000 fund after volatility scaling), about $4,000 or 40% of equity in total, inside the 50% crypto cap. No exits were due within 15 minutes.

**Review:** the code went through an adversarial review across seven lenses (money accounting, risk and real-money safety, security, robustness, crypto, forecast, strategy and dashboard). Each finding had to survive independent verifiers; 27 were confirmed and fixed with regression tests. Examples: the kill switch now cancels open buys and also handles positions with pending orders; an ambiguous order-submit failure is tracked instead of risking a duplicate live order; the drawdown kill switch is checked even during another halt; the forecast backtest no longer tunes its parameters on future bars; the demo no longer stalls on wall-clock trade limits.

## Project history

- **2026-10-26:** project created as an autonomous stock monitor and trader. It included the core contract: models, config, SQLite store, Yahoo and synthetic data, paper and Alpaca brokers with the live-mode gate, ensemble strategy, risk manager with halts and kill switch, engine, token-protected dashboard and offline pytest suite.
- **Crypto extension:** crypto became a first-class, 24/7 asset class. It brought `CoinbaseData`, `RoutedData`, crypto symbols and normalization, `crypto_universe`, `crypto_risk` with the exposure cap, a separate crypto strategy, volatility-aware sizing, Alpaca crypto order and position mapping, and dashboard asset-class badges, filters and market pills.
- **Forecast extension:** added the trend forecaster, its strategy component, `GET /api/chart`, and the dashboard Chart panel showing the predicted continuation in pale colours.
- **Hardening:**
  - Unknown-outcome order tracking by client order id.
  - Deferred liquidations.
  - Ledger reconciliation and cash-flow absorption, so transfers do not count as P&L.
  - Handling of `initial_fund` edits.
  - Tests for engine and order safety.
- **2026-10-27:** documentation written in this README / description layout, and the suite and demo validated as recorded above.
- **2026-10-28:** review fixes for crypto, robustness, security, forecast and dashboard. These covered host checks on wildcard binds, closed-market liquidation deferral, engine I/O outside the lock, a clean shutdown join, demo price continuity, an out-of-sample and shrunk forecast hit rate, demo limits scaled to the 2 s clock, an index-based chart x-axis, every signal in the snapshot, and range-sized equity fetches. Forecast backtests are memoized, so a tick over 37 symbols takes about 0.45 s. Validation re-run as recorded above.
- **2026-10-28 (later):** real-data validation against Yahoo and Coinbase. Switched Yahoo to the bare `Mozilla/5.0` User-Agent after it rate-limited the full Chrome string. Crypto shortfalls of at most 1% at the broker (Alpaca's fee taken in coin) now raise the cost basis instead of being booked as withdrawals.
- **2026-10-28 (evening):** a 15-minute real-data sim run (37 symbols, NYSE closed) made 5 crypto entries with no errors or rate limits. Three real-money fixes from the second review: each mode now needs its own database; in `full_account` a user's own sale of a bot position no longer lowers the risk baselines (which had disabled the daily-loss halt and drawdown kill switch); and a cancel that fails on a network error or 5xx now raises, so the kill switch retries it instead of leaving a real buy open.
- **2026-10-29:** fixes from the second review round (13 confirmed findings, 12 fixed). High: the risk manager now shares the store's lock, so a kill during order placement can no longer deadlock the engine and dashboard; and the halt equity is recomputed after same-cycle exits, so their P&L is no longer counted twice (it had falsely tripped the daily-loss halt). Also: paper fills read the cycle's cached price instead of a network request under locks; buys with an unknown outcome count toward the position caps; NYSE early closes; forming-bar volume is pro-rated by elapsed time; the forecast hit rate counts overlapping windows as about `scored / horizon` trials (`backtest_steps` now 72); the dashboard confirms Resume from a halt, marks positions waiting to sell at the open, warns that stock sales wait for NYSE, labels stock forecast slots "+N bars", formats the risk panel correctly, and has the server downsample long equity histories (`/api/equity?max_points=`). The demo replay growth is documented as a limitation.
