import fs from "fs"
import { ethers } from "ethers"

import SafeProtocolKit from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"

/* ================= CONFIG ================= */

const RPC =
  "https://eth-mainnet.g.alchemy.com/v2/demo"

const SAFE_ADDRESS =
  "0xYOUR_SAFE_ADDRESS"

const GOVERNOR =
  "0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY

/* ================= STORAGE ================= */

const POLLS = JSON.parse(
  fs.readFileSync("polls.json")
)

const QUEUED_FILE = "queued.json"

if (!fs.existsSync(QUEUED_FILE)) {
  fs.writeFileSync(
    QUEUED_FILE,
    JSON.stringify({ queued: [] }, null, 2)
  )
}

const queuedDB = JSON.parse(
  fs.readFileSync(QUEUED_FILE)
)

/* ================= PROVIDER ================= */

const provider = new ethers.JsonRpcProvider(RPC)
const signer = new ethers.Wallet(
  PRIVATE_KEY,
  provider
)

/* ================= SAFE INIT ================= */

const protocolKit =
  await SafeProtocolKit.default.init({
    provider: RPC,
    signer: PRIVATE_KEY,
    safeAddress: SAFE_ADDRESS
  })

const apiKit = new SafeApiKit.default({
  chainId: 1n
})

/* ================= HELPERS ================= */

function buildMarkdown(prop) {
  return `
Prop ${prop.id}: ${prop.result} - Wins

FOR - ${prop.for || 0} VOTES
AGAINST - ${prop.against || 0} VOTES
ABSTAINS - ${prop.abstain || 0} VOTES
`
}

/* ================= MAIN ================= */

for (const prop of POLLS.closed || []) {

  if (queuedDB.queued.includes(prop.id)) {
    console.log(
      "Already queued:",
      prop.id
    )
    continue
  }

  if (prop.result !== "FOR") {
    console.log(
      "Vote did not pass:",
      prop.id
    )
    continue
  }

  console.log(
    "Queueing Safe TX for Prop",
    prop.id
  )

  /* ---------- SAFE TX ---------- */

  const safeTransactionData = {
    to: GOVERNOR,
    data: "0x",
    value: "0"
  }

  const safeTx =
    await protocolKit.createTransaction({
      transactions: [safeTransactionData]
    })

  const txHash =
    await protocolKit.getTransactionHash(
      safeTx
    )

  await protocolKit.signTransaction(
    safeTx
  )

  await apiKit.proposeTransaction({
    safeAddress: SAFE_ADDRESS,
    safeTransactionData:
      safeTx.data,
    safeTxHash: txHash,
    senderAddress:
      await signer.getAddress(),
    senderSignature:
      safeTx.signatures.values()
        .next().value.data
  })

  console.log(
    "✅ Proposed to Safe:",
    prop.id
  )

  /* ---------- MARKDOWN EXPORT ---------- */

  fs.writeFileSync(
    `result-${prop.id}.md`,
    buildMarkdown(prop)
  )

  queuedDB.queued.push(prop.id)
}

/* ================= SAVE ================= */

fs.writeFileSync(
  QUEUED_FILE,
  JSON.stringify(queuedDB, null, 2)
)

console.log("Safe submit complete")
