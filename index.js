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
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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
const PROPOSAL_CHANNEL_ID = process.env.PROPOSAL_CHANNEL_ID

const GOVERNOR_ADDRESS = "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d"

const GOVERNOR_ABI = [
  "event ProposalCreated(uint256 id,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 startBlock,uint256 endBlock,string description)",
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
    for: Object.values(votes).filter(v => v.choice === "for").length,
    against: Object.values(votes).filter(v => v.choice === "against").length,
    abstain: Object.values(votes).filter(v => v.choice === "abstain").length
  }
}

function createButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("vote_for").setLabel("For").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("vote_against").setLabel("Against").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId("vote_abstain").setLabel("Abstain").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
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

// ================= PROPOSAL CHECK (EVERY HOUR) =================
async function checkProposals() {
  const proposalCount = await governor.proposalCount()
  const polls = loadPolls()

  for (let i = 1; i <= proposalCount; i++) {

    const alreadyExists = Object.values(polls).some(
      p => p.type === "proposal" && p.proposalId === i
    )
    if (alreadyExists) continue

    const proposal = await governor.proposals(i)
    const currentBlock = await provider.getBlockNumber()

    if (currentBlock < proposal.startBlock) continue
    if (currentBlock > proposal.endBlock) continue

    const filter = governor.filters.ProposalCreated(i)
    const events = await governor.queryFilter(filter)

    if (!events.length) continue

    const descriptionRaw = events[0].args.description
    const titleLine = descriptionRaw.split("\n")[0].replace("# ", "")

    const endBlock = Number(proposal.endBlock)
    const block = await provider.getBlock(endBlock)
    const endTimestamp = block.timestamp * 1000
    const closesAt = endTimestamp - (24 * 60 * 60 * 1000)

    const channel = await client.channels.fetch(PROPOSAL_CHANNEL_ID)

    const embed = new EmbedBuilder()
      .setTitle(`Prop ${i}: ${titleLine}`)
      .setDescription(`https://nouncil.club/proposal/${i}`)
      .setFooter({ text: `Closes: ${new Date(closesAt).toUTCString()}` })
      .addFields(
        { name: "For", value: "0", inline: true },
        { name: "Against", value: "0", inline: true },
        { name: "Abstain", value: "0", inline: true }
      )

    const message = await channel.send({
      content: `<@&${NOUNCIL_ROLE_ID}>`,
      embeds: [embed],
      components: [createButtons()]
    })

    polls[message.id] = {
      type: "proposal",
      proposalId: i,
      title: `Prop ${i}: ${titleLine}`,
      description: `https://nouncil.club/proposal/${i}`,
      votes: {},
      closesAt,
      closed: false,
      channelId: message.channelId
    }

    savePolls(polls)
  }
}

setInterval(checkProposals, 60 * 60 * 1000)

// ================= AUTO CLOSE =================
setInterval(async () => {
  const polls = loadPolls()
  const now = Date.now()

  for (const id in polls) {
    const poll = polls[id]
    if (!poll.closed && now >= poll.closesAt) {

      poll.closed = true
      savePolls(polls)

      const channel = await client.channels.fetch(poll.channelId)
      const message = await channel.messages.fetch(id)

      await message.edit({
        embeds: [createEmbed(poll)],
        components: [createButtons(true)]
      })

      generateMarkdownExport(poll)
    }
  }
}, 60000)

// ================= MARKDOWN EXPORT =================
function generateMarkdownExport(poll) {
  const counts = getVoteCounts(poll.votes)

  let winner = "ABSTAIN"
  if (counts.for > counts.against && counts.for > counts.abstain) winner = "FOR"
  if (counts.against > counts.for && counts.against > counts.abstain) winner = "AGAINST"

  let commentsSection = ""
  for (const userId in poll.votes) {
    const v = poll.votes[userId]
    commentsSection += `- ${userId} — ${v.choice}${v.comment ? ` — ${v.comment}` : ""}\n`
  }

  const md = `
# Nouncil Signal Vote

${poll.title}

Final Results

For: ${counts.for}
Against: ${counts.against}
Abstain: ${counts.abstain}

Winning Option: ${winner}

## Vote Breakdown

${commentsSection}
`

  fs.writeFileSync(`export-${poll.proposalId || Date.now()}.md`, md)
}

// ================= MODAL + VOTING =================
client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isButton()) {

    const choice = interaction.customId.replace("vote_", "")
    const modal = new ModalBuilder()
      .setCustomId(`comment_${choice}`)
      .setTitle("Optional Vote Comment")

    const input = new TextInputBuilder()
      .setCustomId("vote_comment")
      .setLabel("Reason (optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)

    modal.addComponents(new ActionRowBuilder().addComponents(input))

    await interaction.showModal(modal)
  }

  if (interaction.isModalSubmit()) {

    const choice = interaction.customId.replace("comment_", "")
    const polls = loadPolls()
    const poll = polls[interaction.message.id]
    if (!poll || poll.closed) return

    poll.votes[interaction.user.id] = {
      choice,
      comment: interaction.fields.getTextInputValue("vote_comment")
    }

    savePolls(polls)

    await interaction.update({
      embeds: [createEmbed(poll)],
      components: [createButtons()]
    })
  }
})

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`)
})

client.login(TOKEN)
