import fs from "fs"
import { ethers } from "ethers"

const WEBHOOK =
process.env.DISCORD_WEBHOOK

const RPC =
"https://eth.llamarpc.com"

const DAO_ADDRESS =
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const provider =
new ethers.JsonRpcProvider(RPC)

const DAO_ABI = [
"event ProposalCreated(uint256 id,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 startBlock,uint256 endBlock,string description)"
]

const dao =
new ethers.Contract(
DAO_ADDRESS,
DAO_ABI,
provider
)

const POLLS_FILE="polls.json"

if(!fs.existsSync(POLLS_FILE))
fs.writeFileSync(POLLS_FILE,"{}")

const polls=
JSON.parse(fs.readFileSync(POLLS_FILE))

async function sendPoll(id,closeTime){

const body={
content:"@nouncilor",
embeds:[{
title:`Prop ${id}`,
description:`https://nouncil.club/proposal/${id}`,
color:5793266,
fields:[
{name:"For",value:"⬜",inline:true},
{name:"Against",value:"⬜",inline:true},
{name:"Abstain",value:"⬜",inline:true}
]
}]
}

await fetch(WEBHOOK,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(body)
})

}

async function run(){

const latest=
await provider.getBlockNumber()

const events=
await dao.queryFilter(
dao.filters.ProposalCreated(),
latest-40000,
latest
)

for(const e of events){

const id=Number(e.args.id)

if(polls[id]) continue

const endBlock=
Number(e.args.endBlock)

const block=
await provider.getBlock(endBlock)

const closeTime=
block.timestamp-86400

polls[id]={
closeTime,
passed:true,
submitted:false
}

await sendPoll(id,closeTime)

}

fs.writeFileSync(
POLLS_FILE,
JSON.stringify(polls,null,2)
)

console.log("Poll sync done")

}

run()
