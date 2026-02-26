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

dotenv.config()

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
})

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

function createPollEmbed(title, description, votes) {
  const counts = {
    for: Object.values(votes).filter(v => v === "for").length,
    against: Object.values(votes).filter(v => v === "against").length,
    abstain: Object.values(votes).filter(v => v === "abstain").length
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: "For", value: `${counts.for}`, inline: true },
      { name: "Against", value: `${counts.against}`, inline: true },
      { name: "Abstain", value: `${counts.abstain}`, inline: true }
    )
}

const commands = [
  new SlashCommandBuilder()
    .setName("create-poll")
    .setDescription("Create a custom poll")
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

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`)
  await registerCommands()
})

client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isChatInputCommand()) {

    if (!interaction.member.roles.cache.has(NOUNCIL_ROLE_ID)) {
      return interaction.reply({ content: "Only nouncilors can create polls.", ephemeral: true })
    }

    const title = interaction.options.getString("title")
    const description = interaction.options.getString("description")

    const embed = createPollEmbed(title, description, {})

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("for").setLabel("For").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("against").setLabel("Against").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("abstain").setLabel("Abstain").setStyle(ButtonStyle.Secondary)
    )

    const message = await interaction.reply({
      content: `<@&${NOUNCIL_ROLE_ID}>`,
      embeds: [embed],
      components: [row],
      fetchReply: true
    })

    const polls = loadPolls()
    polls[message.id] = {
      title,
      description,
      votes: {}
    }

    savePolls(polls)
  }

  if (interaction.isButton()) {

    if (!interaction.member.roles.cache.has(NOUNCIL_ROLE_ID)) {
      return interaction.reply({ content: "Only nouncilors can vote.", ephemeral: true })
    }

    const polls = loadPolls()
    const poll = polls[interaction.message.id]

    if (!poll) return

    poll.votes[interaction.user.id] = interaction.customId
    savePolls(polls)

    const updatedEmbed = createPollEmbed(poll.title, poll.description, poll.votes)

    await interaction.update({
      embeds: [updatedEmbed]
    })
  }
})

client.login(TOKEN)
