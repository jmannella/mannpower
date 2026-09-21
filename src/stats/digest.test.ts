import type { Dataset } from '../domain/types'
import { eachDay } from '../domain/dates'
import { mkDay, mkEntry, mkMeal, mkPain, mkWorkout } from './testData'
import { digestMarkdown, weeklyDigest } from './digest'

function dataset(): Dataset {
  return {
    meta: { schemaVersion: 1, updatedAt: '2026-09-13T20:00:00.000Z' },
    exercises: [],
    workouts: [
      mkWorkout('2026-08-31', [mkEntry('back-squat', [[185, 8], [185, 8]])], { id: 'p1' }),
      mkWorkout('2026-09-02', [mkEntry('barbell-bench-press', [[135, 8]])], { id: 'p2' }),
      mkWorkout('2026-09-07', [mkEntry('back-squat', [[185, 8], [185, 8]]), mkEntry('lat-pulldown', [[120, 10]])], { id: 'a' }),
      mkWorkout('2026-09-09', [mkEntry('barbell-bench-press', [[145, 8]])], { id: 'b', withTrainer: false }),
      mkWorkout('2026-09-11', [mkEntry('lateral-raise', [[20, 12]])], { id: 'c' }),
    ],
    days: [
      mkDay('2026-09-01', { bodyWeight: 250, steps: 7000 }),
      mkDay('2026-09-03', { bodyWeight: 249 }),
      mkDay('2026-09-08', { bodyWeight: 247, steps: 11000, cardio: [{ id: 'x', type: 'Desk treadmill', minutes: 40 }] }),
      mkDay('2026-09-10', { bodyWeight: 246.5, steps: 8000, cardio: [{ id: 'y', type: 'Bike', minutes: 25 }] }),
    ],
    pain: [
      mkPain('2026-09-07', 'lower_back', 3, { workoutId: 'a', exerciseId: 'back-squat' }),
      mkPain('2026-08-31', 'lower_back', 2, { workoutId: 'p1' }),
    ],
    meals: [], savedMeals: [],
    settings: { defaultWithTrainer: true, customCardioTypes: [], dailyStepGoal: 10000, targetBodyWeight: 220 },
  }
}

describe('weeklyDigest', () => {
  const d = weeklyDigest(dataset(), '2026-09-13')

  test('week window and workout counts', () => {
    expect(d.weekStart).toBe('2026-09-07')
    expect(d.weekEnd).toBe('2026-09-13')
    expect(d.workouts.count).toBe(3)
    expect(d.workouts.trainer).toBe(2)
    expect(d.workouts.solo).toBe(1)
    expect(d.workouts.volume).toBe(185 * 16 + 1200 + 145 * 8 + 240)
    expect(d.workouts.prevVolume).toBe(185 * 16 + 135 * 8)
    expect(d.workouts.volumeChangePct).toBeGreaterThan(0)
  })

  test('PRs carry exercise names', () => {
    expect(d.prs.map((p) => `${p.exerciseName}:${p.kind}`)).toEqual(['Barbell Bench Press:e1rm', 'Barbell Bench Press:weight'])
    expect(d.bestE1rmGain?.exerciseName).toBe('Barbell Bench Press')
  })

  test('body weight, steps, cardio', () => {
    expect(d.bodyWeight.thisWeek).toBeCloseTo(246.75, 5)
    expect(d.bodyWeight.lastWeek).toBeCloseTo(249.5, 5)
    expect(d.bodyWeight.band).toBe('too_fast')
    expect(d.bodyWeight.target).toBe(220)
    expect(d.steps.total).toBe(19000)
    expect(d.steps.goal).toBe(10000)
    expect(d.steps.daysAtGoal).toBe(1)
    expect(d.cardio.minutes).toBe(65)
    expect(d.cardio.deskTreadmillMinutes).toBe(40)
  })

  test('muscle, stalled, trainer, pain, streak', () => {
    expect(d.muscle.underTrained).toContain('chest')
    expect(d.stalled.map((s) => s.exerciseName)).toEqual(['Back Squat'])
    expect(d.stalled[0].increment).toBe(10)
    expect(d.trainer.soloCount).toBe(1)
    expect(d.pain.entriesThisWeek).toBe(1)
    expect(d.pain.patterns[0].areaLabel).toBe('Lower back')
    expect(d.pain.patterns[0].exercises[0].exerciseName).toBe('Back Squat')
    expect(d.streakWeeks).toBe(2)
  })

  test('digestMarkdown has the sections and a JSON block', () => {
    const md = digestMarkdown(d)
    expect(md).toContain('## Summary')
    expect(md).toContain('## Highlights')
    expect(md).toContain('## Muscle groups')
    expect(md).toContain('## Recommendation facts')
    expect(md).toContain('## Pain')
    expect(md).toContain('```json')
    expect(md).toContain('Back Squat')
  })

  test('empty dataset produces a digest with zeros', () => {
    const empty = weeklyDigest({ ...dataset(), workouts: [], days: [], pain: [] }, '2026-09-13')
    expect(empty.workouts.count).toBe(0)
    expect(empty.prs).toEqual([])
    expect(empty.bodyWeight.band).toBe('unknown')
    expect(empty.streakWeeks).toBe(0)
    expect(digestMarkdown(empty)).toContain('## Summary')
  })

  test('with no meals the nutrition section says logging was too thin', () => {
    const d = weeklyDigest(dataset(), '2026-09-13')
    expect(d.nutrition).toMatchObject({ mealsLogged: 0, completeDays: 0, enoughData: false })
    const md = digestMarkdown(d)
    expect(md).toContain('## Nutrition')
    expect(md).toContain('- Food logging too thin to read: 0 complete days of 7, 0 meals logged, 0 waiting for an estimate')
  })

  test('with a logged week the nutrition section carries the reconciliation and splits', () => {
    const ds = dataset()
    ds.settings = { ...ds.settings, sex: 'male', heightInches: 70, birthYear: 1979, proteinTargetOverride: 140 }
    ds.meals = eachDay('2026-09-07', '2026-09-13').map((date, i) => mkMeal(date, i > 4 ? 3000 : 2000, i > 4 ? 100 : 150, i === 5 ? { time: '21:00' } : {}))
    const d = weeklyDigest(ds, '2026-09-13')
    expect(d.nutrition).toMatchObject({ completeDays: 7, enoughData: true, proteinDaysHit: 5, weekdayAvgCalories: 2000, weekendAvgCalories: 3000 })
    const md = digestMarkdown(d)
    expect(md).toContain('- Complete days logged: 7 of 7')
    expect(md).toMatch(/- Calories: avg 2286 a day against a target of \d+/)
    expect(md).toContain('- Protein: avg 136 g against a target of 140 g, target hit on 5 of 7 complete days')
    expect(md).toMatch(/- Maintenance: about \d+ kcal \(formula\)/)
    expect(md).toContain('- Weekday avg 2000 kcal vs weekend avg 3000 kcal')
    expect(md).toContain('- Top calorie items: Meal 16000 kcal (7)')
    expect(md).toContain('after 8 pm 18.8%')
    expect(md).toMatch(/Body composition signal: .*protein target hit on 5 of 7 complete days/)
  })
})

describe('weeklyDigest longevity sections', () => {
  test('benchmarks, balance, body comp and monthly lens are present', () => {
    const ds = { ...dataset(), settings: { ...dataset().settings, birthYear: 1979 } }
    const d = weeklyDigest(ds, '2026-09-13')
    expect(d.age).toBe(47)
    expect(d.ageBand).toBe('45 to 49')
    const squat = d.benchmarks.find((b) => b.key === 'squat')!
    expect(squat.bestEver).toBeGreaterThan(0)
    expect(squat.level).toBeDefined()
    expect(d.balance.week.totalSets).toBe(5)
    expect(d.neglectedGroups).toEqual([])
    expect(['likely_fat_loss', 'possible_muscle_loss', 'gaining', 'holding', 'unclear']).toContain(d.bodyComp.signal)
    expect(d.guidelines.cardioMinutesShort).toBe(85)
    expect(d.consistency.sessions4w).toBe(5)
    expect(d.monthlyLens).toBe(false)
    const md = digestMarkdown(d)
    expect(md).toContain('## Benchmarks')
    expect(md).toContain('## Balance and longevity markers')
    expect(md).toContain('Squat: best ever')
    expect(md).toContain('band 45 to 49')
  })

  test('without a birth year the digest still runs and says so', () => {
    const d = weeklyDigest(dataset(), '2026-09-13')
    expect(d.age).toBeUndefined()
    expect(d.benchmarks.find((b) => b.key === 'squat')!.level).toBeUndefined()
    expect(digestMarkdown(d)).toContain('add a birth year in Settings')
  })
})
