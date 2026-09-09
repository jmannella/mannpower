import type { DayRecord } from '../domain/types'
import { addDays, eachDay, inRange, weekEnd } from '../domain/dates'

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((a, b) => a + b, 0) / values.length
}

function weightsIn(days: DayRecord[], from: string, to: string): number[] {
  return days.filter((d) => d.bodyWeight !== undefined && inRange(d.date, from, to)).map((d) => d.bodyWeight as number)
}

export function bodyWeightAvg7(days: DayRecord[], date: string): number | undefined {
  return mean(weightsIn(days, addDays(date, -6), date))
}

export interface WeeklyWeightChange {
  thisWeek?: number
  lastWeek?: number
  changeLbs?: number
  changePct?: number
}

export function weeklyBodyWeightChange(days: DayRecord[], weekStartDate: string): WeeklyWeightChange {
  const thisWeek = mean(weightsIn(days, weekStartDate, weekEnd(weekStartDate)))
  const lastWeek = mean(weightsIn(days, addDays(weekStartDate, -7), addDays(weekStartDate, -1)))
  const out: WeeklyWeightChange = {}
  if (thisWeek !== undefined) out.thisWeek = thisWeek
  if (lastWeek !== undefined) out.lastWeek = lastWeek
  if (thisWeek !== undefined && lastWeek !== undefined) {
    out.changeLbs = thisWeek - lastWeek
    out.changePct = ((thisWeek - lastWeek) / lastWeek) * 100
  }
  return out
}

export type LossBand = 'in_band' | 'too_fast' | 'too_slow' | 'gaining' | 'unknown'

/** Healthy loss is 0.5 to 1.0 percent of body weight per week. Negative changePct means loss. */
export function lossBandStatus(changePct?: number): LossBand {
  if (changePct === undefined || Number.isNaN(changePct)) return 'unknown'
  if (changePct > 0) return 'gaining'
  if (changePct < -1.0) return 'too_fast'
  if (changePct <= -0.5) return 'in_band'
  return 'too_slow'
}

export function relativeStrength(e1rm: number, bodyWeight?: number): number | undefined {
  if (!bodyWeight || bodyWeight <= 0) return undefined
  return e1rm / bodyWeight
}

export function bodyWeightSeries(days: DayRecord[], from: string, to: string): { date: string; weight?: number; avg7?: number }[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return eachDay(from, to).map((date) => ({
    date,
    weight: byDate.get(date)?.bodyWeight,
    avg7: bodyWeightAvg7(days, date),
  }))
}

export function latestBodyWeight(days: DayRecord[]): { date: string; weight: number } | undefined {
  const withWeight = days.filter((d) => d.bodyWeight !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  const last = withWeight[withWeight.length - 1]
  return last ? { date: last.date, weight: last.bodyWeight as number } : undefined
}
