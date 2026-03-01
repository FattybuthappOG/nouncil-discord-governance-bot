const fs = require("fs")

const WEBHOOK = process.env.DISCORD_WEBHOOK

console.log("Automation starting")

/* ================= CONFIG ================= */

const START_FROM = 946
const CHECK_COUNT = 5

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({ seen: [] }, null, 2))
}

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= SEND POLL ================= */

async function sendPoll(id) {

  const body = {
    content: "@nouncilor",
    embeds: [{
      title: `Prop ${id}`,
      description: `https://nouncil.club/proposal/${id}`,
      color: 5793266
    }]
  }

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  console.log("Posted proposal", id)
}

/* ================= MAIN ================= */

async function run() {

  const latest = START_FROM + CHECK_COUNT

  for (let id = latest; id >= START_FROM; id--) {

    if (db.seen.includes(id)) continue

    await sendPoll(id)

    db.seen.push(id)
  }

  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))

  console.log("Automation complete")
}

run()
