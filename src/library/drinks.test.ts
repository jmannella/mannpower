import { DRINK_PRESETS, drinkMeal } from './drinks'

describe('drink presets', () => {
  test('offers four presets, all alcohol, none with protein', () => {
    expect(DRINK_PRESETS.map((p) => p.name)).toEqual(['Beer', 'Wine', 'Spirit', 'Seltzer'])
    expect(DRINK_PRESETS.every((p) => p.kind === 'alcohol')).toBe(true)
    expect(DRINK_PRESETS.every((p) => p.protein === 0)).toBe(true)
  })

  test('builds a meal entry a beer can be deleted from', () => {
    const beer = DRINK_PRESETS[0]
    const m = drinkMeal(beer, '2026-09-23', '21:15')
    expect(m.date).toBe('2026-09-23')
    expect(m.time).toBe('21:15')
    expect(m.source).toBe('quick')
    expect(m.description).toBe('Beer')
    expect(m.items).toEqual([{ name: 'Beer', amount: '12 oz', kind: 'alcohol', calories: 150, protein: 0, carbs: 13 }])
  })

  test('gives each drink its own id so two beers are two rows', () => {
    const a = drinkMeal(DRINK_PRESETS[0], '2026-09-23', '21:15')
    const b = drinkMeal(DRINK_PRESETS[0], '2026-09-23', '21:40')
    expect(a.id).not.toBe(b.id)
  })
})
