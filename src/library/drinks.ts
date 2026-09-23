import { newId } from '../domain/ids'
import type { FoodItem, MealEntry } from '../domain/types'

export interface DrinkPreset {
  name: string
  amount: string
  kind: 'alcohol'
  calories: number
  protein: 0
  carbs: number
}

/** Typical values for one standard drink. Edit the entry afterwards for anything unusual. */
export const DRINK_PRESETS: DrinkPreset[] = [
  { name: 'Beer', amount: '12 oz', kind: 'alcohol', calories: 150, protein: 0, carbs: 13 },
  { name: 'Wine', amount: '5 oz', kind: 'alcohol', calories: 125, protein: 0, carbs: 4 },
  { name: 'Spirit', amount: '1.5 oz', kind: 'alcohol', calories: 100, protein: 0, carbs: 0 },
  { name: 'Seltzer', amount: '12 oz', kind: 'alcohol', calories: 100, protein: 0, carbs: 2 },
]

/** One drink as an ordinary meal entry, so it counts in the day's calories and can be deleted on its own. */
export function drinkMeal(preset: DrinkPreset, date: string, time: string): MealEntry {
  const item: FoodItem = {
    name: preset.name, amount: preset.amount, kind: preset.kind,
    calories: preset.calories, protein: preset.protein, carbs: preset.carbs,
  }
  return {
    id: newId(), date, time, description: preset.name, items: [item],
    source: 'quick', createdAt: '', updatedAt: '',
  }
}
