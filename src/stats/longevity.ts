import { MUSCLE_GROUPS, type Exercise, type MuscleGroup, type Workout } from '../domain/types'
import { addDays, daysBetween, inRange, parseISO, weekEnd, weekStart } from '../domain/dates'
import { MAIN_LIFTS, classifyLift, type MainLift, type StrengthLevel } from '../library/standards'
import { variationTags } from '../library/variations'
import { setVolume, workingSets } from './sets'
import { exerciseHistory } from './prs'

export function ageOn(birthYear: number, date: string): number {
  return parseISO(date).getFullYear() - birthYear
}

const PUSH: MuscleGroup[] = ['chest', 'shoulders', 'triceps']
const PULL: MuscleGroup[] = ['back', 'biceps']
const LOWER: MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves']
const HINGE = /deadlift|rdl|romanian|stiff-leg|hip-thrust|glute-bridge|good-morning|kettlebell-swing|rack-pull|pull-through/
const SQUAT = /squat|leg-press|lunge|step-up|hack/
const UNILATERAL_NAME = /single|lunge|step-up|bulgarian|pistol|split/i
const UNILATERAL_TAG = /single-arm|single-leg|alternating/i

export interface BalanceSummary {
  pushVolume: number
  pullVolume: number
  upperVolume: number
  lowerVolume: number
  hingeSets: number
  squatSets: number
  unilateralSets: number
  carrySets: number
  totalSets: number
}

/** Volume and set counts by movement pattern for the range, using each exercise's primary group and id. */
export function balanceSummary(workouts: Workout[], exMap: Map<string, Exercise>, from: string, to: string): BalanceSummary {
  const b: BalanceSummary = { pushVolume: 0, pullVolume: 0, upperVolume: 0, lowerVolume: 0, hingeSets: 0, squatSets: 0, unilateralSets: 0, carrySets: 0, totalSets: 0 }
  for (const w of workouts) {
    if (!inRange(w.date, from, to)) continue
    for (const e of w.entries) {
      const ex = exMap.get(e.exerciseId)
      if (!ex) continue
      const sets = workingSets(e)
      const vol = sets.reduce((s, x) => s + setVolume(x), 0)
      const unilateral = UNILATERAL_NAME.test(ex.name) || variationTags(e.variation).some((t) => UNILATERAL_TAG.test(t))
      if (PUSH.includes(ex.primary)) b.pushVolume += vol
      if (PULL.includes(ex.primary)) b.pullVolume += vol
      if (PUSH.includes(ex.primary) || PULL.includes(ex.primary)) b.upperVolume += vol
      if (LOWER.includes(ex.primary)) b.lowerVolume += vol
      if (HINGE.test(ex.id)) b.hingeSets += sets.length
      if (SQUAT.test(ex.id)) b.squatSets += sets.length
      if (unilateral) b.unilateralSets += sets.length
      if (ex.id.includes('carry')) b.carrySets += sets.length
      b.totalSets += sets.length
    }
  }
  return b
}

/** Days since each muscle group was last trained (primary or secondary), undefined when never. */
export function daysSinceGroup(workouts: Workout[], exMap: Map<string, Exercise>, asOf: string): Record<MuscleGroup, number | undefined> {
  const last: Partial<Record<MuscleGroup, string>> = {}
  for (const w of workouts) {
    if (w.date > asOf) continue
    for (const e of w.entries) {
      const ex = exMap.get(e.exerciseId)
      if (!ex || workingSets(e).length === 0) continue
      for (const g of [ex.primary, ...ex.secondary]) if (!last[g] || w.date > (last[g] as string)) last[g] = w.date
    }
  }
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, last[g] ? daysBetween(last[g] as string, asOf) : undefined])) as Record<MuscleGroup, number | undefined>
}

export interface LiftBenchmark {
  key: MainLift['key']
  label: string
  bestEver?: number
  best4w?: number
  thisWeek?: number
  /** Change in weekly-best e1RM per week over the last 8 weeks, from a least-squares fit; undefined with fewer than 2 sessions. */
  slope8wPerWeek?: number
  ratio?: number
  level?: StrengthLevel
  next?: { level: StrengthLevel; e1rm: number }
}

/** Plain-variant e1RM benchmarks for the main lifts as of the week ending `weekEndDate`. */
export function mainLiftBenchmarks(workouts: Workout[], exMap: Map<string, Exercise>, weekEndDate: string, bodyWeight?: number, age?: number): LiftBenchmark[] {
  const end = weekEnd(weekEndDate)
  const start = weekStart(weekEndDate)
  return MAIN_LIFTS.map((lift) => {
    const sessions = lift.exerciseIds
      .filter((id) => exMap.has(id))
      .flatMap((id) => exerciseHistory(workouts, id, ''))
      .filter((s) => s.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date))
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined)
    const bestEver = max(sessions.map((s) => s.bestE1rm))
    const best4w = max(sessions.filter((s) => s.date >= addDays(start, -21)).map((s) => s.bestE1rm))
    const thisWeek = max(sessions.filter((s) => s.date >= start).map((s) => s.bestE1rm))
    const recent = sessions.filter((s) => s.date >= addDays(start, -49))
    let slope8wPerWeek: number | undefined
    if (recent.length >= 2) {
      const xs = recent.map((s) => daysBetween(recent[0].date, s.date) / 7)
      const ys = recent.map((s) => s.bestE1rm)
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length
      const my = ys.reduce((a, b) => a + b, 0) / ys.length
      const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
      slope8wPerWeek = den > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den : 0
    }
    const out: LiftBenchmark = { key: lift.key, label: lift.label, bestEver, best4w, thisWeek, slope8wPerWeek }
    if (best4w !== undefined && bodyWeight && age !== undefined) {
      const r = classifyLift(lift, best4w, bodyWeight, age)
      out.ratio = r.ratio
      out.level = r.level
      out.next = r.next
    }
    return out
  })
}

export type BodyCompSignal = 'likely_fat_loss' | 'possible_muscle_loss' | 'losing_unclear' | 'gaining' | 'holding' | 'unclear'

export const BODY_COMP_LABELS: Record<BodyCompSignal, string> = {
  likely_fat_loss: 'likely fat loss (weight down, strength held or up)',
  possible_muscle_loss: 'possible muscle loss (weight and strength both down)',
  losing_unclear: 'losing weight with strength slipping a little, worth watching',
  gaining: 'gaining weight',
  holding: 'holding steady',
  unclear: 'not enough data',
}

/**
 * Four-week weight change (percent) read together with main-lift strength change over the same four weeks (percent).
 * A healthy loss of 0.5 to 1 percent a week compounds to roughly 2 to 4 percent over four weeks, so the weight
 * threshold is 1.5 percent, above the noise of day-to-day water swings.
 */
export function bodyCompSignal(weightChangePct?: number, strengthChangePct?: number): BodyCompSignal {
  if (weightChangePct === undefined || strengthChangePct === undefined) return 'unclear'
  if (weightChangePct <= -1.5) {
    if (strengthChangePct >= -1) return 'likely_fat_loss'
    if (strengthChangePct < -3) return 'possible_muscle_loss'
    return 'losing_unclear'
  }
  if (weightChangePct > 1.5) return 'gaining'
  return 'holding'
}

export const CARDIO_GUIDELINE_MINUTES = 150
export const STEPS_GUIDELINE = 8000

export function guidelineCheck(cardioMinutes: number, stepsMean?: number): { cardioMinutesShort: number; stepsMeetsGuideline?: boolean } {
  return {
    cardioMinutesShort: Math.max(0, CARDIO_GUIDELINE_MINUTES - cardioMinutes),
    stepsMeetsGuideline: stepsMean === undefined ? undefined : stepsMean >= STEPS_GUIDELINE,
  }
}

export function consistency(workouts: Workout[], weekEndDate: string): { sessions4w: number; sessions12w: number; weeksWithTwoPlus4w: number } {
  const end = weekEnd(weekEndDate)
  const start = weekStart(weekEndDate)
  const inWindow = (weeks: number) => workouts.filter((w) => inRange(w.date, addDays(start, -7 * (weeks - 1)), end))
  let weeksWithTwoPlus4w = 0
  for (let k = 0; k < 4; k++) {
    const ws = addDays(start, -7 * k)
    if (workouts.filter((w) => inRange(w.date, ws, weekEnd(ws))).length >= 2) weeksWithTwoPlus4w += 1
  }
  return { sessions4w: inWindow(4).length, sessions12w: inWindow(12).length, weeksWithTwoPlus4w }
}

/** True when the given date, which must be a Sunday (a week end), is the last Sunday of its month; the monthly lens runs then. */
export function isLastSundayOfMonth(date: string): boolean {
  return parseISO(date).getMonth() !== parseISO(addDays(date, 7)).getMonth()
}

/** Percent change of the summed best-4-week e1RM across main lifts versus the four weeks before that. */
export function strengthChange4w(workouts: Workout[], exMap: Map<string, Exercise>, weekEndDate: string): number | undefined {
  const now = mainLiftBenchmarks(workouts, exMap, weekEndDate)
  const before = mainLiftBenchmarks(workouts, exMap, addDays(weekEnd(weekEndDate), -28))
  let a = 0
  let b = 0
  for (const lift of now) {
    const prev = before.find((x) => x.key === lift.key)
    if (lift.best4w !== undefined && prev?.best4w !== undefined) {
      a += lift.best4w
      b += prev.best4w
    }
  }
  return b > 0 ? ((a - b) / b) * 100 : undefined
}
