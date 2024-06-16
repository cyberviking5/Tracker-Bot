import { Chain } from "@prisma/client"
import { LRUCache } from "lru-cache"
import chains from "../chains"
import type { SOLChain } from "../chain/sol"
import type { EVMChain } from "../chain/evm"
import ERC20ABI from "../../data/erc20.json"
import { PublicKey } from "@solana/web3.js"

interface TokenInfo {
  symbol: string
  decimals: number
}

const cache = new LRUCache<string, TokenInfo>({ max: 64000 })

export default async (tokenAddr: string, chain: Chain): Promise<TokenInfo> => {
  const cacheKey = tokenAddr + chain
  const cacheVal = cache.get(cacheKey)
  console.log("get token", tokenAddr, chain)

  if (cacheVal) return cacheVal

  let foundChain = chains.find((c) => c.chain === chain)
  if (!foundChain) {
    return { symbol: "Unknown", decimals: 0 }
  }

  let val = { symbol: "Unknown", decimals: 0 }

  if (foundChain.chain === Chain.SOL) {
    const conn = (foundChain as SOLChain).connection
    const info = conn.getParsedAccountInfo(new PublicKey(tokenAddr))
    console.log(info)
  } else {
    const web3 = (foundChain as EVMChain).web3
    const contract = new web3.eth.Contract(ERC20ABI, tokenAddr)

    const symbol = (await contract.methods.symbol().call()) as string
    const decimals = (await contract.methods.decimals().call()) as bigint

    val = {
      symbol: symbol as unknown as string,
      decimals: Number(decimals),
    }

    cache.set(cacheKey, val)

    return val
  }

  return { symbol: "Unknown", decimals: 0 }
}
