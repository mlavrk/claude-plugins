import type { On, SessionCompactResult, SessionMeasureInput, SessionMessage } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SUMMARY: SessionMessage[] = [{ role: 'user', text: 'Summary of the conversation so far.', toolUses: [] }]

// Stand-ins for the engine beneath the plugin: it draws its own hint line
// (the engine node), echoes measurements and turns, starts the session with
// `turns` prompts sent, and compacts (or skips) as `compact` says.
function engine(
  on: On,
  { turns = 0, compact = { messages: SUMMARY } }: { turns?: number; compact?: SessionCompactResult } = {},
) {
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as const)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.start', () => ({ cwd: '/' }))
  on('session.turns', () => ({ value: turns }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as any
  })
  on('classic.PostModelSwitch', () => ({}))
  on('session.compact', () => compact)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  return mock.clock(on, { now: Date.parse('2026-10-16T12:00:00Z') })
}

const SURFACES = ['terminal', 'desktop'] as const
const HINT = {
  plugin: 'usage-statusline',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on' },
} as const

const MEASURE: SessionMeasureInput = {
  context: { window: 200_000, tokens: 84_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 91 },
    { kind: 'seven_day', percentUsed: 60 },
  ],
  changed: ['context', 'rateLimits'],
}

test('row sits under the engine hint line, right-aligned to the terminal width', async ($, on) => {
  engine(on)
  await $.session.measure(MEASURE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface, viewport: { columns: 120, rows: 40 } })
    const tree = (await ui.drawn()) as any
    // Sized only on the terminal, where the hint line's indent is known.
    const width = surface === 'terminal' ? 116 : undefined

    expect(tree.type).toBe('Box')
    expect(tree.props.flexDirection).toBe('column')
    // The engine refuses a width on any Box that holds its node.
    expect(tree.props.width).toBeUndefined()
    expect(tree.children[0].type).toBe('engine')
    // The row spans the hint line's width (2-column indent each side).
    expect(tree.children[1].props.justifyContent).toBe('flex-end')
    expect(tree.children[1].props.width).toBe(width)
    await ui.unmount()
  }
})

test('without a measured width the row is drawn unsized', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(((await ui.drawn()) as any).children[1].props.width).toBeUndefined()
})

test('row reads the usage line in gray, coloring only percentages past their threshold', async ($, on) => {
  engine(on)
  await $.session.measure(MEASURE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    const row = await ui.find({ key: 'usage-row' })

    expect(row?.text).toBe('ctx 42% · cache — · 5h 9% · 7d 40%')
    expect((await ui.find({ type: 'Text', text: /^ctx / }))?.props.color).toBe('gray')
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.props.color).toBe('yellow')
    expect((await ui.find({ type: 'Text', text: /^9%$/ }))?.props.color).toBe('red')
    expect(await ui.find({ type: 'Text', text: /^40%$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('before any usage is reported the row shows dashes', async ($, on) => {
  engine(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    expect((await ui.find({ key: 'usage-row' }))?.text).toBe('ctx — · cache — · 5h — · 7d —')
    await ui.unmount()
  }
})

const NO_USAGE = { startedAt: 0, context: { window: 200_000 }, rateLimits: [] }

test('session start seeds the row from the current usage', async ($, on) => {
  engine(on)
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { window: 200_000, percent: 12 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30 }],
  } }))
  await $.session.start({ source: 'startup', cwd: '/' } as any)

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await ui.find({ key: 'usage-row' }))?.text).toBe('Opus · ctx 12% · cache — · 5h 70% · 7d —')
})

test('row redraws when a window resets, dropping the stale figure', async ($, on) => {
  const clock = engine(on)
  await $.session.measure({
    context: { window: 200_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 91, resetsAt: '2026-10-16T13:00:00Z' }],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await ui.find({ key: 'usage-row' }))?.text).toMatch(/^ctx 10% · cache — · 5h 9% \(/)

  await clock.advance(2 * 60 * 60 * 1000)
  expect((await ui.find({ key: 'usage-row' }))?.text).toBe('ctx 10% · cache — · 5h — · 7d —')
})

// A finished turn, on the main loop unless an agent's id is given.
const turn = (read: number, written: number, uncached: number, agentId?: string) =>
  ({
    answer: '',
    durationMs: 1,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: uncached,
      output_tokens: 100,
      cache_read_input_tokens: read,
      cache_creation_input_tokens: written,
    },
    ...(agentId === undefined ? {} : { agentId }),
  }) as any

const cacheText = async (ui: { find: (q: any) => Promise<any> }) =>
  (await ui.find({ key: 'usage-row' }))?.text.split(' · ').find((x: string) => x.startsWith('cache'))

test('a main-thread turn shows its cache hit rate and the tokens written', async ($, on) => {
  engine(on)
  await $.turn.complete(turn(96_000, 6_400, 0))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    expect(await cacheText(ui)).toBe('cache 94% +6k')
    await ui.unmount()
  }
})

test('a subagent turn leaves the cache segment alone', async ($, on) => {
  engine(on)
  await $.turn.complete(turn(96_000, 6_400, 0))
  await $.turn.complete(turn(0, 50_000, 0, 'agent-1'))

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await cacheText(ui)).toBe('cache 94% +6k')
})

test('a turn with no usage shows a dash', async ($, on) => {
  engine(on)
  await $.turn.complete(turn(96_000, 6_400, 0))
  await $.turn.complete({ ...turn(0, 0, 0), usage: undefined, isAborted: true, reason: 'aborted' })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await cacheText(ui)).toBe('cache —')
})

test("a fresh session's first turn is cold by design and stays gray", async ($, on) => {
  engine(on)
  on('session.usage', () => ({ value: NO_USAGE }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await $.turn.complete(turn(0, 90_000, 10_000))
  expect(await cacheText(ui)).toBe('cache 0% +90k')
  expect(await ui.find({ type: 'Text', text: /^0%$/ })).toBeUndefined()

  // The next cold turn is not expected: something dropped the cache.
  await $.turn.complete(turn(0, 90_000, 10_000))
  expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.props.color).toBe('red')
})

test('the first turn after a compaction stays gray', async ($, on) => {
  engine(on)
  await $.turn.complete(turn(96_000, 6_400, 0))
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  await $.turn.complete(turn(10_000, 60_000, 30_000))

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await cacheText(ui)).toBe('cache 10% +60k')
  expect(await ui.find({ type: 'Text', text: /^10%$/ })).toBeUndefined()
})

test('a skipped compaction does not mark the next turn', async ($, on) => {
  engine(on, { compact: { skip: 'nothing to compact' } })
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  await $.turn.complete(turn(10_000, 60_000, 30_000))

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^10%$/ }))?.props.color).toBe('red')
})

test('a reload mid-session keeps the reading and marks nothing cold', async ($, on) => {
  engine(on, { turns: 3 })
  on('session.usage', () => ({ value: NO_USAGE }))
  await $.turn.complete(turn(96_000, 6_400, 0))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await cacheText(ui)).toBe('cache 94% +6k')
  await $.turn.complete(turn(10_000, 60_000, 30_000))
  expect((await ui.find({ type: 'Text', text: /^10%$/ }))?.props.color).toBe('red')
})

const modelText = async (ui: { find: (q: any) => Promise<any> }) =>
  (await ui.find({ key: 'usage-row' }))?.text.split(' · ')[0]

// One model request, drained, on the main loop unless an agent's id is given.
async function step($: any, model: string, effort?: string, agentId?: string) {
  const s = $.turn.step({
    turnId: 't',
    index: 0,
    model,
    messageCount: 1,
    ...(effort === undefined ? {} : { effort }),
    ...(agentId === undefined ? {} : { agentId }),
  })
  for await (const _ of s);
}

test('a main-loop request shows its model and effort ahead of the context', async ($, on) => {
  engine(on)
  on('session.usage', () => ({ value: NO_USAGE }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await modelText(ui)).toBe('Opus')

  await step($, 'claude-sonnet-5-5[1m]', 'xhigh')
  expect((await ui.find({ key: 'usage-row' }))?.text).toBe('Sonnet (xhigh) · ctx — · cache — · 5h — · 7d —')
  expect((await ui.find({ type: 'Text', text: /^Sonnet/ }))?.props.color).toBe('gray')
})

test("a subagent's request leaves the model alone", async ($, on) => {
  engine(on)
  await step($, 'claude-opus-5-5', 'high')
  await step($, 'claude-haiku-5-5', 'low', 'agent-1')

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await modelText(ui)).toBe('Opus (high)')
})

test('a model switch shows at once', async ($, on) => {
  engine(on)
  await step($, 'claude-opus-5-5', 'high')
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })

  await $.classic.PostModelSwitch({
    from_model: 'claude-opus-5-5',
    to_model: 'claude-sonnet-5-5',
    requested_model: 'sonnet',
    source: 'command',
    context_tokens: 0,
    prompt_cache_warm: false,
    cache_ttl: '5m',
  } as any)
  expect(await modelText(ui)).toBe('Sonnet (high)')
})
