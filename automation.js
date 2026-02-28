import fs from "fs"

const WEBHOOK = process.env.DISCORD_WEBHOOK

/* ================= CONFIG ================= */

const START_FROM = 946   // ✅ NEVER create before this
const CHECK_COUNT = 10

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({ seen: [] }, null, 2))
}

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= HELPERS ================= */

async function sendPoll(id) {

  const body = {
    content: "@nouncilor",
    embeds: [{
      title: `Prop ${id}`,
      description: `https://nouncil.club/proposal/${id}`,
      color: 5793266,
      fields: [
        { name: "For", value: "⬜", inline: true },
        { name: "Against", value: "⬜", inline: true },
        { name: "Abstain", value: "⬜", inline: true }
      ]
    }]
  }

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })
}

/* ================= MAIN ================= */

async function run() {

  const latest = 946 + CHECK_COUNT   // temporary safe window

  for (let id = latest; id >= START_FROM; id--) {

    if (db.seen.includes(id)) continue

    await sendPoll(id)

    db.seen.push(id)
  }

  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
}

run()
