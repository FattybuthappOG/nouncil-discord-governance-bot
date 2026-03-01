import fs from "fs"

/* ================= CONFIG ================= */

const WEBHOOK = process.env.DISCORD_WEBHOOK
const START_FROM = 946
const CHECK_LAST = 10

const GRAPH =
  "https://api.thegraph.com/subgraphs/name/nounsdao/nouns-subgraph"

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({ seen: [] }, null, 2))
}

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= SAFE FETCH ================= */

async function latestProposalId() {

  const query = {
    query: `
      {
        proposals(first:1, orderBy:id, orderDirection:desc){
          id
        }
      }
    `
  }

  const res = await fetch(GRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query)
  })

  const json = await res.json()

  /* ✅ SAFETY CHECK */
  if (!json?.data?.proposals?.length) {
    console.log("❌ Graph returned invalid response")
    console.log(JSON.stringify(json))
    process.exit(0)
  }

  return Number(json.data.proposals[0].id)
}

/* ================= DISCORD ================= */

async function sendPoll(id) {

  const body = {
    content: "@nouncilor",
    embeds: [{
      title: `Prop ${id}`,
      description: `https://nouncil.club/proposal/${id}`,
      color: 5793266,
      fields: [
        { name: "FOR", value: "⬜", inline: true },
        { name: "AGAINST", value: "⬜", inline: true },
        { name: "ABSTAIN", value: "⬜", inline: true }
      ]
    }]
  }

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  console.log("✅ Poll sent:", id)
}

/* ================= MAIN ================= */

async function run() {

  const latest = await latestProposalId()

  console.log("Latest proposal:", latest)

  for (
    let id = latest;
    id > latest - CHECK_LAST;
    id--
  ) {

    if (id < START_FROM) continue
    if (db.seen.includes(id)) continue

    console.log("Creating poll for", id)

    await sendPoll(id)

    db.seen.push(id)
  }

  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
}

run()
