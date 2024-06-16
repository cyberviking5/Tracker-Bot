import { Chain } from "@prisma/client"
import { WRAPPED_NATIVE } from "./constants"
import { logger } from "./logger"
import { prisma } from "../prisma/db"
import { bot } from "../bot"
import { Decimal } from "decimal.js"
import getToken from "./utils/getToken"
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "telegraf/types"
import { TelegramError } from "telegraf"

let debugInfo: { user_id: string | null } = { user_id: null }
export { debugInfo }

export const nativeTransfer = async (
  from: string,
  to: string,
  value: bigint,
  hash: string,
  chain: Chain
) => {
  let listeners = await getDbIds([from, to], chain)
  if (listeners.length === 0) return

  listeners.forEach((listener) => {
    let msg = baseMessage(chain)

    const valString = formatNative(value, chain)

    msg += `<a href="${getAccountUrl(from, chain)}">${
      listener.address === from ? listener.alias : from
    }</a> sent ${valString} ${chain} to <a href="${getAccountUrl(to, chain)}">${
      listener.address === to ? listener.alias : to
    }</a>\n\n`
    msg += txHashMessage(hash)

    const inlineKeyboard = [[txHashButton(hash, chain)]]

    sendMessage(listener.groupId, msg, inlineKeyboard)
  })

  logger.verbose(
    `NATIVE(${chain}): from:${from}, value:${value}, to:${to}, hash:${hash}`
  )
}

export const tokenTransfer = async (
  from: string,
  to: string,
  token: string,
  value: bigint,
  hash: string,
  chain: Chain
) => {
  let listeners = await getDbIds([from, to], chain)
  if (listeners.length === 0) return

  const { symbol, decimals } = await getToken(token, chain)

  listeners.forEach((listener) => {
    let msg = baseMessage(chain)
    msg += `<a href="${getAccountUrl(from, chain)}">${
      listener.address === from ? listener.alias : from
    }</a> sent ${formatValue(value, decimals)} <a href="${getTokenUrl(
      token,
      chain
    )}">$${symbol}</a> to <a href="${getAccountUrl(to, chain)}">${
      listener.address === to ? listener.alias : to
    }</a>\n\n`
    msg += txHashMessage(hash)
    msg += `Token Contract: <code>${token}</code>`

    const inlineKeyboard = [[txHashButton(hash, chain)]]
    inlineKeyboard.push([chartButton(token)])
    inlineKeyboard.push([maestroButton(token), maestroProButton(token)])

    sendMessage(listener.groupId, msg, inlineKeyboard)
  })

  logger.verbose(
    `TOKEN(${chain}): from:${from}, to:${to}, token:${token}, value:${value}, hash:${hash}`
  )
}

export const swap = async (
  address: string,
  inToken: string,
  outToken: string,
  inValue: bigint,
  outValue: bigint,
  hash: string,
  chain: Chain
) => {
  let listeners = await getDbIds([address], chain)
  if (listeners.length === 0) return

  const { symbol: symbolIn, decimals: decimalsIn } = await getToken(
    inToken,
    chain
  )
  const { symbol: symbolOut, decimals: decimalsOut } = await getToken(
    outToken,
    chain
  )

  listeners.forEach((listener) => {
    let msg = baseMessage(chain)

    msg += `<a href="${getAccountUrl(address, chain)}">${
      listener.alias ?? address
    }</a>`

    const inlineKeyboard = [[txHashButton(hash, chain)]]

    if (WRAPPED_NATIVE.includes(inToken.toLowerCase())) {
      msg += ` bought ${formatValue(
        outValue,
        decimalsOut
      )} <a href="${getTokenUrl(
        outToken,
        chain
      )}">$${symbolOut}</a> for ${formatNative(inValue, chain)} ${chain}.\n\n`
      inlineKeyboard.push([chartButton(outToken)])
      inlineKeyboard.push([maestroButton(outToken), maestroProButton(outToken)])

      logger.verbose(
        `SWAP(BUY)(${chain}): address:${address}, token:${outToken}, amount:${outValue}, value:${inValue}, hash:${hash}`
      )
    } else if (WRAPPED_NATIVE.includes(outToken.toLowerCase())) {
      msg += ` sold ${formatValue(inValue, decimalsIn)} <a href="${getTokenUrl(
        inToken,
        chain
      )}">$${symbolIn}</a> for ${formatNative(outValue, chain)} ${chain}.\n\n`
      inlineKeyboard.push([chartButton(inToken)])
      inlineKeyboard.push([maestroButton(inToken), maestroProButton(inToken)])

      logger.verbose(
        `SWAP(SELL)(${chain}): address:${address}, token:${inToken}, amount:${inValue}, value:${outValue}, hash:${hash}`
      )
    } else {
      msg += ` swapped ${formatValue(
        inValue,
        decimalsIn
      )} <a href="${getTokenUrl(
        inToken,
        chain
      )}">$${symbolIn}</a> for ${formatValue(
        outValue,
        decimalsOut
      )} <a href="${getTokenUrl(outToken, chain)}">$${symbolOut}</a>.\n\n`
      inlineKeyboard.push([
        chartButton(inToken, symbolIn),
        chartButton(outToken, symbolOut),
      ])
      inlineKeyboard.push([
        maestroButton(inToken, symbolIn),
        maestroButton(outToken, symbolOut),
      ])
      inlineKeyboard.push([
        maestroProButton(inToken, symbolIn),
        maestroProButton(outToken, symbolOut),
      ])

      logger.verbose(
        `SWAP(SWAP)(${chain}): address:${address}, in:${inToken}, out:${outToken}, inValue:${inValue}, outValue:${outValue}, hash:${hash}`
      )
    }

    msg += txHashMessage(hash)

    sendMessage(listener.groupId, msg, inlineKeyboard)
  })
}

const sendMessage = async (
  groupId: string,
  msg: string,
  inlineKeyboard: InlineKeyboardButton[][]
) => {
  while (1) {
    let retry = false
    try {
      bot.telegram.sendMessage(groupId, msg, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: inlineKeyboard },
      })
    } catch (e) {
      if (e instanceof TelegramError) {
        // TODO  supergroup here
        if (e.parameters?.migrate_to_chat_id) {
          await prisma.group.update({
            where: { id: groupId },
            data: { id: e.parameters.migrate_to_chat_id.toString() },
          })
          groupId = e.parameters.migrate_to_chat_id.toString()
          retry = true
        }
        logger.error(`Failed to send message to ${groupId}: ${e.message}`)
      } else if (e instanceof Error) {
        logger.error(
          `Failed to send message to ${groupId}: Unknown error ${e.message}`
        )
      }
    }
    if (!retry) break
  }
}

const getDbIds = async (addrList: string[], chain: Chain) => {
  // return []
  let listeners = await prisma.watchAddress.findMany({
    where: { address: { in: addrList }, chains: { has: chain } },
  })
  if (debugInfo.user_id) {
    listeners = [
      {
        groupId: debugInfo.user_id,
        id: "DEBUG",
        chains: [chain],
        address: addrList[0],
        alias: addrList[0],
      },
    ]
  }
  return listeners
}

const baseMessage = (chain: Chain) => {
  return `Blockchain: ${chain}\n\n`
}

const txHashMessage = (hash: string) => {
  return `Tx Hash: <code>${hash}</code>\n\n`
}

const txHashButton = (hash: string, chain: Chain) => {
  return { text: "View Transaction", url: getTxUrl(hash, chain) }
}

const chartButton = (token: string, tokenName = "") => {
  return {
    text: `Chart${tokenName.length > 0 ? ` $${tokenName}` : ""}`,
    url: `https://www.dextools.io/app/en/ether/pair-explorer/${token}`,
  }
}
const maestroButton = (tokenAddress: string, tokenName = "") => {
  return {
    text: `Trade${tokenName.length > 0 ? ` $${tokenName}` : ""} with Maestro`,
    url: `https://t.me/MaestroSniperBot?start=${tokenAddress}`,
  }
}
const maestroProButton = (tokenAddress: string, tokenName = "") => {
  return {
    text: `Trade${
      tokenName.length > 0 ? ` $${tokenName}` : ""
    } with Maestro PRO`,
    url: `https://t.me/maestropro?start=${tokenAddress}`,
  }
}

const chainExplorers = {
  [Chain.ETH]: "https://etherscan.io",
  [Chain.MATIC]: "https://polygonscan.com",
  [Chain.SOL]: "https://solscan.io",
  [Chain.BNB]: "https://bscscan.com",
  [Chain.AVAX]: "https://subnets.avax.network/c-chain",
  [Chain.ARB]: "https://arbiscan.io",
} as const

const getTxUrl = (txHash: string, chain: Chain) => {
  return chainExplorers[chain] + `/tx/${txHash}`
}

const getAccountUrl = (account: string, chain: Chain) => {
  return chainExplorers[chain] + `/address/${account}`
}

const getTokenUrl = (tokenAddress: string, chain: Chain) => {
  return chainExplorers[chain] + `/token/${tokenAddress}`
}

const formatNative = (amt: bigint, chain: Chain) => {
  return formatValue(amt, chain === Chain.SOL ? 9 : 18)
}

const formatValue = (amt: bigint, decimals: number) => {
  return new Decimal(amt.toString())
    .div(new Decimal(10).pow(decimals))
    .toString()
}
