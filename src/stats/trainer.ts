import type { Workout } from '../domain/types'
import { inRange } from '../domain/dates'
import { entryVolume, workoutVolume, workoutWorkingSetCount } from './sets'

export interface TrainerSplit {
  trainerCount: number
  soloCount: number
  trainerMeanVolume?: number
  soloMeanVolume?: number
  trainerMeanSets?: number
  soloMeanSets?: number
  /** Share of considered solo sessions whose shared-exercise volume was at least 90% of the last trainer session. */
  soloKeepingPaceShare?: number
  soloConsidered: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

export function trainerSplit(workouts: Workout[], from: string, to: string): TrainerSplit {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date))
  const inWindow = sorted.filter((w) => inRange(w.date, from, to))
  const trainer = inWindow.filter((w) => w.withTrainer)
  const solo = inWindow.filter((w) => !w.withTrainer)

  const out: TrainerSplit = { trainerCount: trainer.length, soloCount: solo.length, soloConsidered: 0 }
  const tv = mean(trainer.map(workoutVolume))
  const sv = mean(solo.map(workoutVolume))
  const ts = mean(trainer.map(workoutWorkingSetCount))
  const ss = mean(solo.map(workoutWorkingSetCount))
  if (tv !== undefined) out.trainerMeanVolume = tv
  if (sv !== undefined) out.soloMeanVolume = sv
  if (ts !== undefined) out.trainerMeanSets = ts
  if (ss !== undefined) out.soloMeanSets = ss

  let kept = 0
  for (const s of solo) {
    const lastTrainer = [...sorted].reverse().find((w) => w.withTrainer && w.date < s.date)
    if (!lastTrainer) continue
    const shared = new Set(lastTrainer.entries.map((e) => e.exerciseId))
    const soloShared = s.entries.filter((e) => shared.has(e.exerciseId))
    if (soloShared.length === 0) continue
    const soloIds = new Set(soloShared.map((e) => e.exerciseId))
    const trainerVol = lastTrainer.entries.filter((e) => soloIds.has(e.exerciseId)).reduce((sum, e) => sum + entryVolume(e), 0)
    if (trainerVol <= 0) continue
    const soloVol = soloShared.reduce((sum, e) => sum + entryVolume(e), 0)
    out.soloConsidered += 1
    if (soloVol / trainerVol >= 0.9) kept += 1
  }
  if (out.soloConsidered > 0) out.soloKeepingPaceShare = kept / out.soloConsidered
  return out
}
