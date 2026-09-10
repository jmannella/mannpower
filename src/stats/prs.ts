import type { SetRecord, Workout } from '../domain/types'
import { normalizeVariation } from '../library/variations'
import { entryE1rm, entryTopWeight, entryVolume, workingSets } from './sets'

export interface ExerciseSession {
  date: string
  workoutId: string
  withTrainer: boolean
  /** The entry's variation as logged, undefined for the plain lift. */
  variation?: string
  sets: SetRecord[]
  bestE1rm: number
  topWeight: number
  volume: number
}

/**
 * Sessions for an exercise, oldest first. With `variation` given (normalized or not; '' means the plain lift)
 * only entries of that variant are returned; omit it for every variant.
 */
export function exerciseHistory(workouts: Workout[], exerciseId: string, variation?: string): ExerciseSession[] {
  const want = variation === undefined ? undefined : normalizeVariation(variation)
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue
      if (want !== undefined && normalizeVariation(e.variation) !== want) continue
      const sets = workingSets(e)
      if (sets.length === 0) continue
      out.push({
        date: w.date, workoutId: w.id, withTrainer: w.withTrainer, variation: e.variation, sets,
        bestE1rm: entryE1rm(e), topWeight: entryTopWeight(e), volume: entryVolume(e),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Best numbers strictly before `date` for one variant of an exercise ('' or omitted means the plain lift). */
export function bestBefore(workouts: Workout[], exerciseId: string, date: string, variation: string = ''): { e1rm: number; weight: number; sessions: number } {
  let e1rm = 0
  let weight = 0
  let sessions = 0
  for (const s of exerciseHistory(workouts, exerciseId, variation)) {
    if (s.date >= date) break
    sessions += 1
    e1rm = Math.max(e1rm, s.bestE1rm)
    weight = Math.max(weight, s.topWeight)
  }
  return { e1rm, weight, sessions }
}

export interface PR {
  exerciseId: string
  /** Normalized variation the PR belongs to, '' for the plain lift. */
  variation: string
  kind: 'e1rm' | 'weight'
  previous: number
  current: number
}

/** PRs set in this workout compared with every earlier workout. A first session is never a PR because there is nothing to beat. */
export function prsForWorkout(workouts: Workout[], workout: Workout): PR[] {
  const out: PR[] = []
  for (const e of workout.entries) {
    const variation = normalizeVariation(e.variation)
    const prior = bestBefore(workouts, e.exerciseId, workout.date, variation)
    if (prior.sessions === 0) continue
    const e1rm = entryE1rm(e)
    const top = entryTopWeight(e)
    if (e1rm > prior.e1rm) out.push({ exerciseId: e.exerciseId, variation, kind: 'e1rm', previous: prior.e1rm, current: e1rm })
    if (top > prior.weight) out.push({ exerciseId: e.exerciseId, variation, kind: 'weight', previous: prior.weight, current: top })
  }
  return out
}
