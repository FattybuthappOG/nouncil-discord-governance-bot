import fs from "fs"
import { ethers } from "ethers"

const WEBHOOK = process.env.DISCORD_WEBHOOK

/* ================= CONFIG ================= */

const RPC =
  "https://eth.llamarpc.com"

const GOVERNOR =
  "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d"

/* Governor ABI minimal */
const ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id,uint256 eta,uint256 startBlock,uint256 endBlock)"
]

/* ================= LOAD STATE ================= */

const seen = JSON.parse(
  fs.readFileSync("./seen_proposals.json")
)

/* ================= RPC ================= */

const provider = new ethers.JsonRpcProvider(RPC)
const gov = new ethers.Contract(GOVERNOR, ABI, provider)

/* ================= MAIN ================= */

async function run() {

  const latest = Number(await gov.proposalCount())

  console.log("Latest proposal:", latest)

  for (let id = latest; id > latest - 10; id--) {

    if (seen.includes(id)) continue

    console.log("Creating poll for", id)

    await createDiscordPoll(id)

    seen.push(id)
  }

  fs.writeFileSync(
    "./seen_proposals.json",
    JSON.stringify(seen, null, 2)
  )
}

/* ================= DISCORD ================= */

async function createDiscordPoll(id) {

  const payload = {
    content: "@nouncilor",
    embeds: [{
      title: `Prop ${id}`,
      description:
        `https://nouncil.club/proposal/${id}`,
      fields: [
        { name: "For", value: "⬜", inline: true },
        { name: "Against", value: "⬜", inline: true },
        { name: "Abstain", value: "⬜", inline: true }
      ]
    }]
  }

  await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  console.log("Poll sent:", id)
}

run()
