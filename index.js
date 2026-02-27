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

dotenv.config()

console.log("Nouncil Bot Minimal WebService Build Starting")

/* ================= KEEP RENDER ALIVE ================= */

http.createServer((req, res) => {
  res.writeHead(200)
  res.end("Bot is running")
}).listen(process.env.PORT || 3000)

/* ================= ENV ================= */

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID

/* ================= DISCORD CLIENT ================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
})

/* ================= STORAGE ================= */

const POLL_FILE = "./polls.json"
if (!fs.existsSync(POLL_FILE)) fs.writeFileSync(POLL_FILE, JSON.stringify({}))

function loadPolls() {
  return JSON.parse(fs.readFileSync(POLL_FILE))
}

function savePolls(data) {
  fs.writeFileSync(POLL_FILE, JSON.stringify(data, null, 2))
}

/* ================= HELPERS ================= */

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

  return new EmbedBuilder()
    .setTitle(poll.title)
    .setDescription(poll.description)
    .addFields(
      { name: "For", value: String(counts.for), inline: true },
      { name: "Against", value: String(counts.against), inline: true },
      { name: "Abstain", value: String(counts.abstain), inline: true }
    )
    .setFooter({ text: `Closes: ${new Date(poll.closesAt).toUTCString()}` })
}

/* ================= READY ================= */

client.once(Events.ClientReady, async () => {

  console.log("Logged in as", client.user.tag)

  const rest = new REST({ version: "10" }).setToken(TOKEN)

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: [
        new SlashCommandBuilder()
          .setName("create-poll")
          .setDescription("Create a custom 4-day poll")
          .addStringOption(o =>
            o.setName("title").setDescription("Poll title").setRequired(true))
          .addStringOption(o =>
            o.setName("description").setDescription("Poll description").setRequired(true))
      ]
    }
  )
})

/* ================= INTERACTIONS ================= */

client.on(Events.InteractionCreate, async interaction => {

  try {

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "create-poll") {

        await interaction.deferReply()

        const member = await interaction.guild.members.fetch(interaction.user.id)

        if (!member.roles.cache.has(NOUNCIL_ROLE_ID)) {
          return interaction.editReply("Only nouncilors can create polls.")
        }

        const title = interaction.options.getString("title")
        const description = interaction.options.getString("description")
        const closesAt = Date.now() + (4 * 24 * 60 * 60 * 1000)

        const poll = {
          title,
          description,
          votes: {},
          closesAt,
          closed: false,
          channelId: interaction.channelId
        }

        const message = await interaction.editReply({
          content: `<@&${NOUNCIL_ROLE_ID}>`,
          allowedMentions: { roles: [NOUNCIL_ROLE_ID] },
          embeds: [createEmbed(poll)],
          components: [createButtons()]
        })

        const thread = await message.startThread({
          name: `${title} — Discussion`,
          autoArchiveDuration: 1440
        })

        poll.threadId = thread.id

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

      const thread = await client.channels.fetch(poll.threadId)
      await thread.send(
        `<@${interaction.user.id}> voted **${choice.toUpperCase()}**` +
        (comment ? `\nReason: ${comment}` : "")
      )
    }

  } catch (err) {
    console.error("Interaction error:", err)
  }
})

client.login(TOKEN)
client.login(TOKEN).then(() => {
  console.log("Login success promise resolved")
}).catch(err => {
  console.error("Login failed:", err)
})
client.login(TOKEN)
  .then(() => {
    console.log("LOGIN SUCCESS")
  })
  .catch(err => {
    console.error("LOGIN FAILED:", err)
  })
