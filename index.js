import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} from "discord.js"

import fs from "fs"
import dotenv from "dotenv"
import http from "http"

dotenv.config()

console.log("✅ Nouncil Governance Bot Starting")

/* ================= ENV ================= */

const TOKEN = process.env.DISCORD_TOKEN
const NOUNCIL_ROLE_ID = process.env.NOUNCIL_ROLE_ID

/* ================= KEEP ALIVE ================= */

http.createServer((req,res)=>{
  res.end("alive")
}).listen(process.env.PORT || 3000)

/* ================= CLIENT ================= */

const client = new Client({
  intents:[GatewayIntentBits.Guilds]
})

/* ================= STORAGE ================= */

const FILE="./polls.json"
if(!fs.existsSync(FILE))
  fs.writeFileSync(FILE,JSON.stringify({}))

const load=()=>JSON.parse(fs.readFileSync(FILE))
const save=(d)=>fs.writeFileSync(FILE,JSON.stringify(d,null,2))

/* ================= HELPERS ================= */

function counts(votes){
  return{
    for:Object.values(votes).filter(v=>v.choice==="for").length,
    against:Object.values(votes).filter(v=>v.choice==="against").length,
    abstain:Object.values(votes).filter(v=>v.choice==="abstain").length
  }
}

function buttons(disabled=false){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("vote_for")
      .setLabel("For")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId("vote_against")
      .setLabel("Against")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId("vote_abstain")
      .setLabel("Abstain")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled)
  )
}

function embed(poll){
  const c=counts(poll.votes)

  return new EmbedBuilder()
    .setTitle(poll.title)
    .setDescription(poll.link)
    .addFields(
      {name:"For",value:String(c.for),inline:true},
      {name:"Against",value:String(c.against),inline:true},
      {name:"Abstain",value:String(c.abstain),inline:true}
    )
}

/* ================= READY ================= */

client.once(Events.ClientReady,()=>{
  console.log("✅ Logged in:",client.user.tag)
})

/* ================= AUTO THREAD ================= */

client.on(Events.MessageCreate,async msg=>{

  if(!msg.author.bot) return
  if(!msg.embeds.length) return

  const title=msg.embeds[0].title
  if(!title?.startsWith("Prop")) return

  const polls=load()
  if(polls[msg.id]) return

  const thread=await msg.startThread({
    name:`${title} — Voting Record`,
    autoArchiveDuration:1440
  })

  polls[msg.id]={
    title,
    link:msg.embeds[0].description,
    votes:{},
    threadId:thread.id
  }

  save(polls)

  console.log("Thread created for",title)
})

/* ================= BUTTON CLICK ================= */

client.on(Events.InteractionCreate,async interaction=>{

  try{

    /* ---------- BUTTON ---------- */

    if(interaction.isButton()){

      const member=interaction.member

      if(!member.roles.cache.has(NOUNCIL_ROLE_ID))
        return interaction.reply({
          content:"Only nouncilors may vote.",
          ephemeral:true
        })

      const choice=interaction.customId.replace("vote_","")

      const modal=new ModalBuilder()
        .setCustomId(`reason_${choice}`)
        .setTitle("Vote Reason (optional)")

      const input=new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setRequired(false)
        .setStyle(TextInputStyle.Paragraph)

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      )

      await interaction.showModal(modal)
    }

    /* ---------- MODAL ---------- */

    if(interaction.isModalSubmit()){

      const choice=
        interaction.customId.replace("reason_","")

      const polls=load()
      const poll=polls[interaction.message.id]

      if(!poll) return

      const reason=
        interaction.fields.getTextInputValue("reason")

      poll.votes[interaction.user.id]={
        user:interaction.user.username,
        choice,
        reason
      }

      save(polls)

      const thread=
        await client.channels.fetch(poll.threadId)

      await thread.send(
        `**${interaction.user.username}** — ${choice.toUpperCase()}`
        +(reason?`\n"${reason}"`:"")
      )

      await interaction.update({
        embeds:[embed(poll)],
        components:[buttons()]
      })
    }

  }catch(err){
    console.error(err)
  }
})

/* ================= MARKDOWN EXPORT ================= */

setInterval(async()=>{

  const polls=load()

  for(const id in polls){

    const poll=polls[id]
    if(poll.exported) continue

    const c=counts(poll.votes)

    const winner=
      Object.entries(c)
      .sort((a,b)=>b[1]-a[1])[0][0]
      .toUpperCase()

    let md=`${poll.title}: ${winner} — WINS\n\n`

    for(const side of["for","against","abstain"]){

      const voters=
        Object.values(poll.votes)
        .filter(v=>v.choice===side)

      md+=`${side.toUpperCase()} — ${voters.length} VOTES\n`

      voters.forEach(v=>{
        md+=v.reason
          ?`${v.user} "${v.reason}"\n`
          :`${v.user}\n`
      })

      md+="\n"
    }

    fs.writeFileSync(
      `prop-${poll.title.match(/\d+/)[0]}.md`,
      md
    )

    poll.exported=true
    save(polls)

    const thread=
      await client.channels.fetch(poll.threadId)

    await thread.send(
      "✅ Markdown export generated."
    )
  }

},60000)

/* ================= LOGIN ================= */

client.login(TOKEN)
