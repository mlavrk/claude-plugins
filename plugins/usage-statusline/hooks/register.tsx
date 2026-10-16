import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { UsageSnapshot } from '../types'
import { formatUsage } from './format'

const usage = atom({ plugin: 'usage-statusline', key: 'usage' } as const, null)

const EMPTY: UsageSnapshot = { contextPercent: null, limits: [] }

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

    return (
      <Box flexDirection="column">
        {own}
        <Box key="usage-row" justifyContent="flex-end">
          <Text color="gray">
            {formatUsage(u, now).map(s => (s.color ? <Text color={s.color}>{s.text}</Text> : s.text))}
          </Text>
        </Box>
      </Box>
    )
  })
}
