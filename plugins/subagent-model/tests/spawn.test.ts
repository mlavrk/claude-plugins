import type { AgentSpawnInput, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Stand-ins for the engine beneath the plugin: it records the name each agent
// starts under, resolves an agent with no model of its own to Sonnet, and
// answers model requests. `$.store` is kept in memory.
function engine(on: On, names: string[]) {
  let n = 0
  mock.store(on)
  on('agent.spawn', (_$, e) => {
    names.push(e.description)
    n += 1
    return { model: e.model ?? 'claude-sonnet-5-5', agentId: `a${n}` }
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as any
  })
}

const spawn = (description: string, subagentType: string, model?: string): AgentSpawnInput => ({
  tool_use_id: `call-${description}`,
  prompt: 'p',
  description,
  subagentType,
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
  ...(model === undefined ? {} : { model }),
})

// One model request of an agent's loop, drained.
async function step($: any, agentId: string, model: string, effort: string) {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model, effort, messageCount: 1, agentId }));
}

test('a call that sets the model is tagged with it', async ($, on) => {
  const names: string[] = []
  engine(on, names)

  await $.agent.spawn(spawn('Review', 'general-purpose', 'opus'))

  expect(names).toEqual(['Review [Opus]'])
})

test("an agent type's defaults come from its last run", async ($, on) => {
  const names: string[] = []
  engine(on, names)

  await $.agent.spawn(spawn('First', 'Explore'))
  await step($, 'a1', 'claude-sonnet-5-5', 'high')
  await $.agent.spawn(spawn('Second', 'Explore'))
  await $.agent.spawn(spawn('Other type', 'Plan'))

  expect(names).toEqual(['First', 'Second [Sonnet high]', 'Other type'])
})

test('a fork shows the main model and its effort', async ($, on) => {
  const names: string[] = []
  engine(on, names)

  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 }));
  await $.agent.spawn({ ...spawn('Fork', 'fork'), fork: true })

  expect(names).toEqual(['Fork [Opus xhigh]'])
})
