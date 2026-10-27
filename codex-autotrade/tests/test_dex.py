"""Offline EVM adapter checks; no RPC requests, funded keys or broadcasts."""
import os
import time
import unittest
from decimal import Decimal
from unittest.mock import patch

from autotrade.broker import BrokerError, TOKENS, USDC, ROUTER
from autotrade.config import validate
from autotrade.dex import BaseDex, ERC20, QUOTER_ABI, ROUTER_ABI

try:
    from web3 import Web3
    from web3.providers import BaseProvider
    from eth_account import Account
    from eth_account.typed_transactions import TypedTransaction
    from hexbytes import HexBytes
    HAS_WEB3 = True
except ImportError:
    HAS_WEB3 = False
    BaseProvider = object


class LocalRPC(BaseProvider):
    def __init__(self):
        super().__init__()
        self.codec = Web3().codec
        self.allowance = 2**128
        self.quote_factor = Decimal("1")
        self.pending_nonce = 0
        self.broadcasts = []
        self.receipt = None
        self.height = 120
        self.chain = 8453

    def make_request(self, method, params):
        result = None
        if method == "eth_chainId":
            result = hex(self.chain)
        elif method == "eth_getBlockByNumber":
            result = {"number": hex(self.height), "hash": "0x" + "ab" * 32,
                      "timestamp": hex(int(time.time())), "baseFeePerGas": hex(1000000)}
        elif method == "eth_blockNumber":
            result = hex(self.height)
        elif method == "eth_getCode":
            result = "0x6000"
        elif method == "eth_getBalance":
            result = hex(10**18)
        elif method == "eth_getTransactionCount":
            result = hex(self.pending_nonce if params[1] == "pending" else 0)
        elif method == "eth_maxPriorityFeePerGas":
            result = hex(1000000)
        elif method == "eth_estimateGas":
            result = hex(200000)
        elif method == "eth_sendRawTransaction":
            self.broadcasts.append(params[0])
            result = Web3.to_hex(Web3.keccak(HexBytes(params[0])))
        elif method == "eth_getTransactionReceipt":
            result = self.receipt
        elif method == "eth_call":
            tx = params[0]
            data = HexBytes(tx["data"])
            selector = data[:4].hex()
            signatures = {name: Web3.keccak(text=signature)[:4].hex() for name, signature in {
                "balance": "balanceOf(address)", "allowance": "allowance(address,address)",
                "decimals": "decimals()", "quote": "quoteExactInputSingle((address,address,uint256,uint24,uint160))",
                "l1fee": "getL1Fee(bytes)"}.items()}
            if selector == signatures["quote"]:
                token_in, token_out, amount, fee, _ = self.codec.decode(["(address,address,uint256,uint24,uint160)"], data[4:])[0]
                if token_in.lower() == USDC.lower():
                    price, scale = (3200, 10**18) if token_out.lower() == TOKENS["WETH"]["address"].lower() else (85000, 10**8)
                    output = int(Decimal(amount) / 10**6 / price * scale * self.quote_factor)
                else:
                    output = int(Decimal(amount) / 10**18 * 3200 * 10**6 * self.quote_factor)
                result = "0x" + self.codec.encode(["uint256", "uint160", "uint32", "uint256"], [output, 1, 1, 200000]).hex()
            else:
                value = 0
                if selector == signatures["balance"]:
                    value = 1000 * 10**6 if tx["to"].lower() == USDC.lower() else 10**18
                elif selector == signatures["allowance"]:
                    value = self.allowance
                elif selector == signatures["decimals"]:
                    value = 6 if tx["to"].lower() == USDC.lower() else 18
                elif selector == signatures["l1fee"]:
                    value = 1000000000
                result = "0x" + self.codec.encode(["uint256"], [value]).hex()
        else:
            raise AssertionError("Unexpected RPC method: " + method)
        return {"jsonrpc": "2.0", "id": 1, "result": result}


@unittest.skipUnless(HAS_WEB3, "Install requirements-live.txt for EVM tests")
class DexTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AUTOTRADE_ALLOW_LIVE": "YES"})
        self.env.start()
        self.rpc = LocalRPC()
        self.dex = BaseDex()
        self.dex.rpc_url = "http://127.0.0.1:1"
        self.dex.key = "offline-test-placeholder"
        self.dex.w3 = Web3(self.rpc)
        # Throwaway in-memory key, never funded, saved or printed.
        self.dex.wallet = Account.create()
        self.body = {"symbol": "WETH", "side": "buy", "notional": 100, "qty": None, "client_order_id": "test"}
        self.cfg = validate({})

    def tearDown(self):
        self.env.stop()

    def decode(self, prepared):
        raw = HexBytes(prepared["raw"])
        tx = TypedTransaction.from_bytes(raw).as_dict()
        self.assertEqual(tx["chainId"], 8453)
        self.assertEqual(tx["value"], 0)
        self.assertEqual(Account.recover_transaction(raw), self.dex.wallet.address)
        return tx

    def test_swap_encoding_recipient_deadline_and_minimum_output(self):
        result = self.dex.prepare(self.body, self.cfg, 3200)
        self.assertEqual(result["metadata"]["kind"], "swap")
        tx = self.decode(result)
        self.assertEqual(Web3.to_checksum_address(tx["to"]), ROUTER)
        router = self.dex.w3.eth.contract(address=ROUTER, abi=ROUTER_ABI)
        outer, args = router.decode_function_input(tx["data"])
        self.assertEqual(outer.fn_name, "multicall")
        self.assertGreater(args["deadline"], time.time())
        self.assertLessEqual(args["deadline"], time.time() + 90)
        _, inner = router.decode_function_input(args["data"][0])
        params = inner["params"]
        self.assertEqual(params["recipient"], self.dex.wallet.address)
        self.assertEqual(params["amountIn"], 100000000)
        self.assertGreater(params["amountOutMinimum"], 0)
        self.assertEqual(params["amountOutMinimum"], 31250000000000000 * 9950 // 10000)
        self.assertFalse(self.rpc.broadcasts)
        remote = self.dex.submit(self.body, result)
        self.assertEqual(remote["id"], result["metadata"]["tx_hash"])
        self.assertEqual(len(self.rpc.broadcasts), 1)

    def test_finite_approval_to_fixed_router(self):
        self.rpc.allowance = 0
        result = self.dex.prepare(self.body, self.cfg, 3200)
        self.assertEqual(result["metadata"]["kind"], "approval")
        tx = self.decode(result)
        token = self.dex.w3.eth.contract(address=USDC, abi=ERC20)
        fn, args = token.decode_function_input(tx["data"])
        self.assertEqual(fn.fn_name, "approve")
        self.assertEqual(args["spender"], ROUTER)
        self.assertEqual(args["amount"], 1000 * 10**6)
        self.assertLess(args["amount"], 2**128)
        self.assertFalse(self.rpc.broadcasts)

    def test_quote_deviation_gas_and_pending_nonce_block_before_broadcast(self):
        self.rpc.quote_factor = Decimal("0.8")
        with self.assertRaisesRegex(BrokerError, "deviates"):
            self.dex.prepare(self.body, self.cfg, 3200)
        self.rpc.quote_factor = Decimal("1")
        with self.assertRaisesRegex(BrokerError, "gas exceeds"):
            self.dex.prepare(self.body, {**self.cfg, "max_gas_eth": 0.000000001}, 3200)
        self.rpc.pending_nonce = 1
        with self.assertRaisesRegex(BrokerError, "pending nonce"):
            self.dex.prepare(self.body, self.cfg, 3200)
        self.assertFalse(self.rpc.broadcasts)

    def test_wrong_chain_and_lock_reject_signing(self):
        self.rpc.chain = 1
        with self.assertRaisesRegex(BrokerError, "Wrong network"):
            self.dex.prepare(self.body, self.cfg, 3200)
        self.rpc.chain = 8453
        with patch.dict(os.environ, {"AUTOTRADE_ALLOW_LIVE": "NO"}):
            with self.assertRaisesRegex(BrokerError, "locked"):
                self.dex.prepare(self.body, self.cfg, 3200)

    def test_receipt_transfers_and_confirmation_depth(self):
        wallet = self.dex.wallet.address
        other = "0x" + "12" * 20
        def transfer(token, sender, recipient, value, index):
            return {"address": token, "topics": [Web3.to_hex(Web3.keccak(text="Transfer(address,address,uint256)")),
                "0x" + sender[2:].lower().rjust(64, "0"), "0x" + recipient[2:].lower().rjust(64, "0")],
                "data": "0x" + value.to_bytes(32).hex(), "logIndex": hex(index), "transactionIndex": "0x0",
                "transactionHash": "0x" + "11" * 32, "blockHash": "0x" + "22" * 32,
                "blockNumber": "0x64", "removed": False}
        self.rpc.receipt = {"transactionHash": "0x" + "11" * 32, "blockNumber": "0x64", "blockHash": "0x" + "22" * 32,
            "status": "0x1", "gasUsed": hex(200000), "effectiveGasPrice": hex(1000000), "l1Fee": "0x64",
            "logs": [transfer(USDC, wallet, other, 100000000, 0), transfer(TOKENS["WETH"]["address"], other, wallet, 31250000000000000, 1)]}
        self.dex.orders = [{"client_id": "test", "symbol": "WETH", "side": "buy", "kind": "swap", "tx_hash": "0x" + "11" * 32}]
        self.rpc.height = 105
        self.assertEqual(self.dex.order("test")["status"], "confirming")
        self.rpc.height = 120
        result = self.dex.order("test")
        self.assertEqual(Decimal(result["filled_qty"]), Decimal("0.03125"))
        self.assertEqual(Decimal(result["filled_avg_price"]), Decimal("3200"))
        self.assertGreater(Decimal(result["gas_eth"]), 0)
        self.rpc.receipt["status"] = "0x0"
        self.assertEqual(self.dex.order("test")["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
