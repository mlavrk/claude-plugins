import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { UsageSnapshot } from '../types'
import { formatUsage } from './format'

const usage = atom({ plugin: 'usage-statusline', key: 'usage' } as const, null)

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

export const register: Register = on => {
  // Seed on start (and after a hot reload, which raises session.start again).
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    await update($, usage, () => snapshot(u.context, u.rateLimits))
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => snapshot(e.context, e.rateLimits))
    return next(e)
  })

  // Keep the engine's own hint line and add a right-aligned usage row under it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const own = await next(e)
    const u = (await read($, usage)) ?? EMPTY
    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)
    // The engine refuses a width on any Box holding its node, so only the row
    // is sized, from the terminal width (the hook re-runs on resize).
    const columns = e.viewport?.columns
    const width = columns === undefined ? undefined : Math.max(columns - SIDE_GAPS, 0)

    return (
      <Box flexDirection="column">
        {own}
        <Box key="usage-row" justifyContent="flex-end" width={width}>
          <Text color="gray">
            {formatUsage(u, now).map(s => (s.color ? <Text color={s.color}>{s.text}</Text> : s.text))}
          </Text>
        </Box>
      </Box>
    )
  })
}
