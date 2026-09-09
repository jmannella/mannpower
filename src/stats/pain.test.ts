import { mkEntry, mkPain, mkWorkout } from './testData'
import { flareRate, painPatterns } from './pain'

const squat = () => mkEntry('back-squat', [[185, 8], [185, 8], [185, 8]])
const bench = () => mkEntry('barbell-bench-press', [[135, 8]])

describe('pain', () => {
  test('flareRate counts workouts with the exercise that have a linked pain entry', () => {
    const w1 = mkWorkout('2026-09-01', [squat()], { id: 'w1' })
    const w2 = mkWorkout('2026-09-03', [squat(), bench()], { id: 'w2' })
    const w3 = mkWorkout('2026-09-05', [bench()], { id: 'w3' })
    const pain = [
      mkPain('2026-09-01', 'lower_back', 3, { workoutId: 'w1', exerciseId: 'back-squat' }),
      mkPain('2026-09-03', 'lower_back', 2, { workoutId: 'w2' }), // not linked to an exercise
    ]
    expect(flareRate([w1, w2, w3], pain, 'back-squat')).toEqual({ rate: 0.5, flares: 1, sessions: 2 })
    expect(flareRate([w1, w2, w3], pain, 'barbell-bench-press')).toEqual({ rate: 0, flares: 0, sessions: 2 })
    expect(flareRate([], pain, 'back-squat')).toEqual({ rate: 0, flares: 0, sessions: 0 })
  })

  test('painPatterns ranks co-occurring exercises and tracks severity and spikes', () => {
    const workouts = [
      mkWorkout('2026-08-24', [bench()], { id: 'a' }),
      mkWorkout('2026-08-31', [squat(), bench()], { id: 'b' }),
      mkWorkout('2026-09-02', [squat()], { id: 'c' }),
      mkWorkout('2026-09-07', [squat(), squat(), squat()], { id: 'd' }), // big volume jump week of Sep 7
      mkWorkout('2026-09-09', [bench()], { id: 'e' }),
    ]
    const pain = [
      mkPain('2026-08-31', 'lower_back', 2, { workoutId: 'b' }),
      mkPain('2026-09-02', 'lower_back', 3, { workoutId: 'c', limited: true }),
      mkPain('2026-09-07', 'lower_back', 4, { workoutId: 'd' }),
      mkPain('2026-09-09', 'neck', 1), // only one entry, not reported
    ]
    const patterns = painPatterns(workouts, pain, '2026-09-13')
    expect(patterns).toHaveLength(1)
    const p = patterns[0]
    expect(p.area).toBe('lower_back')
    expect(p.count).toBe(3)
    expect(p.limitedCount).toBe(1)
    expect(p.lastDate).toBe('2026-09-07')
    expect(p.daysSinceLast).toBe(6)
    expect(p.severityTrend).toBe('up')
    expect(p.exercises[0].exerciseId).toBe('back-squat')
    expect(p.exercises[0].coRate).toBe(1)
    expect(p.exercises[0].baseRate).toBeCloseTo(3 / 5, 5)
    // All three entries fell in weeks whose volume was more than 20% above the week before.
    expect(p.afterVolumeSpike).toBe(3)
  })

  test('entry on a day with no workout still counts for the area', () => {
    const pain = [mkPain('2026-09-01', 'knee_left', 2), mkPain('2026-09-05', 'knee_left', 2)]
    const p = painPatterns([], pain, '2026-09-08')[0]
    expect(p.count).toBe(2)
    expect(p.exercises).toEqual([])
    expect(p.severityTrend).toBe('n/a')
  })
})
