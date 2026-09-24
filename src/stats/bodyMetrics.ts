import type { DayRecord, Sex, SyncedSettings } from '../domain/types'
import { addDays } from '../domain/dates'

/** Waist to height at or above this is the point the marker calls raised. */
export const WAIST_HEIGHT_MARKER = 0.5
/** Waist to hip markers, above which the marker calls it raised. */
export const WAIST_HIP_MARKERS: Record<Sex, number> = { male: 0.9, female: 0.85 }
/** A tape estimate outside this range is a mistyped measurement, not a body. */
const PLAUSIBLE_BODY_FAT = { min: 3, max: 60 }

export interface NavyInput {
  waist?: number
  neck?: number
  /** Only the female formula uses it. */
  hip?: number
  heightInches?: number
  sex?: Sex
}

/**
 * US Navy circumference body fat estimate, in percent, from inches.
 * The male formula measures the waist at the navel, which is the site this app already uses.
 * Returns undefined rather than a guess whenever an input is missing or the result is implausible.
 */
export function navyBodyFat({ waist, neck, hip, heightInches, sex }: NavyInput): number | undefined {
  if (waist === undefined || neck === undefined || heightInches === undefined || sex === undefined) return undefined
  if (heightInches <= 0) return undefined

  let pct: number
  if (sex === 'male') {
    const girth = waist - neck
    if (girth <= 0) return undefined
    pct = 86.010 * Math.log10(girth) - 70.041 * Math.log10(heightInches) + 36.76
  } else {
    if (hip === undefined) return undefined
    const girth = waist + hip - neck
    if (girth <= 0) return undefined
    pct = 163.205 * Math.log10(girth) - 97.684 * Math.log10(heightInches) - 78.387
  }
  if (!Number.isFinite(pct) || pct < PLAUSIBLE_BODY_FAT.min || pct > PLAUSIBLE_BODY_FAT.max) return undefined
  return pct
}

export interface Reading { date: string; value: number }

export interface BodyMetrics {
  waist?: Reading
  neck?: Reading
  hip?: Reading
  /** Waist divided by height. Needs a height in Settings. */
  waistToHeight?: number
  waistToHeightOver?: boolean
  waistToHip?: number
  /** The marker used, which depends on sex. */
  waistToHipThreshold?: number
  waistToHipOver?: boolean
  bodyFatPct?: number
  /** The same estimate from the measurements standing four weeks before the week end. */
  bodyFatPct4wAgo?: number
  /** False when not one of the three sites has ever been measured. */
  anything: boolean
  /** Whether Settings carries the height the estimate and the height ratio both need. */
  heightSet: boolean
  /** Whether the estimate's formula used the hip. Only the female one does. */
  bodyFatUsedHip: boolean
}

type Site = 'waist' | 'neck' | 'hip'

/** The most recent reading for a site on or before a date. Each site is read on its own. */
function latest(days: DayRecord[], site: Site, onOrBefore: string): Reading | undefined {
  const past = days
    .filter((d) => d[site] !== undefined && d.date <= onOrBefore)
    .sort((a, b) => a.date.localeCompare(b.date))
  const last = past[past.length - 1]
  return last ? { date: last.date, value: last[site] as number } : undefined
}

export function bodyMetrics(days: DayRecord[], settings: SyncedSettings, end: string): BodyMetrics {
  const waist = latest(days, 'waist', end)
  const neck = latest(days, 'neck', end)
  const hip = latest(days, 'hip', end)
  const height = settings.heightInches
  const sex = settings.sex

  const out: BodyMetrics = {
    waist, neck, hip,
    anything: waist !== undefined || neck !== undefined || hip !== undefined,
    heightSet: height !== undefined && height > 0,
    bodyFatUsedHip: sex === 'female',
  }

  if (waist && height !== undefined && height > 0) {
    out.waistToHeight = waist.value / height
    out.waistToHeightOver = out.waistToHeight >= WAIST_HEIGHT_MARKER
  }
  if (waist && hip && hip.value > 0) {
    out.waistToHip = waist.value / hip.value
    if (sex !== undefined) {
      out.waistToHipThreshold = WAIST_HIP_MARKERS[sex]
      out.waistToHipOver = out.waistToHip > WAIST_HIP_MARKERS[sex]
    }
  }

  out.bodyFatPct = navyBodyFat({ waist: waist?.value, neck: neck?.value, hip: hip?.value, heightInches: height, sex })

  const then = addDays(end, -28)
  out.bodyFatPct4wAgo = navyBodyFat({
    waist: latest(days, 'waist', then)?.value,
    neck: latest(days, 'neck', then)?.value,
    hip: latest(days, 'hip', then)?.value,
    heightInches: height,
    sex,
  })

  return out
}
