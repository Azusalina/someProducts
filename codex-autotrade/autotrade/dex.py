"""Fixed Base / Uniswap v3 execution. No exchange login, identity database or relay."""
import functools
import os
import time
from decimal import Decimal

from .broker import BrokerError, PublicFeed, TOKENS, USDC, ROUTER, QUOTER


def function(name, inputs, outputs, state="view"):
    def param(spec):
        return {"name": spec[0], "type": spec[1]}
    return {"type": "function", "name": name, "stateMutability": state,
            "inputs": [param(x) for x in inputs], "outputs": [param(x) for x in outputs]}


ERC20 = [function("balanceOf", [("owner", "address")], [("", "uint256")]),
         function("allowance", [("owner", "address"), ("spender", "address")], [("", "uint256")]),
         function("approve", [("spender", "address"), ("amount", "uint256")], [("", "bool")], "nonpayable"),
         function("decimals", [], [("", "uint8")])]
QUOTER_ABI = [{"type": "function", "name": "quoteExactInputSingle", "stateMutability": "nonpayable",
    "inputs": [{"name": "params", "type": "tuple", "components": [
        {"name": n, "type": t} for n, t in [("tokenIn", "address"), ("tokenOut", "address"),
            ("amountIn", "uint256"), ("fee", "uint24"), ("sqrtPriceLimitX96", "uint160")]]}],
    "outputs": [{"name": n, "type": t} for n, t in [("amountOut", "uint256"),
        ("sqrtPriceX96After", "uint160"), ("initializedTicksCrossed", "uint32"), ("gasEstimate", "uint256")]]}]
ROUTER_ABI = [{"type": "function", "name": "exactInputSingle", "stateMutability": "payable",
    "inputs": [{"name": "params", "type": "tuple", "components": [
        {"name": n, "type": t} for n, t in [("tokenIn", "address"), ("tokenOut", "address"), ("fee", "uint24"),
            ("recipient", "address"), ("amountIn", "uint256"), ("amountOutMinimum", "uint256"), ("sqrtPriceLimitX96", "uint160")]]}],
    "outputs": [{"name": "amountOut", "type": "uint256"}]},
    function("multicall", [("deadline", "uint256"), ("data", "bytes[]")], [("results", "bytes[]")], "payable")]
ORACLE_ABI = [function("getL1Fee", [("data", "bytes")], [("", "uint256")])]


def safe_rpc(method):
    """Never pass RPC URL, key material or signed transaction bytes into UI/logs."""
    @functools.wraps(method)
    def wrapped(*args, **kwargs):
        try:
            return method(*args, **kwargs)
        except BrokerError:
            raise
        except Exception:
            raise BrokerError(f"Wallet/RPC operation '{method.__name__}' failed. Check network, funding and provider status; transaction status may be unknown.") from None
    return wrapped


class BaseDex(PublicFeed):
    base = "Base · chain 8453 · Uniswap v3 SwapRouter02"

    def __init__(self):
        self.rpc_url = os.environ.get("AUTOTRADE_RPC_URL", "")
        self.key = os.environ.get("AUTOTRADE_WALLET_KEY", "")
        self.orders = []
        self.w3 = self.wallet = None

    @property
    def connected(self):
        return bool(self.rpc_url and self.key)

    def client(self):
        if not self.connected:
            raise BrokerError("Set AUTOTRADE_RPC_URL and AUTOTRADE_WALLET_KEY on the local server, then restart.")
        if self.w3 is None:
            try:
                from web3 import Web3
            except ImportError:
                raise BrokerError("Install requirements-live.txt in a virtual environment to enable wallet execution.") from None
            if not self.rpc_url.startswith("https://") and not self.rpc_url.startswith(("http://127.0.0.1:", "http://localhost:")):
                raise BrokerError("RPC must use HTTPS, or a loopback HTTP node.")
            self.w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 12}))
            self.wallet = self.w3.eth.account.from_key(self.key)
        if self.w3.eth.chain_id != 8453:
            raise BrokerError("Wrong network: the wallet adapter only accepts Base mainnet (8453).")
        latest = self.w3.eth.get_block("latest")
        if not -5 <= time.time() - latest["timestamp"] <= 90:
            raise BrokerError("RPC head is stale; wallet execution stopped.")
        return self.w3

    def token(self, address):
        return self.w3.eth.contract(address=self.w3.to_checksum_address(address), abi=ERC20)

    @safe_rpc
    def account(self):
        w3 = self.client()
        cash = self.token(USDC).functions.balanceOf(self.wallet.address).call() / 10**6
        gas = w3.eth.get_balance(self.wallet.address) / 10**18
        return {"id": self.wallet.address, "cash": cash, "equity": cash,
                "status": "ACTIVE", "blocked": False, "gas_eth": gas, "chain_id": 8453}

    @safe_rpc
    def positions(self):
        self.client()
        result = []
        for symbol, token in TOKENS.items():
            qty = self.token(token["address"]).functions.balanceOf(self.wallet.address).call()
            if qty:
                result.append({"symbol": symbol, "qty": str(Decimal(qty) / 10**token["decimals"])})
        return result

    def open_orders(self):
        # RPC has no portable account-wide mempool view. Nonce parity is checked before signing.
        return []

    @safe_rpc
    def asset(self, symbol):
        self.client()
        if symbol not in TOKENS:
            raise BrokerError("Token is not in the fixed Base allowlist.")
        t = TOKENS[symbol]
        for address, decimals in ((t["address"], t["decimals"]), (USDC, 6)):
            if not self.w3.eth.get_code(self.w3.to_checksum_address(address)):
                raise BrokerError("An allowlisted contract has no code on this network.")
            if self.token(address).functions.decimals().call() != decimals:
                raise BrokerError("On-chain token decimals do not match the allowlist.")

    @safe_rpc
    def prepare(self, body, cfg, reference_price):
        if os.environ.get("AUTOTRADE_ALLOW_LIVE") != "YES":
            raise BrokerError("Wallet execution is locked. Set AUTOTRADE_ALLOW_LIVE=YES.")
        w3 = self.client()
        address = self.wallet.address
        token = TOKENS[body["symbol"]]
        token_in, token_out = (USDC, token["address"]) if body["side"] == "buy" else (token["address"], USDC)
        decimals_in, decimals_out = (6, token["decimals"]) if body["side"] == "buy" else (token["decimals"], 6)
        units = Decimal(str(body["notional"] if body["side"] == "buy" else body["qty"]))
        amount_in = int(units * 10**decimals_in)
        if amount_in <= 0:
            raise BrokerError("Swap input rounds to zero.")
        nonce = w3.eth.get_transaction_count(address, "pending")
        if nonce != w3.eth.get_transaction_count(address, "latest"):
            raise BrokerError("Wallet has a pending nonce outside a reconciled app transaction. Wait and reconcile first.")
        input_contract = self.token(token_in)
        if input_contract.functions.balanceOf(address).call() < amount_in:
            raise BrokerError("Wallet balance is lower than the proposed input.")
        router_address = w3.to_checksum_address(ROUTER)
        for deployed in (ROUTER, QUOTER):
            if not w3.eth.get_code(w3.to_checksum_address(deployed)):
                raise BrokerError("Uniswap contract missing on configured chain.")
        allowance = input_contract.functions.allowance(address, router_address).call()
        metadata = {"nonce": nonce, "token_in": token_in, "token_out": token_out, "amount_in": str(amount_in)}
        if allowance < amount_in:
            # Finite allowance to the fixed router; no Permit2 or unlimited approval.
            if body["side"] == "buy":
                allowance_target = max(amount_in, int(Decimal(str(cfg["capital"])) * 10**6))
                allowance_target = min(allowance_target, input_contract.functions.balanceOf(address).call())
            else:
                allowance_target = amount_in
            call = input_contract.functions.approve(router_address, allowance_target)
            metadata.update(kind="approval", approval_amount=str(allowance_target))
        else:
            quoter = w3.eth.contract(address=w3.to_checksum_address(QUOTER), abi=QUOTER_ABI)
            choices = []
            for fee in (100, 500, 3000, 10000):
                try:
                    quote = quoter.functions.quoteExactInputSingle((w3.to_checksum_address(token_in),
                        w3.to_checksum_address(token_out), amount_in, fee, 0)).call()
                    if quote[0] > 0:
                        choices.append((quote[0], fee))
                except Exception:
                    continue
            if not choices:
                raise BrokerError("No direct allowlisted Uniswap v3 pool can quote this swap.")
            output, fee = max(choices)
            expected = units / Decimal(str(reference_price)) if body["side"] == "buy" else units * Decimal(str(reference_price))
            minimum_fair = expected * (10000 - cfg["max_deviation_bps"]) / 10000
            if Decimal(output) / 10**decimals_out < minimum_fair:
                raise BrokerError("Pool quote deviates too far from the public reference price; swap blocked.")
            minimum_out = output * (10000 - cfg["slippage_bps"]) // 10000
            if minimum_out <= 0:
                raise BrokerError("Minimum output rounds to zero.")
            router = w3.eth.contract(address=router_address, abi=ROUTER_ABI)
            swap = router.functions.exactInputSingle((w3.to_checksum_address(token_in),
                w3.to_checksum_address(token_out), fee, address, amount_in, minimum_out, 0))
            deadline = int(time.time()) + 90
            call = router.functions.multicall(deadline, [bytes.fromhex(swap._encode_transaction_data()[2:])])
            metadata.update(kind="swap", min_out=str(minimum_out), pool_fee=fee, deadline=deadline)
        block = w3.eth.get_block("latest")
        max_priority = min(int(w3.eth.max_priority_fee), 1000000000)
        max_fee = int(block["baseFeePerGas"]) * 2 + max_priority
        transaction = {"from": address, "nonce": nonce, "chainId": 8453, "value": 0,
                       "maxFeePerGas": max_fee, "maxPriorityFeePerGas": max_priority}
        gas = int(call.estimate_gas(transaction) * 1.25)
        tx = call.build_transaction({**transaction, "gas": gas})
        if tx["to"].lower() not in {router_address.lower(), token_in.lower()} or tx["value"] != 0:
            raise BrokerError("Transaction target or native value failed validation.")
        signed = self.wallet.sign_transaction(tx)
        oracle = w3.eth.contract(address=w3.to_checksum_address("0x420000000000000000000000000000000000000F"), abi=ORACLE_ABI)
        l1_fee = oracle.functions.getL1Fee(signed.raw_transaction).call()
        worst_fee = gas * max_fee + l1_fee * 2
        if Decimal(worst_fee) / 10**18 > Decimal(str(cfg["max_gas_eth"])):
            raise BrokerError("Estimated transaction gas exceeds the configured ETH cap.")
        if w3.eth.get_balance(address) < worst_fee * 2:
            raise BrokerError("Fund the dedicated wallet with more Base ETH for gas.")
        metadata.update(tx_hash=w3.to_hex(signed.hash), gas_estimate_eth=str(Decimal(worst_fee) / 10**18))
        return {"metadata": metadata, "raw": signed.raw_transaction}

    @safe_rpc
    def submit(self, body, prepared):
        # Hash has already been persisted by Engine before this network write.
        if os.environ.get("AUTOTRADE_ALLOW_LIVE") != "YES":
            raise BrokerError("Wallet execution is locked.")
        result = self.w3.eth.send_raw_transaction(prepared["raw"])
        if self.w3.to_hex(result).lower() != prepared["metadata"]["tx_hash"].lower():
            raise BrokerError("RPC returned an unexpected transaction hash; manual reconciliation required.")
        return {"id": self.w3.to_hex(result), "status": "pending", "filled_qty": "0", "filled_avg_price": None}

    @safe_rpc
    def order(self, client_id):
        self.client()
        local = next(o for o in self.orders if o["client_id"] == client_id)
        tx_hash = local.get("tx_hash")
        if not tx_hash:
            raise BrokerError("A saved transaction has no hash. Manual reconciliation is required.")
        from web3.exceptions import TransactionNotFound
        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
        except TransactionNotFound:
            return {"id": tx_hash, "status": "pending", "filled_qty": "0", "filled_avg_price": None}
        if self.w3.eth.block_number - receipt["blockNumber"] + 1 < 12:
            return {"id": tx_hash, "status": "confirming", "filled_qty": "0", "filled_avg_price": None}
        l1_fee = receipt.get("l1Fee", 0)
        if isinstance(l1_fee, str):
            l1_fee = int(l1_fee, 16)
        actual_fee = Decimal(receipt["gasUsed"] * receipt["effectiveGasPrice"] + l1_fee) / 10**18
        result = {"id": tx_hash, "status": "filled" if receipt["status"] == 1 else "rejected",
                  "filled_qty": "0", "filled_avg_price": None, "block_number": receipt["blockNumber"],
                  "block_hash": self.w3.to_hex(receipt["blockHash"]),
                  "gas_eth": str(actual_fee)}
        if receipt["status"] != 1 or local.get("kind") == "approval":
            return result
        token = TOKENS[local["symbol"]]
        transfers = {USDC.lower(): 0, token["address"].lower(): 0}
        wallet = self.wallet.address.lower()[2:]
        topic = bytes(self.w3.keccak(text="Transfer(address,address,uint256)"))
        for log in receipt["logs"]:
            if log["address"].lower() not in transfers or len(log["topics"]) != 3 or bytes(log["topics"][0]) != topic:
                continue
            value = int.from_bytes(bytes(log["data"]), "big")
            if bytes(log["topics"][2])[-20:].hex() == wallet:
                transfers[log["address"].lower()] += value
            if bytes(log["topics"][1])[-20:].hex() == wallet:
                transfers[log["address"].lower()] -= value
        token_qty = Decimal(transfers[token["address"].lower()]) / 10**token["decimals"]
        usdc_qty = Decimal(transfers[USDC.lower()]) / 10**6
        if local["side"] == "buy" and not (token_qty > 0 and usdc_qty < 0):
            raise BrokerError("Receipt transfers do not match an expected buy.")
        if local["side"] == "sell" and not (token_qty < 0 and usdc_qty > 0):
            raise BrokerError("Receipt transfers do not match an expected sell.")
        result.update(filled_qty=str(abs(token_qty)), filled_avg_price=str(abs(usdc_qty / token_qty)))
        return result

    @safe_rpc
    def verify_receipt(self, order):
        self.client()
        receipt = self.w3.eth.get_transaction_receipt(order["tx_hash"])
        if self.w3.to_hex(receipt["blockHash"]) != order["block_hash"]:
            raise BrokerError("A previously confirmed swap was reorganized. Automation stopped; manual ledger reconciliation required.")
        return self.w3.eth.get_block("finalized")["number"] >= order["block_number"]

    def cancel(self, order_id):
        raise BrokerError("Broadcast blockchain transactions cannot be canceled reliably here. Automation is stopped; monitor the saved transaction hash in your wallet.")
