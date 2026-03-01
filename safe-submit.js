import fs from "fs"
import { ethers } from "ethers"
import Safe from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"

/* CONFIG */

const RPC="https://eth.llamarpc.com"

const SAFE_ADDRESS=
"0xcC2688350d29623E2A0844Cc8885F9050F0f6Ed5"

const DAO_ADDRESS=
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const PRIVATE_KEY=
process.env.SAFE_PRIVATE_KEY

/* STORAGE */

const polls=
JSON.parse(fs.readFileSync("polls.json"))

/* PROVIDER */

const provider=
new ethers.JsonRpcProvider(RPC)

const signer=
new ethers.Wallet(PRIVATE_KEY,provider)

/* SAFE SETUP */

const ethAdapter={
ethers,
signerOrProvider:signer
}

const safeSdk=
await Safe.create({
ethAdapter,
safeAddress:SAFE_ADDRESS
})

const apiKit=
new SafeApiKit({
txServiceUrl:
"https://safe-transaction-mainnet.safe.global",
ethAdapter
})

/* DAO */

const DAO_ABI=[
"function state(uint256) view returns(uint8)",
"function queue(uint256)"
]

const dao=
new ethers.Contract(
DAO_ADDRESS,
DAO_ABI,
provider
)

async function queueIfReady(id){

const poll=polls[id]
if(!poll) return

const now=Math.floor(Date.now()/1000)

if(now < poll.closeTime) return
if(poll.queued) return

const state=
await dao.state(id)

/*
STATE:
4 = Succeeded
5 = Queued
7 = Executed
*/

if(state!=4){
console.log("Not succeeded yet:",id)
return
}

console.log("Creating Safe queue tx for",id)

const data=
dao.interface.encodeFunctionData(
"queue",
[id]
)

const safeTransactionData={
to:DAO_ADDRESS,
value:"0",
data
}

const safeTx=
await safeSdk.createTransaction({
transactions:[safeTransactionData]
})

const txHash=
await safeSdk.getTransactionHash(safeTx)

const senderSignature=
await safeSdk.signTransactionHash(txHash)

await apiKit.proposeTransaction({
safeAddress:SAFE_ADDRESS,
safeTransactionData:safeTx.data,
safeTxHash:txHash,
senderAddress:
await signer.getAddress(),
senderSignature:
senderSignature.data
})

poll.queued=true

console.log("✅ Queue proposed via Safe")

}

async function run(){

for(const id of Object.keys(polls)){
await queueIfReady(id)
}

fs.writeFileSync(
"polls.json",
JSON.stringify(polls,null,2)
)

}

run()
