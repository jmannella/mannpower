/**
 * Approximate strength standards for men, as multiples of body weight, at the estimated one-rep max.
 * Base rows describe lifters in their late twenties to thirties; an age factor scales them down.
 * Sources are the widely published community standards (Strength Level style); treat them as a rough
 * yardstick for "where am I versus my cohort", not a test.
 */
export type StrengthLevel = 'untrained' | 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite'

export const LEVELS: StrengthLevel[] = ['untrained', 'beginner', 'novice', 'intermediate', 'advanced', 'elite']

export interface MainLift {
  key: 'squat' | 'bench' | 'deadlift' | 'overhead' | 'row'
  label: string
  /** Exercise ids that count; the best across them is used. */
  exerciseIds: string[]
  /** Body weight multiples for beginner, novice, intermediate, advanced, elite. */
  thresholds: [number, number, number, number, number]
}

export const MAIN_LIFTS: MainLift[] = [
  { key: 'squat', label: 'Squat', exerciseIds: ['back-squat', 'front-squat', 'box-squat', 'smith-machine-squat'], thresholds: [0.75, 1.25, 1.5, 2.25, 2.75] },
  { key: 'bench', label: 'Bench press', exerciseIds: ['barbell-bench-press', 'smith-machine-bench-press'], thresholds: [0.5, 0.75, 1.25, 1.75, 2.0] },
  { key: 'deadlift', label: 'Deadlift', exerciseIds: ['deadlift', 'trap-bar-deadlift', 'sumo-deadlift'], thresholds: [1.0, 1.5, 2.0, 2.5, 3.0] },
  { key: 'overhead', label: 'Overhead press', exerciseIds: ['overhead-press', 'push-press'], thresholds: [0.35, 0.55, 0.8, 1.05, 1.35] },
  // Rows are not a competition lift; these thresholds are looser folk standards than the four above.
  { key: 'row', label: 'Barbell row', exerciseIds: ['barbell-row', 'pendlay-row'], thresholds: [0.5, 0.75, 1.0, 1.5, 1.75] },
]

/** Scale applied to the base thresholds for a given age. */
export function ageFactor(age: number): number {
  if (age < 40) return 1.0
  if (age < 45) return 0.95
  if (age < 50) return 0.9
  if (age < 55) return 0.85
  if (age < 60) return 0.8
  if (age < 65) return 0.75
  return 0.7
}

export function ageBand(age: number): string {
  if (age < 40) return 'under 40'
  const lo = Math.floor(age / 5) * 5
  return `${lo} to ${lo + 4}`
}

export interface LevelResult {
  level: StrengthLevel
  /** Body weight multiple achieved. */
  ratio: number
  /** Next level name and the e1RM (lb) needed to reach it, absent at elite. */
  next?: { level: StrengthLevel; e1rm: number }
}

/** Classify an e1RM against the age-adjusted thresholds for a lift. */
export function classifyLift(lift: MainLift, e1rm: number, bodyWeight: number, age: number): LevelResult {
  const factor = ageFactor(age)
  const ratio = e1rm / bodyWeight
  const scaled = lift.thresholds.map((t) => t * factor)
  let idx = 0
  for (let i = 0; i < scaled.length; i++) if (ratio >= scaled[i]) idx = i + 1
  const level = LEVELS[idx]
  // Rounded to 5 lb: these are rough yardsticks, not a test to pass by the pound.
  const next = idx < scaled.length ? { level: LEVELS[idx + 1], e1rm: Math.round((scaled[idx] * bodyWeight) / 5) * 5 } : undefined
  return { level, ratio, next }
}
