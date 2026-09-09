import { mkDay } from './testData'
import { bodyWeightAvg7, bodyWeightSeries, latestBodyWeight, lossBandStatus, relativeStrength, weeklyBodyWeightChange } from './bodyweight'

const days = [
  mkDay('2026-08-31', { bodyWeight: 250 }),
  mkDay('2026-09-01', { bodyWeight: 249 }),
  mkDay('2026-09-03', { bodyWeight: 248 }),
  mkDay('2026-09-07', { bodyWeight: 246 }),
  mkDay('2026-09-08', { bodyWeight: 245 }),
  mkDay('2026-09-10'), // logged steps only, no weight
]

describe('bodyweight', () => {
  test('bodyWeightAvg7 averages available entries in the trailing 7 days', () => {
    expect(bodyWeightAvg7(days, '2026-09-08')).toBeCloseTo((248 + 246 + 245) / 3, 5) // Sep 2 to Sep 8
    expect(bodyWeightAvg7(days, '2026-08-20')).toBeUndefined()
  })

  test('weeklyBodyWeightChange compares this week to last', () => {
    const c = weeklyBodyWeightChange(days, '2026-09-07')
    expect(c.lastWeek).toBeCloseTo((250 + 249 + 248) / 3, 5)
    expect(c.thisWeek).toBeCloseTo(245.5, 5)
    expect(c.changeLbs).toBeCloseTo(245.5 - 249, 5)
    expect(c.changePct).toBeCloseTo(((245.5 - 249) / 249) * 100, 5)
    expect(weeklyBodyWeightChange([], '2026-09-07')).toEqual({})
  })

  test('lossBandStatus', () => {
    expect(lossBandStatus(undefined)).toBe('unknown')
    expect(lossBandStatus(-0.7)).toBe('in_band')
    expect(lossBandStatus(-0.5)).toBe('in_band')
    expect(lossBandStatus(-1.0)).toBe('in_band')
    expect(lossBandStatus(-1.4)).toBe('too_fast')
    expect(lossBandStatus(-0.2)).toBe('too_slow')
    expect(lossBandStatus(0)).toBe('too_slow')
    expect(lossBandStatus(0.3)).toBe('gaining')
  })

  test('relativeStrength and latestBodyWeight', () => {
    expect(relativeStrength(300, 250)).toBeCloseTo(1.2, 5)
    expect(relativeStrength(300, undefined)).toBeUndefined()
    expect(latestBodyWeight(days)).toEqual({ date: '2026-09-08', weight: 245 })
    expect(latestBodyWeight([])).toBeUndefined()
  })

  test('bodyWeightSeries has one row per day with rolling average', () => {
    const s = bodyWeightSeries(days, '2026-09-07', '2026-09-09')
    expect(s.map((r) => r.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(s[0].weight).toBe(246)
    expect(s[2].weight).toBeUndefined()
    expect(s[2].avg7).toBeCloseTo((248 + 246 + 245) / 3, 5)
  })
})
