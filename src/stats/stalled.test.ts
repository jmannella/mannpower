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

describe('exercises measured in time or distance', () => {
  const exMap = exerciseMap(BUILTIN_EXERCISES)
  const carry = (date: string, weight: number, seconds: number, feet: number) =>
    mkWorkout(date, [{ id: 'c' + date, exerciseId: 'farmers-carry', sets: [{ weight, reps: 0, warmup: false, seconds, feet }] }])

  // Same reading as reps: holding the same weight for longer is the cue to make it heavier.
  test('a carry held longer at the same weight is the cue to add weight', () => {
    const ws = [carry('2026-09-07', 150, 40, 100), carry('2026-09-14', 150, 55, 100)]
    expect(stalledLifts(ws, exMap, '2026-09-07').map((s) => s.exerciseId)).toContain('farmers-carry')
  })

  test('a carry taken further at the same weight reads the same way', () => {
    const ws = [carry('2026-09-07', 150, 40, 100), carry('2026-09-14', 150, 40, 140)]
    expect(stalledLifts(ws, exMap, '2026-09-07').map((s) => s.exerciseId)).toContain('farmers-carry')
  })

  test('a carry identical on every count is a stall, and worth adding weight to', () => {
    const ws = [carry('2026-09-07', 150, 40, 100), carry('2026-09-14', 150, 40, 100)]
    expect(stalledLifts(ws, exMap, '2026-09-07').map((s) => s.exerciseId)).toContain('farmers-carry')
  })

  test('a carry that went backwards is not called stalled either', () => {
    const ws = [carry('2026-09-07', 150, 60, 100), carry('2026-09-14', 150, 30, 100)]
    expect(stalledLifts(ws, exMap, '2026-09-07').map((s) => s.exerciseId)).not.toContain('farmers-carry')
  })
})
