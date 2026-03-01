import Safe from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"
import { ethers } from "ethers"
import fs from "fs"

console.log("🚀 Safe automation boot")

/* ================= ENV ================= */

const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const RPC_URL = process.env.RPC_URL
const SAFE_ADDRESS = process.env.SAFE_ADDRESS

if (!PRIVATE_KEY) throw Error("Missing PRIVATE KEY")
if (!RPC_URL) throw Error("Missing RPC_URL")
if (!SAFE_ADDRESS) throw Error("Missing SAFE_ADDRESS")

if (!ethers.isAddress(SAFE_ADDRESS))
  throw Error("Invalid SAFE_ADDRESS")

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

console.log("Proposer:", await signer.getAddress())

/* ================= SAFE INIT ================= */

const protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: PRIVATE_KEY,
  safeAddress: SAFE_ADDRESS
})

const apiKit = new SafeApiKit({
  chainId: 1n
})

console.log("✅ Safe connected")

/* ================= LOAD POLLS ================= */

if (!fs.existsSync("polls.json")) {
  console.log("No polls")
  process.exit(0)
}

const polls = JSON.parse(fs.readFileSync("polls.json"))

const proposal = Object.values(polls).find(
  p => p.passed && !p.safeQueued
)

if (!proposal) {
  console.log("Nothing to queue")
  process.exit(0)
}

/* ================= MARKDOWN ================= */

const markdown = `
${proposal.title}

FOR - ${proposal.forVotes}
AGAINST - ${proposal.againstVotes}
ABSTAIN - ${proposal.abstainVotes}
`

/* ================= CREATE SAFE TX ================= */

const tx = await protocolKit.createTransaction({
  transactions: [{
    to: SAFE_ADDRESS,
    value: "0",
    data: "0x"
  }]
})

const hash = await protocolKit.getTransactionHash(tx)

const signature = await protocolKit.signHash(hash)

await apiKit.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData: tx.data,
  safeTxHash: hash,
  senderAddress: await signer.getAddress(),
  senderSignature: signature.data,
  origin: markdown
})

proposal.safeQueued = true

fs.writeFileSync(
  "polls.json",
  JSON.stringify(polls, null, 2)
)

console.log("✅ Proposed to Safe")
