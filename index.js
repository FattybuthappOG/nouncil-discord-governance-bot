import {
  Client,
  GatewayIntentBits,
  Events
} from "discord.js"

import dotenv from "dotenv"
import http from "http"

dotenv.config()

console.log("BOOT START")

/* ================= ENV ================= */

const TOKEN = process.env.DISCORD_TOKEN

if (!TOKEN) {
  console.error("❌ DISCORD TOKEN MISSING")
  process.exit(1)
}

/* ================= KEEP RENDER ALIVE FIRST ================= */

http.createServer((req, res) => {
  res.writeHead(200)
  res.end("alive")
}).listen(process.env.PORT || 3000)

/* ================= DISCORD CLIENT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

/* ================= READY EVENT ================= */

client.once(Events.ClientReady, () => {
  console.log("✅ CONNECTED:", client.user.tag)
})

/* ================= ERROR LOGGING ================= */

client.on("error", err => {
  console.error("Discord client error:", err)
})

process.on("unhandledRejection", err => {
  console.error("Unhandled rejection:", err)
})

process.on("uncaughtException", err => {
  console.error("Uncaught exception:", err)
})

/* ================= LOGIN ================= */

client.login(TOKEN)
  .then(() => {
    console.log("✅ LOGIN SUCCESS")
  })
  .catch(err => {
    console.error("❌ LOGIN FAILED:", err)
  })
