import type { DayRecord, Sex, SyncedSettings } from '../domain/types'
import { addDays, daysBetween } from '../domain/dates'

/** Waist to height at or above this is the point the marker calls raised. */
export const WAIST_HEIGHT_MARKER = 0.5
/** Waist to hip markers, above which the marker calls it raised. */
export const WAIST_HIP_MARKERS: Record<Sex, number> = { male: 0.9, female: 0.85 }
/** A tape estimate outside this range is a mistyped measurement, not a body. */
const PLAUSIBLE_BODY_FAT = { min: 3, max: 60 }
/** Two readings further apart than this were not taken together, so a ratio of them says so. */
export const PAIRING_GAP_DAYS = 35
/**
 * Ratios are compared at the same two decimals they are printed at, so the number and the
 * wording beside it can never disagree. The 0.005 this can shift a verdict by is far inside
 * the quarter inch a tape measure repeats to.
 */
const round2 = (x: number): number => Math.round(x * 100) / 100

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
  /** The same estimate from the measurements standing four weeks before the week end. Left out when
   *  those are the very same readings, since comparing a number against itself proves nothing. */
  bodyFatPct4wAgo?: number
  /** Why there is no estimate, so the email can say what to do rather than going quiet. */
  bodyFatMissing?: 'waist' | 'neck' | 'hip' | 'height' | 'sex' | 'sites' | 'implausible'
  /** Days between the waist and hip readings behind waistToHip, when they were not taken together. */
  waistToHipGapDays?: number
  /** False when not one of the three sites has ever been measured. */
  anything: boolean
  /** Whether Settings carries the height the estimate and the height ratio both need. */
  heightSet: boolean
  /** Whether the estimate's formula used the hip. Only the female one does. */
  bodyFatUsedHip: boolean
}

type Site = 'waist' | 'neck' | 'hip'

/** Which single thing stands between the readings and an estimate, so the email can name it. */
function whyNoBodyFat(
  waist: Reading | undefined, neck: Reading | undefined, hip: Reading | undefined,
  heightSet: boolean, sex: Sex | undefined,
): BodyMetrics['bodyFatMissing'] {
  if (!waist) return 'waist'
  if (!neck) return 'neck'
  if (!heightSet) return 'height'
  if (sex === undefined) return 'sex'
  if (sex === 'female' && !hip) return 'hip'
  const girth = sex === 'male' ? waist.value - neck.value : waist.value + (hip?.value ?? 0) - neck.value
  if (girth <= 0) return 'sites'
  return 'implausible'
}

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
    out.waistToHeight = round2(waist.value / height)
    out.waistToHeightOver = out.waistToHeight >= WAIST_HEIGHT_MARKER
  }
  if (waist && hip && hip.value > 0) {
    out.waistToHip = round2(waist.value / hip.value)
    const gap = daysBetween(waist.date < hip.date ? waist.date : hip.date, waist.date < hip.date ? hip.date : waist.date)
    if (gap > PAIRING_GAP_DAYS) out.waistToHipGapDays = gap
    if (sex !== undefined) {
      out.waistToHipThreshold = WAIST_HIP_MARKERS[sex]
      // The published cut points are inclusive, so a ratio sitting exactly on the marker is at it.
      out.waistToHipOver = out.waistToHip >= WAIST_HIP_MARKERS[sex]
    }
  }

  out.bodyFatPct = navyBodyFat({ waist: waist?.value, neck: neck?.value, hip: hip?.value, heightInches: height, sex })
  if (out.bodyFatPct === undefined) out.bodyFatMissing = whyNoBodyFat(waist, neck, hip, out.heightSet, sex)

  const then = addDays(end, -28)
  const thenWaist = latest(days, 'waist', then)
  const thenNeck = latest(days, 'neck', then)
  const thenHip = latest(days, 'hip', then)
  // Comparing an estimate against itself would read as holding steady when nothing was measured at all.
  const sameReadings = thenWaist?.date === waist?.date && thenNeck?.date === neck?.date && thenHip?.date === hip?.date
  if (!sameReadings) {
    out.bodyFatPct4wAgo = navyBodyFat({
      waist: thenWaist?.value, neck: thenNeck?.value, hip: thenHip?.value, heightInches: height, sex,
    })
  }

  return out
}
