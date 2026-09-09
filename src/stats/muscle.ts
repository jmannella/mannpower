import { MUSCLE_GROUPS, type Exercise, type MuscleGroup, type Workout } from '../domain/types'
import { addDays, inRange, weekEnd } from '../domain/dates'
import { setVolume, workingSets } from './sets'

export type GroupLoad = Record<MuscleGroup, { sets: number; volume: number }>

export function emptyLoad(): GroupLoad {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { sets: 0, volume: 0 }])) as GroupLoad
}

function addTo(load: GroupLoad, w: Workout, exMap: Map<string, Exercise>): void {
  for (const entry of w.entries) {
    const ex = exMap.get(entry.exerciseId)
    if (!ex) continue
    for (const s of workingSets(entry)) {
      const v = setVolume(s)
      load[ex.primary].sets += 1
      load[ex.primary].volume += v
      for (const g of ex.secondary) {
        load[g].sets += 0.5
        load[g].volume += v / 2
      }
    }
  }
}

export function workoutMuscleLoad(w: Workout, exMap: Map<string, Exercise>): GroupLoad {
  const load = emptyLoad()
  addTo(load, w, exMap)
  return load
}

export function muscleLoadForRange(workouts: Workout[], exMap: Map<string, Exercise>, from: string, to: string): GroupLoad {
  const load = emptyLoad()
  for (const w of workouts) if (inRange(w.date, from, to)) addTo(load, w, exMap)
  return load
}

export function weeklyMuscleLoad(workouts: Workout[], exMap: Map<string, Exercise>, weekStartDate: string): GroupLoad {
  return muscleLoadForRange(workouts, exMap, weekStartDate, weekEnd(weekStartDate))
}

export const MIN_WEEKLY_SETS = 10

/** Groups with fewer than 10 weighted sets this week that were trained at all in the trailing four weeks. */
export function underTrainedGroups(workouts: Workout[], exMap: Map<string, Exercise>, weekStartDate: string): MuscleGroup[] {
  const thisWeek = weeklyMuscleLoad(workouts, exMap, weekStartDate)
  const trailing = muscleLoadForRange(workouts, exMap, addDays(weekStartDate, -21), weekEnd(weekStartDate))
  return MUSCLE_GROUPS.filter((g) => trailing[g].sets > 0 && thisWeek[g].sets < MIN_WEEKLY_SETS)
}

export function weeklyMuscleSeries(
  workouts: Workout[], exMap: Map<string, Exercise>, fromWeekStart: string, toWeekStart: string,
): { week: string; load: GroupLoad }[] {
  const out: { week: string; load: GroupLoad }[] = []
  let week = fromWeekStart
  while (week <= toWeekStart) {
    out.push({ week, load: weeklyMuscleLoad(workouts, exMap, week) })
    week = addDays(week, 7)
  }
  return out
}
