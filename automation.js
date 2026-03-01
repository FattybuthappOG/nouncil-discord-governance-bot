import fs from "fs"

/* ================= CONFIG ================= */

const WEBHOOK = process.env.DISCORD_WEBHOOK
const GOVERNOR =
  "https://api.thegraph.com/subgraphs/name/nounsdao/nouns-subgraph"

const START_FROM = 946
const CHECK_LAST = 10

/* ================= STORAGE ================= */

const FILE = "seen_proposals.json"

if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify({ seen: [] }, null, 2))
}

const db = JSON.parse(fs.readFileSync(FILE))

/* ================= GRAPH QUERY ================= */

async function latestProposal() {

  const res = await fetch(GOVERNOR, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
      {
        proposals(first:1,orderBy:id,orderDirection:desc){
          id
          title
        }
      }`
    })
  })

  const json = await res.json()
  return json.data.proposals[0]
}

/* ================= SEND POLL ================= */

async function sendPoll(id,title){

  const body={
    content:"<@&NOUNCIL_ROLE_ID>",
    embeds:[{
      title:`Prop ${id}: ${title}`,
      description:`https://nouncil.club/proposal/${id}`,
      color:5793266
    }],
    components:[{
      type:1,
      components:[
        {type:2,label:"For",style:3,custom_id:"vote_for"},
        {type:2,label:"Against",style:4,custom_id:"vote_against"},
        {type:2,label:"Abstain",style:2,custom_id:"vote_abstain"}
      ]
    }]
  }

  await fetch(WEBHOOK,{
    method:"POST",
    headers:{ "Content-Type":"application/json"},
    body:JSON.stringify(body)
  })

  console.log("Poll sent:",id)
}

/* ================= MAIN ================= */

async function run(){

  const latest=await latestProposal()
  const latestId=parseInt(latest.id)

  console.log("Latest proposal:",latestId)

  for(
    let id=latestId;
    id>latestId-CHECK_LAST && id>=START_FROM;
    id--
  ){

    if(db.seen.includes(id)) continue

    await sendPoll(id,`Nouns Proposal`)

    db.seen.push(id)
  }

  fs.writeFileSync(FILE,JSON.stringify(db,null,2))
}

run()
