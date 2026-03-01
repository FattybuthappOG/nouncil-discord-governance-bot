import fs from "fs"
import { ethers } from "ethers"

import Safe from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"

/* ================= CONFIG ================= */

const RPC = "https://eth.llamarpc.com"

const SAFE_ADDRESS =
"0xcC2688350d29623E2A0844Cc8885F9050F0f6Ed5"

const DAO_ADDRESS =
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const PRIVATE_KEY =
process.env.SAFE_PRIVATE_KEY

/* ================= STORAGE ================= */

const polls =
JSON.parse(fs.readFileSync("polls.json"))

/* ================= PROVIDER ================= */

const provider =
new ethers.JsonRpcProvider(RPC)

const signer =
new ethers.Wallet(PRIVATE_KEY, provider)

/* ================= SAFE SETUP ================= */

const ethAdapter = {
  ethers,
  signerOrProvider: signer
}

const safeSdk =
await Safe.create({
  ethAdapter,
  safeAddress: SAFE_ADDRESS
})

const apiKit =
new SafeApiKit({
  txServiceUrl:
  "https://safe-transaction-mainnet.safe.global",
  ethAdapter
})

/* ================= DAO ================= */

const DAO_ABI=[
"function state(uint256) view returns(uint8)"
]

const dao =
new ethers.Contract(
DAO_ADDRESS,
DAO_ABI,
provider
)

/* ================= SAFE SUBMIT ================= */

async function submitProposal(id){

const poll=polls[id]
if(!poll) return

const now=Math.floor(Date.now()/1000)

if(now < poll.closeTime){
console.log("poll active")
return
}

if(poll.submitted){
console.log("already submitted")
return
}

if(!poll.passed){
console.log("vote failed")
return
}

/* ===== ONCHAIN STATE CHECK ===== */

const state=await dao.state(id)

if(state==5 || state==7){
console.log("already queued/executed")
return
}

/* ===== SAFE TX ===== */

console.log("Creating Safe TX for",id)

/*
Example tx:
You replace target later
*/

const safeTransactionData={
to:DAO_ADDRESS,
value:"0",
data:"0x"
}

const safeTx =
await safeSdk.createTransaction({
transactions:[safeTransactionData]
})

const txHash =
await safeSdk.getTransactionHash(safeTx)

const senderSignature =
await safeSdk.signTransactionHash(txHash)

await apiKit.proposeTransaction({
safeAddress:SAFE_ADDRESS,
safeTransactionData:
safeTx.data,
safeTxHash:txHash,
senderAddress:
await signer.getAddress(),
senderSignature:
senderSignature.data
})

poll.submitted=true

console.log("✅ Safe TX proposed")

}

/* ================= RUN ================= */

async function run(){

for(const id of Object.keys(polls)){
await submitProposal(id)
}

fs.writeFileSync(
"polls.json",
JSON.stringify(polls,null,2)
)

}

run()
