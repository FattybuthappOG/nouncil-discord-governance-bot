import Safe from '@safe-global/protocol-kit'
import SafeApiKit from '@safe-global/api-kit'
import { ethers } from "ethers"
import fs from "fs"

// =============================
// ENV
// =============================
const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const RPC_URL = process.env.RPC_URL

// ✅ REPLACE WITH YOUR SAFE
const SAFE_ADDRESS = "PASTE_YOUR_SAFE_ADDRESS_HERE"

// =============================
// GUARD
// =============================
if (!PRIVATE_KEY) {
  throw new Error("SAFE_PRIVATE_KEY missing")
}

if (!RPC_URL) {
  throw new Error("RPC_URL missing")
}

if (SAFE_ADDRESS.includes("PASTE")) {
  throw new Error("SAFE_ADDRESS not configured")
}

// =============================
// PROVIDER
// =============================
const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

// =============================
// SAFE SDK
// =============================
const protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: PRIVATE_KEY,
  safeAddress: SAFE_ADDRESS
})

const apiKit = new SafeApiKit({
  chainId: 1n
})

// =============================
// LOAD POLL RESULT
// =============================
if (!fs.existsSync("polls.json")) {
  console.log("No polls.json found")
  process.exit(0)
}

const polls = JSON.parse(fs.readFileSync("polls.json"))

const proposal = Object.values(polls).find(
  p => p.passed && !p.safeQueued
)

if (!proposal) {
  console.log("No passed proposal needing Safe queue")
  process.exit(0)
}

// =============================
// MARKDOWN REASON
// =============================
const markdownReason = `
${proposal.title}

FOR - ${proposal.forVotes}
AGAINST - ${proposal.againstVotes}
ABSTAIN - ${proposal.abstainVotes}

${proposal.markdown || ""}
`

// =============================
// SAFE TX
// Example: empty tx (queue signal)
// =============================
const safeTransactionData = {
  to: SAFE_ADDRESS,
  value: "0",
  data: "0x"
}

const safeTx = await protocolKit.createTransaction({
  transactions: [safeTransactionData]
})

const safeTxHash =
  await protocolKit.getTransactionHash(safeTx)

const senderSignature =
  await protocolKit.signHash(safeTxHash)

await apiKit.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData:
    safeTx.data,
  safeTxHash,
  senderAddress:
    await signer.getAddress(),
  senderSignature:
    senderSignature.data,
  origin: markdownReason
})

proposal.safeQueued = true

fs.writeFileSync(
  "polls.json",
  JSON.stringify(polls, null, 2)
)

console.log("✅ Safe transaction queued")
