import type { DayRecord, Supplement } from '../domain/types'
import { addDays, eachDay } from '../domain/dates'

export interface SupplementAdherence {
  id: string
  name: string
  /** Days ticked inside the eligible window. */
  taken: number
  /** Days in the week that this supplement existed for. */
  eligibleDays: number
  /** taken over eligibleDays as a percentage. Zero when nothing is eligible. */
  pct: number
  /** Consecutive days ticked ending at the week's last day. Reaches back before the week. */
  streak: number
}

export function supplementAdherence(
  days: DayRecord[], supplements: Supplement[], start: string, end: string,
): SupplementAdherence[] {
  const taken = new Map(days.map((d) => [d.date, new Set(d.supplementsTaken ?? [])]))
  const was = (date: string, id: string) => taken.get(date)?.has(id) ?? false

  return supplements.filter((s) => s.active).map((s) => {
    const from = s.addedOn && s.addedOn > start ? s.addedOn : start
    const window = from > end ? [] : eachDay(from, end)
    const hit = window.filter((d) => was(d, s.id)).length

    let streak = 0
    for (let d = end; ; d = addDays(d, -1)) {
      if (!was(d, s.id)) break
      streak += 1
      if (streak > 3650) break
    }

    return {
      id: s.id,
      name: s.name,
      taken: hit,
      eligibleDays: window.length,
      pct: window.length === 0 ? 0 : (hit / window.length) * 100,
      streak,
    }
  })
}
