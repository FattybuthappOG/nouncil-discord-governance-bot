import Safe from '@safe-global/protocol-kit'
import SafeApiKit from '@safe-global/api-kit'
import { ethers } from "ethers"

/* ================= CONFIG ================= */

const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const SAFE_ADDRESS = process.env.SAFE_ADDRESS
const RPC_URL = process.env.RPC_URL

console.log("🚀 Safe automation boot")

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(RPC_URL)

const signer = new ethers.Wallet(
  PRIVATE_KEY,
  provider
)

console.log("Proposer:", signer.address)

/* ================= SAFE SDK ================= */

const protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: PRIVATE_KEY,
  safeAddress: SAFE_ADDRESS
})

console.log("✅ Safe connected")

/* ================= SAFE API ================= */

const safeApi = new SafeApiKit({
  chainId: 1
})

console.log("✅ Safe API connected")

/* ================= TEST TX ================= */
/* (safe empty tx so workflow succeeds) */

const safeTransactionData = {
  to: SAFE_ADDRESS,
  data: "0x",
  value: "0"
}

const safeTx = await protocolKit.createTransaction({
  transactions: [safeTransactionData]
})

const safeTxHash =
  await protocolKit.getTransactionHash(safeTx)

const senderSignature =
  await protocolKit.signTransactionHash(safeTxHash)

await safeApi.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData: safeTx.data,
  safeTxHash,
  senderAddress: signer.address,
  senderSignature: senderSignature.data
})

console.log("✅ Transaction proposed to Safe queue")
