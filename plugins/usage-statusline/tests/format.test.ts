import { describe, expect, test } from 'claude-code/testing'

import { formatUsage } from '../hooks/format'
import type { LocalTime, Segment, UsageSnapshot } from '../hooks/format'

const NOW = Date.parse('2026-10-16T12:00:00Z') // Fri
const R5 = '2026-10-16T16:45:00Z' // same day
const R7 = '2026-10-19T09:00:00Z' // Mon

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local time at a fixed offset from UTC, in minutes.
const offset =
  (minutes: number): LocalTime =>
  ms => {
    const d = new Date(ms + minutes * 60_000)
    const iso = d.toISOString()
    return { date: iso.slice(0, 10), hm: iso.slice(11, 16), weekday: WEEKDAYS[d.getUTCDay()]! }
  }
const UTC = offset(0)

const line = (s: Segment[]) => s.map(x => x.text).join('')
const colored = (s: Segment[]) => s.filter(x => x.color).map(x => `${x.text}:${x.color}`)

const snap = (ctx: number | null, h5?: number, d7?: number): UsageSnapshot => ({
  contextPercent: ctx,
  limits: [
    ...(h5 === undefined ? [] : [{ kind: 'five_hour', percentUsed: h5, resetsAt: R5 }]),
    ...(d7 === undefined ? [] : [{ kind: 'seven_day', percentUsed: d7, resetsAt: R7 }]),
  ],
})

describe('formatUsage', () => {
  test('full data', () => {
    const s = formatUsage(snap(42, 31, 58), NOW, UTC)
    expect(line(s)).toBe('ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)')
    expect(colored(s)).toEqual(['42%:yellow'])
  })

  test('nothing reported yet', () => {
    const s = formatUsage({ contextPercent: null, limits: [] }, NOW, UTC)
    expect(line(s)).toBe('ctx — · 5h — · 7d —')
    expect(colored(s)).toEqual([])
  })

  test('one window, no reset time', () => {
    const s = formatUsage(
      { contextPercent: 20, limits: [{ kind: 'seven_day', percentUsed: 58 }] },
      NOW,
      UTC,
    )
    expect(line(s)).toBe('ctx 20% · 5h — · 7d 58%')
  })

  test('boundaries: 34 gray, 74 gray, 75 yellow', () => {
    expect(colored(formatUsage(snap(34, 74, 75), NOW, UTC))).toEqual(['75%:yellow'])
  })

  test('boundaries: 35 yellow, 89 yellow, 90 red', () => {
    expect(colored(formatUsage(snap(35, 89, 90), NOW, UTC))).toEqual([
      '35%:yellow',
      '89%:yellow',
      '90%:red',
    ])
  })

  test('boundaries: 49 yellow, 100 red, 0 gray', () => {
    expect(colored(formatUsage(snap(49, 100, 0), NOW, UTC))).toEqual(['49%:yellow', '100%:red'])
  })

  test('colors follow the rounded value', () => {
    const s = formatUsage(snap(50, 89.6, 74.4), NOW, UTC)
    expect(line(s)).toBe('ctx 50% · 5h 90% (16:45) · 7d 74% (Mon 09:00)')
    expect(colored(s)).toEqual(['50%:red', '90%:red'])
  })

  test('other windows such as spend_limit are ignored', () => {
    const u = snap(42, 31, 58)
    const s = formatUsage(
      { ...u, limits: [{ kind: 'spend_limit', percentUsed: 99 }, ...u.limits] },
      NOW,
      UTC,
    )
    expect(line(s)).toBe('ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)')
  })

  test('reset times use the local clock and local date', () => {
    // UTC-4: now is 08:00 Fri local.
    expect(line(formatUsage(snap(42, 31, 58), NOW, offset(-240)))).toBe(
      'ctx 42% · 5h 31% (12:45) · 7d 58% (Mon 05:00)',
    )
    // UTC+13: now is 01:00 Sat local; the 5h reset (05:45 Sat) is today.
    expect(line(formatUsage(snap(42, 31, 58), NOW, offset(780)))).toBe(
      'ctx 42% · 5h 31% (05:45) · 7d 58% (Mon 22:00)',
    )
  })

  test('default local time formats HH:MM', () => {
    expect(line(formatUsage(snap(42, 31), NOW))).toMatch(/5h 31% \((\w{3} )?\d\d:\d\d\)/)
  })
})
