// Turns a usage snapshot and the last cache reading into the row's segments:
//   ctx 42% · cache 96% +6k · 5h 31% (16:45) · 7d 58% (Mon 09:00)
// Only a percentage past its threshold carries a color; the rest is drawn gray.

import type { CacheReading, UsageLimit, UsageSnapshot } from '../types'

export type { CacheReading, UsageLimit, UsageSnapshot }

export type Segment = { text: string; color?: 'yellow' | 'red' }

/** A moment in local time: `date` YYYY-MM-DD, `hm` HH:MM, `weekday` Mon. */
export type LocalTime = (ms: number) => { date: string; hm: string; weekday: string }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')

export const systemLocalTime: LocalTime = ms => {
  const d = new Date(ms)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    weekday: WEEKDAYS[d.getDay()]!,
  }
}

function percent(value: number | null | undefined, warn: number, crit: number): Segment {
  if (value === null || value === undefined) return { text: '—' }
  const r = Math.round(value)
  const color = r >= crit ? 'red' : r >= warn ? 'yellow' : undefined
  return color ? { text: `${r}%`, color } : { text: `${r}%` }
}

function reset(resetsAt: string | undefined, nowMs: number, local: LocalTime): string {
  const ms = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(ms)) return ''
  const at = local(ms)
  return at.date === local(nowMs).date ? ` (${at.hm})` : ` (${at.weekday} ${at.hm})`
}

const tokens = (n: number) => (n < 1000 ? String(n) : `${Math.round(n / 1000)}k`)

// The cache hit rate is good when high: gray from 80, yellow from 50, else red,
// unless the turn was cold by design.
function cache(c: CacheReading | null): Segment[] {
  const total = c === null ? 0 : c.read + c.written + c.uncached
  if (c === null || total === 0) return [{ text: 'cache ' }, { text: '—' }]
  const r = Math.round((c.read / total) * 100)
  const color = c.expectedCold ? undefined : r < 50 ? 'red' : r < 80 ? 'yellow' : undefined
  return [
    { text: 'cache ' },
    color ? { text: `${r}%`, color } : { text: `${r}%` },
    { text: c.written > 0 ? ` +${tokens(c.written)}` : '' },
  ]
}

/** Whether the window's reset time has passed: its figure no longer holds. */
export function isExpired(l: UsageLimit, nowMs: number): boolean {
  const ms = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)
  return !Number.isNaN(ms) && ms <= nowMs
}

function limit(label: string, l: UsageLimit | undefined, nowMs: number, local: LocalTime): Segment[] {
  if (!l || isExpired(l, nowMs)) return [{ text: `${label} ` }, { text: '—' }]
  return [{ text: `${label} ` }, percent(l.percentUsed, 75, 90), { text: reset(l.resetsAt, nowMs, local) }]
}

export function formatUsage(
  u: UsageSnapshot,
  c: CacheReading | null,
  nowMs: number,
  local: LocalTime = systemLocalTime,
): Segment[] {
  const find = (kind: string) => u.limits.find(l => l.kind === kind)
  const segments: Segment[] = [
    { text: 'ctx ' },
    percent(u.contextPercent, 35, 50),
    { text: ' · ' },
    ...cache(c),
    { text: ' · ' },
    ...limit('5h', find('five_hour'), nowMs, local),
    { text: ' · ' },
    ...limit('7d', find('seven_day'), nowMs, local),
  ]
  return segments.filter(s => s.text !== '')
}
