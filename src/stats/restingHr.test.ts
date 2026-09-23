import { mkDay } from './testData'
import { restingHrTrend } from './restingHr'

const run = (from: string, n: number, value: (i: number) => number | undefined) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T00:00:00`)
    d.setDate(d.getDate() + i)
    const v = value(i)
    return mkDay(d.toISOString().slice(0, 10), v === undefined ? {} : { restingHr: v })
  })

describe('restingHrTrend', () => {
  test('stays quiet until fourteen readings exist in the window', () => {
    const days = run('2026-09-08', 13, () => 52)
    const t = restingHrTrend(days, '2026-09-20')
    expect(t.readings28).toBe(13)
    expect(t.elevated).toBe(false)
    expect(t.delta).toBeUndefined()
  })

  test('flags a week sitting five beats above the baseline', () => {
    const days = run('2026-08-24', 28, (i) => (i < 21 ? 50 : 58))
    const t = restingHrTrend(days, '2026-09-20')
    expect(t.readings28).toBe(28)
    expect(t.weekAvg).toBe(58)
    expect(t.delta).toBeGreaterThanOrEqual(5)
    expect(t.elevated).toBe(true)
  })

  test('does not flag a week in line with the baseline', () => {
    const days = run('2026-08-24', 28, () => 52)
    const t = restingHrTrend(days, '2026-09-20')
    expect(t.delta).toBe(0)
    expect(t.elevated).toBe(false)
  })

  test('reports nothing at all when no readings exist', () => {
    const t = restingHrTrend(run('2026-08-24', 28, () => undefined), '2026-09-20')
    expect(t).toEqual({ weekAvg: undefined, baselineAvg: undefined, readings28: 0, delta: undefined, elevated: false })
  })
})
