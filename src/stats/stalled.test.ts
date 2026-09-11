import { mkEntry, mkWorkout } from './testData'
import { exerciseMap } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { stalledLifts } from './stalled'

const exMap = exerciseMap(BUILTIN_EXERCISES)

describe('stalledLifts', () => {
  test('flags a lift whose last two sessions used the same top weight and reps held or rose', () => {
    const ws = [
      mkWorkout('2026-09-01', [mkEntry('back-squat', [[185, 8], [185, 8], [185, 7]])]),
      mkWorkout('2026-09-05', [mkEntry('back-squat', [[185, 8], [185, 8], [185, 8]])]),
    ]
    expect(stalledLifts(ws, exMap, '2026-09-01')).toEqual([
      { exerciseId: 'back-squat', variation: '', topWeight: 185, increment: 10, lastDate: '2026-09-05' },
    ])
  })

  test('does not flag when reps dropped, weight changed, or only one session exists', () => {
    const dropped = [
      mkWorkout('2026-09-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[30, 10]])]),
    ]
    const changed = [
      mkWorkout('2026-09-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[35, 12]])]),
    ]
    const single = [mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[30, 12]])])]
    expect(stalledLifts(dropped, exMap, '2026-09-01')).toEqual([])
    expect(stalledLifts(changed, exMap, '2026-09-01')).toEqual([])
    expect(stalledLifts(single, exMap, '2026-09-01')).toEqual([])
  })

  test('ignores lifts whose last session is before since', () => {
    const ws = [
      mkWorkout('2026-08-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-08-05', [mkEntry('dumbbell-curl', [[30, 12]])]),
    ]
    expect(stalledLifts(ws, exMap, '2026-09-01')).toEqual([])
  })
})

describe('stalledLifts keys by variant', () => {
  test('a tempo variant stalls independently and reports its variation', () => {
    const ws = [
      mkWorkout('2026-09-01', [{ ...mkEntry('back-squat', [[135, 5]]), variation: 'Pause' }]),
      mkWorkout('2026-09-03', [mkEntry('back-squat', [[185, 5]])]),
      mkWorkout('2026-09-05', [{ ...mkEntry('back-squat', [[135, 5]]), variation: 'pause' }]),
    ]
    expect(stalledLifts(ws, exMap, '2026-09-01')).toEqual([
      { exerciseId: 'back-squat', variation: 'pause', topWeight: 135, increment: 10, lastDate: '2026-09-05' },
    ])
  })
})
