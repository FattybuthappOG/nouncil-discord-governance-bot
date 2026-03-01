const Safe = require('@safe-global/protocol-kit').default
const EthersAdapter =
  require('@safe-global/protocol-kit').EthersAdapter

const { ethers } = require('ethers')
const axios = require('axios')
require('dotenv').config()

console.log("🚀 Safe automation boot")

const SAFE_ADDRESS = process.env.SAFE_ADDRESS
const RPC_URL = process.env.RPC_URL
const PRIVATE_KEY = process.env.SAFE_PRIVATE_KEY

const SAFE_TX_SERVICE =
  "https://safe-transaction-mainnet.safe.global"

async function run() {

  const provider =
    new ethers.providers.JsonRpcProvider(RPC_URL)

  const signer =
    new ethers.Wallet(PRIVATE_KEY, provider)

  const proposer =
    await signer.getAddress()

  console.log("Proposer:", proposer)

  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer
  })

  const safeSdk = await Safe.create({
    ethAdapter,
    safeAddress: SAFE_ADDRESS
  })

  console.log("✅ Safe connected")

  const nonce = await safeSdk.getNonce()

  const safeTx =
    await safeSdk.createTransaction({
      safeTransactionData: {
        to: SAFE_ADDRESS,
        data: "0x",
        value: "0"
      },
      options: { nonce }
    })

  const hash =
    await safeSdk.getTransactionHash(safeTx)

  const sig =
    await safeSdk.signTransactionHash(hash)

  await axios.post(
    `${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDRESS}/multisig-transactions/`,
    {
      ...safeTx.data,
      contractTransactionHash: hash,
      sender: proposer,
      signature: sig.data
    }
  )

  console.log("✅ Transaction proposed")
}

run()
