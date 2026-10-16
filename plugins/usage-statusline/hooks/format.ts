// Turns a usage snapshot into the row's text segments:
//   ctx 42% · 5h 31% (16:45) · 7d 58% (Mon 09:00)
// Only a percentage over its threshold carries a color; the rest is drawn gray.

export type UsageLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type UsageSnapshot = {
  contextPercent: number | null
  limits: UsageLimit[]
}

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

function limit(label: string, l: UsageLimit | undefined, nowMs: number, local: LocalTime): Segment[] {
  if (!l) return [{ text: `${label} ` }, { text: '—' }]
  return [{ text: `${label} ` }, percent(l.percentUsed, 75, 90), { text: reset(l.resetsAt, nowMs, local) }]
}

export function formatUsage(
  u: UsageSnapshot,
  nowMs: number,
  local: LocalTime = systemLocalTime,
): Segment[] {
  const find = (kind: string) => u.limits.find(l => l.kind === kind)
  const segments: Segment[] = [
    { text: 'ctx ' },
    percent(u.contextPercent, 35, 50),
    { text: ' · ' },
    ...limit('5h', find('five_hour'), nowMs, local),
    { text: ' · ' },
    ...limit('7d', find('seven_day'), nowMs, local),
  ]
  return segments.filter(s => s.text !== '')
}
