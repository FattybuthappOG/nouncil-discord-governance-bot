import {
Client,
GatewayIntentBits,
Events,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
ModalBuilder,
TextInputBuilder,
TextInputStyle
} from "discord.js"

import fs from "fs"
import dotenv from "dotenv"
import http from "http"

dotenv.config()

console.log("Nouncil Phase 2 Bot Starting")

/* ================= KEEP ALIVE ================= */

http.createServer((req,res)=>{
res.writeHead(200)
res.end("alive")
}).listen(process.env.PORT || 3000)

/* ================= ENV ================= */

const TOKEN = process.env.DISCORD_TOKEN
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID

/* ================= CLIENT ================= */

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers
]
})

/* ================= STORAGE ================= */

const FILE="./polls.json"
if(!fs.existsSync(FILE))
fs.writeFileSync(FILE,"{}")

const load=()=>JSON.parse(fs.readFileSync(FILE))
const save=d=>fs.writeFileSync(FILE,JSON.stringify(d,null,2))

/* ================= BUTTONS ================= */

function buttons(disabled=false){
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("for").setLabel("FOR").setStyle(ButtonStyle.Success).setDisabled(disabled),
new ButtonBuilder().setCustomId("against").setLabel("AGAINST").setStyle(ButtonStyle.Danger).setDisabled(disabled),
new ButtonBuilder().setCustomId("abstain").setLabel("ABSTAIN").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
)
}

/* ================= READY ================= */

client.once(Events.ClientReady,()=>{
console.log("✅ Logged:",client.user.tag)
})

/* ================= AUTO DETECT POLLS ================= */

client.on(Events.MessageCreate,async msg=>{

if(!msg.author.bot) return
if(!msg.embeds.length) return

const title=msg.embeds[0].title
if(!title?.startsWith("Prop")) return

const polls=load()

if(polls[msg.id]) return

const thread=await msg.startThread({
name:`${title} — Votes`,
autoArchiveDuration:1440
})

polls[msg.id]={
title,
threadId:thread.id,
votes:{}
}

save(polls)

await msg.edit({
components:[buttons()]
})

console.log("Thread created for",title)

})

/* ================= VOTE CLICK ================= */

client.on(Events.InteractionCreate,async i=>{

if(i.isButton()){

const member=await i.guild.members.fetch(i.user.id)

if(!member.roles.cache.has(NOUNCIL_ROLE_ID))
return i.reply({content:"Nouncil only.",ephemeral:true})

const modal=new ModalBuilder()
.setCustomId(`vote_${i.customId}_${i.message.id}`)
.setTitle("Optional Vote Reason")

const input=new TextInputBuilder()
.setCustomId("reason")
.setLabel("Reason")
.setStyle(TextInputStyle.Paragraph)
.setRequired(false)

modal.addComponents(
new ActionRowBuilder().addComponents(input)
)

await i.showModal(modal)
}

/* ================= MODAL ================= */

if(i.isModalSubmit()){

const [_,choice,msgId]=i.customId.split("_")

const polls=load()
const poll=polls[msgId]
if(!poll) return

const reason=i.fields.getTextInputValue("reason")

poll.votes[i.user.id]={
choice,
reason,
user:i.user.username
}

save(polls)

const thread=await client.channels.fetch(poll.threadId)

await thread.send(
`**${i.user.username}** — ${choice.toUpperCase()}`
+(reason?`\n"${reason}"`:"")
)

await i.reply({
content:`Vote recorded: ${choice}`,
ephemeral:true
})
}

})

client.login(TOKEN)
