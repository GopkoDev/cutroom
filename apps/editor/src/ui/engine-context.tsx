import { createContext, useContext } from "react"

import type { EngineClient } from "@/engine-client"

/** The running engine, or `null` while it starts. Provided by `EditorLayout`, which owns it. */
export const EngineContext = createContext<EngineClient | null>(null)

export function useEngine(): EngineClient | null {
  return useContext(EngineContext)
}
