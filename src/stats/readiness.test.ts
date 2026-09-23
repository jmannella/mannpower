import { mkDay } from './testData'
import { readinessWeek } from './readiness'

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']

describe('readinessWeek', () => {
  test('averages the days recorded and counts the low ones', () => {
    const days = [mkDay(week[0], { readiness: 80 }), mkDay(week[1], { readiness: 50 }), mkDay(week[2], { readiness: 59 })]
    const r = readinessWeek(days, week[0], week[6])
    expect(r.daysRecorded).toBe(3)
    expect(r.avg).toBe(63)
    expect(r.lowDays).toBe(2)
  })

  test('flags a drop of twenty or more from the previous recorded day', () => {
    const days = [mkDay(week[0], { readiness: 85 }), mkDay(week[1], { readiness: 60 })]
    expect(readinessWeek(days, week[0], week[6]).drops).toEqual([{ date: week[1], from: 85, to: 60 }])
  })

  test('ignores a drop under twenty', () => {
    const days = [mkDay(week[0], { readiness: 85 }), mkDay(week[1], { readiness: 70 })]
    expect(readinessWeek(days, week[0], week[6]).drops).toEqual([])
  })

  test('compares against the day before the week when there is one', () => {
    const days = [mkDay('2026-09-13', { readiness: 90 }), mkDay(week[0], { readiness: 65 })]
    expect(readinessWeek(days, week[0], week[6]).drops).toEqual([{ date: week[0], from: 90, to: 65 }])
  })

  test('skips gaps rather than inventing a comparison', () => {
    const days = [mkDay(week[0], { readiness: 85 }), mkDay(week[3], { readiness: 60 })]
    expect(readinessWeek(days, week[0], week[6]).drops).toEqual([])
  })

  test('returns an empty read when nothing was recorded', () => {
    const r = readinessWeek(week.map((d) => mkDay(d)), week[0], week[6])
    expect(r).toEqual({ daysRecorded: 0, avg: undefined, lowDays: 0, drops: [] })
  })
})
