import type { SetRecord } from '../domain/types'
import { mkEntry, mkWorkout } from './testData'
import { entryE1rm, entryFeet, entrySeconds, entryTopWeight, entryVolume, epley, exerciseMap, workingSets, workoutVolume, workoutWorkingSetCount } from './sets'
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

describe('time and carry sets', () => {
  const held = (weight: number, seconds: number): SetRecord => ({ weight, reps: 0, warmup: false, seconds })
  const carried = (weight: number, feet: number): SetRecord => ({ weight, reps: 0, warmup: false, feet })

  test('a held set counts as a working set even with no reps', () => {
    const e = { id: 'e1', exerciseId: 'plank', sets: [held(0, 60)] }
    expect(workingSets(e).length).toBe(1)
  })

  test('a carried set counts as a working set', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [carried(150, 100)] }
    expect(workingSets(e).length).toBe(1)
  })

  test('an empty set is still not a working set', () => {
    const e = { id: 'e1', exerciseId: 'plank', sets: [{ weight: 0, reps: 0, warmup: false }] }
    expect(workingSets(e).length).toBe(0)
  })

  test('a warmup carry is still a warmup', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [{ ...carried(100, 50), warmup: true }] }
    expect(workingSets(e).length).toBe(0)
  })

  test('contributes no tonnage, so a long carry cannot swamp the volume chart', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [{ weight: 150, reps: 0, warmup: false, seconds: 60, feet: 200 }] }
    expect(entryVolume(e)).toBe(0)
  })

  test('still reports its top weight, which is the number that progresses', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [carried(150, 100), carried(170, 80)] }
    expect(entryTopWeight(e)).toBe(170)
  })

  test('has no estimated one rep max, because it has no reps', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [carried(150, 100)] }
    expect(entryE1rm(e)).toBe(0)
  })

  test('sums the seconds and the feet across an entry', () => {
    const e = { id: 'e1', exerciseId: 'farmers-carry', sets: [{ weight: 150, reps: 0, warmup: false, seconds: 40, feet: 100 }, { weight: 150, reps: 0, warmup: false, seconds: 35, feet: 90 }] }
    expect(entrySeconds(e)).toBe(75)
    expect(entryFeet(e)).toBe(190)
  })

  test('ignores warmups when summing seconds and feet', () => {
    const e = { id: 'e1', exerciseId: 'plank', sets: [{ weight: 0, reps: 0, warmup: true, seconds: 20 }, { weight: 0, reps: 0, warmup: false, seconds: 60 }] }
    expect(entrySeconds(e)).toBe(60)
  })
})
