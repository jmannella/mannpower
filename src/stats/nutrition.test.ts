import { eachDay } from '../domain/dates'
import type { SyncedSettings } from '../domain/types'
import type { NutritionInput } from '../nutrition/targets'
import { mkDay, mkEntry, mkMeal, mkWorkout } from './testData'
import { nutritionSeries, nutritionWeek, recentDeficit } from './nutrition'

const START = '2026-09-14'
const END = '2026-09-20'
const settings: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male', heightInches: 70, birthYear: 1979, targetBodyWeight: 220, proteinTargetOverride: 140 }
const days = [
  ...eachDay('2026-08-10', '2026-09-13').map((d) => mkDay(d, { bodyWeight: 240, steps: 8000 })),
  ...eachDay(START, END).map((d) => mkDay(d, { bodyWeight: 239, steps: 8000 })),
]
const weekdayMeals = eachDay('2026-09-14', '2026-09-18').map((d) => mkMeal(d, 2000, 150))
const saturday = mkMeal('2026-09-19', 0, 0, {
  time: '21:00', description: 'Pizza night',
  items: [{ name: 'Pizza', kind: 'food', calories: 2400, protein: 80, fibre: 6 }, { name: 'Beer', kind: 'alcohol', calories: 600, protein: 20 }],
})
const sunday = mkMeal('2026-09-20', 3000, 100)
const workouts = [mkWorkout('2026-09-14', [mkEntry('back-squat', [[185, 5]])]), mkWorkout('2026-09-16', [mkEntry('barbell-bench-press', [[135, 8]])])]
const full = (): NutritionInput => ({ meals: [...weekdayMeals, saturday, sunday], days, workouts, settings })

describe('nutritionWeek', () => {
  test('a full week', () => {
    const w = nutritionWeek(full(), START, END, false)
    expect(w).toMatchObject({ mealsLogged: 7, pendingMeals: 0, completeDays: 7, enoughData: true, calorieTarget: 2220, proteinTarget: 140, proteinDaysHit: 5, maintenanceSource: 'formula' })
    expect(w.avgCalories).toBeCloseTo(2285.7, 1)
    expect(w.avgProtein).toBeCloseTo(135.7, 1)
    expect(w.avgFibre).toBeCloseTo(0.86, 2)
    // Formula maintenance at 239 lb and 8000 steps is about 2948.
    expect(w.maintenance).toBeCloseTo(2948, 0)
    expect(w.avgDeficit).toBeCloseTo(662.3, 0)
    expect(w.predictedChangeLbs).toBeCloseTo(-1.32, 2)
    expect(w.actualChangeLbs).toBeCloseTo(-1.0, 5)
    expect(w.weekdayAvgCalories).toBe(2000)
    expect(w.weekendAvgCalories).toBe(3000)
    expect(w.trainingDay).toEqual({ days: 2, calories: 2000, protein: 150 })
    expect(w.restDay).toEqual({ days: 5, calories: 2400, protein: 130 })
    expect(w.topItems).toEqual([{ name: 'Meal', calories: 13000, count: 6 }, { name: 'Pizza', calories: 2400, count: 1 }, { name: 'Beer', calories: 600, count: 1 }])
    expect(w.alcoholSharePct).toBeCloseTo(3.75, 2)
    expect(w.drinkSharePct).toBe(0)
    expect(w.lateSharePct).toBeCloseTo(18.75, 2)
    expect(w.calorieSpread).toBeCloseTo(451.8, 0)
    expect(w.month).toBeUndefined()
  })

  test('thin logging reports only the counts', () => {
    const w = nutritionWeek({ ...full(), meals: weekdayMeals.slice(0, 2) }, START, END, false)
    expect(w).toMatchObject({ mealsLogged: 2, completeDays: 2, enoughData: false, topItems: [] })
    expect(w.avgCalories).toBeUndefined()
    expect(w.predictedChangeLbs).toBeUndefined()
  })

  test('a meal waiting for an estimate makes its day incomplete', () => {
    const pending = mkMeal('2026-09-14', 0, 0, { items: [], needsEstimate: true })
    const w = nutritionWeek({ ...full(), meals: [...full().meals, pending] }, START, END, false)
    expect(w).toMatchObject({ mealsLogged: 8, pendingMeals: 1, completeDays: 6 })
  })

  test('the monthly lens adds the maintenance trend', () => {
    const w = nutritionWeek(full(), START, END, true)
    expect(w.month?.completeDays).toBe(7)
    expect(w.month?.maintenanceStart).toBeCloseTo(2954.8, 0)
    expect(w.month?.maintenanceEnd).toBeCloseTo(2948, 0)
  })
})

describe('series and recent deficit', () => {
  test('nutritionSeries has one row per day with a trailing average of complete days', () => {
    const rows = nutritionSeries(full(), '2026-09-13', END)
    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({ date: '2026-09-13', label: '09-13', complete: false })
    expect(rows[0].calories).toBeUndefined()
    expect(rows[1]).toMatchObject({ calories: 2000, protein: 150, complete: true, avg7: 2000 })
    expect(rows[7].avg7).toBeCloseTo(2285.7, 1)
  })

  test('recentDeficit needs three complete days', () => {
    expect(recentDeficit(full(), END)).toBeCloseTo(662.3, 0)
    expect(recentDeficit({ ...full(), meals: weekdayMeals.slice(0, 2) }, END)).toBeUndefined()
  })
})
