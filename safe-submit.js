import Safe from '@safe-global/protocol-kit'
import SafeApiKit from '@safe-global/api-kit'
import { ethers } from 'ethers'

console.log("🚀 Safe automation boot")

/* ------------------------------------------------ */
/* ENV                                              */
/* ------------------------------------------------ */

const RPC_URL = process.env.RPC_URL
const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const SAFE_ADDRESS = process.env.SAFE_ADDRESS

if (!RPC_URL || !PRIVATE_KEY || !SAFE_ADDRESS) {
  throw new Error("Missing ENV variables")
}

/* ------------------------------------------------ */
/* PROVIDER                                         */
/* ------------------------------------------------ */

const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

console.log("Proposer:", signer.address)

/* ------------------------------------------------ */
/* SAFE SDK INIT ✅ CORRECT FOR v6                  */
/* ------------------------------------------------ */

const protocolKit = await Safe.default.init({
  provider: RPC_URL,
  signer: PRIVATE_KEY,
  safeAddress: SAFE_ADDRESS
})

console.log("✅ Safe connected")

/* ------------------------------------------------ */
/* SAFE API                                         */
/* ------------------------------------------------ */

const safeApi = new SafeApiKit({
  chainId: 1n
})

/* ------------------------------------------------ */
/* DUMMY TX (TEST SAFE QUEUE)                       */
/* ------------------------------------------------ */

const safeTransactionData = {
  to: SAFE_ADDRESS,
  data: "0x",
  value: "0"
}

const safeTx = await protocolKit.createTransaction({
  transactions: [safeTransactionData]
})

const safeTxHash = await protocolKit.getTransactionHash(safeTx)

await protocolKit.signTransaction(safeTx)

await safeApi.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData: safeTx.data,
  safeTxHash,
  senderAddress: signer.address,
  senderSignature:
    safeTx.signatures.get(signer.address.toLowerCase()).data
})

console.log("✅ Transaction proposed to Safe")
