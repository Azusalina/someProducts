"""Optional read-only check of public data and Base contract deployment. Never signs."""
import os
from web3 import Web3
from autotrade.broker import PublicFeed, TOKENS, USDC, ROUTER, QUOTER
from autotrade.dex import ERC20, QUOTER_ABI

prices, _, _ = PublicFeed().market(list(TOKENS), 20)
assert all(q["fresh"] for q in prices.values()), "Reference price feed is stale"
w3 = Web3(Web3.HTTPProvider(os.environ.get("AUTOTRADE_PROBE_RPC_URL", "https://mainnet.base.org"), request_kwargs={"timeout": 12}))
assert w3.eth.chain_id == 8453
for address in [USDC, ROUTER, QUOTER] + [t["address"] for t in TOKENS.values()]:
    assert w3.eth.get_code(w3.to_checksum_address(address)), "Expected deployment has no code"
assert w3.eth.contract(address=USDC, abi=ERC20).functions.decimals().call() == 6
quote = w3.eth.contract(address=QUOTER, abi=QUOTER_ABI).functions.quoteExactInputSingle(
    (USDC, TOKENS["WETH"]["address"], 10**6, 500, 0)).call()
assert quote[0] > 0
print("Read-only checks passed: fresh ETH/BTC feed, Base chain 8453, allowlisted contract bytecode, USDC decimals and 1 USDC → WETH quote. No wallet or broadcast.")
