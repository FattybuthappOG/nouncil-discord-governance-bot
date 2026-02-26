import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  SlashCommandBuilder,
  REST,
  Routes
} from "discord.js"

import fs from "fs"
import dotenv from "dotenv"
import http from "http"
import { ethers } from "ethers"

dotenv.config()

// ================= ENV =================
const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID
const ETH_RPC_URL = process.env.ETH_RPC_URL

// Governance contract
const GOVERNOR_ADDRESS = "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d"

// Minimal ABI
const GOVERNOR_ABI = [
  "function proposalCount() view returns (uint256)",
  "function proposals(uint256) view returns (uint256 id,address proposer,uint256 eta,uint256 startBlock,uint256 endBlock,uint256 forVotes,uint256 againstVotes,uint256 abstainVotes,bool canceled,bool executed)"
]

// ================= RENDER PORT =================
http.createServer((req, res) => {
  res.writeHead(200)
  res.end("Nouncil bot running")
}).listen(process.env.PORT || 3000)

// ================= DISCORD =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
})

// ================= STORAGE =================
const POLL_FILE = "./polls.json"
if (!fs.existsSync(POLL_FILE)) fs.writeFileSync(POLL_FILE, JSON.stringify({}))

function loadPolls() {
  return JSON.parse(fs.readFileSync(POLL_FILE))
}

function savePolls(data) {
  fs.writeFileSync(POLL_FILE, JSON.stringify(data, null, 2))
}

// ================= ETHERS =================
const provider = new ethers.JsonRpcProvider(ETH_RPC_URL)
const governor = new ethers.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider)

// ================= HELPERS =================
function getVoteCounts(votes) {
  return {
    for: Object.values(votes).filter(v => v === "for").length,
    against: Object.values(votes).filter(v => v === "against").length,
    abstain: Object.values(votes).filter(v => v === "abstain").length
  }
}

function createButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("for").setLabel("For").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("against").setLabel("Against").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId("abstain").setLabel("Abstain").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  )
}

function createEmbed(poll) {
  const counts = getVoteCounts(poll.votes)

  const embed = new EmbedBuilder()
    .setTitle(poll.title)
    .setDescription(poll.description)
    .addFields(
      { name: "For", value: String(counts.for), inline: true },
      { name: "Against", value: String(counts.against), inline: true },
      { name: "Abstain", value: String(counts.abstain), inline: true }
    )
    .setFooter({ text: `Closes: ${new Date(poll.closesAt).toUTCString()}` })

  if (poll.closed) embed.addFields({ name: "Status", value: "CLOSED" })

  return embed
}

// ================= PROPOSAL MONITOR =================
async function checkProposals() {
  const proposalCount = await governor.proposalCount()
  const polls = loadPolls()

  for (let i = 1; i <= proposalCount; i++) {
    const proposal = await governor.proposals(i)

    const alreadyExists = Object.values(polls).some(
      p => p.type === "proposal" && p.proposalId === i
    )

    if (alreadyExists) continue

    const currentBlock = await provider.getBlockNumber()

    // proposal active?
    if (currentBlock >= proposal.startBlock && currentBlock <= proposal.endBlock) {

      const endBlock = Number(proposal.endBlock)
      const block = await provider.getBlock(endBlock)
      const endTimestamp = block.timestamp * 1000

      const closesAt = endTimestamp - (24 * 60 * 60 * 1000)

      const title = `Prop ${i}: Nouns Proposal`
      const description = `https://nouncil.club/proposal/${i}`

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: `Closes: ${new Date(closesAt).toUTCString()}` })
        .addFields(
          { name: "For", value: "0", inline: true },
          { name: "Against", value: "0", inline: true },
          { name: "Abstain", value: "0", inline: true }
        )

      const channel = await client.channels.fetch(process.env.PROPOSAL_CHANNEL_ID)

      const message = await channel.send({
        content: `<@&${NOUNCIL_ROLE_ID}>`,
        embeds: [embed],
        components: [createButtons()]
      })

      polls[message.id] = {
        title,
        description,
        votes: {},
        closesAt,
        closed: false,
        channelId: message.channelId,
        type: "proposal",
        proposalId: i
      }

      savePolls(polls)
    }
  }
}

// run every 5 minutes
setInterval(checkProposals, 5 * 60 * 1000)

// ================= AUTO CLOSE =================
setInterval(async () => {
  const polls = loadPolls()
  const now = Date.now()

  for (const messageId in polls) {
    const poll = polls[messageId]

    if (!poll.closed && now >= poll.closesAt) {
      poll.closed = true
      savePolls(polls)

      const channel = await client.channels.fetch(poll.channelId)
      const message = await channel.messages.fetch(messageId)

      await message.edit({
        embeds: [createEmbed(poll)],
        components: [createButtons(true)]
      })

      generateMarkdownExport(poll)
    }
  }
}, 60000)

// ================= EXPORT =================
function generateMarkdownExport(poll) {
  const counts = getVoteCounts(poll.votes)

  let winner = "ABSTAIN"
  if (counts.for > counts.against && counts.for > counts.abstain) winner = "FOR"
  if (counts.against > counts.for && counts.against > counts.abstain) winner = "AGAINST"

  const md = `
# Nouncil Signal Vote

${poll.title}

Final Results

For: ${counts.for}
Against: ${counts.against}
Abstain: ${counts.abstain}

Winning Option: ${winner}
`

  fs.writeFileSync(`export-proposal-${poll.proposalId}.md`, md)
}

// ================= READY =================
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`)
})

// ================= LOGIN =================
client.login(TOKEN)
