import { describe, expect, test } from 'claude-code/testing'

import { formatUsage } from '../hooks/format'
import type { CacheReading, LocalTime, Segment, UsageSnapshot } from '../hooks/format'

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
    const s = formatUsage(snap(42, 31, 58), null, NOW, UTC)
    expect(line(s)).toBe('ctx 42% · cache — · 5h 31% (16:45) · 7d 58% (Mon 09:00)')
    expect(colored(s)).toEqual(['42%:yellow'])
  })

  test('nothing reported yet', () => {
    const s = formatUsage({ contextPercent: null, limits: [] }, null, NOW, UTC)
    expect(line(s)).toBe('ctx — · cache — · 5h — · 7d —')
    expect(colored(s)).toEqual([])
  })

  test('one window, no reset time', () => {
    const s = formatUsage(
      { contextPercent: 20, limits: [{ kind: 'seven_day', percentUsed: 58 }] },
      null,
      NOW,
      UTC,
    )
    expect(line(s)).toBe('ctx 20% · cache — · 5h — · 7d 58%')
  })

  test('boundaries: 34 gray, 74 gray, 75 yellow', () => {
    expect(colored(formatUsage(snap(34, 74, 75), null, NOW, UTC))).toEqual(['75%:yellow'])
  })

  test('boundaries: 35 yellow, 89 yellow, 90 red', () => {
    expect(colored(formatUsage(snap(35, 89, 90), null, NOW, UTC))).toEqual([
      '35%:yellow',
      '89%:yellow',
      '90%:red',
    ])
  })

  test('boundaries: 49 yellow, 100 red, 0 gray', () => {
    expect(colored(formatUsage(snap(49, 100, 0), null, NOW, UTC))).toEqual(['49%:yellow', '100%:red'])
  })

  test('colors follow the rounded value', () => {
    const s = formatUsage(snap(50, 89.6, 74.4), null, NOW, UTC)
    expect(line(s)).toBe('ctx 50% · cache — · 5h 90% (16:45) · 7d 74% (Mon 09:00)')
    expect(colored(s)).toEqual(['50%:red', '90%:red'])
  })

  test('other windows such as spend_limit are ignored', () => {
    const u = snap(42, 31, 58)
    const s = formatUsage(
      { ...u, limits: [{ kind: 'spend_limit', percentUsed: 99 }, ...u.limits] },
      null,
      NOW,
      UTC,
    )
    expect(line(s)).toBe('ctx 42% · cache — · 5h 31% (16:45) · 7d 58% (Mon 09:00)')
  })

  test('reset times use the local clock and local date', () => {
    // UTC-4: now is 08:00 Fri local.
    expect(line(formatUsage(snap(42, 31, 58), null, NOW, offset(-240)))).toBe(
      'ctx 42% · cache — · 5h 31% (12:45) · 7d 58% (Mon 05:00)',
    )
    // UTC+13: now is 01:00 Sat local; the 5h reset (05:45 Sat) is today.
    expect(line(formatUsage(snap(42, 31, 58), null, NOW, offset(780)))).toBe(
      'ctx 42% · cache — · 5h 31% (05:45) · 7d 58% (Mon 22:00)',
    )
  })

  test('a window whose reset time has passed shows a dash', () => {
    const later = Date.parse('2026-10-17T00:00:00Z') // past R5, before R7
    expect(line(formatUsage(snap(42, 91, 58), null, later, UTC))).toBe('ctx 42% · cache — · 5h — · 7d 58% (Mon 09:00)')
  })

  test('default local time formats HH:MM', () => {
    expect(line(formatUsage(snap(42, 31), null, NOW))).toMatch(/5h 31% \((\w{3} )?\d\d:\d\d\)/)
  })
})

// A reading whose hit rate is `hit` percent of 100,000 input tokens.
const reading = (hit: number, written: number, expectedCold = false): CacheReading => ({
  read: hit * 1000,
  written,
  uncached: (100 - hit) * 1000 - written,
  expectedCold,
})
const cacheOf = (c: CacheReading | null) => {
  const s = formatUsage(snap(10), c, NOW, UTC)
  return { text: line(s).split(' · ')[1], colored: colored(s) }
}

describe('cache segment', () => {
  test('sits after context, with the tokens written', () => {
    expect(line(formatUsage(snap(42, 31, 58), reading(96, 6_400), NOW, UTC))).toBe(
      'ctx 42% · cache 96% +6k · 5h 31% (16:45) · 7d 58% (Mon 09:00)',
    )
  })

  test('tokens written: none, under a thousand, thousands', () => {
    expect(cacheOf(reading(100, 0)).text).toBe('cache 100%')
    expect(cacheOf(reading(97, 840)).text).toBe('cache 97% +840')
    expect(cacheOf(reading(5, 94_500)).text).toBe('cache 5% +95k')
  })

  test('no reading, or one with no tokens, shows a dash', () => {
    expect(cacheOf(null)).toEqual({ text: 'cache —', colored: [] })
    expect(cacheOf({ read: 0, written: 0, uncached: 0, expectedCold: false }).text).toBe('cache —')
  })

  test('boundaries: 80 gray, 79 yellow, 50 yellow, 49 red', () => {
    expect(cacheOf(reading(80, 0)).colored).toEqual([])
    expect(cacheOf(reading(79, 0)).colored).toEqual(['79%:yellow'])
    expect(cacheOf(reading(50, 0)).colored).toEqual(['50%:yellow'])
    expect(cacheOf(reading(49, 0)).colored).toEqual(['49%:red'])
  })

  test('colors follow the rounded value', () => {
    const c = (read: number) => ({ read, written: 0, uncached: 1000 - read, expectedCold: false })
    expect(cacheOf(c(796))).toEqual({ text: 'cache 80%', colored: [] })
    expect(cacheOf(c(494))).toEqual({ text: 'cache 49%', colored: ['49%:red'] })
  })

  test('a turn cold by design stays gray', () => {
    expect(cacheOf(reading(3, 97_000, true))).toEqual({ text: 'cache 3% +97k', colored: [] })
  })
})
