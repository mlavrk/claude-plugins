import type { On, SessionMeasureInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Stand-ins for the engine beneath the plugin: it draws its own hint line
// (the engine node), echoes measurements and starts the session.
function engine(on: On) {
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as const)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.start', () => ({ cwd: '/' }))
  mock.clock(on, { now: Date.parse('2026-10-16T12:00:00Z') })
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
    { kind: 'seven_day', percentUsed: 58 },
  ],
  changed: ['context', 'rateLimits'],
}

test('row sits under the engine hint line, right-aligned to the terminal width', async ($, on) => {
  engine(on)
  await $.session.measure(MEASURE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface, viewport: { columns: 120, rows: 40 } })
    const tree = (await ui.drawn()) as any

    expect(tree.type).toBe('Box')
    expect(tree.props.flexDirection).toBe('column')
    // The engine refuses a width on any Box that holds its node.
    expect(tree.props.width).toBeUndefined()
    expect(tree.children[0].type).toBe('engine')
    // The row spans the hint line's width (2-column indent each side).
    expect(tree.children[1].props.justifyContent).toBe('flex-end')
    expect(tree.children[1].props.width).toBe(116)
    await ui.unmount()
  }
})

test('without a measured width the row is drawn unsized', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(((await ui.drawn()) as any).children[1].props.width).toBeUndefined()
})

test('row reads the usage line in gray, coloring only hot percentages', async ($, on) => {
  engine(on)
  await $.session.measure(MEASURE)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    const row = await ui.find({ key: 'usage-row' })

    expect(row?.text).toBe('ctx 42% · 5h 91% · 7d 58%')
    expect((await ui.find({ type: 'Text', text: /^ctx / }))?.props.color).toBe('gray')
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.props.color).toBe('yellow')
    expect((await ui.find({ type: 'Text', text: /^91%$/ }))?.props.color).toBe('red')
    expect(await ui.find({ type: 'Text', text: /^58%$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('before any usage is reported the row shows dashes', async ($, on) => {
  engine(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...HINT, surface })
    expect((await ui.find({ key: 'usage-row' }))?.text).toBe('ctx — · 5h — · 7d —')
    await ui.unmount()
  }
})

test('session start seeds the row from the current usage', async ($, on) => {
  engine(on)
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { window: 200_000, percent: 12 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30 }],
  } }))
  await $.session.start({ source: 'startup', cwd: '/' } as any)

  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await ui.find({ key: 'usage-row' }))?.text).toBe('ctx 12% · 5h 30% · 7d —')
})
