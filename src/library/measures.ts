import type { SetMeasure, SetRecord } from '../domain/types'

/**
 * Blank whatever the exercise is not measured in. Carries logged before seconds existed carry a
 * made up rep count, and a carry row shows no reps field, so an inherited rep count could never
 * be seen or cleared while still adding tonnage to every total.
 */
export function forMeasure(set: SetRecord, measure: SetMeasure): SetRecord {
  if (measure === 'reps') return { weight: set.weight, reps: set.reps, warmup: set.warmup }
  const cleaned: SetRecord = { weight: set.weight, reps: 0, warmup: set.warmup, seconds: set.seconds }
  return measure === 'carry' ? { ...cleaned, feet: set.feet } : cleaned
}

/** One set in the units its exercise is measured in, for the "last time" line and the history list. */
export function describeSet(s: SetRecord, measure: SetMeasure): string {
  if (measure === 'reps') return `${s.weight} x ${s.reps}`
  const parts = [s.seconds ? `${s.seconds}s` : '', s.feet ? `${s.feet} ft` : ''].filter((p) => p)
  const work = parts.join(' ') || '0s'
  return s.weight > 0 ? `${s.weight} lb ${work}` : work
}

/** Seconds as minutes and seconds once past a minute, for the weekly email. */
export function describeDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} seconds`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} minutes` : `${minutes} minutes ${seconds} seconds`
}
