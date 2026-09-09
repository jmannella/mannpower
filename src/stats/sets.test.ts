import { mkEntry, mkWorkout } from './testData'
import { entryE1rm, entryTopWeight, entryVolume, epley, exerciseMap, workingSets, workoutVolume, workoutWorkingSetCount } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'

describe('sets', () => {
  const entry = mkEntry('back-squat', [[135, 10], [155, 8], [155, 6]], [[95, 10]])

  test('workingSets drops warm-ups and empty rows', () => {
    expect(workingSets(entry)).toHaveLength(3)
    expect(workingSets(mkEntry('x', [[135, 5], [0, 0], [135, 0]]))).toHaveLength(1)
  })

  test('volume ignores warm-ups', () => {
    expect(entryVolume(entry)).toBe(135 * 10 + 155 * 8 + 155 * 6)
    expect(workoutVolume(mkWorkout('2026-09-08', [entry, entry]))).toBe(2 * entryVolume(entry))
    expect(workoutWorkingSetCount(mkWorkout('2026-09-08', [entry]))).toBe(3)
  })

  test('epley formula', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(100, 10)).toBeCloseTo(133.33, 2)
    expect(epley(0, 10)).toBe(0)
    expect(epley(100, 0)).toBe(0)
  })

  test('entryE1rm is the best working set and topWeight is the heaviest', () => {
    expect(entryE1rm(entry)).toBeCloseTo(epley(155, 8), 5)
    expect(entryTopWeight(entry)).toBe(155)
    expect(entryE1rm(mkEntry('x', [], [[95, 10]]))).toBe(0)
    expect(entryTopWeight(mkEntry('x', []))).toBe(0)
  })

  test('exerciseMap keys by id', () => {
    expect(exerciseMap(BUILTIN_EXERCISES).get('back-squat')?.name).toBe('Back Squat')
  })
})
