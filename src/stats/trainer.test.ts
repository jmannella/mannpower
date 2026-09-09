import { mkEntry, mkWorkout } from './testData'
import { trainerSplit } from './trainer'

describe('trainerSplit', () => {
  test('counts and means per mode', () => {
    const ws = [
      mkWorkout('2026-09-07', [mkEntry('back-squat', [[185, 8], [185, 8]])], { withTrainer: true }),      // 2960, 2 sets
      mkWorkout('2026-09-09', [mkEntry('back-squat', [[185, 8]]), mkEntry('leg-press', [[300, 10]])], { withTrainer: false }), // 4480, 2 sets
      mkWorkout('2026-09-11', [mkEntry('back-squat', [[135, 8]])], { withTrainer: false }),                // 1080, 1 set
    ]
    const s = trainerSplit(ws, '2026-09-07', '2026-09-13')
    expect(s.trainerCount).toBe(1)
    expect(s.soloCount).toBe(2)
    expect(s.trainerMeanVolume).toBe(2960)
    expect(s.soloMeanVolume).toBe((4480 + 1080) / 2)
    expect(s.trainerMeanSets).toBe(2)
    expect(s.soloMeanSets).toBe(1.5)
    // Solo 1: shared back-squat 1480 vs trainer 2960 -> 0.5, not keeping pace.
    // Solo 2: shared back-squat 1080 vs 2960 -> not keeping pace.
    expect(s.soloConsidered).toBe(2)
    expect(s.soloKeepingPaceShare).toBe(0)
  })

  test('solo session with no shared exercises or no prior trainer session is not considered', () => {
    const ws = [
      mkWorkout('2026-09-07', [mkEntry('lat-pulldown', [[100, 10]])], { withTrainer: false }),
      mkWorkout('2026-09-08', [mkEntry('back-squat', [[185, 8]])], { withTrainer: true }),
      mkWorkout('2026-09-10', [mkEntry('leg-press', [[300, 10]])], { withTrainer: false }),
      mkWorkout('2026-09-12', [mkEntry('back-squat', [[185, 8]])], { withTrainer: false }),
    ]
    const s = trainerSplit(ws, '2026-09-07', '2026-09-13')
    expect(s.soloConsidered).toBe(1)
    expect(s.soloKeepingPaceShare).toBe(1)
  })

  test('empty range', () => {
    const s = trainerSplit([], '2026-09-07', '2026-09-13')
    expect(s).toEqual({ trainerCount: 0, soloCount: 0, soloConsidered: 0 })
  })
})
