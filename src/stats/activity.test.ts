import { mkDay } from './testData'
import { cardioSummary, dayCardioMinutes, stepsSummary, weeklyActivitySeries } from './activity'

const desk = (id: string, minutes: number) => ({ id, type: 'Desk treadmill', minutes })
const days = [
  mkDay('2026-09-07', { steps: 12000, cardio: [desk('a', 20), desk('b', 25), desk('c', 15), desk('d', 30)] }),
  mkDay('2026-09-08', { steps: 6000, cardio: [{ id: 'e', type: 'Bike', minutes: 30, distance: 8 }] }),
  mkDay('2026-09-09', { bodyWeight: 240 }),
  mkDay('2026-09-15', { steps: 9000 }), // next week
]

describe('activity', () => {
  test('stepsSummary totals, mean, goal days, best day', () => {
    const s = stepsSummary(days, '2026-09-07', '2026-09-13', 10000)
    expect(s.total).toBe(18000)
    expect(s.mean).toBe(9000)
    expect(s.daysLogged).toBe(2)
    expect(s.daysAtGoal).toBe(1)
    expect(s.bestDay).toEqual({ date: '2026-09-07', steps: 12000 })
    expect(stepsSummary([], '2026-09-07', '2026-09-13')).toEqual({ total: 0, daysLogged: 0, daysAtGoal: 0 })
  })

  test('cardioSummary counts four desk treadmill sessions in one day', () => {
    const c = cardioSummary(days, '2026-09-07', '2026-09-13')
    expect(c.minutes).toBe(120)
    expect(c.sessions).toBe(5)
    expect(c.byType['Desk treadmill']).toEqual({ minutes: 90, sessions: 4 })
    expect(c.byType['Bike']).toEqual({ minutes: 30, sessions: 1 })
    expect(dayCardioMinutes(days[0])).toBe(90)
  })

  test('weeklyActivitySeries returns a row per week', () => {
    const s = weeklyActivitySeries(days, '2026-09-07', '2026-09-14', 10000)
    expect(s).toHaveLength(2)
    expect(s[0].steps.total).toBe(18000)
    expect(s[1].steps.total).toBe(9000)
    expect(s[1].cardio.minutes).toBe(0)
  })
})
