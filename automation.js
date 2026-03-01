import { ethers } from "ethers"
import fs from "fs"

const WEBHOOK = process.env.DISCORD_WEBHOOK

/* ================= RPC ================= */

const provider =
  new ethers.JsonRpcProvider(
    "https://eth.llamarpc.com"
  )

/* ================= DAO ================= */

const DAO =
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const ABI = [
"event ProposalCreated(uint256 id,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 startBlock,uint256 endBlock,string description)",
"function state(uint256) view returns(uint8)"
]

const dao =
new ethers.Contract(DAO, ABI, provider)

/* ================= STORAGE ================= */

const FILE="seen_proposals.json"

if(!fs.existsSync(FILE))
fs.writeFileSync(FILE,JSON.stringify({
seen:[],
closed:[],
executed:[]
},null,2))

const db=
JSON.parse(fs.readFileSync(FILE))

/* ================= DISCORD ================= */

async function post(content){
 await fetch(WEBHOOK,{
  method:"POST",
  headers:{
   "Content-Type":"application/json"
  },
  body:JSON.stringify(content)
 })
}

/* ================= MARKDOWN ================= */

function exportMarkdown(id){

const md=`
Prop ${id}: Results

FOR -
AGAINST -
ABSTAIN -
`

fs.writeFileSync(
`prop-${id}.md`,
md
)

return md
}

/* ================= POLL CREATE ================= */

async function createPoll(e){

const id=Number(e.args.id)

if(db.seen.includes(id)) return

const block=
await provider.getBlock(
e.args.endBlock
)

const votingEnd=
block.timestamp*1000

const nouncilClose=
votingEnd-(24*60*60*1000)

await post({
content:"@nouncilor",
embeds:[{
title:`Prop ${id}`,
description:e.args.description,
fields:[
{
name:"Voting Ends",
value:`<t:${Math.floor(votingEnd/1000)}:F>`
},
{
name:"Nouncil Close",
value:`<t:${Math.floor(nouncilClose/1000)}:F>`
}
]
}]
})

db.seen.push(id)
}

/* ================= CLOSE POLL ================= */

async function closePoll(id){

if(db.closed.includes(id)) return

const md=exportMarkdown(id)

await post({
content:
`✅ Prop ${id} Nouncil voting closed`,
embeds:[{
description:"```markdown\n"+md+"\n```"
}]
})

db.closed.push(id)
}

/* ================= SAFE READY CHECK ================= */

async function maybeExecute(id){

if(db.executed.includes(id)) return

const state=await dao.state(id)

/*
0 Pending
1 Active
2 Canceled
3 Defeated
4 Succeeded
5 Queued
6 Expired
7 Executed
*/

if(state==5){
console.log(
"✅ Ready for Safe submit",
id
)

/* Safe submission handled separately */

db.executed.push(id)
}
}

/* ================= MAIN ================= */

async function run(){

const events=
await dao.queryFilter(
dao.filters.ProposalCreated(),
-40000
)

for(const e of events){

const id=Number(e.args.id)

await createPoll(e)

const block=
await provider.getBlock(
e.args.endBlock
)

const closeTime=
(block.timestamp*1000)
-(24*60*60*1000)

if(Date.now()>closeTime)
await closePoll(id)

await maybeExecute(id)
}

fs.writeFileSync(
FILE,
JSON.stringify(db,null,2)
)
}

run()
