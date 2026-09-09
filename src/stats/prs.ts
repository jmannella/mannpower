import type { SetRecord, Workout } from '../domain/types'
import { entryE1rm, entryTopWeight, entryVolume, workingSets } from './sets'

export interface ExerciseSession {
  date: string
  workoutId: string
  withTrainer: boolean
  sets: SetRecord[]
  bestE1rm: number
  topWeight: number
  volume: number
}

export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue
      const sets = workingSets(e)
      if (sets.length === 0) continue
      out.push({
        date: w.date, workoutId: w.id, withTrainer: w.withTrainer, sets,
        bestE1rm: entryE1rm(e), topWeight: entryTopWeight(e), volume: entryVolume(e),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function bestBefore(workouts: Workout[], exerciseId: string, date: string): { e1rm: number; weight: number } {
  let e1rm = 0
  let weight = 0
  for (const s of exerciseHistory(workouts, exerciseId)) {
    if (s.date >= date) break
    e1rm = Math.max(e1rm, s.bestE1rm)
    weight = Math.max(weight, s.topWeight)
  }
  return { e1rm, weight }
}

export interface PR {
  exerciseId: string
  kind: 'e1rm' | 'weight'
  previous: number
  current: number
}

/** PRs set in this workout compared with every earlier workout. A first session is never a PR. */
export function prsForWorkout(workouts: Workout[], workout: Workout): PR[] {
  const out: PR[] = []
  for (const e of workout.entries) {
    const prior = bestBefore(workouts, e.exerciseId, workout.date)
    if (prior.e1rm === 0) continue
    const e1rm = entryE1rm(e)
    const top = entryTopWeight(e)
    if (e1rm > prior.e1rm) out.push({ exerciseId: e.exerciseId, kind: 'e1rm', previous: prior.e1rm, current: e1rm })
    if (top > prior.weight) out.push({ exerciseId: e.exerciseId, kind: 'weight', previous: prior.weight, current: top })
  }
  return out
}
