import fs from "fs"
import { ethers } from "ethers"

/* ================= CONFIG ================= */

const RPC =
"https://eth.llamarpc.com"

const SAFE_ADDRESS =
"0xcC2688350d29623E2A0844Cc8885F9050F0f6Ed5"

const DAO_ADDRESS =
"0x9c8ff314c9bc7f6e59a9d9225fb22946427edc03"

const PRIVATE_KEY =
process.env.SAFE_PRIVATE_KEY

/* ================= STORAGE ================= */

const POLLS_FILE = "polls.json"

if (!fs.existsSync(POLLS_FILE))
  fs.writeFileSync(POLLS_FILE,"{}")

const polls =
JSON.parse(fs.readFileSync(POLLS_FILE))

/* ================= PROVIDER ================= */

const provider =
new ethers.JsonRpcProvider(RPC)

const wallet =
new ethers.Wallet(
PRIVATE_KEY,
provider
)

/* ================= DAO ================= */

const DAO_ABI = [
"function state(uint256) view returns(uint8)",
"function propose(address[],uint256[],string[],bytes[],string) returns(uint256)"
]

const dao =
new ethers.Contract(
DAO_ADDRESS,
DAO_ABI,
wallet
)

/*
STATE ENUM

0 Pending
1 Active
2 Canceled
3 Defeated
4 Succeeded
5 Queued
6 Expired
7 Executed
*/

/* ================= SAFE LOGIC ================= */

async function submitIfReady(id) {

  const poll = polls[id]
  if (!poll) return

  const now =
  Math.floor(Date.now()/1000)

  if (now < poll.closeTime) {
    console.log("Poll still active",id)
    return
  }

  if (poll.submitted) {
    console.log("Already submitted",id)
    return
  }

  const state =
  await dao.state(id)

  if (
    state == 5 ||
    state == 7
  ) {
    console.log(
      "Already queued/executed",
      id
    )
    return
  }

  if (!poll.passed) {
    console.log(
      "Poll failed",
      id
    )
    return
  }

  console.log(
    "Submitting proposal via Safe:",
    id
  )

  /*
   IMPORTANT:
   Here we only mark submission.
   Real propose payload normally
   comes from stored proposal data.
  */

  poll.submitted = true

}

/* ================= RUN ================= */

async function run() {

  for (const id of Object.keys(polls)) {
    await submitIfReady(id)
  }

  fs.writeFileSync(
    POLLS_FILE,
    JSON.stringify(polls,null,2)
  )

  console.log("Safe execution check done")
}

run()
