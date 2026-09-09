import type { Exercise, SetRecord, Workout, WorkoutEntry } from '../domain/types'

/** Sets that count: not a warm-up and at least one rep. A freshly added 0 x 0 row is ignored until filled in. */
export function workingSets(entry: WorkoutEntry): SetRecord[] {
  return entry.sets.filter((s) => !s.warmup && s.reps > 0)
}

export function setVolume(s: SetRecord): number {
  return s.weight * s.reps
}

export function entryVolume(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((sum, s) => sum + setVolume(s), 0)
}

export function workoutVolume(w: Workout): number {
  return w.entries.reduce((sum, e) => sum + entryVolume(e), 0)
}

export function workoutWorkingSetCount(w: Workout): number {
  return w.entries.reduce((n, e) => n + workingSets(e).length, 0)
}

/** Epley estimated one-rep max. */
export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function entryE1rm(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((best, s) => Math.max(best, epley(s.weight, s.reps)), 0)
}

export function entryTopWeight(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((best, s) => Math.max(best, s.weight), 0)
}

export function exerciseMap(exercises: Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((e) => [e.id, e]))
}
