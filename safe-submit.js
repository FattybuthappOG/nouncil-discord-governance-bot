import SafeProtocolKit from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"
import { ethers } from "ethers"

const Safe = SafeProtocolKit.default || SafeProtocolKit

console.log("🚀 Safe automation boot")

/* ================= ENV ================= */

const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const SAFE_ADDRESS = process.env.SAFE_ADDRESS
const RPC_URL = process.env.RPC_URL

if (!PRIVATE_KEY || !SAFE_ADDRESS || !RPC_URL) {
  throw new Error("Missing Safe env variables")
}

/* ================= WALLET ================= */

const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

console.log("Proposer:", signer.address)

/* ================= SAFE CONNECT ================= */

const protocolKit = await Safe.create({
  ethAdapter: {
    ethers,
    signerOrProvider: signer
  },
  safeAddress: SAFE_ADDRESS
})

console.log("✅ Safe connected")

/* ================= SAFE API ================= */

const apiKit = new SafeApiKit.default
  ? new SafeApiKit.default({ chainId: 1 })
  : new SafeApiKit({ chainId: 1 })

console.log("✅ Safe API connected")

/* ================= TEST TX ================= */

const safeTransaction =
  await protocolKit.createTransaction({
    transactions: [
      {
        to: SAFE_ADDRESS,
        data: "0x",
        value: "0"
      }
    ]
  })

const safeTxHash =
  await protocolKit.getTransactionHash(
    safeTransaction
  )

const signature =
  await protocolKit.signHash(safeTxHash)

await apiKit.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData:
    safeTransaction.data,
  safeTxHash,
  senderAddress: signer.address,
  senderSignature: signature.data
})

console.log("✅ Transaction proposed to Safe queue")
