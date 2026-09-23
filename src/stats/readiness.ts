import type { DayRecord } from '../domain/types'
import { inRange } from '../domain/dates'

/** Below this, the morning counts as a low readiness day. */
const LOW = 60
/** A fall of this much from the previous recorded morning is worth naming. */
const DROP = 20

export interface ReadinessWeek {
  daysRecorded: number
  avg?: number
  /** Mornings under 60. */
  lowDays: number
  /** Falls of 20 or more from the previous recorded morning, which may sit before the week. */
  drops: { date: string; from: number; to: number }[]
}

export function readinessWeek(days: DayRecord[], start: string, end: string): ReadinessWeek {
  const all = days
    .filter((d) => d.readiness !== undefined && d.date <= end)
    .map((d) => ({ date: d.date, value: d.readiness as number }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const week = all.filter((d) => inRange(d.date, start, end))
  const drops: ReadinessWeek['drops'] = []
  for (let i = 1; i < all.length; i += 1) {
    const prev = all[i - 1]
    const cur = all[i]
    if (!inRange(cur.date, start, end)) continue
    if (prev.value - cur.value >= DROP) drops.push({ date: cur.date, from: prev.value, to: cur.value })
  }

  return {
    daysRecorded: week.length,
    avg: week.length === 0 ? undefined : week.reduce((s, d) => s + d.value, 0) / week.length,
    lowDays: week.filter((d) => d.value < LOW).length,
    drops,
  }
}
