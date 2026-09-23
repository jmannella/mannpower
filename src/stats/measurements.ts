import type { DayRecord } from '../domain/types'
import { addDays, daysBetween, inRange } from '../domain/dates'
import { bodyWeightAvg7 } from './bodyweight'

/** Weight has to move this much over four weeks before it counts as a direction. */
const WEIGHT_BAND_LBS = 2
/** Waist has to move this much over four weeks before it counts as a direction. */
const WAIST_BAND_IN = 0.25
/** Days between waist measurements before the check in card asks again. */
export const WAIST_INTERVAL_DAYS = 7

export type RecompSignal = 'fat_loss' | 'recomposition' | 'gaining_mass' | 'surplus_too_large' | 'flat' | 'unclear'

export const RECOMP_LABELS: Record<RecompSignal, string> = {
  fat_loss: 'fat loss, working',
  recomposition: 'recomposition, weight holding while the waist comes in',
  gaining_mass: 'gaining mass without the waist following',
  surplus_too_large: 'surplus running too large',
  flat: 'flat, nothing moving either way',
  unclear: 'not enough measurements to read',
}

export interface WaistTrend {
  latest?: { date: string; waist: number }
  /** Measurements inside the trailing four weeks. */
  measurements4w: number
  /** Inches, negative is smaller. Undefined under three measurements in the window. */
  change4w?: number
  change12w?: number
  /** Pounds, from the 7 day average weight four weeks apart. */
  weightChange4wLbs?: number
  signal: RecompSignal
}

interface Point { date: string; waist: number }

function points(days: DayRecord[], from: string, to: string): Point[] {
  return days
    .filter((d) => d.waist !== undefined && inRange(d.date, from, to))
    .map((d) => ({ date: d.date, waist: d.waist as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** True when the check in card should ask for a waist measurement on this date. */
export function needsWaist(days: DayRecord[], date: string): boolean {
  const past = days.filter((d) => d.waist !== undefined && d.date <= date).sort((a, b) => a.date.localeCompare(b.date))
  const last = past[past.length - 1]
  if (!last) return true
  return daysBetween(last.date, date) >= WAIST_INTERVAL_DAYS
}

function change(list: Point[]): number | undefined {
  if (list.length < 3) return undefined
  return list[list.length - 1].waist - list[0].waist
}

function signalFor(weight: number | undefined, waist: number | undefined): RecompSignal {
  if (weight === undefined || waist === undefined) return 'unclear'
  const w = weight <= -WEIGHT_BAND_LBS ? 'down' : weight >= WEIGHT_BAND_LBS ? 'up' : 'flat'
  const s = waist <= -WAIST_BAND_IN ? 'down' : waist >= WAIST_BAND_IN ? 'up' : 'flat'
  if (w === 'down' && s === 'down') return 'fat_loss'
  if (w === 'flat' && s === 'down') return 'recomposition'
  if (w === 'up' && s === 'flat') return 'gaining_mass'
  if (w === 'up' && s === 'up') return 'surplus_too_large'
  if (w === 'flat' && s === 'flat') return 'flat'
  return 'unclear'
}

export function waistTrend(days: DayRecord[], end: string): WaistTrend {
  const all = points(days, '0000-01-01', end)
  const last = all[all.length - 1]
  const window4w = points(days, addDays(end, -28), end)
  const window12w = points(days, addDays(end, -84), end)

  const now = bodyWeightAvg7(days, end)
  const then = bodyWeightAvg7(days, addDays(end, -28))
  const weightChange4wLbs = now !== undefined && then !== undefined ? now - then : undefined

  const change4w = change(window4w)
  return {
    latest: last ? { date: last.date, waist: last.waist } : undefined,
    measurements4w: window4w.length,
    change4w,
    change12w: change(window12w),
    weightChange4wLbs,
    signal: signalFor(weightChange4wLbs, change4w),
  }
}
