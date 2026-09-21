import { addDays, eachDay, inRange, parseISO } from '../domain/dates'
import { bodyWeightAvg7 } from './bodyweight'
import { KCAL_PER_LB, dailyIntake, maintenanceAt, targetsFor, type DayIntake, type MaintenanceSource, type NutritionInput } from '../nutrition/targets'

/** Meals at or after this time count as late eating. */
export const LATE_TIME = '20:00'

export interface NutritionWeek {
  mealsLogged: number
  pendingMeals: number
  completeDays: number
  /** False under 3 complete days. Only the three counts above are meaningful then. */
  enoughData: boolean
  calorieTarget?: number
  proteinTarget?: number
  avgCalories?: number
  avgProtein?: number
  avgFibre?: number
  proteinDaysHit?: number
  maintenance?: number
  maintenanceSource: MaintenanceSource
  /** Maintenance minus average intake. Positive means a deficit. */
  avgDeficit?: number
  /** What that deficit predicts for the week, in pounds. Negative is loss. */
  predictedChangeLbs?: number
  /** Change in the 7 day average weight across the week. */
  actualChangeLbs?: number
  weekdayAvgCalories?: number
  weekendAvgCalories?: number
  trainingDay?: { days: number; calories: number; protein: number }
  restDay?: { days: number; calories: number; protein: number }
  topItems: { name: string; calories: number; count: number }[]
  /** Non alcoholic drinks. */
  drinkSharePct?: number
  alcoholSharePct?: number
  lateSharePct?: number
  /** Standard deviation of complete day calories. */
  calorieSpread?: number
  month?: { completeDays: number; maintenanceStart?: number; maintenanceEnd?: number }
}

const mean = (xs: number[]): number | undefined => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const isWeekend = (date: string) => { const d = parseISO(date).getDay(); return d === 0 || d === 6 }

function group(rows: DayIntake[]): { days: number; calories: number; protein: number } | undefined {
  if (rows.length === 0) return undefined
  return { days: rows.length, calories: mean(rows.map((r) => r.calories)) as number, protein: mean(rows.map((r) => r.protein)) as number }
}

export function nutritionWeek(input: NutritionInput, start: string, end: string, monthly: boolean): NutritionWeek {
  const inWeek = input.meals.filter((m) => inRange(m.date, start, end))
  const complete = dailyIntake(input, start, end).filter((d) => d.complete)
  const maintenance = maintenanceAt(input, end)
  const out: NutritionWeek = {
    mealsLogged: inWeek.length,
    pendingMeals: inWeek.filter((m) => m.needsEstimate).length,
    completeDays: complete.length,
    enoughData: complete.length >= 3,
    maintenanceSource: maintenance.source,
    topItems: [],
  }
  if (monthly) {
    out.month = {
      completeDays: dailyIntake(input, addDays(end, -27), end).filter((d) => d.complete).length,
      maintenanceStart: maintenanceAt(input, addDays(end, -28)).value,
      maintenanceEnd: maintenance.value,
    }
  }
  if (!out.enoughData) return out

  // The targets Jeremy actually saw this week.
  const targets = targetsFor(input, start)
  const calories = complete.map((d) => d.calories)
  const avgCalories = mean(calories) as number
  out.calorieTarget = targets.calories
  out.proteinTarget = targets.protein
  out.avgCalories = avgCalories
  out.avgProtein = mean(complete.map((d) => d.protein))
  out.avgFibre = mean(complete.map((d) => d.fibre))
  if (targets.protein !== undefined) out.proteinDaysHit = complete.filter((d) => d.protein >= (targets.protein as number)).length
  out.maintenance = maintenance.value
  if (maintenance.value !== undefined) {
    out.avgDeficit = maintenance.value - avgCalories
    out.predictedChangeLbs = (-out.avgDeficit * 7) / KCAL_PER_LB
  }
  const wEnd = bodyWeightAvg7(input.days, end)
  const wStart = bodyWeightAvg7(input.days, addDays(end, -7))
  if (wEnd !== undefined && wStart !== undefined) out.actualChangeLbs = wEnd - wStart

  out.weekdayAvgCalories = mean(complete.filter((d) => !isWeekend(d.date)).map((d) => d.calories))
  out.weekendAvgCalories = mean(complete.filter((d) => isWeekend(d.date)).map((d) => d.calories))
  const trainingDates = new Set(input.workouts.filter((w) => w.entries.length > 0).map((w) => w.date))
  out.trainingDay = group(complete.filter((d) => trainingDates.has(d.date)))
  out.restDay = group(complete.filter((d) => !trainingDates.has(d.date)))

  const estimated = inWeek.filter((m) => !m.needsEstimate)
  const byName = new Map<string, { name: string; calories: number; count: number }>()
  let total = 0, drink = 0, alcohol = 0, late = 0
  for (const m of estimated) for (const i of m.items) {
    total += i.calories
    if (i.kind === 'drink') drink += i.calories
    if (i.kind === 'alcohol') alcohol += i.calories
    if (m.time >= LATE_TIME) late += i.calories
    const key = i.name.trim().toLowerCase()
    const row = byName.get(key) ?? { name: i.name.trim(), calories: 0, count: 0 }
    row.calories += i.calories
    row.count += 1
    byName.set(key, row)
  }
  out.topItems = [...byName.values()].sort((a, b) => b.calories - a.calories).slice(0, 5)
  if (total > 0) {
    out.drinkSharePct = (drink / total) * 100
    out.alcoholSharePct = (alcohol / total) * 100
    out.lateSharePct = (late / total) * 100
  }
  out.calorieSpread = Math.sqrt(mean(calories.map((c) => (c - avgCalories) ** 2)) as number)
  return out
}

export interface NutritionDayRow {
  date: string
  label: string
  calories?: number
  protein?: number
  complete: boolean
  /** Mean calories of the complete days in the trailing 7 days. */
  avg7?: number
}

export function nutritionSeries(input: NutritionInput, from: string, to: string): NutritionDayRow[] {
  const intake = new Map(dailyIntake(input, addDays(from, -6), to).map((d) => [d.date, d]))
  return eachDay(from, to).map((date) => {
    const d = intake.get(date)
    const trailing = eachDay(addDays(date, -6), date).map((x) => intake.get(x)).filter((x): x is DayIntake => x !== undefined && x.complete)
    return { date, label: date.slice(5), calories: d?.calories, protein: d?.protein, complete: d?.complete ?? false, avg7: mean(trailing.map((x) => x.calories)) }
  })
}

/** Maintenance minus average intake over the last 14 complete days (within 28 days). Needs at least three. */
export function recentDeficit(input: NutritionInput, date: string): number | undefined {
  const maintenance = maintenanceAt(input, date).value
  const complete = dailyIntake(input, addDays(date, -27), date).filter((d) => d.complete).slice(-14)
  if (maintenance === undefined || complete.length < 3) return undefined
  return maintenance - (mean(complete.map((d) => d.calories)) as number)
}
