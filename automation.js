import fs from "fs"
import { ethers } from "ethers"

/* ================= CONFIG ================= */

const WEBHOOK = process.env.DISCORD_WEBHOOK

const RPC =
"https://eth.llamarpc.com"

const DAO_ADDRESS =
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const START_FROM = 946

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(
    FILE,
    JSON.stringify({ seen: [] }, null, 2)
  )
}

const db =
JSON.parse(fs.readFileSync(FILE))

/* ================= PROVIDER ================= */

const provider =
new ethers.JsonRpcProvider(RPC)

const DAO_ABI = [
"event ProposalCreated(uint256 id,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 startBlock,uint256 endBlock,string description)"
]

const dao =
new ethers.Contract(
DAO_ADDRESS,
DAO_ABI,
provider
)

/* ================= DISCORD ================= */

async function sendPoll(id, endTimestamp) {

  const closeTime =
  new Date(
    (endTimestamp - 86400) * 1000
  ).toUTCString()

  const body = {
    content: "@nouncilor",
    embeds: [{
      title: `Prop ${id}`,
      description:
      `https://nouncil.club/proposal/${id}`,
      color: 5793266,
      fields: [
        { name: "For", value: "⬜", inline: true },
        { name: "Against", value: "⬜", inline: true },
        { name: "Abstain", value: "⬜", inline: true },
        { name: "Closes", value: closeTime }
      ]
    }]
  }

  await fetch(WEBHOOK,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  })
}

/* ================= MAIN ================= */

async function run() {

  console.log("Checking proposals onchain...")

  const latestBlock =
  await provider.getBlockNumber()

  const fromBlock =
  Math.max(latestBlock - 40000, 0)

  const events =
  await dao.queryFilter(
    dao.filters.ProposalCreated(),
    fromBlock,
    latestBlock
  )

  for (const e of events.reverse()) {

    const id =
    Number(e.args.id)

    if (id < START_FROM) continue
    if (db.seen.includes(id)) continue

    console.log("Found proposal", id)

    const endBlock =
    Number(e.args.endBlock)

    const safeBlock =
    Math.min(
      endBlock,
      await provider.getBlockNumber()
    )

    const block =
    await provider.getBlock(safeBlock)

    const endTimestamp =
    block.timestamp

    await sendPoll(
      id,
      endTimestamp
    )

    db.seen.push(id)
  }

  fs.writeFileSync(
    FILE,
    JSON.stringify(db,null,2)
  )

  console.log("Done.")
}

run()
