import { mkEntry, mkWorkout } from './testData'
import { exerciseMap } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { muscleLoadForRange, underTrainedGroups, weeklyMuscleLoad, weeklyMuscleSeries, workoutMuscleLoad } from './muscle'

const exMap = exerciseMap(BUILTIN_EXERCISES)

describe('muscle load', () => {
  test('primary gets full credit, secondary gets half', () => {
    // Barbell bench: chest primary, triceps + shoulders secondary
    const w = mkWorkout('2026-09-08', [mkEntry('barbell-bench-press', [[135, 10], [135, 10]], [[95, 10]])])
    const load = workoutMuscleLoad(w, exMap)
    expect(load.chest).toEqual({ sets: 2, volume: 2700 })
    expect(load.triceps).toEqual({ sets: 1, volume: 1350 })
    expect(load.shoulders).toEqual({ sets: 1, volume: 1350 })
    expect(load.quads).toEqual({ sets: 0, volume: 0 })
  })

  test('unknown exercise ids are skipped', () => {
    const w = mkWorkout('2026-09-08', [mkEntry('deleted-custom', [[100, 10]])])
    expect(workoutMuscleLoad(w, exMap).chest.sets).toBe(0)
  })

  test('weekly load only counts the Monday to Sunday window', () => {
    const ws = [
      mkWorkout('2026-09-06', [mkEntry('leg-extension', [[100, 10]])]), // Sunday, previous week
      mkWorkout('2026-09-07', [mkEntry('leg-extension', [[100, 10]])]), // Monday
      mkWorkout('2026-09-13', [mkEntry('leg-extension', [[100, 10]])]), // Sunday
      mkWorkout('2026-09-14', [mkEntry('leg-extension', [[100, 10]])]), // next Monday
    ]
    expect(weeklyMuscleLoad(ws, exMap, '2026-09-07').quads.sets).toBe(2)
    expect(muscleLoadForRange(ws, exMap, '2026-09-06', '2026-09-14').quads.sets).toBe(4)
  })

  test('underTrainedGroups flags groups under 10 sets that were trained in the last four weeks', () => {
    const ws = [
      mkWorkout('2026-08-20', [mkEntry('lat-pulldown', [[100, 10]])]), // back, three weeks earlier
      mkWorkout('2026-09-08', [mkEntry('leg-extension', Array(10).fill([100, 10]) as [number, number][])]),
      mkWorkout('2026-09-09', [mkEntry('lateral-raise', [[20, 12], [20, 12]])]),
    ]
    const flagged = underTrainedGroups(ws, exMap, '2026-09-07')
    expect(flagged).toContain('back')       // trained recently, zero this week
    expect(flagged).toContain('shoulders')  // 2 sets this week
    expect(flagged).not.toContain('quads')  // 10 sets
    expect(flagged).not.toContain('chest')  // never trained
  })

  test('weeklyMuscleSeries returns one row per week', () => {
    const ws = [mkWorkout('2026-09-08', [mkEntry('leg-extension', [[100, 10]])])]
    const series = weeklyMuscleSeries(ws, exMap, '2026-08-31', '2026-09-14')
    expect(series.map((s) => s.week)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
    expect(series[1].load.quads.sets).toBe(1)
  })
})

describe('adductors', () => {
  const exMap = exerciseMap(BUILTIN_EXERCISES)

  test('a squat credits them at half a set and half the volume, as any secondary', () => {
    const w = mkWorkout('2026-09-14', [mkEntry('back-squat', [[225, 5], [225, 5]])])
    const load = workoutMuscleLoad(w, exMap)
    expect(load.quads.sets).toBe(2)
    expect(load.quads.volume).toBe(2250)
    expect(load.adductors.sets).toBe(1)
    expect(load.adductors.volume).toBe(1125)
  })

  test('the adduction machine credits them as the primary', () => {
    const w = mkWorkout('2026-09-14', [mkEntry('hip-adduction-machine', [[90, 12]])])
    const load = workoutMuscleLoad(w, exMap)
    expect(load.adductors.sets).toBe(1)
    expect(load.adductors.volume).toBe(1080)
    expect(load.glutes.sets).toBe(0)
  })

  test('the abduction machine still credits the glutes and not the adductors', () => {
    const load = workoutMuscleLoad(mkWorkout('2026-09-14', [mkEntry('hip-abduction-machine', [[70, 15]])]), exMap)
    expect(load.glutes.sets).toBe(1)
    expect(load.adductors.sets).toBe(0)
  })

  test('a leg day of curls and extensions leaves them at zero', () => {
    const w = mkWorkout('2026-09-14', [mkEntry('leg-extension', [[100, 12]]), mkEntry('lying-leg-curl', [[90, 12]])])
    expect(workoutMuscleLoad(w, exMap).adductors.sets).toBe(0)
  })
})
