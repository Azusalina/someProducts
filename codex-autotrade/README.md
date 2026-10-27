# Autotrade

## What is it?

A local cryptocurrency monitor and automated spot-trading app with a portfolio dashboard, configurable USDC allocation, hourly trend strategy, and transaction journal. Includes offline simulation, paper trading with public crypto prices, and wallet-based Base/Uniswap execution for WETH and cbBTC.

No account signup, identity collection, analytics, or cloud database. Public-chain transactions are traceable; wallet-based trading does not guarantee anonymity. See [description.md](description.md) for strategy details, privacy boundaries, sources, and validation.

## How to use

Requires Linux and Python 3.11 or newer. The demo and paper modes use only Python’s standard library.

```bash
cd /home/a/Documents/someProducts/codex-autotrade
python3 app.py
```

Open **http://127.0.0.1:4386**. In **Strategy settings**, choose initial capital, tokens, allocation limits, and entry/exit settings. Save, review **Start automation**, then choose **Scan now** or wait for the scan interval. Automation starts paused after every server restart. The default demo uses synthetic prices and moves no funds.

For public ETH/BTC reference prices with simulated swaps:

```bash
python3 app.py --mode paper
```

For real Base swaps, create a dedicated wallet with **native Base USDC and ETH for gas**, initially holding no WETH or cbBTC. Install the wallet dependency and provide its key locally; never paste a key into chat or the dashboard:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-live-lock.txt
read -rsp 'Dedicated wallet private key: ' AUTOTRADE_WALLET_KEY
export AUTOTRADE_WALLET_KEY
export AUTOTRADE_RPC_URL='https://YOUR_BASE_MAINNET_RPC'
export AUTOTRADE_ALLOW_LIVE=YES
.venv/bin/python app.py --mode live
```

Use a Base RPC provider that supports ordinary EVM reads, fee estimation, and finalized blocks. Run **Scan now** to load the wallet balance. Set the initial USDC allocation before the first start, review the mandate, and type `START LIVE CRYPTO TRADING` in the start dialog. To permit use of the full allocation, set both total investment and per-position limits to 100%; the engine retains a small execution reserve. The key remains in server memory/environment; it is never sent to the browser or saved in the database.

**Pause automation** stops entries and automated exits. **Stop new transactions** also stops a requested close sequence; already broadcast transactions may still confirm. **Close to USDC** requires a typed confirmation and may take multiple scans for approvals and swaps. Keep the process running for automated monitoring and exits. Native ETH gas is separate from the USDC budget and equity chart.

Data lives in `data/autotrade.sqlite3`, separately for each mode. Use `--port 4387` if needed, or `--data-dir /your/path` for a separate mandate. Do not run multiple app instances against the same wallet or discard a live ledger with pending transactions. Capital is fixed after the first start. Stop with Ctrl+C; no autostart service is installed. To uninstall, stop the process and remove the app directory, preserving any live ledger and managing wallet balances/allowances through your wallet first.
