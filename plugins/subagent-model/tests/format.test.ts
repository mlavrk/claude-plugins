import { describe, expect, test } from 'claude-code/testing'

import { effortText, family, tag } from '../hooks/format'

describe('family', () => {
  test('ids, aliases and provider ids', () => {
    expect(family('claude-sonnet-5-5')).toBe('sonnet')
    expect(family('opus')).toBe('opus')
    expect(family('us.anthropic.claude-haiku-5-5[1m]')).toBe('haiku')
    expect(family('CLAUDE-FABLE-5-1')).toBe('fable')
  })

  test('an unknown model keeps its id', () => {
    expect(family('claude-mystery-1')).toBe('mystery-1')
  })
})

describe('tag', () => {
  test('model and effort', () => {
    expect(tag('sonnet', 'high')).toBe('[Sonnet high]')
  })

  test('one of them', () => {
    expect(tag('opus')).toBe('[Opus]')
    expect(tag(undefined, 'low')).toBe('[low]')
  })

  test('neither', () => {
    expect(tag()).toBe('')
  })

  test('a budget effort', () => {
    expect(tag('opus', effortText(8000))).toBe('[Opus 8000]')
  })
})
