import { Chain } from "@prisma/client"
import type { BaseChain } from "./chain/chain"
import { EVMChain } from "./chain/evm"
import { SOLChain } from "./chain/sol"

const chains: BaseChain[] = [
  new EVMChain(Chain.ETH, process.env.ETH_RPC!),
  new EVMChain(Chain.BNB, process.env.BSC_RPC!),
  new EVMChain(Chain.ARB, process.env.ARB_RPC!),
  new EVMChain(Chain.MATIC, process.env.MATIC_RPC!),
  new EVMChain(Chain.AVAX, process.env.AVAX_RPC!),
  // new SOLChain(process.env.SOL_RPC!),

  // new EVMChain(Chain.ETH, process.env.SEPOLIA_RPC!),
]

export default chains
