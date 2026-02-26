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

dotenv.config()

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID

// ===============================
// RENDER FREE TIER PORT BINDING
// ===============================
const server = http.createServer((req, res) => {
  res.writeHead(200)
  res.end("Nouncil bot running")
})

server.listen(process.env.PORT || 3000, () => {
  console.log("Web server active")
})

// ===============================
// DISCORD CLIENT
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
})

// ===============================
// STORAGE
// ===============================
const POLL_FILE = "./polls.json"

if (!fs.existsSync(POLL_FILE)) {
  fs.writeFileSync(POLL_FILE, JSON.stringify({}))
}

function loadPolls() {
  return JSON.parse(fs.readFileSync(POLL_FILE))
}

function savePolls(data) {
  fs.writeFileSync(POLL_FILE, JSON.stringify(data, null, 2))
}

// ===============================
// HELPERS
// ===============================
function getVoteCounts(votes) {
  return {
    for: Object.values(votes).filter(v => v === "for").length,
    against: Object.values(votes).filter(v => v === "against").length,
    abstain: Object.values(votes).filter(v => v === "abstain").length
  }
}

function createPollEmbed(poll) {
  const counts = getVoteCounts(poll.votes)

  const embed = new EmbedBuilder()
    .setTitle(poll.title)
    .setDescription(poll.description)
    .addFields(
      { name: "For", value: String(counts.for), inline: true },
      { name: "Against", value: String(counts.against), inline: true },
      { name: "Abstain", value: String(counts.abstain), inline: true }
    )
    .setFooter({
      text: `Closes: ${new Date(poll.closesAt).toUTCString()}`
    })

  if (poll.closed) {
    embed.addFields({
      name: "Status",
      value: "CLOSED"
    })
  }

  return embed
}

function createButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("for")
      .setLabel("For")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId("against")
      .setLabel("Against")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId("abstain")
      .setLabel("Abstain")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  )
}

// ===============================
// SLASH COMMAND REGISTRATION
// ===============================
const commands = [
  new SlashCommandBuilder()
    .setName("create-poll")
    .setDescription("Create a custom poll (4 day duration)")
    .addStringOption(option =>
      option.setName("title")
        .setDescription("Poll title")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("description")
        .setDescription("Poll description")
        .setRequired(true))
].map(command => command.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  )
  console.log("Slash commands registered")
}

// ===============================
// AUTO CLOSE CHECK (EVERY 60 SEC)
// ===============================
setInterval(async () => {
  const polls = loadPolls()
  const now = Date.now()

  for (const messageId in polls) {
    const poll = polls[messageId]

    if (!poll.closed && now >= poll.closesAt) {
      poll.closed = true
      savePolls(polls)

      try {
        const channel = await client.channels.fetch(poll.channelId)
        const message = await channel.messages.fetch(messageId)

        await message.edit({
          embeds: [createPollEmbed(poll)],
          components: [createButtons(true)]
        })

        generateMarkdownExport(poll)

      } catch (error) {
        console.log("Error closing poll:", error)
      }
    }
  }
}, 60000)

// ===============================
// MARKDOWN EXPORT
// ===============================
function generateMarkdownExport(poll) {
  const counts = getVoteCounts(poll.votes)

  let winner = "ABSTAIN"
  if (counts.for > counts.against && counts.for > counts.abstain) winner = "FOR"
  if (counts.against > counts.for && counts.against > counts.abstain) winner = "AGAINST"

  const markdown = `
# Nouncil Signal Vote

${poll.title}

Final Results

For: ${counts.for}
Against: ${counts.against}
Abstain: ${counts.abstain}

Winning Option: ${winner}
`

  fs.writeFileSync(`export-${Date.now()}.md`, markdown)
}

// ===============================
// DISCORD EVENTS
// ===============================
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`)
  await registerCommands()
})

client.on(Events.InteractionCreate, async interaction => {

  // CREATE POLL
  if (interaction.isChatInputCommand()) {

    if (!interaction.member.roles.cache.has(NOUNCIL_ROLE_ID)) {
      return interaction.reply({
        content: "Only nouncilors can create polls.",
        ephemeral: true
      })
    }

    const title = interaction.options.getString("title")
    const description = interaction.options.getString("description")

    const closesAt = Date.now() + (4 * 24 * 60 * 60 * 1000)

    const pollData = {
      title,
      description,
      votes: {},
      closesAt,
      closed: false,
      channelId: interaction.channelId,
      type: "custom"
    }

    const embed = createPollEmbed(pollData)

    const message = await interaction.reply({
      content: `<@&${NOUNCIL_ROLE_ID}>`,
      embeds: [embed],
      components: [createButtons()],
      fetchReply: true
    })

    const polls = loadPolls()
    polls[message.id] = pollData
    savePolls(polls)
  }

  // VOTING
  if (interaction.isButton()) {

    const polls = loadPolls()
    const poll = polls[interaction.message.id]

    if (!poll || poll.closed) return

    if (!interaction.member.roles.cache.has(NOUNCIL_ROLE_ID)) {
      return interaction.reply({
        content: "Only nouncilors can vote.",
        ephemeral: true
      })
    }

    poll.votes[interaction.user.id] = interaction.customId
    savePolls(polls)

    await interaction.update({
      embeds: [createPollEmbed(poll)],
      components: [createButtons()]
    })
  }
})

client.login(TOKEN)
