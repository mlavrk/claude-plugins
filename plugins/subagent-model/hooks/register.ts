import type { EngineInterface, Register } from 'claude-code'

import { effortText, family, tag } from './format'

type Defaults = { model: string; effort?: string }

const STORE_KEY = 'defaults'

// What each agent type ran on last, when spawned without a model or effort of its own.
const defaults = async ($: EngineInterface) =>
  ((await $.store.get(STORE_KEY).catch(() => undefined)) ?? {}) as Record<string, Defaults>

export const register: Register = on => {
  // The Agent call's own `effort`, by tool_use_id: agent.spawn does not carry it.
  const callEffort = new Map<string, string>()
  // Spawned with no model or effort of their own: their first request teaches the type's defaults.
  const learning = new Map<string, string>()
  let mainEffort: string | undefined

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const effort = effortText(e.effort)

    if (effort) {
      callEffort.set(e.tool_use_id, effort)
    }

    try {
      return await next(e)
    } finally {
      callEffort.delete(e.tool_use_id)
    }
  })

  // The name is fixed as the agent starts, before the engine resolves its model,
  // so an agent type's defaults come from what it was last seen running on.
  on('agent.spawn', async ($, e, next) => {
    if (e.workflow || e.resume) {
      return next(e)
    }

    const known = (await defaults($))[e.subagentType]
    const asked = callEffort.get(e.tool_use_id)
    const own = e.model === undefined || e.model === 'inherit' ? undefined : family(e.model)

    let model: string | undefined
    let effort: string | undefined

    if (e.fork) {
      model = family(e.parentModel)
      effort = mainEffort
    } else {
      model = own ?? known?.model
      effort = asked ?? (model === known?.model ? known?.effort : undefined)
    }

    const label = tag(model, effort)
    const result = await next(label ? { ...e, description: `${e.description} ${label}` } : e)

    if (!('deny' in result) && result.agentId && !e.fork && !own && !asked) {
      learning.set(result.agentId, e.subagentType)
    }

    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      mainEffort = effortText(e.effort)
    } else if (learning.has(e.agentId)) {
      const type = learning.get(e.agentId)!
      learning.delete(e.agentId)

      const known = await defaults($)
      known[type] = { model: family(e.model), effort: effortText(e.effort) }
      await $.store.set(STORE_KEY, known).catch(() => {})
    }

    return yield* next(e)
  })
}
