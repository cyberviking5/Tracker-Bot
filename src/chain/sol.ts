import { Chain } from "@prisma/client"
import { BaseChain } from "./chain"
import {
  Connection,
  type ParsedTransaction,
  type ParsedTransactionMeta,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
  PublicKey,
  type AccountInfo,
  type ParsedAccountData,
} from "@solana/web3.js"
import sleep from "../utils/sleep"
import { logger } from "../logger"
import checkType from "../utils/checkType"
import { nativeTransfer, swap, tokenTransfer } from "../notify"
import bs58 from "bs58"
import { RAYDIUM_POOL } from "../constants"
import waitCondition from "../utils/waitCondition"

export class SOLChain extends BaseChain {
  chain = Chain.SOL
  connection: Connection
  running = true

  constructor(rpcUrl: string) {
    super()
    this.connection = new Connection(rpcUrl, "confirmed")
  }

  async start() {
    let nextSlot = 0
    while (this.running) {
      const blockHashData = await this.connection.getLatestBlockhashAndContext(
        "finalized"
      )
      const currentSlot = blockHashData.context.slot

      if (nextSlot != 0 && currentSlot >= nextSlot) {
        const slots = await this.connection.getBlocks(nextSlot, currentSlot)
        for (const slot of slots) {
          this.parseBlock(slot)
        }
      }

      nextSlot = currentSlot + 1
      await sleep(5000)
    }
  }

  async stop() {
    this.running = false
  }

  async parseBlock(slot: number) {
    let block = null
    while (!block) {
      block = await this.connection.getParsedBlock(slot, {
        maxSupportedTransactionVersion: 0,
      })
    }

    logger.verbose(`${this.chain}: New block ${slot}`)

    block.transactions.forEach((tx) => {
      this.parseTransaction(tx.transaction as any as ParsedTransaction, tx.meta)
    })
  }

  async parseTransaction(
    tx: ParsedTransaction,
    meta: ParsedTransactionMeta | null
  ) {
    if (meta && meta.err) {
      return
    }
    const txHash = tx.signatures[0]
    const innerInsts: Record<
      number,
      (ParsedInstruction | PartiallyDecodedInstruction)[]
    > = {}
    for (const innerInst of meta?.innerInstructions || []) {
      if (!(innerInst.index in innerInsts)) {
        innerInsts[innerInst.index] = []
      }
      innerInsts[innerInst.index].push(...innerInst.instructions)
    }

    await Promise.all(
      tx.message.instructions.map(async (instruction, idx) => {
        if (checkType<ParsedInstruction>(instruction, "program")) {
          if (
            instruction.program === "system" &&
            instruction.parsed.type === "transfer"
          ) {
            const { source, destination, lamports } = instruction.parsed.info
            nativeTransfer(source, destination, lamports, txHash, this.chain)
          } else if (
            instruction.program === "spl-token" &&
            ["transfer", "transferChecked"].includes(instruction.parsed.type)
          ) {
            if (!instruction.parsed.info.authority) {
              return // ignore multisig
            }

            const { authority, destination, amount, tokenAmount } =
              instruction.parsed.info

            const sentAmount = tokenAmount
              ? BigInt(tokenAmount.amount)
              : BigInt(amount)

            const destAccountInfo = await this.getAccountInfoBundle(
              new PublicKey(destination)
            )

            if (destAccountInfo === null) {
              logger.warn(
                `Invalid destination account info: ${destination} in tx ${txHash}`
              )
              return
            }

            const mint = new PublicKey(
              destAccountInfo.data.subarray(0, 32)
            ).toBase58()

            tokenTransfer(
              authority,
              destAccountInfo.owner.toBase58(),
              mint,
              sentAmount,
              txHash,
              this.chain
            )
          }
        } else {
          if (instruction.programId.toBase58() === RAYDIUM_POOL) {
            const instBytes = bs58.decode(instruction.data)
            if (
              [9, 11].includes(instBytes[0]) &&
              idx in innerInsts &&
              innerInsts[idx].length === 2
            ) {
              const poolAddr = instruction.accounts[1]
              const poolAccountInfo = await this.getAccountInfoBundle(poolAddr)
              if (poolAccountInfo === null) {
                logger.warn(`Cannot get pool info for account ${poolAddr}`)
                return
              }

              let tokIn = new PublicKey(
                poolAccountInfo.data.subarray(400, 432)
              ).toBase58()
              let tokOut = new PublicKey(
                poolAccountInfo.data.subarray(432, 464)
              ).toBase58()

              let amtIn = BigInt(
                (innerInsts[idx][1] as ParsedInstruction).parsed.info.amount
              )
              let amtOut = BigInt(
                (innerInsts[idx][0] as ParsedInstruction).parsed.info.amount
              )
              if (instBytes[0] === 9) {
                ;[amtIn, amtOut] = [amtOut, amtIn]
                ;[tokIn, tokOut] = [tokOut, tokIn]
              }
              const from = tx.message.accountKeys[0]

              swap(
                from.pubkey.toBase58(),
                tokIn,
                tokOut,
                amtIn,
                amtOut,
                txHash,
                this.chain
              )
            }
          }
        }
      })
    )
  }

  #accountInfoQueue: Array<PublicKey> = []
  #resultQueue: Array<AccountInfo<Buffer> | null> = []
  #bundleBusy = false
  #resultsConsumed: number = 0
  async getAccountInfoBundle(address: PublicKey) {
    await waitCondition(() => this.#bundleBusy)
    this.#bundleBusy = true
    // TODO do this

    let idx = this.#accountInfoQueue.push(address) - 1
    if (idx === 0) {
      await waitCondition(() => this.#accountInfoQueue.length !== 100)
      this.#resultsConsumed = 0
      this.#resultQueue = await this.connection.getMultipleAccountsInfo(
        this.#accountInfoQueue
      )
    }

    await waitCondition(() => this.#resultQueue.length !== 100)

    let info = this.#resultQueue[idx]
    this.#resultsConsumed += 1
    if (this.#resultsConsumed === 100) {
      this.#accountInfoQueue = []
      this.#resultQueue = []
    }

    return info
  }
}
