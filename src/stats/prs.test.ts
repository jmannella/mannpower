import { mkEntry, mkWorkout } from './testData'
import { bestBefore, exerciseHistory, prsForWorkout } from './prs'
import { epley } from './sets'

const w1 = mkWorkout('2026-09-01', [mkEntry('back-squat', [[135, 10], [135, 10]])])
const w2 = mkWorkout('2026-09-04', [mkEntry('back-squat', [[145, 8]]), mkEntry('leg-press', [[300, 12]])])
const w3 = mkWorkout('2026-09-08', [mkEntry('back-squat', [[145, 10]])])
const all = [w3, w1, w2]

describe('prs', () => {
  test('exerciseHistory is ascending and summarised', () => {
    const h = exerciseHistory(all, 'back-squat')
    expect(h.map((s) => s.date)).toEqual(['2026-09-01', '2026-09-04', '2026-09-08'])
    expect(h[0].topWeight).toBe(135)
    expect(h[0].volume).toBe(2700)
    expect(h[1].bestE1rm).toBeCloseTo(epley(145, 8), 5)
    expect(exerciseHistory(all, 'nothing')).toEqual([])
  })

  test('bestBefore looks strictly before the date', () => {
    expect(bestBefore(all, 'back-squat', '2026-09-04')).toEqual({ e1rm: epley(135, 10), weight: 135, sessions: 1 })
    expect(bestBefore(all, 'back-squat', '2026-09-01')).toEqual({ e1rm: 0, weight: 0, sessions: 0 })
  })

  test('prsForWorkout reports e1rm and weight PRs against prior history only', () => {
    expect(prsForWorkout(all, w1)).toEqual([]) // first ever session is not a PR
    const p2 = prsForWorkout(all, w2)
    expect(p2).toEqual([
      { exerciseId: 'back-squat', kind: 'e1rm', previous: epley(135, 10), current: epley(145, 8) },
      { exerciseId: 'back-squat', kind: 'weight', previous: 135, current: 145 },
    ])
    const p3 = prsForWorkout(all, w3)
    expect(p3).toEqual([{ exerciseId: 'back-squat', kind: 'e1rm', previous: epley(145, 8), current: epley(145, 10) }])
  })

  test('adding weight to a bodyweight exercise counts as a PR', () => {
    const bw1 = mkWorkout('2026-09-01', [mkEntry('push-up', [[0, 12]])])
    const bw2 = mkWorkout('2026-09-05', [mkEntry('push-up', [[25, 10]])])
    expect(prsForWorkout([bw1, bw2], bw1)).toEqual([])
    expect(prsForWorkout([bw1, bw2], bw2)).toEqual([
      { exerciseId: 'push-up', kind: 'e1rm', previous: 0, current: epley(25, 10) },
      { exerciseId: 'push-up', kind: 'weight', previous: 0, current: 25 },
    ])
  })
})
