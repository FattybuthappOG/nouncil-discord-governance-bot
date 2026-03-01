import Safe from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"
import { ethers } from "ethers"
import fs from "fs"

console.log("🚀 Safe submit starting")

/* ================= ENV ================= */

const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY
const RPC_URL = process.env.RPC_URL

// ✅ PUT REAL SAFE HERE
const SAFE_ADDRESS = "0xcC2688350d29623E2A0844Cc8885F9050F0f6Ed5"

/* ================= VALIDATION ================= */

if (!PRIVATE_KEY) throw Error("Missing SAFE_PRIVATE_KEY")
if (!RPC_URL) throw Error("Missing RPC_URL")

if (!ethers.isAddress(SAFE_ADDRESS))
  throw Error("INVALID SAFE ADDRESS")

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

console.log("Signer:", await signer.getAddress())

/* ================= SAFE EXISTS CHECK ================= */

const code = await provider.getCode(SAFE_ADDRESS)

if (code === "0x")
  throw Error("SAFE NOT DEPLOYED OR WRONG NETWORK")

console.log("✅ Safe contract detected")

/* ================= SAFE INIT ================= */

const protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: PRIVATE_KEY,
  safeAddress: SAFE_ADDRESS
})

const apiKit = new SafeApiKit({
  chainId: 1n
})

console.log("✅ Safe SDK initialized")

/* ================= LOAD POLLS ================= */

if (!fs.existsSync("polls.json")) {
  console.log("No polls.json")
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

/* ================= SAFE TX ================= */

const tx = await protocolKit.createTransaction({
  transactions: [{
    to: SAFE_ADDRESS,
    value: "0",
    data: "0x"
  }]
})

const hash = await protocolKit.getTransactionHash(tx)

const sig = await protocolKit.signHash(hash)

await apiKit.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData: tx.data,
  safeTxHash: hash,
  senderAddress: await signer.getAddress(),
  senderSignature: sig.data,
  origin: markdown
})

proposal.safeQueued = true

fs.writeFileSync(
  "polls.json",
  JSON.stringify(polls, null, 2)
)

console.log("✅ SAFE TX SUCCESSFULLY QUEUED")
