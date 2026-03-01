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
TextInputStyle,
SlashCommandBuilder,
REST,
Routes
} from "discord.js"

import fs from "fs"
import dotenv from "dotenv"
import http from "http"

dotenv.config()

console.log("Nouncil Phase 3 Governance Online")

/* ================= KEEP RENDER ALIVE ================= */

http.createServer((req,res)=>{
res.writeHead(200)
res.end("alive")
}).listen(process.env.PORT||3000)

/* ================= ENV ================= */

const TOKEN=process.env.DISCORD_TOKEN
const CLIENT_ID=process.env.CLIENT_ID
const GUILD_ID=process.env.GUILD_ID
const NOUNCIL_ROLE_ID=process.env.NOUNCIL_ROLE_ID

/* ================= CLIENT ================= */

const client=new Client({
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

function voteButtons(disabled=false){
return new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("for").setLabel("FOR").setStyle(ButtonStyle.Success).setDisabled(disabled),
new ButtonBuilder().setCustomId("against").setLabel("AGAINST").setStyle(ButtonStyle.Danger).setDisabled(disabled),
new ButtonBuilder().setCustomId("abstain").setLabel("ABSTAIN").setStyle(ButtonStyle.Secondary).setDisabled(disabled)
)
}

/* ================= READY ================= */

client.once(Events.ClientReady,async()=>{

console.log("✅ Logged:",client.user.tag)

const commands=[
new SlashCommandBuilder()
.setName("export")
.setDescription("Export proposal markdown")
.addIntegerOption(o=>
o.setName("prop")
.setRequired(true)
.setDescription("Proposal number")),

new SlashCommandBuilder()
.setName("participation")
.setDescription("Show nouncil participation")
]

const rest=new REST({version:"10"}).setToken(TOKEN)

await rest.put(
Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),
{body:commands}
)

})

/* ================= AUTO DETECT POLL ================= */

client.on(Events.MessageCreate,async msg=>{

if(!msg.author.bot||!msg.embeds.length)return

const title=msg.embeds[0].title
if(!title?.startsWith("Prop"))return

const polls=load()
if(polls[msg.id])return

const thread=await msg.startThread({
name:`${title} — Votes`,
autoArchiveDuration:1440
})

polls[msg.id]={
title,
threadId:thread.id,
created:Date.now(),
votes:{},
closed:false
}

save(polls)

await msg.edit({components:[voteButtons()]})

})

/* ================= VOTING ================= */

client.on(Events.InteractionCreate,async i=>{

/* BUTTON */

if(i.isButton()){

const member=await i.guild.members.fetch(i.user.id)

if(!member.roles.cache.has(NOUNCIL_ROLE_ID))
return i.reply({content:"Nouncil only",ephemeral:true})

const modal=new ModalBuilder()
.setCustomId(`vote_${i.customId}_${i.message.id}`)
.setTitle("Optional Reason")

modal.addComponents(
new ActionRowBuilder().addComponents(
new TextInputBuilder()
.setCustomId("reason")
.setLabel("Reason")
.setStyle(TextInputStyle.Paragraph)
.setRequired(false)
)
)

await i.showModal(modal)
}

/* MODAL */

if(i.isModalSubmit()){

const[_,choice,msgId]=i.customId.split("_")

const polls=load()
const poll=polls[msgId]
if(!poll||poll.closed)return

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

await i.reply({content:"Vote recorded",ephemeral:true})
}

/* EXPORT */

if(i.isChatInputCommand()){

const polls=load()

if(i.commandName==="export"){

const prop=i.options.getInteger("prop")

const poll=Object.values(polls)
.find(p=>p.title.includes(`Prop ${prop}`))

if(!poll)
return i.reply("Not found")

const groups={for:[],against:[],abstain:[]}

Object.values(poll.votes).forEach(v=>{
groups[v.choice].push(
`${v.user}${v.reason?` "${v.reason}"`:""}`
)
})

const winner=
Object.entries(groups)
.sort((a,b)=>b[1].length-a[1].length)[0][0]

let md=`Prop ${prop} — ${winner.toUpperCase()} WINS\n\n`

for(const k of["for","against","abstain"]){
md+=`${k.toUpperCase()} — ${groups[k].length} votes\n`
md+=groups[k].join("\n")+"\n\n"
}

await i.reply({content:"```"+md+"```"})
}

/* PARTICIPATION */

if(i.commandName==="participation"){

const counts={}

Object.values(polls).forEach(p=>{
Object.keys(p.votes).forEach(u=>{
counts[u]=(counts[u]||0)+1
})
})

let out="Participation:\n"

Object.entries(counts)
.forEach(([u,c])=>{
out+=`<@${u}> — ${c} votes\n`
})

await i.reply(out)
}

}

})

/* ================= AUTO CLOSE ================= */

setInterval(async()=>{

const polls=load()
const now=Date.now()

for(const[id,p]of Object.entries(polls)){

if(p.closed)continue

if(now-p.created>4*24*60*60*1000){

p.closed=true
save(polls)

const channel=await client.channels.fetch(p.threadId)
await channel.send("✅ Poll closed automatically")
}

}

},600000)

client.login(TOKEN)
