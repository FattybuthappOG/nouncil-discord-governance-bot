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

console.log("Nouncil Bot — RPC Safe Build Active")

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

// Keep Render alive
http.createServer((req, res) => {
  res.writeHead(200)
  res.end("Bot running")
}).listen(process.env.PORT || 3000)

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
})

const POLL_FILE = "./polls.json"
if (!fs.existsSync(POLL_FILE)) fs.writeFileSync(POLL_FILE, JSON.stringify({}))

function loadPolls() {
  return JSON.parse(fs.readFileSync(POLL_FILE))
}

function savePolls(data) {
  fs.writeFileSync(POLL_FILE, JSON.stringify(data, null, 2))
}

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

// ================= PROPOSAL AUTO (RPC SAFE) =================
async function checkProposals() {

  if (!ETH_RPC_URL) {
    console.log("No ETH_RPC_URL set — skipping proposal automation")
    return
  }

  try {

    const provider = new ethers.JsonRpcProvider(ETH_RPC_URL)
    const governor = new ethers.Contract(GOVERNOR_ADDRESS, GOVERNOR_ABI, provider)

    const proposalCount = Number(await governor.proposalCount())
    const polls = loadPolls()
    const start = Math.max(1, proposalCount - 10)

    for (let i = start; i <= proposalCount; i++) {

      const exists = Object.values(polls).some(
        p => p.type === "proposal" && p.proposalId === i
      )
      if (exists) continue

      const proposal = await governor.proposals(i)
      if (proposal.canceled || proposal.executed) continue

      const endBlock = Number(proposal.endBlock)
      const block = await provider.getBlock(endBlock)
      if (!block) continue

      const endTimestamp = block.timestamp * 1000
      if (Date.now() > endTimestamp) continue

      const filter = governor.filters.ProposalCreated(i)
      const events = await governor.queryFilter(filter)
      if (!events.length) continue

      const rawDesc = events[0].args.description
      const firstLine = rawDesc.split("\n")[0].trim()
      const titleParsed = firstLine.startsWith("#")
        ? firstLine.replace(/^#+\s*/, "")
        : firstLine.substring(0, 100)

      const closesAt = endTimestamp - (24 * 60 * 60 * 1000)

      const channel = await client.channels.fetch(PROPOSAL_CHANNEL_ID)

      const poll = {
        type: "proposal",
        proposalId: i,
        title: `Prop ${i}: ${titleParsed}`,
        description: `https://nouncil.club/proposal/${i}`,
        votes: {},
        closesAt,
        closed: false,
        channelId: PROPOSAL_CHANNEL_ID
      }

      const message = await channel.send({
        content: `<@&${NOUNCIL_ROLE_ID}>`,
        embeds: [createEmbed(poll)],
        components: [createButtons()]
      })

      try {
        const thread = await message.startThread({
          name: `Prop ${i} — Discussion`,
          autoArchiveDuration: 1440
        })
        poll.threadId = thread.id
      } catch (err) {
        console.log("Thread creation failed:", err)
      }

      const updated = loadPolls()
      updated[message.id] = poll
      savePolls(updated)

      console.log("Created proposal poll:", i)
    }

  } catch (err) {
    console.log("RPC failed — skipping proposal automation:", err.message)
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
    }
  }
}, 60000)

// ================= READY =================
client.once(Events.ClientReady, async () => {

  const rest = new REST({ version: "10" }).setToken(TOKEN)

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: [
        new SlashCommandBuilder()
          .setName("create-poll")
          .setDescription("Create a custom 4-day poll")
          .addStringOption(o => o.setName("title").setDescription("Poll title").setRequired(true))
          .addStringOption(o => o.setName("description").setDescription("Poll description").setRequired(true))
      ]
    }
  )

  console.log(`Logged in as ${client.user.tag}`)
  checkProposals()
})

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async interaction => {

  try {

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "create-poll") {

        const member = await interaction.guild.members.fetch(interaction.user.id)

        if (!member.roles.cache.has(NOUNCIL_ROLE_ID)) {
          return interaction.reply({
            content: "Only nouncilors can create polls.",
            ephemeral: true
          })
        }

        const title = interaction.options.getString("title")
        const description = interaction.options.getString("description")
        const closesAt = Date.now() + (4 * 24 * 60 * 60 * 1000)

        const poll = {
          type: "custom",
          title,
          description,
          votes: {},
          closesAt,
          closed: false,
          channelId: interaction.channelId
        }

        const message = await interaction.reply({
          content: `<@&${NOUNCIL_ROLE_ID}>`,
          embeds: [createEmbed(poll)],
          components: [createButtons()],
          fetchReply: true
        })

        try {
          const thread = await message.startThread({
            name: `${title} — Discussion`,
            autoArchiveDuration: 1440
          })
          poll.threadId = thread.id
        } catch (err) {
          console.log("Thread creation failed:", err)
        }

        const polls = loadPolls()
        polls[message.id] = poll
        savePolls(polls)
      }
    }

    if (interaction.isButton()) {

      const choice = interaction.customId.replace("vote_", "")
      const polls = loadPolls()
      const poll = polls[interaction.message.id]
      if (!poll || poll.closed) return

      const modal = new ModalBuilder()
        .setCustomId(`comment_${choice}`)
        .setTitle("Vote Reason (Optional)")

      const input = new TextInputBuilder()
        .setCustomId("vote_comment")
        .setLabel("Reason for your vote")
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

      const comment = interaction.fields.getTextInputValue("vote_comment")

      poll.votes[interaction.user.id] = { choice, comment }
      savePolls(polls)

      await interaction.update({
        embeds: [createEmbed(poll)],
        components: [createButtons()]
      })

      if (poll.threadId) {
        const thread = await client.channels.fetch(poll.threadId)
        await thread.send(
          `<@${interaction.user.id}> voted **${choice.toUpperCase()}**` +
          (comment ? `\nReason: ${comment}` : "")
        )
      }
    }

  } catch (err) {
    console.log("Interaction error:", err)
  }
})

client.login(TOKEN)
