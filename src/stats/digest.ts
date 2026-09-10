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
    steps: { ...stepsSummary(ds.days, start, end, ds.settings.dailyStepGoal), goal: ds.settings.dailyStepGoal },
    cardio: { ...cardio, deskTreadmillMinutes: cardio.byType['Desk treadmill']?.minutes ?? 0 },
    muscle: { load: weeklyMuscleLoad(workouts, exMap, start), underTrained: underTrainedGroups(workouts, exMap, start) },
    stalled: stalledLifts(workouts, exMap, start).map((s) => ({ ...s, exerciseName: name(s.exerciseId, s.variation) })),
    trainer: trainerSplit(workouts, start, end),
    pain: { entriesThisWeek: ds.pain.filter((p) => inRange(p.date, start, end)).length, patterns },
    streakWeeks,
  }
}

const n = (x: number | undefined, digits = 0) => (x === undefined ? 'n/a' : x.toFixed(digits))
const pct = (x: number | undefined) => (x === undefined ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)

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
