import { mkDay, mkMeal, mkWorkout, mkEntry } from './testData'
import { sleepWeek } from './sleep'
import type { Dataset } from '../domain/types'

const ds = (patch: Partial<Dataset>): Dataset => ({
  meta: { schemaVersion: 1, updatedAt: '' },
  exercises: [], workouts: [], days: [], pain: [], meals: [], savedMeals: [],
  settings: { defaultWithTrainer: true, customCardioTypes: [], supplements: [] },
  ...patch,
})

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']

describe('sleepWeek', () => {
  test('averages only the nights that were recorded', () => {
    const days = [mkDay(week[0], { sleepScore: 80, sleepHours: 7 }), mkDay(week[1], { sleepScore: 70, sleepHours: 6 }), mkDay(week[2])]
    const s = sleepWeek(ds({ days }), week[0], week[6])
    expect(s.nightsRecorded).toBe(2)
    expect(s.avgScore).toBe(75)
    expect(s.avgHours).toBe(6.5)
  })

  test('counts hours recorded separately from scores recorded', () => {
    const days = [mkDay(week[0], { sleepScore: 80 }), mkDay(week[1], { sleepHours: 6 }), mkDay(week[2], { sleepHours: 7 })]
    const s = sleepWeek(ds({ days }), week[0], week[6])
    expect(s.nightsRecorded).toBe(1)
    expect(s.hoursRecorded).toBe(2)
    expect(s.avgHours).toBe(6.5)
  })

  test('returns undefined averages when nothing was recorded', () => {
    const s = sleepWeek(ds({ days: week.map((d) => mkDay(d)) }), week[0], week[6])
    expect(s.nightsRecorded).toBe(0)
    expect(s.avgScore).toBeUndefined()
    expect(s.beforeTraining).toBeUndefined()
  })

  test('names the best and worst night', () => {
    const days = [mkDay(week[0], { sleepScore: 90 }), mkDay(week[1], { sleepScore: 50 }), mkDay(week[2], { sleepScore: 70 })]
    const s = sleepWeek(ds({ days }), week[0], week[6])
    expect(s.best).toEqual({ date: week[0], score: 90 })
    expect(s.worst).toEqual({ date: week[1], score: 50 })
  })

  test('splits sleep by training day using the same date', () => {
    const days = week.map((d, i) => mkDay(d, { sleepScore: i < 2 ? 60 : 85 }))
    const workouts = [mkWorkout(week[0], [mkEntry('bench', [[135, 5]])]), mkWorkout(week[1], [mkEntry('bench', [[135, 5]])])]
    const s = sleepWeek(ds({ days, workouts }), week[0], week[6])
    expect(s.beforeTraining).toBe(60)
    expect(s.beforeRest).toBe(85)
  })

  test('names the session that followed a night well below the average', () => {
    const days = week.map((d, i) => mkDay(d, { sleepScore: i === 3 ? 45 : 85 }))
    const workouts = [mkWorkout(week[3], [mkEntry('bench', [[135, 5]])])]
    const s = sleepWeek(ds({ days, workouts }), week[0], week[6])
    expect(s.worstNightSession).toEqual({ date: week[3], score: 45 })
  })

  test('does not name a session when the worst night is close to the average', () => {
    const days = week.map((d, i) => mkDay(d, { sleepScore: i === 3 ? 80 : 85 }))
    const workouts = [mkWorkout(week[3], [mkEntry('bench', [[135, 5]])])]
    expect(sleepWeek(ds({ days, workouts }), week[0], week[6]).worstNightSession).toBeUndefined()
  })

  test('compares intake on the three worst nights against the three best', () => {
    const scores = [40, 45, 50, 85, 90, 95, 70]
    const days = week.map((d, i) => mkDay(d, { sleepScore: scores[i] }))
    const meals = week.flatMap((d, i) => [mkMeal(d, i < 3 ? 3200 : 2200, 60), mkMeal(d, 0, 60)])
    const s = sleepWeek(ds({ days, meals }), week[0], week[6])
    expect(s.caloriesAfterWorst3).toBeGreaterThan(s.caloriesAfterBest3 as number)
  })

  test('will not compare intake with fewer than six nights', () => {
    const days = week.slice(0, 5).map((d, i) => mkDay(d, { sleepScore: 50 + i * 10 }))
    const meals = week.slice(0, 5).map((d) => mkMeal(d, 2400, 60))
    const s = sleepWeek(ds({ days, meals }), week[0], week[6])
    expect(s.caloriesAfterWorst3).toBeUndefined()
  })
})
