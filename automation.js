import fs from "fs"
import { ethers } from "ethers"

const WEBHOOK = process.env.DISCORD_WEBHOOK

const RPC = "https://eth.llamarpc.com"

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

const STATE_FILE="polls.json"

if(!fs.existsSync(STATE_FILE))
fs.writeFileSync(STATE_FILE,"{}")

const polls=
JSON.parse(fs.readFileSync(STATE_FILE))

const SCAN_FILE="scan_state.json"

if(!fs.existsSync(SCAN_FILE))
fs.writeFileSync(SCAN_FILE,JSON.stringify({last:0},null,2))

const scanState=
JSON.parse(fs.readFileSync(SCAN_FILE))

async function sendPoll(id,closeTime){

const body={
content:"@nouncilor",
embeds:[{
title:`Prop ${id}`,
description:`https://nouncil.club/proposal/${id}`,
color:5793266
}]
}

await fetch(WEBHOOK,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify(body)
})

}

async function scanProposals(){

const latest=
await provider.getBlockNumber()

let fromBlock=
scanState.last || (latest-800)

if(fromBlock < 0) fromBlock=0

while(fromBlock < latest){

const toBlock=
Math.min(fromBlock+900,latest)

const events=
await dao.queryFilter(
dao.filters.ProposalCreated(),
fromBlock,
toBlock
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
queued:false
}

await sendPoll(id,closeTime)

}

fromBlock=toBlock+1

}

scanState.last=latest

fs.writeFileSync(
SCAN_FILE,
JSON.stringify(scanState,null,2)
)

}

async function run(){

await scanProposals()

fs.writeFileSync(
STATE_FILE,
JSON.stringify(polls,null,2)
)

console.log("Automation complete")

}

run()
