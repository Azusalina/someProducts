# Autotrade implementation and operating notes

## Scope and modes

This product was created in `codex-autotrade`. The user changed the original stock-market brief to cryptocurrency trading; the stock and Alpaca implementation was removed before delivery.

| Mode | Prices | Execution | Required credentials |
| --- | --- | --- | --- |
| `demo` | Deterministic synthetic crypto prices | Local simulated swaps | None |
| `paper` | Coinbase public ETH/USD and BTC/USD hourly candles/ticker | Local simulated WETH/cbBTC swaps | None |
| `live` | Same public reference prices; actual pool quotes before signing | Base mainnet, Uniswap v3 SwapRouter02 | Dedicated wallet key, Base RPC URL, live enable flag |

Base was selected as the stated default while awaiting an optional network preference. Only WETH and Coinbase wrapped BTC (`CBBTC` in settings) are supported, quoted against Circle’s native Base USDC. This does not trade native Bitcoin or Solana assets. There are no centralized exchange trading accounts, deposits, withdrawals, bridges, leverage, short sales, custom-token routes, or cross-chain execution paths.

## Dashboard

The responsive local web UI has four views: portfolio overview, crypto reference markets, orders/activity, and strategy settings. It shows USDC allocation equity and cash, holdings, unrealized and realized return, peak drawdown, recorded equity history, hourly reference closes, current signals, order statuses, and the event journal. Charts contain recorded observations; they do not invent historical portfolio returns. All/today chart ranges, symbol selection, CSV export, typed confirmations, and persisted light/dark appearance are provided.

The Base wallet address and native ETH balance appear in settings after a successful scan. Transaction hashes link to Base Blockscout; opening those links contacts that external service. The UI polls cached local state every two seconds while the engine performs network operations in a separate worker. Stop/pause requests interrupt before subsequent submissions and are completed when the current operation yields.

## Capital, strategy and accounting

The initial allocation is a USDC ledger budget, not a transfer of funds. The first live start checks actual wallet USDC against that budget. Subsequent purchases use the smaller of allocation cash and current wallet USDC. External USDC deposits do not expand the strategy’s ledger allocation. Gains can be reused within the evolving allocation equity. Investment and per-position limits are configurable through 100%, with a 0.5% execution reserve. Minimum order size is the smaller of 25 USDC and 1% of initial capital, bounded below by 1 USDC.

Native ETH pays gas and is excluded from the USDC allocation, equity, return and loss calculations. The dashboard reports gas separately. The wallet key technically controls all assets in that wallet; application limits are not an on-chain vault or a restriction on a compromised host. Fund a dedicated wallet with only the intended allocation and gas reserve. There is no claim of profitable performance or a backtested strategy; defaults demonstrate the mechanics.

Signals use completed one-hour candles, with configurable fast/slow simple moving averages (default 5/20). An entry requires the fast average above the slow average and the current reference price above the slow average. An owned token exits on a trend reversal, stop loss, or take profit. Removed tokens remain monitored and exit-managed while held. The engine evaluates exits before new entries and permits at most one buy per symbol per UTC date. The daily transaction cap includes approvals and failed submissions; exit transactions bypass the entry count cap, but gas budgets still apply.

Daily allocation loss and peak drawdown limits latch a pause and leave holdings open. Daily boundaries use UTC. A daily loss latch clears on the next UTC date, but trading still requires an explicit start. A drawdown latch requires a deliberate risk-baseline reset. Resetting the baseline preserves the order ledger and previous loss events. Stop loss/take profit run on scan intervals; they are not resting orders or guaranteed fill prices. Pausing or shutting down also pauses automated exits.

Simulation fills include 5 basis points of adverse price movement and a 0.3% modeled fee on each side. Simulation gas is not modeled. Actual swap accounting reads net USDC and token transfers from the confirmed receipt: pool fees and price impact are reflected in the executed exchange rate. Decimal arithmetic is used for cash, quantities and average cost. Gas is reported from execution fees plus the receipt’s Base `l1Fee`, where returned; other network fee extensions may not be represented.

## Wallet transaction path

1. Check Base chain ID 8453, recent RPC head, wallet balance, allowlisted token decimals and contract bytecode. Reject an unmatched pending wallet nonce.
2. If needed, prepare a finite token approval to the fixed router. USDC approvals are bounded to the larger of the intended swap and initial allocation, capped by wallet USDC. Token sell approvals cover the intended input only. No unlimited approvals or Permit2 permissions are used. Existing approvals are not automatically revoked on pause or uninstall; manage them through the wallet.
3. With allowance available, quote direct Uniswap v3 pools at fee tiers 100/500/3000/10000 and choose the best returned output. There is no multi-hop or cross-DEX routing. Missing liquidity blocks execution.
4. Reject quotes whose output is worse than the configured reference-price deviation. Apply the slippage tolerance as a nonzero `amountOutMinimum`. The reference-price check assumes USDC approximately equals USD and WETH/cbBTC track ETH/BTC; it is not a depeg oracle or a standalone pool-impact calculation.
5. Build `exactInputSingle` inside a router `multicall` with a 90-second deadline, zero native value, fixed Base chain ID, and recipient equal to the signing wallet. Estimate execution and L1 fees, apply transaction and daily ETH budgets, and retain native ETH headroom. Gas limits are estimates: L1 fee changes can affect actual cost.
6. Sign locally. Persist the signed transaction’s hash, nonce and non-secret metadata in SQLite before the first broadcast. Signed bytes and private keys are not written to the database or API output. A timeout becomes `unknown`; it is never automatically re-signed or rebroadcast as another trade.
7. Block further submissions while a transaction is pending/unknown/confirming. Wait for 12 Base block confirmations before applying receipt transfers once. Reverted receipts update status and gas but add no position fill. Check confirmed receipt block hashes until the RPC’s finalized height covers them; a detected reorganization stops trading for manual reconciliation. Twelve L2 confirmations are distinct from Ethereum settlement finality.

A requested **Close to USDC** sequence remains authorized over successive scans while ordinary entries are paused, so an approval can confirm before its sell. Pause/stop cancels that sequence’s future submissions. Already broadcast approvals and swaps cannot be reliably undone by this app. Wallet token balances must match recorded app holdings when no transaction is unresolved; outside trades/transfers stop the engine. One process lock protects each data directory; this cannot prevent a separate app/data directory from using the same key.

Unknown or replaced transactions require manual inspection through the wallet/RPC/block explorer. The app deliberately has no “assume failed and retry” button. Resolve the nonce and holdings before any new mandate; do not erase the ledger while pending transactions could still confirm.

## Privacy and local access

No identity fields, signup, telemetry, analytics, remote fonts or cloud storage are included. Wallet-based trading is pseudonymous, not anonymous. Base transactions, approvals, balances and addresses are public. Coinbase receives public price requests, the RPC provider receives the node requests and broadcasts (including the public wallet address), and these providers can observe the requesting IP. cbBTC and USDC have their own issuer/custody properties; the app does not hide those or provide privacy-coin functionality.

The HTTP server binds only to `127.0.0.1`. Host and Origin guards, same-site restrictions, a random per-process action token, constant-time token comparison, bounded JSON requests, a same-origin content policy, and no CORS are included. API state/actions/export require the token. User text is escaped in rendered tables. A live start must match the exact configuration captured in the review dialog. The application does not expose key import, arbitrary RPC calls, arbitrary transaction payloads, transfers or withdrawals over HTTP.

The local machine and other processes running as the user are trusted. The loopback server is not designed for reverse-proxy/public exposure or multiple untrusted users. The private key comes from `AUTOTRADE_WALLET_KEY`; RPC URL and live unlock come from `AUTOTRADE_RPC_URL` and `AUTOTRADE_ALLOW_LIVE=YES`. An `.env` file is ignored by Git but is not loaded by the app. Key/RPC errors are sanitized; RPC URLs and signed bytes are not logged by the adapter. The UI key is not the wallet key.

## Files and persistence

| File | Responsibility |
| --- | --- |
| `app.py` | CLI, loopback server, per-directory lock, signals and shutdown |
| `autotrade/config.py` | Validated capital, token, strategy and execution limits |
| `autotrade/store.py` | SQLite full-sync snapshot storage, separate rows per mode |
| `autotrade/broker.py` | Public crypto reference feed and synthetic data |
| `autotrade/dex.py` | Base allowlist, ABI encoding, local signing and receipt decoding |
| `autotrade/engine.py` | Ledger, risk rules, strategy, persistent transaction intents and reconciliation |
| `autotrade/server.py` | Cached HTTP API, serialized operations and monitor scheduler |
| `web/` | Buildless HTML/CSS/JavaScript dashboard |
| `tests/` | Offline engine/EVM tests, disposable demo HTTP smoke test, optional public network probe |
| `requirements-live.txt` | Supported Web3 dependency range |
| `requirements-live-lock.txt` | Exact packages installed for validation (Web3 8.0.0, Python 3.14) |

Runtime state goes to `data/` by default with private directory/file permissions and WAL journaling. The store retains all orders, the latest 400 journal events, and the latest 5,000 equity observations. UI views show the latest 100 orders/events and 3,000 observations; CSV exports the complete order history. The app does not auto-resume trading or a close sequence after restart. Back up the data directory with the process stopped; do not copy only the main SQLite file while ignoring active WAL state.

## Development and validation

No frontend build, CDN, service installation, Git commit, push or deployment is required. Start the app from its folder, edit `web/`, and refresh. Restart the process after Python changes. To update dependencies, review the supported range, install, rerun offline and read-only checks, and regenerate the lock file. Extending the allowlist or network requires audited token addresses/decimals, execution routing, tests and updated documentation rather than a symbol-only change.

```bash
python3 -m unittest discover -s tests -v
node --check web/app.js
# Include offline signing/ABI/receipt tests after installing requirements-live-lock.txt:
.venv/bin/python -m unittest discover -s tests -v
# Optional public reads: no key, signing or broadcast:
.venv/bin/python -m tests.probe_network
# Launch, check, and automatically stop a fresh disposable demo:
.venv/bin/python tests/http_smoke.py --launch
```

Verification through 2026-10-27:

- 27 offline tests passed with Web3 installed: ledger/fees, smallest-unit token balances, capital bounds, risk latches, removed-token exits, restart pause, partial-fill idempotency, timeout recovery without resubmission, unknown-order gates, durable hash-before-broadcast, stop during preparation, reference prices expiring during preparation, finite approvals, gas budgets, calldata recipient/deadline/minimum output, signing/recovery, wrong-chain rejection and confirmed transfer decoding.
- Fresh disposable demo HTTP checks passed on 2026-10-27 for Host/Origin/token guards, invalid settings, allocation update, start, scans, simulated fills, pause, CSV export and closing to USDC. The test owns and stops its temporary server.
- On 2026-10-26, the public ETH/BTC reference feed returned fresh prices. A read-only Base mainnet probe verified chain ID, allowlisted contract bytecode, USDC decimals and a 1 USDC → WETH pool quote.
- Python compilation and JavaScript syntax checks passed.

No real wallet key, approval, funded swap, mempool replacement, wallet recovery, exchange account, deployment or on-chain write was exercised. RPC behavior during a real outage/reorg, actual gas/finality behavior, market execution and profitability remain outside the validation. Browser inventory was empty and the in-app browser was unavailable, so the rendered desktop/mobile layout, visual appearance, and browser interaction flow were not visually verified. API success is not proof of browser UI correctness.

## Primary references

- [Uniswap Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments): fixed router/quoter/WETH addresses. SwapRouter02 is used deliberately for its direct ERC-20 approval flow; Universal Router is the current preferred general entry point.
- [Uniswap SwapRouter02 interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol) and [deadline multicall interface](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IMulticallExtended.sol): tuple layout, minimum output and deadline wrapper.
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses): native Base USDC.
- [Coinbase wrapped assets](https://www.coinbase.com/cbbtc): Base cbBTC address and wrapping/custody context.
- [Coinbase public candles API](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles): hourly candle schema and public endpoints.
- [Web3.py transactions](https://web3py.readthedocs.io/en/stable/transactions.html): local signing, transaction preparation and broadcast APIs.
