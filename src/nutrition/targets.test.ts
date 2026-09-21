import { addDays, eachDay } from '../domain/dates'
import { mkDay, mkEntry, mkMeal, mkWorkout } from '../stats/testData'
import type { SyncedSettings } from '../domain/types'
import {
  activityFactor, bmr, dailyIntake, formulaMaintenance, maintenanceAt, measuredMaintenance, missingProfileFields, targetsFor, weightAt,
  type NutritionInput,
} from './targets'

const settings: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male', heightInches: 70, birthYear: 1979, targetBodyWeight: 220 }
const flatDays = (from: string, to: string, weight = 240, steps = 8000) => eachDay(from, to).map((d) => mkDay(d, { bodyWeight: weight, steps }))
const input = (patch: Partial<NutritionInput> = {}): NutritionInput => ({
  meals: [], workouts: [], days: flatDays('2026-08-10', '2026-09-20'), settings, ...patch,
})

describe('formula maintenance', () => {
  test('bmr is Mifflin St Jeor in pounds and inches', () => {
    expect(bmr('male', 240, 70, 47)).toBeCloseTo(1969.87, 1)
    expect(bmr('female', 240, 70, 47)).toBeCloseTo(1803.87, 1)
  })

  test('activity factor steps up with steps and with five sessions in 14 days', () => {
    const at = '2026-09-20'
    expect(activityFactor([], [], at)).toBe(1.4)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 4000), [], at)).toBe(1.3)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 6000), [], at)).toBe(1.4)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), [], at)).toBe(1.5)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 12000), [], at)).toBe(1.6)
    const five = ['2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-17'].map((d) => mkWorkout(d, [mkEntry('back-squat', [[185, 5]])]))
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), five, at)).toBeCloseTo(1.55, 5)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), five.slice(0, 4), at)).toBe(1.5)
  })

  test('formulaMaintenance needs sex, height, birth year and a weight', () => {
    expect(formulaMaintenance(input(), '2026-09-20')).toBeCloseTo(2954.8, 0)
    expect(formulaMaintenance(input({ settings: { ...settings, sex: undefined } }), '2026-09-20')).toBeUndefined()
    expect(missingProfileFields(input({ settings: { ...settings, sex: undefined, heightInches: undefined } }), '2026-09-20')).toEqual(['sex', 'height'])
    expect(missingProfileFields(input({ days: [] }), '2026-09-20')).toEqual(['body weight'])
    expect(missingProfileFields(input(), '2026-09-20')).toEqual([])
  })
})

describe('complete days', () => {
  test('a day under half of formula maintenance or with a pending meal is not complete', () => {
    const meals = [mkMeal('2026-09-18', 2400, 150), mkMeal('2026-09-19', 1200, 60),
      mkMeal('2026-09-20', 2000, 100), mkMeal('2026-09-20', 0, 0, { items: [], needsEstimate: true })]
    const rows = dailyIntake(input({ meals }), '2026-09-14', '2026-09-20')
    expect(rows.map((r) => [r.date, r.calories, r.complete])).toEqual([
      ['2026-09-18', 2400, true], ['2026-09-19', 1200, false], ['2026-09-20', 2000, false],
    ])
    expect(rows[2].pending).toBe(true)
  })

  test('with no formula value the threshold is a flat 1000', () => {
    const meals = [mkMeal('2026-09-19', 1200, 60), mkMeal('2026-09-20', 900, 40)]
    const rows = dailyIntake(input({ meals, settings: { ...settings, sex: undefined } }), '2026-09-14', '2026-09-20')
    expect(rows.map((r) => r.complete)).toEqual([true, false])
  })

  test('threshold is each date\'s own formula maintenance, not the window end', () => {
    const start = '2026-01-01'
    const early = '2026-01-14'
    const late = '2026-02-03'
    const highDays = eachDay(start, '2026-01-20').map((d) => mkDay(d, { bodyWeight: 300, steps: 12000 }))
    const lowDays = eachDay('2026-01-21', late).map((d) => mkDay(d, { bodyWeight: 180, steps: 3000 }))
    const meals = [mkMeal(early, 1500, 100), mkMeal(late, 1500, 100)]
    const data = input({ days: [...highDays, ...lowDays], meals })

    // Early day's own formula: weight 300 (7 day average), age 47, activity factor 1.6 (12000 step average, no sessions).
    // bmr(male, 300, 70, 47) = 10 * 300 * 0.45359237 + 6.25 * 70 * 2.54 - 5 * 47 + 5 = 2242.03.
    // Formula 2242.03 * 1.6 = 3587.24, half 1793.62. The 1500 calorie meal falls short, so the early day is not complete.
    //
    // Late day's own formula: weight 180, age 47, activity factor 1.3 (3000 step average).
    // bmr(male, 180, 70, 47) = 10 * 180 * 0.45359237 + 6.25 * 70 * 2.54 - 5 * 47 + 5 = 1697.72.
    // Formula 1697.72 * 1.3 = 2207.03, half 1103.52. The same 1500 calorie meal clears that, so the late day is complete.
    const rows = dailyIntake(data, start, late)
    expect(rows.find((r) => r.date === early)?.complete).toBe(false)
    expect(rows.find((r) => r.date === late)?.complete).toBe(true)

    // A past day must classify the same way no matter which window end it is viewed through.
    const throughEarly = dailyIntake(data, start, early).find((r) => r.date === early)?.complete
    const throughLate = dailyIntake(data, start, late).find((r) => r.date === early)?.complete
    expect(throughEarly).toBe(throughLate)
  })
})

describe('weightAt falls back past a skipped week of weigh ins', () => {
  test('a weigh in 12 days before the date is used when none fall in the trailing 7 days', () => {
    const days = [mkDay('2026-09-08', { bodyWeight: 238 })]
    expect(weightAt(days, '2026-09-20')).toBe(238)
  })

  test('a weigh in logged after the date is ignored', () => {
    const days = [mkDay('2026-09-25', { bodyWeight: 235 })]
    expect(weightAt(days, '2026-09-20')).toBeUndefined()
  })

  test('no weigh ins at all returns undefined', () => {
    expect(weightAt([], '2026-09-20')).toBeUndefined()
  })

  test('targetsFor still returns a calorie target after a skipped week of weigh ins', () => {
    const days = [mkDay('2026-09-08', { bodyWeight: 240 })]
    const t = targetsFor(input({ days }), '2026-09-20')
    expect(t.calories).toBeDefined()
    expect(t.missing).toEqual([])
  })
})

describe('measured maintenance', () => {
  const end = '2026-09-20'
  const start = addDays(end, -27)
  const falling = eachDay(start, end).map((d, i) => mkDay(d, { bodyWeight: 240 - 0.2 * i, steps: 8000 }))
  const eat = (kcal: number, count = 28) => eachDay(start, end).slice(0, count).map((d) => mkMeal(d, kcal, 150))

  test('intake plus the energy in the weight lost', () => {
    // 7 day average falls 4.2 lb across 21 days: 4.2 * 3500 / 21 = 700 kcal a day on top of 2500 eaten.
    expect(measuredMaintenance(input({ days: falling, meals: eat(2500) }), end)).toBeCloseTo(3200, 0)
    expect(maintenanceAt(input({ days: falling, meals: eat(2500) }), end)).toMatchObject({ source: 'measured' })
  })

  test('needs 14 complete days, else falls back to the formula', () => {
    const thin = input({ days: falling, meals: eat(2500, 13) })
    expect(measuredMaintenance(thin, end)).toBeUndefined()
    expect(maintenanceAt(thin, end).source).toBe('formula')
  })

  test('an implausible result is discarded', () => {
    expect(measuredMaintenance(input({ days: falling, meals: eat(6000) }), end)).toBeUndefined()
  })

  test('needs a weight average at both ends', () => {
    expect(measuredMaintenance(input({ days: falling.slice(10), meals: eat(2500) }), end)).toBeUndefined()
  })

  test('no data at all gives source none', () => {
    expect(maintenanceAt(input({ days: [], settings: { defaultWithTrainer: true, customCardioTypes: [] } }), end)).toEqual({ value: undefined, source: 'none' })
  })
})

describe('targetsFor', () => {
  test('formula maintenance minus the capped deficit, protein from target weight', () => {
    // Maintenance 2954.8. Deficit 0.0075 * 240 * 500 = 900, capped at 25 percent = 738.7. 2216.1 rounds to 2220.
    const t = targetsFor(input(), '2026-09-21')
    expect(t).toMatchObject({ source: 'formula', calories: 2220, protein: 220, caloriesOverridden: false, proteinOverridden: false, missing: [] })
    expect(t.maintenance).toBeCloseTo(2954.8, 0)
  })

  test('holds steady through the week and steps on Monday', () => {
    const drop = input({ days: [...flatDays('2026-08-10', '2026-09-20'), mkDay('2026-09-22', { bodyWeight: 200, steps: 8000 })] })
    expect(targetsFor(drop, '2026-09-23').calories).toBe(2220)
    expect(targetsFor(drop, '2026-09-27').calories).toBe(2220)
    expect(targetsFor(drop, '2026-09-28').calories).not.toBe(2220)
  })

  test('overrides win', () => {
    const t = targetsFor(input({ settings: { ...settings, calorieTargetOverride: 2000, proteinTargetOverride: 180 } }), '2026-09-21')
    expect(t).toMatchObject({ calories: 2000, protein: 180, caloriesOverridden: true, proteinOverridden: true })
  })

  test('never below the floor', () => {
    const small = input({ days: flatDays('2026-08-10', '2026-09-20', 110, 2000), settings: { ...settings, heightInches: 60, targetBodyWeight: 100 } })
    expect(targetsFor(small, '2026-09-21').calories).toBe(1500)
    expect(targetsFor({ ...small, settings: { ...small.settings, sex: 'female' } }, '2026-09-21').calories).toBe(1200)
  })

  test('at or below target weight the target is maintenance', () => {
    const t = targetsFor(input({ settings: { ...settings, targetBodyWeight: 240 } }), '2026-09-21')
    expect(t.calories).toBe(2950)
  })

  test('protein falls back to 0.8 g per pound of current weight, rounded to 5', () => {
    expect(targetsFor(input({ settings: { ...settings, targetBodyWeight: undefined } }), '2026-09-21').protein).toBe(190)
  })

  test('a first week with no data on the prior Sunday still gets a target', () => {
    const fresh = input({ days: [mkDay('2026-09-22', { bodyWeight: 240, steps: 8000 })] })
    expect(targetsFor(fresh, '2026-09-22').calories).toBe(2220)
  })

  test('missing profile fields are reported', () => {
    const t = targetsFor(input({ settings: { defaultWithTrainer: true, customCardioTypes: [] } }), '2026-09-21')
    expect(t.calories).toBeUndefined()
    expect(t.missing).toEqual(['sex', 'height', 'birth year'])
  })
})
