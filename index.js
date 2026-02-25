import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } from 'discord.js'
import fs from 'fs'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
})

const TOKEN = process.env.DISCORD_TOKEN
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID
const CHANNEL_ID = process.env.CHANNEL_ID

const pollsFile = './polls.json'

if (!fs.existsSync(pollsFile)) {
  fs.writeFileSync(pollsFile, JSON.stringify({}))
}

function loadPolls() {
  return JSON.parse(fs.readFileSync(pollsFile))
}

function savePolls(data) {
  fs.writeFileSync(pollsFile, JSON.stringify(data, null, 2))
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`)
})

client.on(Events.InteractionCreate, async interaction => {

  if (!interaction.isButton()) return

  if (!interaction.member.roles.cache.has(NOUNCIL_ROLE_ID)) {
    return interaction.reply({ content: "Only nouncilors can vote.", ephemeral: true })
  }

  const polls = loadPolls()
  const pollId = interaction.message.id

  if (!polls[pollId]) return

  const userId = interaction.user.id
  const vote = interaction.customId

  polls[pollId].votes[userId] = vote
  savePolls(polls)

  updateEmbed(interaction.message, polls[pollId])

  await interaction.reply({ content: `Vote recorded: ${vote}`, ephemeral: true })
})

async function updateEmbed(message, pollData) {
  const votes = Object.values(pollData.votes)

  const counts = {
    for: votes.filter(v => v === "for").length,
    against: votes.filter(v => v === "against").length,
    abstain: votes.filter(v => v === "abstain").length
  }

  const embed = new EmbedBuilder()
    .setTitle(pollData.title)
    .setDescription(pollData.description)
    .addFields(
      { name: "For", value: `${counts.for}`, inline: true },
      { name: "Against", value: `${counts.against}`, inline: true },
      { name: "Abstain", value: `${counts.abstain}`, inline: true }
    )

  await message.edit({ embeds: [embed] })
}

client.login(TOKEN)
