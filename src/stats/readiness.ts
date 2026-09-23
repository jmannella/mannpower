import type { DayRecord } from '../domain/types'
import { addDays, inRange } from '../domain/dates'

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
  const byDate = new Map(all.map((d) => [d.date, d.value]))
  const drops: ReadinessWeek['drops'] = []
  for (const cur of week) {
    const prevDate = addDays(cur.date, -1)
    const prevValue = byDate.get(prevDate)
    if (prevValue === undefined) continue
    if (prevValue - cur.value >= DROP) drops.push({ date: cur.date, from: prevValue, to: cur.value })
  }

  return {
    daysRecorded: week.length,
    avg: week.length === 0 ? undefined : week.reduce((s, d) => s + d.value, 0) / week.length,
    lowDays: week.filter((d) => d.value < LOW).length,
    drops,
  }
}
