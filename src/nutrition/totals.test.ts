import { mkMeal } from '../stats/testData'
import { dayTotals, mealTotals, scaleItems, sumItems } from './totals'

describe('totals', () => {
  test('sumItems treats missing macros as zero', () => {
    expect(sumItems([
      { name: 'Wrap', kind: 'food', calories: 520, protein: 32, carbs: 48, fat: 20, fibre: 4 },
      { name: 'Coffee', kind: 'drink', calories: 230, protein: 4 },
    ])).toEqual({ calories: 750, protein: 36, carbs: 48, fat: 20, fibre: 4 })
    expect(sumItems([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 })
  })

  test('mealTotals and dayTotals', () => {
    const meals = [mkMeal('2026-09-21', 700, 40), mkMeal('2026-09-21', 500, 30), mkMeal('2026-09-22', 900, 50),
      mkMeal('2026-09-21', 0, 0, { items: [], needsEstimate: true })]
    expect(mealTotals(meals[0]).calories).toBe(700)
    expect(dayTotals(meals, '2026-09-21')).toMatchObject({ calories: 1200, protein: 70, meals: 3, pending: 1 })
    expect(dayTotals(meals, '2026-09-23')).toMatchObject({ calories: 0, meals: 0, pending: 0 })
  })

  test('scaleItems rounds calories to whole numbers and macros to one decimal, and does not mutate', () => {
    const items = [{ name: 'Burger', kind: 'food' as const, calories: 615, protein: 30.5, carbs: 41, fat: 33 }]
    const half = scaleItems(items, 0.5)
    expect(half[0]).toMatchObject({ calories: 308, protein: 15.3, carbs: 20.5, fat: 16.5 })
    expect(half[0].fibre).toBeUndefined()
    expect(items[0].calories).toBe(615)
    expect(scaleItems(items, 1)[0]).toEqual(items[0])
  })
})
