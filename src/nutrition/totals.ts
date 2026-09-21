import type { FoodItem, MealEntry } from '../domain/types'

export interface Totals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

export function sumItems(items: FoodItem[]): Totals {
  const t: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
  for (const i of items) {
    t.calories += i.calories
    t.protein += i.protein
    t.carbs += i.carbs ?? 0
    t.fat += i.fat ?? 0
    t.fibre += i.fibre ?? 0
  }
  return t
}

export function mealTotals(meal: MealEntry): Totals {
  return sumItems(meal.items)
}

export function dayTotals(meals: MealEntry[], date: string): Totals & { meals: number; pending: number } {
  const day = meals.filter((m) => m.date === date)
  return { ...sumItems(day.flatMap((m) => m.items)), meals: day.length, pending: day.filter((m) => m.needsEstimate).length }
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Portion multiplier for the confirm view. */
export function scaleItems(items: FoodItem[], factor: number): FoodItem[] {
  if (factor === 1) return items.map((i) => ({ ...i }))
  return items.map((i) => ({
    ...i,
    calories: Math.round(i.calories * factor),
    protein: round1(i.protein * factor),
    ...(i.carbs === undefined ? {} : { carbs: round1(i.carbs * factor) }),
    ...(i.fat === undefined ? {} : { fat: round1(i.fat * factor) }),
    ...(i.fibre === undefined ? {} : { fibre: round1(i.fibre * factor) }),
  }))
}
