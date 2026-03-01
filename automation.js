import { ethers } from "ethers"
import fs from "fs"

const WEBHOOK = process.env.DISCORD_WEBHOOK

/* ================= RPC ================= */

const provider = new ethers.JsonRpcProvider(
  "https://eth.llamarpc.com"
)

/* ================= NOUNS DAO ================= */

const DAO =
  "0x9C8fF314C9Bc7F6e59A9D9225Fb22946427Edc03"

const ABI = [
  "event ProposalCreated(uint256 id,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 startBlock,uint256 endBlock,string description)"
]

const dao = new ethers.Contract(DAO, ABI, provider)

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE))
  fs.writeFileSync(FILE, JSON.stringify({ seen: [] }, null, 2))

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= HELPERS ================= */

async function sendPoll(id, description, endBlock) {

  const block = await provider.getBlock(endBlock)

  const votingEnd = block.timestamp * 1000
  const closeTime =
    votingEnd - (24 * 60 * 60 * 1000)

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "@nouncilor",
      embeds: [{
        title: `Prop ${id}`,
        description,
        fields: [
          {
            name: "Voting ends",
            value: `<t:${Math.floor(votingEnd/1000)}:F>`
          },
          {
            name: "Nouncil closes",
            value: `<t:${Math.floor(closeTime/1000)}:F>`
          }
        ]
      }]
    })
  })

  console.log("✅ Created poll", id)
}

/* ================= MAIN ================= */

async function run() {

  const events =
    await dao.queryFilter(
      dao.filters.ProposalCreated(),
      -40000
    )

  for (const e of events.reverse()) {

    const id = Number(e.args.id)

    if (db.seen.includes(id)) continue

    await sendPoll(
      id,
      e.args.description,
      e.args.endBlock
    )

    db.seen.push(id)
  }

  fs.writeFileSync(FILE, JSON.stringify(db,null,2))
}

run()
