import Web3, {
  type Log,
  type TransactionHash,
  type Transaction,
  type Numbers,
} from "web3"
import { BaseChain } from "./chain"
import type { Chain } from "@prisma/client"
import { nativeTransfer, swap, tokenTransfer } from "../notify"
import {
  TOKEN_TRANSFER_HASH,
  V2_ROUTER,
  V2_SWAP_ETH_FOR_EXACT_TOKENS,
  V2_SWAP_EXACT_ETH_FOR_TOKENS,
  V2_SWAP_EXACT_ETH_FOR_TOKENS_FEE,
  V2_SWAP_EXACT_TOKENS_FOR_ETH,
  V2_SWAP_EXACT_TOKENS_FOR_ETH_FEE,
  V2_SWAP_EXACT_TOKENS_FOR_TOKENS,
  V2_SWAP_EXACT_TOKENS_FOR_TOKENS_FEE,
  V2_SWAP_TOKENS_FOR_EXACT_ETH,
  V2_SWAP_TOKENS_FOR_EXACT_TOKENS,
  V3_EXECUTE,
  V3_ROUTER,
} from "../constants"
import { logger } from "../logger"
import sleep from "../utils/sleep"

export class EVMChain extends BaseChain {
  chain: Chain
  web3: Web3
  running = true
  backlog = 0

  constructor(chain: Chain, rpcUrl: string) {
    super()
    this.chain = chain
    this.web3 = new Web3(
      rpcUrl.replace("wss://", "https://").replace("/ws/", "/rpc/")
    )

    // did this due to some weird memory leak issue in web3.js
    setInterval(() => {
      logger.verbose(`Refreshing web3 instance for ${chain}`)
      this.web3 = new Web3(
        rpcUrl.replace("wss://", "https://").replace("/ws/", "/rpc/")
      )
    }, 1000 * 15)
  }

  async start() {
    let nextBlock = 0n
    logger.info(`Started ${this.chain}`)
    while (this.running) {
      const currentBlock = await this.web3.eth.getBlockNumber()
      if (nextBlock === 0n) {
        nextBlock = currentBlock
      } else {
        for (let blockNum = nextBlock; blockNum <= currentBlock; blockNum++) {
          this.processBlock(blockNum)
        }
        nextBlock = currentBlock + 1n
      }
      await sleep(5000)
    }
  }

  async stop() {
    this.running = false
  }

  async processBlock(blockNum: bigint) {
    this.backlog++
    let hash
    try {
      const block = await this.web3.eth.getBlock(blockNum, true)
      hash = block.hash
      const blockLogs = await this.web3.eth.getPastLogs({ blockHash: hash })

      const logMap: Record<TransactionHash, Log[]> = {}
      for (const log of blockLogs) {
        if (typeof log === "string" || !log.transactionHash) continue
        if (!(log.transactionHash in logMap)) {
          logMap[log.transactionHash] = []
        }
        logMap[log.transactionHash].push(log)
      }
      logger.verbose(
        `${this.chain}: New block ${blockNum} [backlog: ${this.backlog - 1}]`
      )

      if (!block.transactions) return
      const txThreads = block.transactions.map(async (tx) => {
        if (typeof tx === "string") return
        return this.processTx(tx, tx.hash, logMap[tx.hash] || [])
      })
      await Promise.all(txThreads)
    } catch (e) {
      let errorMsg = e instanceof Error ? e.message : e
      logger.error(
        `Failed to process block ${hash ?? "<unknown>"}(${blockNum}) on chain ${
          this.chain
        }: ${errorMsg}`
      )
    }
    this.backlog--
  }

  async processTx(tx: Transaction, hash: TransactionHash, logs: Log[]) {
    try {
      if (
        tx.to === V3_ROUTER &&
        tx.input &&
        tx.input.slice(0, 10) === V3_EXECUTE
      ) {
        // uniswap v3 execute
        await this.processUniswapExecute(tx, hash, logs)
        return
      } else if (V2_ROUTER.includes(tx.to ?? "")) {
        await this.processUniswapV2(tx, hash, logs)
        return
      }

      await this.processTokenTransfer(tx, hash, logs)
      await this.processNativeTransfer(tx, hash)
    } catch (e) {
      logger.error(`Failed to process tx ${hash} on chain ${this.chain}: ${e}`)
    }
  }

  async processUniswapExecute(
    tx: Transaction,
    hash: TransactionHash,
    logs: Log[]
  ) {
    if (!tx.input || !tx.from) return

    const executeParams = this.web3.eth.abi.decodeParameters(
      ["bytes", "bytes[]", "uint256"],
      "0x" + tx.input.toString().slice(10)
    )
    const commands = (executeParams["0"] as string).slice(2)
    const inputs = executeParams["1"] as string[]

    for (let idx = 0; idx < commands.length / 2; idx++) {
      const command = commands.slice(2 * idx, 2 * (idx + 1))
      const input = inputs[idx]

      if (["08", "09"].includes(command)) {
        // v2 exact in/out
        const swapParams = this.web3.eth.abi.decodeParameters(
          ["address", "uint256", "uint256", "address[]", "bool"],
          input
        )

        let inAmount = swapParams["1"] as bigint
        let outAmount = swapParams["2"] as bigint
        const path = swapParams["3"] as string[]
        const inToken = path[0]
        const outToken = path[path.length - 1]

        if (command === "08") {
          const actualOutAmount = this.getSwapAmount(
            outToken,
            tx.from,
            logs,
            false
          )
          if (actualOutAmount !== -1n) outAmount = actualOutAmount
        } else {
          const actualInAmount = this.getSwapAmount(
            inToken,
            tx.from,
            logs,
            true
          )
          if (actualInAmount !== -1n) inAmount = actualInAmount
        }

        await swap(
          tx.from,
          inToken,
          outToken,
          inAmount,
          outAmount,
          hash,
          this.chain
        )
      }
    }
  }

  async processUniswapV2(tx: Transaction, hash: TransactionHash, logs: Log[]) {
    if (!tx.input || !tx.from) return
    const funcSig = tx.input.slice(0, 10).toString()

    if (
      [
        V2_SWAP_EXACT_TOKENS_FOR_TOKENS,
        V2_SWAP_TOKENS_FOR_EXACT_TOKENS,
        V2_SWAP_TOKENS_FOR_EXACT_ETH,
        V2_SWAP_EXACT_TOKENS_FOR_ETH,
        V2_SWAP_EXACT_TOKENS_FOR_ETH_FEE,
        V2_SWAP_EXACT_TOKENS_FOR_TOKENS_FEE,
      ].includes(funcSig)
    ) {
      const swapParams = this.web3.eth.abi.decodeParameters(
        ["uint256", "uint256", "address[]", "address", "uint256"],
        "0x" + tx.input.toString().slice(10)
      )
      let inAmount = swapParams["0"] as bigint
      let outAmount = swapParams["1"] as bigint
      const path = swapParams["2"] as string[]
      const toAddress = swapParams["3"] as string

      const inToken = path[0]
      const outToken = path[path.length - 1]

      if (
        [
          V2_SWAP_TOKENS_FOR_EXACT_TOKENS,
          V2_SWAP_TOKENS_FOR_EXACT_ETH,
        ].includes(funcSig)
      ) {
        ;[inAmount, outAmount] = [outAmount, inAmount]
        const actualInAmount = this.getSwapAmount(inToken, tx.from, logs, true)
        if (actualInAmount !== -1n) inAmount = actualInAmount
      } else {
        const actualOutAmount = this.getSwapAmount(
          outToken,
          toAddress,
          logs,
          false
        )
        if (actualOutAmount !== -1n) outAmount = actualOutAmount
      }

      await swap(
        tx.from,
        inToken,
        outToken,
        inAmount,
        outAmount,
        hash,
        this.chain
      )
    } else if (
      [
        V2_SWAP_EXACT_ETH_FOR_TOKENS,
        V2_SWAP_ETH_FOR_EXACT_TOKENS,
        V2_SWAP_EXACT_ETH_FOR_TOKENS_FEE,
      ].includes(funcSig)
    ) {
      const swapParams = this.web3.eth.abi.decodeParameters(
        ["uint256", "address[]", "address", "uint256"],
        "0x" + tx.input.toString().slice(10)
      )
      let inAmount = BigInt(tx.value || 0)
      let outAmount = swapParams["0"] as bigint
      const path = swapParams["1"] as string[]
      const toAddress = swapParams["2"] as string

      const outToken = path[path.length - 1]

      if ([V2_SWAP_ETH_FOR_EXACT_TOKENS].includes(funcSig)) {
        const actualInAmount = this.getSwapAmount(path[0], tx.from, logs, true)
        if (actualInAmount !== -1n) inAmount = actualInAmount
      } else {
        const actualOutAmount = this.getSwapAmount(
          outToken,
          toAddress,
          logs,
          false
        )

        if (actualOutAmount !== -1n) outAmount = actualOutAmount
      }

      await swap(
        tx.from,
        path[0],
        outToken,
        inAmount,
        outAmount,
        hash,
        this.chain
      )
    }
  }

  processTokenTransfer = async (
    tx: Transaction,
    hash: TransactionHash,
    logs: Log[]
  ) => {
    for (const log of logs) {
      if (
        log.topics &&
        log.topics.length === 3 &&
        log.data &&
        log.address &&
        log.topics[0] === TOKEN_TRANSFER_HASH
      ) {
        const token = log.address
        const [from, to] = log.topics
          .slice(1)
          .map((addr) => "0x" + addr.slice(0x1a))
        const value = BigInt(log.data.toString())

        await tokenTransfer(from, to, token, value, hash, this.chain)
      }
    }
  }

  async processNativeTransfer(tx: Transaction, hash: TransactionHash) {
    if (tx.from && tx.to && tx.value) {
      await nativeTransfer(tx.from, tx.to, BigInt(tx.value), hash, this.chain)
    }
  }

  getSwapAmount(
    token: string,
    address: string,
    logs: Log[],
    isSender: boolean
  ) {
    // isSender: <addr> is the sender of the token
    for (const log of logs) {
      if (
        log.topics &&
        log.topics.length === 3 &&
        log.data &&
        log.address &&
        log.topics[0] === TOKEN_TRANSFER_HASH
      ) {
        const logToken = log.address
        const [from, to] = log.topics
          .slice(1)
          .map((addr) => "0x" + addr.slice(0x1a))
        const value = BigInt(log.data.toString())

        if (
          logToken.toLowerCase() === token.toLowerCase() &&
          ((isSender && from === address.toLowerCase()) ||
            (!isSender && to === address.toLowerCase()))
        ) {
          return value
        }
      }
    }
    return -1n
  }
}
