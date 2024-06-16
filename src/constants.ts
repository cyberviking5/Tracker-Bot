import Web3 from "web3"

export const WRAPPED_NATIVE = [
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH mainnet
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH arb
  "so11111111111111111111111111111111111111112", // WSOL
]
export const TOKEN_TRANSFER_HASH = Web3.utils.sha3(
  "Transfer(address,address,uint256)"
)

// uniswap v3
export const V3_ROUTER = "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad"
export const V3_EXECUTE = Web3.utils
  .sha3("execute(bytes,bytes[],uint256)")!
  .slice(0, 10)

// uniswap v2
export const V2_ROUTER = [
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // uniswap v2
  "0x10ed43c718714eb63d5aa57b78b54704e256024e", // pancake swap BSC
  "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // sushiswap poly and arb
]
export const V2_SWAP_EXACT_TOKENS_FOR_TOKENS = Web3.utils
  .sha3("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_TOKENS_FOR_EXACT_TOKENS = Web3.utils
  .sha3("swapTokensForExactTokens(uint256,uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_TOKENS_FOR_EXACT_ETH = Web3.utils
  .sha3("swapTokensForExactETH(uint256,uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_EXACT_TOKENS_FOR_ETH = Web3.utils
  .sha3("swapExactTokensForETH(uint256,uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_EXACT_TOKENS_FOR_ETH_FEE = Web3.utils
  .sha3(
    "swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"
  )!
  .slice(0, 10)
export const V2_SWAP_EXACT_TOKENS_FOR_TOKENS_FEE = Web3.utils
  .sha3("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)")!
  .slice(0, 10)

export const V2_SWAP_EXACT_ETH_FOR_TOKENS = Web3.utils
  .sha3("swapExactETHForTokens(uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_ETH_FOR_EXACT_TOKENS = Web3.utils
  .sha3("swapETHForExactTokens(uint256,address[],address,uint256)")!
  .slice(0, 10)
export const V2_SWAP_EXACT_ETH_FOR_TOKENS_FEE = Web3.utils
  .sha3(
    "swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)"
  )!
  .slice(0, 10)

export const SOL_NULL_ADDRESS = "1nc1nerator11111111111111111111111111111111"

// raydium v4 sol
export const RAYDIUM_POOL = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
