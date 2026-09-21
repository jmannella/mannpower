import type { DayRecord, MealEntry, Sex, SyncedSettings, Workout } from '../domain/types'
import { addDays, inRange, weekStart } from '../domain/dates'
import { bodyWeightAvg7 } from '../stats/bodyweight'
import { ageOn } from '../stats/longevity'
import { sumItems } from './totals'

/** The slice of the dataset the nutrition maths needs. A Dataset satisfies it. */
export interface NutritionInput {
  meals: MealEntry[]
  days: DayRecord[]
  workouts: Workout[]
  settings: SyncedSettings
}

export const KCAL_PER_LB = 3500
const LB_TO_KG = 0.45359237
const IN_TO_CM = 2.54
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Mifflin St Jeor, taking pounds and inches. */
export function bmr(sex: Sex, weightLb: number, heightInches: number, age: number): number {
  return 10 * weightLb * LB_TO_KG + 6.25 * heightInches * IN_TO_CM - 5 * age + (sex === 'male' ? 5 : -161)
}

/** 7 day average on the date, else the last weight logged on or before it. */
export function weightAt(days: DayRecord[], date: string): number | undefined {
  const avg = bodyWeightAvg7(days, date)
  if (avg !== undefined) return avg
  const prior = days.filter((d) => d.bodyWeight !== undefined && d.date <= date).sort((a, b) => a.date.localeCompare(b.date))
  return prior.length ? prior[prior.length - 1].bodyWeight : undefined
}

/** From the last 14 days of real steps and sessions, so it is never a guess Jeremy has to make. */
export function activityFactor(days: DayRecord[], workouts: Workout[], date: string): number {
  const from = addDays(date, -13)
  const steps = days.filter((d) => d.steps !== undefined && inRange(d.date, from, date)).map((d) => d.steps as number)
  const avg = steps.length ? mean(steps) : undefined
  const base = avg === undefined ? 1.4 : avg < 5000 ? 1.3 : avg < 7500 ? 1.4 : avg < 10000 ? 1.5 : 1.6
  const sessions = workouts.filter((w) => inRange(w.date, from, date) && w.entries.length > 0).length
  return base + (sessions >= 5 ? 0.05 : 0)
}

export function missingProfileFields(input: NutritionInput, date: string): string[] {
  const s = input.settings
  const missing: string[] = []
  if (!s.sex) missing.push('sex')
  if (!s.heightInches) missing.push('height')
  if (!s.birthYear) missing.push('birth year')
  if (weightAt(input.days, date) === undefined) missing.push('body weight')
  return missing
}

export function formulaMaintenance(input: NutritionInput, date: string): number | undefined {
  const s = input.settings
  const weight = weightAt(input.days, date)
  if (!s.sex || !s.heightInches || !s.birthYear || weight === undefined) return undefined
  return bmr(s.sex, weight, s.heightInches, ageOn(s.birthYear, date)) * activityFactor(input.days, input.workouts, date)
}

export interface DayIntake {
  date: string
  calories: number
  protein: number
  fibre: number
  pending: boolean
  complete: boolean
}

/**
 * One row per date that has a meal. A day is complete when it reaches half of that date's own formula
 * maintenance (a flat 1000 on a date with no formula value) and has no meal waiting for an estimate. The
 * threshold is computed per date, not anchored to the window end, so a past day classifies the same way no
 * matter which window it is viewed through. The formula value is used on purpose: the measured value depends
 * on complete days, so using it here would be circular.
 */
export function dailyIntake(input: NutritionInput, from: string, to: string): DayIntake[] {
  const byDate = new Map<string, MealEntry[]>()
  for (const m of input.meals) {
    if (!inRange(m.date, from, to)) continue
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, meals]) => {
    const formula = formulaMaintenance(input, date)
    const threshold = formula === undefined ? 1000 : formula / 2
    const t = sumItems(meals.flatMap((m) => m.items))
    const pending = meals.some((m) => m.needsEstimate)
    return { date, calories: t.calories, protein: t.protein, fibre: t.fibre, pending, complete: !pending && t.calories >= threshold }
  })
}

/** Average intake on complete days minus the energy in the weight change, over a trailing 28 day window. */
export function measuredMaintenance(input: NutritionInput, date: string): number | undefined {
  const wEnd = bodyWeightAvg7(input.days, date)
  const wStart = bodyWeightAvg7(input.days, addDays(date, -21))
  if (wEnd === undefined || wStart === undefined) return undefined
  const complete = dailyIntake(input, addDays(date, -27), date).filter((d) => d.complete)
  if (complete.length < 14) return undefined
  const value = mean(complete.map((d) => d.calories)) - ((wEnd - wStart) * KCAL_PER_LB) / 21
  return value >= 1200 && value <= 5000 ? value : undefined
}

export type MaintenanceSource = 'measured' | 'formula' | 'none'

export function maintenanceAt(input: NutritionInput, date: string): { value?: number; source: MaintenanceSource } {
  const measured = measuredMaintenance(input, date)
  if (measured !== undefined) return { value: measured, source: 'measured' }
  const formula = formulaMaintenance(input, date)
  if (formula !== undefined) return { value: formula, source: 'formula' }
  return { value: undefined, source: 'none' }
}

export interface Targets {
  maintenance?: number
  source: MaintenanceSource
  calories?: number
  protein?: number
  caloriesOverridden: boolean
  proteinOverridden: boolean
  /** Settings fields still needed before a target can be computed. */
  missing: string[]
}

/** Middle of the healthy loss band: 0.75 percent of body weight a week. */
const WEEKLY_LOSS_FRACTION = 0.0075

export function targetsFor(input: NutritionInput, date: string): Targets {
  const s = input.settings
  // Computed as of the Sunday before this week so the number holds steady Monday to Sunday.
  const sunday = addDays(weekStart(date), -1)
  const asOf = maintenanceAt(input, sunday).source === 'none' ? date : sunday
  const m = maintenanceAt(input, asOf)
  const weight = weightAt(input.days, asOf)

  let calories: number | undefined
  if (m.value !== undefined && weight !== undefined) {
    const atGoal = s.targetBodyWeight !== undefined && weight <= s.targetBodyWeight
    const deficit = atGoal ? 0 : Math.min((WEEKLY_LOSS_FRACTION * weight * KCAL_PER_LB) / 7, 0.25 * m.value)
    const floor = s.sex === 'female' ? 1200 : 1500
    calories = Math.max(floor, Math.round((m.value - deficit) / 10) * 10)
  }
  const proteinBase = s.targetBodyWeight !== undefined ? s.targetBodyWeight : weight === undefined ? undefined : 0.8 * weight
  const protein = proteinBase === undefined ? undefined : Math.round(proteinBase / 5) * 5

  return {
    maintenance: m.value,
    source: m.source,
    calories: s.calorieTargetOverride ?? calories,
    protein: s.proteinTargetOverride ?? protein,
    caloriesOverridden: s.calorieTargetOverride !== undefined,
    proteinOverridden: s.proteinTargetOverride !== undefined,
    missing: m.source === 'measured' ? [] : missingProfileFields(input, asOf),
  }
}
