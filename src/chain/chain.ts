import type { Chain } from "@prisma/client"

export abstract class BaseChain {
  abstract chain: Chain
  abstract start(): Promise<void>
  abstract stop(): Promise<void>
}
