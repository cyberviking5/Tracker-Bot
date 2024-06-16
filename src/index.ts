import "dotenv/config"
import Web3, { type Log, type TransactionHash } from "web3"
import { EVMChain } from "./chain/evm"
import { Chain } from "@prisma/client"
import type { BaseChain } from "./chain/chain"
import { logger } from "./logger"
import { SOLChain } from "./chain/sol"
import chains from "./chains"
import { prisma } from "../prisma/db"
import { debugInfo } from "./notify"
import sleep from "./utils/sleep"
import { bot } from "../bot"
import { generateHeapSnapshot } from "bun"

const main = async () => {
  // setInterval(async () => {
  //   console.log("dumping heap...")

  //   const snapshot = generateHeapSnapshot()
  //   await Bun.write(
  //     `heap-${Date.now()}.json`,
  //     JSON.stringify(snapshot, null, 2)
  //   )
  //   console.log("dumped heap")
  // }, 10 * 1000)
  process.on("SIGINT", async () => {
    await Promise.all(chains.map((chain) => chain.stop()))
    logger.info("Ended gracefully")
    process.exit(0)
  })

  await Promise.all(chains.map((chain) => chain.start()))
}

await main()

// const c = chains[0] as EVMChain
// console.log("Listening for debug")
// while (1) {
//   const recs = await prisma.debug.findMany()
//   for (const { txhash, user_id, id } of recs) {
//     try {
//       const tx = await c.web3.eth.getTransaction(txhash)
//       const receipt = await c.web3.eth.getTransactionReceipt(txhash)
//       debugInfo.user_id = user_id
//       await c.processTx(tx, txhash, receipt.logs)

//       await bot.telegram.sendMessage(user_id, "processed debug")
//     } catch (e) {
//       console.log(e)

//       await bot.telegram.sendMessage(user_id, "invalid tx")
//     }
//     debugInfo.user_id = null
//     await prisma.debug.delete({ where: { id } })
//   }
//   await sleep(100)
// }
