import type { DayRecord } from '../domain/types'
import { addDays, inRange } from '../domain/dates'

/** Readings needed inside the 28 day window before anything is reported. */
const MIN_READINGS = 14
/** Beats above the baseline before the week is called elevated. */
const ELEVATED_DELTA = 5

export interface RestingHrTrend {
  /** Average over the seven days ending at `end`. */
  weekAvg?: number
  /** Average over the 28 days ending at `end`. */
  baselineAvg?: number
  readings28: number
  /** Week average minus baseline. Undefined until the window has enough readings. */
  delta?: number
  elevated: boolean
}

function readings(days: DayRecord[], from: string, to: string): number[] {
  return days.filter((d) => d.restingHr !== undefined && inRange(d.date, from, to)).map((d) => d.restingHr as number)
}

const mean = (xs: number[]): number | undefined => (xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length)

export function restingHrTrend(days: DayRecord[], end: string): RestingHrTrend {
  const window28 = readings(days, addDays(end, -27), end)
  const window7 = readings(days, addDays(end, -6), end)
  const weekAvg = mean(window7)
  const baselineAvg = mean(window28)

  if (window28.length < MIN_READINGS || weekAvg === undefined || baselineAvg === undefined) {
    return { weekAvg, baselineAvg, readings28: window28.length, delta: undefined, elevated: false }
  }
  const delta = weekAvg - baselineAvg
  return { weekAvg, baselineAvg, readings28: window28.length, delta, elevated: delta >= ELEVATED_DELTA }
}
