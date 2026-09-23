import type { Dataset, DayRecord } from '../domain/types'
import { inRange } from '../domain/dates'
import { dailyIntake } from '../nutrition/targets'

/** How far below the week's average a night has to sit before the session that followed is named. */
const BAD_NIGHT_GAP = 15
/** Nights and complete food days needed before intake is compared across sleep. */
const INTAKE_MIN_DAYS = 6

export interface SleepWeek {
  nightsRecorded: number
  hoursRecorded: number
  avgScore?: number
  avgHours?: number
  best?: { date: string; score: number }
  worst?: { date: string; score: number }
  /** Average score on dates with a workout, and on dates without. Same date, never offset. */
  beforeTraining?: number
  beforeRest?: number
  /** The worst night of the week when a session followed it and it sat well below the average. */
  worstNightSession?: { date: string; score: number }
  caloriesAfterWorst3?: number
  caloriesAfterBest3?: number
}

const mean = (xs: number[]): number | undefined => (xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length)

export function sleepWeek(ds: Dataset, start: string, end: string): SleepWeek {
  const days: DayRecord[] = ds.days.filter((d) => inRange(d.date, start, end))
  const scored = days
    .filter((d) => d.sleepScore !== undefined)
    .map((d) => ({ date: d.date, score: d.sleepScore as number }))
    .sort((a, b) => a.score - b.score)

  const avgScore = mean(scored.map((s) => s.score))
  const trainingDates = new Set(ds.workouts.filter((w) => inRange(w.date, start, end)).map((w) => w.date))
  const hoursDays = days.filter((d) => d.sleepHours !== undefined)

  const out: SleepWeek = {
    nightsRecorded: scored.length,
    hoursRecorded: hoursDays.length,
    avgScore,
    avgHours: mean(hoursDays.map((d) => d.sleepHours as number)),
    best: scored[scored.length - 1],
    worst: scored[0],
    beforeTraining: mean(scored.filter((s) => trainingDates.has(s.date)).map((s) => s.score)),
    beforeRest: mean(scored.filter((s) => !trainingDates.has(s.date)).map((s) => s.score)),
  }

  const worst = scored[0]
  if (worst && avgScore !== undefined && trainingDates.has(worst.date) && avgScore - worst.score >= BAD_NIGHT_GAP) {
    out.worstNightSession = worst
  }

  const intake = new Map(dailyIntake(ds, start, end).filter((i) => i.complete).map((i) => [i.date, i.calories]))
  if (scored.length >= INTAKE_MIN_DAYS && intake.size >= INTAKE_MIN_DAYS) {
    const cal = (list: typeof scored) => mean(list.map((s) => intake.get(s.date)).filter((c): c is number => c !== undefined))
    out.caloriesAfterWorst3 = cal(scored.slice(0, 3))
    out.caloriesAfterBest3 = cal(scored.slice(-3))
  }

  return out
}
