import type { Exercise, Workout } from '../domain/types'
import { suggestedIncrement } from '../library/exercises'
import { normalizeVariation } from '../library/variations'
import { exerciseHistory } from './prs'

export interface StalledLift {
  exerciseId: string
  /** Normalized variation, '' for the plain lift. */
  variation: string
  topWeight: number
  increment: 5 | 10
  lastDate: string
}

/**
 * An exercise is stalled when its last two sessions used the same top working weight
 * and every working set in the latest session matched or beat the previous session's reps.
 * Only exercises whose latest session is on or after `since` are considered.
 */
export function stalledLifts(workouts: Workout[], exMap: Map<string, Exercise>, since: string): StalledLift[] {
  // One entry per variant: the plain lift and each tagged variation stall independently.
  const variants = new Map<string, { id: string; variation: string }>()
  for (const w of workouts) for (const e of w.entries) {
    const variation = normalizeVariation(e.variation)
    variants.set(`${e.exerciseId}|${variation}`, { id: e.exerciseId, variation })
  }
  const out: StalledLift[] = []
  for (const { id, variation } of variants.values()) {
    const ex = exMap.get(id)
    if (!ex) continue
    const history = exerciseHistory(workouts, id, variation)
    if (history.length < 2) continue
    const last = history[history.length - 1]
    const prev = history[history.length - 2]
    if (last.date < since) continue
    if (last.topWeight !== prev.topWeight || last.topWeight <= 0) continue
    if (last.sets.length < prev.sets.length) continue
    const held = prev.sets.every((p, i) => last.sets[i].reps >= p.reps)
    if (!held) continue
    out.push({ exerciseId: id, variation, topWeight: last.topWeight, increment: suggestedIncrement(ex), lastDate: last.date })
  }
  return out.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.variation.localeCompare(b.variation))
}
