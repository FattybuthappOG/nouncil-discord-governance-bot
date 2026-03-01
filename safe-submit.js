import Safe from "@safe-global/protocol-kit"
import SafeApiKit from "@safe-global/api-kit"
import { ethers } from "ethers"
import fs from "fs"

const SAFE_ADDRESS =
"0xcC2688350d29623E2A0844Cc8885F9050F0f6Ed5"

const RPC =
"https://eth.llamarpc.com"

const provider = new ethers.JsonRpcProvider(RPC)

const signer = new ethers.Wallet(
  process.env.SAFE_PRIVATE_KEY,
  provider
)

const safeService =
new SafeApiKit({
  txServiceUrl:
  "https://safe-transaction-mainnet.safe.global",
  ethAdapter: {
    getSignerAddress: async () => signer.address,
    getProvider: () => provider,
    signer
  }
})

async function run() {

  const results =
    JSON.parse(
      fs.readFileSync("export.json")
    )

  for (const prop of results) {

    console.log("Submitting Safe tx for", prop.id)

    const safeSdk =
      await Safe.create({
        ethAdapter:{
          signer,
          provider
        },
        safeAddress: SAFE_ADDRESS
      })

    const tx =
      await safeSdk.createTransaction({
        transactions:[{
          to: prop.target,
          value:"0",
          data: prop.calldata
        }]
      })

    const signed =
      await safeSdk.signTransaction(tx)

    await safeService.proposeTransaction({
      safeAddress: SAFE_ADDRESS,
      safeTransactionData:
        tx.data,
      safeTxHash:
        await safeSdk.getTransactionHash(tx),
      senderAddress:
        signer.address,
      senderSignature:
        signed.signatures
          .values()
          .next().value.data
    })

    console.log("✅ Proposed")
  }
}

run()
