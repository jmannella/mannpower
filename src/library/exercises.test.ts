import { MUSCLE_GROUPS } from '../domain/types'
import { BUILTIN_EXERCISES, searchExercises, suggestedIncrement } from './exercises'

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
    const goblet = BUILTIN_EXERCISES.find((e) => e.id === 'goblet-squat')!
    const bulgSplit = BUILTIN_EXERCISES.find((e) => e.id === 'bulgarian-split-squat')!
    const barbellGlute = BUILTIN_EXERCISES.find((e) => e.id === 'barbell-glute-bridge')!
    const rackPull = BUILTIN_EXERCISES.find((e) => e.id === 'rack-pull')!
    const deadlift = BUILTIN_EXERCISES.find((e) => e.id === 'deadlift')!
    const rdl = BUILTIN_EXERCISES.find((e) => e.id === 'romanian-deadlift')!
    expect(suggestedIncrement(squat)).toBe(10)
    expect(suggestedIncrement(legExt)).toBe(5)
    expect(suggestedIncrement(bench)).toBe(5)
    expect(suggestedIncrement(goblet)).toBe(5)
    expect(suggestedIncrement(bulgSplit)).toBe(5)
    expect(suggestedIncrement(barbellGlute)).toBe(10)
    expect(suggestedIncrement(rackPull)).toBe(10)
    expect(suggestedIncrement(deadlift)).toBe(10)
    expect(suggestedIncrement(rdl)).toBe(10)
  })
})

describe('library additions and search', () => {
  test('trap bar deadlift and banded lateral walk exist and are found by alias', () => {
    expect(BUILTIN_EXERCISES.find((e) => e.id === 'trap-bar-deadlift')?.primary).toBe('back')
    expect(suggestedIncrement(BUILTIN_EXERCISES.find((e) => e.id === 'trap-bar-deadlift')!)).toBe(10)
    expect(searchExercises(BUILTIN_EXERCISES, 'hex bar').map((e) => e.id)).toEqual(['trap-bar-deadlift'])
    expect(searchExercises(BUILTIN_EXERCISES, 'side band').map((e) => e.id)).toEqual(['banded-lateral-walk'])
  })

  test('searchExercises matches names case-insensitively and returns nothing for blank', () => {
    expect(searchExercises(BUILTIN_EXERCISES, '  ')).toEqual([])
    expect(searchExercises(BUILTIN_EXERCISES, 'BACK SQ').map((e) => e.id)).toEqual(['back-squat'])
    expect(searchExercises(BUILTIN_EXERCISES, 'curl').length).toBeGreaterThan(5)
  })

  test('at least 120 exercises with unique aliases', () => {
    expect(BUILTIN_EXERCISES.length).toBeGreaterThanOrEqual(120)
    const aliases = BUILTIN_EXERCISES.flatMap((e) => e.aliases ?? []).map((a) => a.toLowerCase())
    expect(new Set(aliases).size).toBe(aliases.length)
  })
})
