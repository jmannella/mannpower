import { mkDay } from './testData'
import { waterWeek } from './water'

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']

describe('waterWeek', () => {
  test('averages only the days with a count and reports how many that was', () => {
    const days = [mkDay(week[0], { waterGlasses: 8 }), mkDay(week[1], { waterGlasses: 4 }), mkDay(week[2])]
    const w = waterWeek(days, week[0], week[6], 8)
    expect(w.daysLogged).toBe(2)
    expect(w.avgGlasses).toBe(6)
    expect(w.daysAtGoal).toBe(1)
    expect(w.goal).toBe(8)
  })

  test('treats a zero as a logged day, not a missing one', () => {
    const w = waterWeek([mkDay(week[0], { waterGlasses: 0 })], week[0], week[6], 8)
    expect(w.daysLogged).toBe(1)
    expect(w.avgGlasses).toBe(0)
  })

  test('falls back to the default goal', () => {
    expect(waterWeek([], week[0], week[6]).goal).toBe(8)
  })

  test('returns no average when nothing was logged', () => {
    const w = waterWeek(week.map((d) => mkDay(d)), week[0], week[6], 8)
    expect(w.daysLogged).toBe(0)
    expect(w.avgGlasses).toBeUndefined()
  })
})
