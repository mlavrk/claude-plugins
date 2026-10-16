export type UsageLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** The figures the row draws: context fill and the rate-limit windows. */
export type UsageSnapshot = {
  contextPercent: number | null
  limits: UsageLimit[]
}

/**
 * The last main-thread turn's input, in tokens, by how the prompt cache
 * served it; `expectedCold` when the turn was cold by design (the session's
 * first, or the first after a compaction).
 */
export type CacheReading = { read: number; written: number; uncached: number; expectedCold: boolean }

/** The cache segment's state: the last reading, and whether the next turn is cold by design. */
export type CacheState = { last: CacheReading | null; coldNext: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-statusline': { usage: UsageSnapshot | null; cache: CacheState }
  }
}
