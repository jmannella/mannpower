import { MUSCLE_GROUPS } from '../domain/types'
import { BUILTIN_EXERCISES, suggestedIncrement } from './exercises'

describe('built-in exercise library', () => {
  test('has about a hundred exercises', () => {
    expect(BUILTIN_EXERCISES.length).toBeGreaterThanOrEqual(90)
  })

  test('ids and names are unique', () => {
    const ids = new Set(BUILTIN_EXERCISES.map((e) => e.id))
    const names = new Set(BUILTIN_EXERCISES.map((e) => e.name.toLowerCase()))
    expect(ids.size).toBe(BUILTIN_EXERCISES.length)
    expect(names.size).toBe(BUILTIN_EXERCISES.length)
  })

  test('every exercise has valid groups and is not custom', () => {
    for (const e of BUILTIN_EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(e.primary)
      for (const s of e.secondary) expect(MUSCLE_GROUPS).toContain(s)
      expect(e.secondary).not.toContain(e.primary)
      expect(e.custom).toBe(false)
      expect(e.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  test('every muscle group has at least four exercises', () => {
    for (const g of MUSCLE_GROUPS) {
      expect(BUILTIN_EXERCISES.filter((e) => e.primary === g).length).toBeGreaterThanOrEqual(4)
    }
  })

  test('suggested increment is 10 for big lower body lifts, 5 otherwise', () => {
    const squat = BUILTIN_EXERCISES.find((e) => e.id === 'back-squat')!
    const legExt = BUILTIN_EXERCISES.find((e) => e.id === 'leg-extension')!
    const bench = BUILTIN_EXERCISES.find((e) => e.id === 'barbell-bench-press')!
    expect(suggestedIncrement(squat)).toBe(10)
    expect(suggestedIncrement(legExt)).toBe(5)
    expect(suggestedIncrement(bench)).toBe(5)
  })
})
