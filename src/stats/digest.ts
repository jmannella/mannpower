import { MUSCLE_GROUPS, MUSCLE_LABELS, type Dataset, type MuscleGroup } from '../domain/types'
import { addDays, inRange, weekEnd, weekStart } from '../domain/dates'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { bodyAreaLabel } from '../library/bodyAreas'
import { variationLabelFor } from '../library/variations'
import { exerciseMap, workoutVolume, workoutWorkingSetCount } from './sets'
import { prsForWorkout, type PR } from './prs'
import { underTrainedGroups, weeklyMuscleLoad, type GroupLoad } from './muscle'
import { stalledLifts, type StalledLift } from './stalled'
import { lossBandStatus, weeklyBodyWeightChange, type LossBand, type WeeklyWeightChange } from './bodyweight'
import { cardioSummary, stepsSummary, type CardioSummary, type StepsSummary } from './activity'
import { trainerSplit, type TrainerSplit } from './trainer'
import { painPatterns, type AreaPattern } from './pain'
import { bodyWeightAvg7 } from './bodyweight'
import { nutritionWeek, type NutritionWeek } from './nutrition'
import {
  BODY_COMP_LABELS, ageOn, balanceSummary, bodyCompSignal, consistency, daysSinceGroup, guidelineCheck, isLastSundayOfMonth,
  mainLiftBenchmarks, strengthChange4w, type BalanceSummary, type BodyCompSignal, type LiftBenchmark,
} from './longevity'
import { ageBand } from '../library/standards'

export interface Digest {
  weekStart: string
  weekEnd: string
  workouts: { count: number; trainer: number; solo: number; volume: number; prevVolume: number; volumeChangePct?: number; workingSets: number }
  prs: (PR & { exerciseName: string; date: string })[]
  bestE1rmGain?: { exerciseName: string; from: number; to: number; date: string }
  bodyWeight: WeeklyWeightChange & { band: LossBand; target?: number }
  steps: StepsSummary & { goal?: number }
  cardio: CardioSummary & { deskTreadmillMinutes: number }
  muscle: { load: GroupLoad; underTrained: MuscleGroup[] }
  stalled: (StalledLift & { exerciseName: string })[]
  trainer: TrainerSplit
  pain: {
    entriesThisWeek: number
    patterns: (Omit<AreaPattern, 'exercises'> & { areaLabel: string; exercises: (AreaPattern['exercises'][number] & { exerciseName: string })[] })[]
  }
  streakWeeks: number
  /** Age on the week's Sunday and the standards band used, when a birth year is set. */
  age?: number
  ageBand?: string
  /** Main-lift benchmarks: you versus you, and you versus published standards for the age band. */
  benchmarks: LiftBenchmark[]
  /** Movement balance this week and the trailing four weeks. */
  balance: { week: BalanceSummary; fourWeeks: BalanceSummary }
  /** Days since each muscle group was last trained; groups over 10 days listed separately. */
  daysSinceGroup: Record<MuscleGroup, number | undefined>
  neglectedGroups: MuscleGroup[]
  /** Four-week body weight change and main-lift strength change read together. */
  bodyComp: { weightChange4wPct?: number; strengthChange4wPct?: number; signal: BodyCompSignal }
  guidelines: { cardioMinutesShort: number; stepsMeetsGuideline?: boolean }
  consistency: { sessions4w: number; sessions12w: number; weeksWithTwoPlus4w: number }
  /** True on the last Sunday of the month, when the email adds the long-game section. */
  monthlyLens: boolean
  /** Food logged this week: intake against targets, the intake versus scale reconciliation, and where the calories came from. */
  nutrition: NutritionWeek
}

export function weeklyDigest(ds: Dataset, weekEndDate: string): Digest {
  const end = weekEnd(weekEndDate)
  const start = weekStart(weekEndDate)
  const exMap = exerciseMap([...BUILTIN_EXERCISES, ...ds.exercises])
  const allEntries = ds.workouts.flatMap((w) => w.entries)
  const name = (id: string, variation?: string) =>
    (exMap.get(id)?.name ?? id) + (variation ? ` (${variationLabelFor(allEntries, id, variation)})` : '')
  const workouts = [...ds.workouts].sort((a, b) => a.date.localeCompare(b.date))
  const inWeek = workouts.filter((w) => inRange(w.date, start, end))
  const prevWeek = workouts.filter((w) => inRange(w.date, addDays(start, -7), addDays(start, -1)))

  const volume = inWeek.reduce((s, w) => s + workoutVolume(w), 0)
  const prevVolume = prevWeek.reduce((s, w) => s + workoutVolume(w), 0)

  const prs = inWeek.flatMap((w) => prsForWorkout(workouts, w).map((p) => ({ ...p, exerciseName: name(p.exerciseId, p.variation), date: w.date })))
  const e1rmPrs = prs.filter((p) => p.kind === 'e1rm')
  const best = e1rmPrs.sort((a, b) => (b.current - b.previous) - (a.current - a.previous))[0]

  const bw = weeklyBodyWeightChange(ds.days, start)
  const cardio = cardioSummary(ds.days, start, end)

  const patterns = painPatterns(workouts, ds.pain, end).map((p) => ({
    ...p,
    areaLabel: bodyAreaLabel(p.area),
    exercises: p.exercises.map((e) => ({ ...e, exerciseName: name(e.exerciseId) })),
  }))

  const bwNow = bodyWeightAvg7(ds.days, end)
  const bwFourWeeksAgo = bodyWeightAvg7(ds.days, addDays(end, -28))
  const weightChange4wPct = bwNow !== undefined && bwFourWeeksAgo !== undefined && bwFourWeeksAgo > 0 ? ((bwNow - bwFourWeeksAgo) / bwFourWeeksAgo) * 100 : undefined
  const strengthChange4wPct = strengthChange4w(workouts, exMap, end)
  const age = ds.settings.birthYear ? ageOn(ds.settings.birthYear, end) : undefined
  const since = daysSinceGroup(workouts, exMap, end)
  const stepsWeek = stepsSummary(ds.days, start, end, ds.settings.dailyStepGoal)

  let streakWeeks = 0
  for (let ws = start; ; ws = addDays(ws, -7)) {
    if (!workouts.some((w) => inRange(w.date, ws, weekEnd(ws)))) break
    streakWeeks += 1
    if (streakWeeks > 520) break
  }

  return {
    weekStart: start,
    weekEnd: end,
    workouts: {
      count: inWeek.length,
      trainer: inWeek.filter((w) => w.withTrainer).length,
      solo: inWeek.filter((w) => !w.withTrainer).length,
      volume, prevVolume,
      volumeChangePct: prevVolume > 0 ? ((volume - prevVolume) / prevVolume) * 100 : undefined,
      workingSets: inWeek.reduce((s, w) => s + workoutWorkingSetCount(w), 0),
    },
    prs,
    bestE1rmGain: best ? { exerciseName: best.exerciseName, from: best.previous, to: best.current, date: best.date } : undefined,
    bodyWeight: { ...bw, band: lossBandStatus(bw.changePct), target: ds.settings.targetBodyWeight },
    steps: { ...stepsWeek, goal: ds.settings.dailyStepGoal },
    cardio: { ...cardio, deskTreadmillMinutes: cardio.byType['Desk treadmill']?.minutes ?? 0 },
    muscle: { load: weeklyMuscleLoad(workouts, exMap, start), underTrained: underTrainedGroups(workouts, exMap, start) },
    stalled: stalledLifts(workouts, exMap, start).map((s) => ({ ...s, exerciseName: name(s.exerciseId, s.variation) })),
    trainer: trainerSplit(workouts, start, end),
    pain: { entriesThisWeek: ds.pain.filter((p) => inRange(p.date, start, end)).length, patterns },
    streakWeeks,
    age,
    ageBand: age === undefined ? undefined : ageBand(age),
    benchmarks: mainLiftBenchmarks(workouts, exMap, end, bwNow, age),
    balance: { week: balanceSummary(workouts, exMap, start, end), fourWeeks: balanceSummary(workouts, exMap, addDays(start, -21), end) },
    daysSinceGroup: since,
    neglectedGroups: MUSCLE_GROUPS.filter((g) => since[g] !== undefined && (since[g] as number) > 10),
    bodyComp: { weightChange4wPct, strengthChange4wPct, signal: bodyCompSignal(weightChange4wPct, strengthChange4wPct) },
    guidelines: guidelineCheck(cardio.minutes, stepsWeek.mean),
    consistency: consistency(workouts, end),
    monthlyLens: isLastSundayOfMonth(end),
    nutrition: nutritionWeek(ds, start, end, isLastSundayOfMonth(end)),
  }
}

const n = (x: number | undefined, digits = 0) => (x === undefined ? 'n/a' : x.toFixed(digits))
const pct = (x: number | undefined) => (x === undefined ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)
const share = (x: number | undefined) => (x === undefined ? 'n/a' : `${x.toFixed(1)}%`)

export function digestMarkdown(d: Digest): string {
  const lines: string[] = []
  lines.push(`# Mannpower weekly digest, ${d.weekStart} to ${d.weekEnd}`, '')
  lines.push('## Summary')
  lines.push(`- Workouts: ${d.workouts.count} (${d.workouts.trainer} with trainer, ${d.workouts.solo} solo), ${d.workouts.workingSets} working sets`)
  lines.push(`- Volume: ${n(d.workouts.volume)} lb, previous week ${n(d.workouts.prevVolume)} lb (${pct(d.workouts.volumeChangePct)})`)
  lines.push(`- Body weight: this week avg ${n(d.bodyWeight.thisWeek, 1)}, last week ${n(d.bodyWeight.lastWeek, 1)}, change ${n(d.bodyWeight.changeLbs, 1)} lb (${pct(d.bodyWeight.changePct)}), band: ${d.bodyWeight.band}, target ${n(d.bodyWeight.target)}`)
  lines.push(`- Steps: total ${n(d.steps.total)}, avg ${n(d.steps.mean)}, ${d.steps.daysLogged} days logged, ${d.steps.daysAtGoal} at goal (${n(d.steps.goal)})`)
  lines.push(`- Cardio: ${n(d.cardio.minutes)} min over ${d.cardio.sessions} sessions, desk treadmill ${n(d.cardio.deskTreadmillMinutes)} min`)
  lines.push(`- Streak: ${d.streakWeeks} consecutive weeks with a workout`, '')

  lines.push('## Highlights')
  if (d.prs.length === 0) lines.push('- No PRs this week')
  for (const p of d.prs) lines.push(`- PR ${p.exerciseName} ${p.kind === 'e1rm' ? 'estimated 1RM' : 'top weight'}: ${n(p.previous, 1)} to ${n(p.current, 1)} on ${p.date}`)
  if (d.bestE1rmGain) lines.push(`- Biggest strength gain: ${d.bestE1rmGain.exerciseName} ${n(d.bestE1rmGain.from, 1)} to ${n(d.bestE1rmGain.to, 1)}`)
  if (d.steps.bestDay) lines.push(`- Best step day: ${d.steps.bestDay.date} with ${d.steps.bestDay.steps}`)
  lines.push('')

  lines.push('## Muscle groups (weighted sets / volume this week)')
  for (const g of MUSCLE_GROUPS) {
    const l = d.muscle.load[g]
    if (l.sets > 0) lines.push(`- ${MUSCLE_LABELS[g]}: ${n(l.sets, 1)} sets, ${n(l.volume)} lb`)
  }
  lines.push(`- Under 10 sets but trained recently: ${d.muscle.underTrained.map((g) => MUSCLE_LABELS[g]).join(', ') || 'none'}`, '')

  lines.push('## Recommendation facts')
  for (const s of d.stalled) lines.push(`- Stalled: ${s.exerciseName} at ${s.topWeight} lb for two sessions, suggest +${s.increment} lb`)
  lines.push(`- Trainer sessions ${d.trainer.trainerCount}, solo ${d.trainer.soloCount}; mean volume trainer ${n(d.trainer.trainerMeanVolume)} vs solo ${n(d.trainer.soloMeanVolume)}; mean sets trainer ${n(d.trainer.trainerMeanSets, 1)} vs solo ${n(d.trainer.soloMeanSets, 1)}; solo keeping pace share ${d.trainer.soloKeepingPaceShare === undefined ? 'n/a' : pct(d.trainer.soloKeepingPaceShare * 100)}`)
  lines.push(`- Weight band: ${d.bodyWeight.band} (healthy loss is 0.5% to 1.0% per week)`)
  lines.push(`- Step goal days: ${d.steps.daysAtGoal} of ${d.steps.daysLogged} logged`)
  lines.push(`- Cardio sessions: ${d.cardio.sessions}`, '')

  const food = d.nutrition
  lines.push('## Nutrition')
  if (!food.enoughData) {
    lines.push(`- Food logging too thin to read: ${food.completeDays} complete days of 7, ${food.mealsLogged} meals logged, ${food.pendingMeals} waiting for an estimate`)
  } else {
    lines.push(`- Complete days logged: ${food.completeDays} of 7 (${food.mealsLogged} meals, ${food.pendingMeals} waiting for an estimate). Averages use complete days only`)
    lines.push(`- Calories: avg ${n(food.avgCalories)} a day against a target of ${n(food.calorieTarget)}`)
    lines.push(`- Protein: avg ${n(food.avgProtein)} g against a target of ${n(food.proteinTarget)} g, target hit on ${food.proteinDaysHit ?? 'n/a'} of ${food.completeDays} complete days; fibre avg ${n(food.avgFibre)} g`)
    const switchesNote = food.maintenanceSource === 'formula' ? ' It switches to measured after 14 complete days in 28.' : ''
    lines.push(`- Maintenance: about ${n(food.maintenance)} kcal (${food.maintenanceSource}).${switchesNote} Avg daily deficit ${n(food.avgDeficit)} kcal`)
    lines.push(`- Reconciliation: intake predicts ${n(food.predictedChangeLbs, 1)} lb this week, the 7 day average weight moved ${n(food.actualChangeLbs, 1)} lb`)
    lines.push(`- Weekday avg ${n(food.weekdayAvgCalories)} kcal vs weekend avg ${n(food.weekendAvgCalories)} kcal`)
    const grp = (g?: { days: number; calories: number; protein: number }) => (g ? `${n(g.calories)} kcal and ${n(g.protein)} g protein over ${g.days} days` : 'n/a')
    lines.push(`- Training days: ${grp(food.trainingDay)}; rest days: ${grp(food.restDay)}`)
    lines.push(`- Top calorie items: ${food.topItems.map((t) => `${t.name} ${n(t.calories)} kcal (${t.count})`).join(', ') || 'none'}`)
    lines.push(`- Calorie shares: non alcoholic drinks ${share(food.drinkSharePct)}, alcohol ${share(food.alcoholSharePct)}, after 8 pm ${share(food.lateSharePct)}`)
    lines.push(`- Day to day spread: ${n(food.calorieSpread)} kcal standard deviation`)
  }
  if (food.month) lines.push(`- Month: ${food.month.completeDays} complete days in 28; maintenance ${n(food.month.maintenanceStart)} four weeks ago, ${n(food.month.maintenanceEnd)} now`)
  lines.push('')

  lines.push('## Benchmarks')
  lines.push(`- Age ${d.age ?? 'unknown'} (band ${d.ageBand ?? 'not set, add a birth year in Settings'}). Levels are a rough yardstick from community strength standards (body weight multiples at an estimated 1RM) scaled down for the age band, not a test or a medical measure; plain variants only, rows are the loosest of the five`)
  for (const b of d.benchmarks) {
    if (b.bestEver === undefined) continue
    const lvl = b.level ? `${b.level} at ${n(b.ratio, 2)}x body weight${b.next ? `, ${b.next.level} needs ${b.next.e1rm} lb e1RM` : ''}` : 'level n/a (needs body weight and birth year)'
    lines.push(`- ${b.label}: best ever ${n(b.bestEver)} lb e1RM, best 4 weeks ${n(b.best4w)}, this week ${n(b.thisWeek)}, 8 week slope ${b.slope8wPerWeek === undefined ? 'n/a' : `${b.slope8wPerWeek > 0 ? '+' : ''}${n(b.slope8wPerWeek, 1)} lb/week`}; ${lvl}`)
  }
  if (d.benchmarks.every((b) => b.bestEver === undefined)) lines.push('- No main lifts logged yet (squat, bench, deadlift, overhead press, row)')
  lines.push('')

  lines.push('## Balance and longevity markers')
  const w = d.balance.week
  const f = d.balance.fourWeeks
  lines.push(`- Push vs pull volume this week: ${n(w.pushVolume)} vs ${n(w.pullVolume)} lb; four weeks: ${n(f.pushVolume)} vs ${n(f.pullVolume)} lb`)
  lines.push(`- Upper vs lower volume this week: ${n(w.upperVolume)} vs ${n(w.lowerVolume)} lb; four weeks: ${n(f.upperVolume)} vs ${n(f.lowerVolume)} lb`)
  lines.push(`- Hinge vs squat pattern sets, four weeks: ${f.hingeSets} vs ${f.squatSets}`)
  lines.push(`- Single leg or single arm sets, four weeks: ${f.unilateralSets} of ${f.totalSets} (balance and fall prevention)`)
  lines.push(`- Loaded carry sets, four weeks: ${f.carrySets} (grip strength tracks with healthy ageing)`)
  lines.push(`- Muscle groups over 10 days untrained: ${d.neglectedGroups.map((g) => `${MUSCLE_LABELS[g]} (${d.daysSinceGroup[g]} days)`).join(', ') || 'none'}`)
  const proteinFact = d.nutrition.enoughData && d.nutrition.proteinDaysHit !== undefined ? `, protein target hit on ${d.nutrition.proteinDaysHit} of ${d.nutrition.completeDays} complete days` : ''
  lines.push(`- Body composition signal: ${BODY_COMP_LABELS[d.bodyComp.signal]} (4 week weight ${pct(d.bodyComp.weightChange4wPct)}, main lift strength ${pct(d.bodyComp.strengthChange4wPct)}${proteinFact})`)
  const stepsWord = d.guidelines.stepsMeetsGuideline === undefined ? 'no steps logged' : d.guidelines.stepsMeetsGuideline ? 'steps average meets the 8000 a day marker' : 'steps average is below the 8000 a day marker'
  lines.push(`- Guidelines: cardio short of 150 min by ${d.guidelines.cardioMinutesShort} min; ${stepsWord}`)
  lines.push(`- Consistency: ${d.consistency.sessions4w} sessions in 4 weeks, ${d.consistency.sessions12w} in 12, ${d.consistency.weeksWithTwoPlus4w} of the last 4 weeks had 2 or more`)
  lines.push(`- Monthly lens: ${d.monthlyLens ? 'yes, last Sunday of the month, include the long game section' : 'no'}`, '')

  lines.push('## Pain')
  if (d.pain.patterns.length === 0 && d.pain.entriesThisWeek === 0) lines.push('- No pain logged')
  else {
    lines.push(`- Entries this week: ${d.pain.entriesThisWeek}`)
    for (const p of d.pain.patterns) {
      const ex = p.exercises.map((e) => `${e.exerciseName} (${pct(e.coRate * 100)} of flares vs ${pct(e.baseRate * 100)} of all workouts)`).join('; ')
      lines.push(`- ${p.areaLabel}: ${p.count} entries, ${p.limitedCount} limiting, last ${p.lastDate} (${p.daysSinceLast} days ago), severity trend ${p.severityTrend}, ${p.afterVolumeSpike} after a volume spike. Co-occurring: ${ex || 'none'}`)
    }
  }
  lines.push('')
  lines.push('```json', JSON.stringify(d, null, 2), '```')
  return lines.join('\n')
}
