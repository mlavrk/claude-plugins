export type UsageLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** The figures the row draws: context fill and the rate-limit windows. */
export type UsageSnapshot = {
  contextPercent: number | null
  limits: UsageLimit[]
}

declare module 'claude-code' {
  interface PluginState {
    'usage-statusline': { usage: UsageSnapshot | null }
  }
}
