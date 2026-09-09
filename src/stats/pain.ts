import type { BodyArea, PainEntry, Workout } from '../domain/types'
import { addDays, daysBetween, weekEnd, weekStart, inRange } from '../domain/dates'
import { workoutVolume } from './sets'

export function flareRate(workouts: Workout[], pain: PainEntry[], exerciseId: string): { rate: number; flares: number; sessions: number } {
  const sessions = workouts.filter((w) => w.entries.some((e) => e.exerciseId === exerciseId))
  const flares = sessions.filter((w) =>
    pain.some((p) => p.exerciseId === exerciseId && (p.workoutId === w.id || p.date === w.date)),
  ).length
  return { rate: sessions.length ? flares / sessions.length : 0, flares, sessions: sessions.length }
}

export interface ExerciseCoOccurrence {
  exerciseId: string
  count: number
  /** Share of this area's workout-day pain entries whose workout included the exercise. */
  coRate: number
  /** Share of all workouts that include the exercise. */
  baseRate: number
}

export interface AreaPattern {
  area: BodyArea
  count: number
  limitedCount: number
  lastDate: string
  daysSinceLast: number
  severityTrend: 'up' | 'down' | 'flat' | 'n/a'
  /** Entries that fell in a week whose volume was more than 20% above the previous week. */
  afterVolumeSpike: number
  exercises: ExerciseCoOccurrence[]
}

function workoutFor(entry: PainEntry, workouts: Workout[]): Workout | undefined {
  if (entry.workoutId) {
    const byId = workouts.find((w) => w.id === entry.workoutId)
    if (byId) return byId
  }
  return workouts.find((w) => w.date === entry.date)
}

function weekVolume(workouts: Workout[], weekStartDate: string): number {
  return workouts.filter((w) => inRange(w.date, weekStartDate, weekEnd(weekStartDate))).reduce((s, w) => s + workoutVolume(w), 0)
}

function severityTrend(entries: PainEntry[]): AreaPattern['severityTrend'] {
  const recent = entries.slice(-4)
  if (recent.length < 3) return 'n/a'
  const diff = recent[recent.length - 1].severity - recent[0].severity
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
}

export function painPatterns(workouts: Workout[], pain: PainEntry[], asOf: string): AreaPattern[] {
  const byArea = new Map<BodyArea, PainEntry[]>()
  for (const p of [...pain].sort((a, b) => a.date.localeCompare(b.date))) {
    byArea.set(p.area, [...(byArea.get(p.area) ?? []), p])
  }
  const totalWorkouts = workouts.length
  const out: AreaPattern[] = []
  for (const [area, entries] of byArea) {
    if (entries.length < 2) continue
    const counts = new Map<string, number>()
    let withWorkout = 0
    let afterVolumeSpike = 0
    for (const p of entries) {
      const w = workoutFor(p, workouts)
      if (w) {
        withWorkout += 1
        for (const id of new Set(w.entries.map((e) => e.exerciseId))) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      const ws = weekStart(p.date)
      const prev = weekVolume(workouts, addDays(ws, -7))
      if (prev > 0 && weekVolume(workouts, ws) > prev * 1.2) afterVolumeSpike += 1
    }
    const exercises: ExerciseCoOccurrence[] = [...counts.entries()]
      .map(([exerciseId, count]) => ({
        exerciseId, count,
        coRate: withWorkout ? count / withWorkout : 0,
        baseRate: totalWorkouts ? workouts.filter((w) => w.entries.some((e) => e.exerciseId === exerciseId)).length / totalWorkouts : 0,
      }))
      .sort((a, b) => (b.coRate - b.baseRate) - (a.coRate - a.baseRate))
      .slice(0, 3)
    const last = entries[entries.length - 1]
    out.push({
      area, count: entries.length,
      limitedCount: entries.filter((p) => p.limited).length,
      lastDate: last.date,
      daysSinceLast: daysBetween(last.date, asOf),
      severityTrend: severityTrend(entries),
      afterVolumeSpike,
      exercises,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}
