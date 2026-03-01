const fs = require("fs")

const WEBHOOK = process.env.DISCORD_WEBHOOK

console.log("Automation starting")

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({
    lastPosted: 946
  }, null, 2))
}

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= GET LATEST ================= */

async function getLatestProposal() {

  // simple safe probe forward
  let id = db.lastPosted + 1

  while (true) {
    const res = await fetch(
      `https://nouncil.club/proposal/${id}`
    )

    if (!res.ok) break

    id++
  }

  return id - 1
}

/* ================= SEND ================= */

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

  const latest = await getLatestProposal()

  console.log("Latest:", latest)
  console.log("Last posted:", db.lastPosted)

  if (latest <= db.lastPosted) {
    console.log("No new proposals")
    return
  }

  for (
    let id = db.lastPosted + 1;
    id <= latest;
    id++
  ) {
    await sendPoll(id)
  }

  db.lastPosted = latest

  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))

  console.log("Automation complete")
}

run()
