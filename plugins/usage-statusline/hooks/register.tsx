import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { CacheState, UsageSnapshot } from '../types'
import { formatUsage } from './format'

const usage = atom({ plugin: 'usage-statusline', key: 'usage' } as const, null)
const NO_CACHE: CacheState = { last: null, coldNext: false }
const cache = atom({ plugin: 'usage-statusline', key: 'cache' } as const, NO_CACHE)

const EMPTY: UsageSnapshot = { contextPercent: null, limits: [] }

// The hint line is indented 2 columns; keep the same gap on the right.
const SIDE_GAPS = 4

function snapshot(context: SessionContextUsage, rateLimits: SessionRateLimit[]): UsageSnapshot {
  return {
    contextPercent: context.percent ?? null,
    limits: rateLimits.map(({ kind, percentUsed, resetsAt }) =>
      resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
    ),
  }
}

let resetTimer: Timer | undefined

// Store a snapshot and redraw again at the next reset, when a figure expires.
async function store($: EngineInterface, u: UsageSnapshot) {
  await update($, usage, () => u)
  resetTimer?.cancel()
  resetTimer = undefined
  const now = await $.clock.now()
  const next = Math.min(
    ...u.limits.map(l => (l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt))).filter(ms => ms > now),
  )
  if (Number.isFinite(next)) {
    resetTimer = $.clock.after(next - now, () => $.ui.invalidate('ui.render'))
  }
}

export const register: Register = on => {
  // Seed on start (and after a hot reload, which raises session.start again).
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await store($, snapshot(u.context, u.rateLimits))
    // A fresh session's first turn is cold by design. A hot reload comes after
    // prompts were sent: the reading stands.
    if ((await $.session.turns()) === 0) await update($, cache, () => ({ last: null, coldNext: true }))
    return result
  })

  // So is the first turn after a compaction, which rewrites the whole prefix.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (result.skip === undefined) await update($, cache, c => ({ ...c, coldNext: true }))
    return result
  })

  // The main loop's turns only: a subagent's run has a cache of its own.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const u = e.usage
    await update($, cache, c =>
      u === undefined
        ? { ...c, last: null }
        : {
            last: {
              read: u.cache_read_input_tokens,
              written: u.cache_creation_input_tokens,
              uncached: u.input_tokens,
              expectedCold: c.coldNext,
            },
            coldNext: false,
          },
    )
    return result
  })

  on('session.measure', async ($, e, next) => {
    await store($, snapshot(e.context, e.rateLimits))
    return next(e)
  })

  // Keep the engine's own hint line and add a right-aligned usage row under it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const own = await next(e)
    const u = (await read($, usage)) ?? EMPTY
    const c = (await read($, cache)) ?? NO_CACHE
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)
    // The engine refuses a width on any Box holding its node, so only the row
    // is sized, from the terminal width (the hook re-runs on resize). Other
    // surfaces lay the hint out differently; they get the row unsized.
    const columns = e.surface === 'terminal' ? e.viewport?.columns : undefined
    const width = columns === undefined ? undefined : Math.max(columns - SIDE_GAPS, 0)

    return (
      <Box flexDirection="column">
        {own}
        <Box key="usage-row" justifyContent="flex-end" width={width}>
          <Text color="gray">
            {formatUsage(u, c.last, now).map(s => (s.color ? <Text color={s.color}>{s.text}</Text> : s.text))}
          </Text>
        </Box>
      </Box>
    )
  })
}
