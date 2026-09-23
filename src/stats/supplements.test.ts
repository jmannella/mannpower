import { mkDay } from './testData'
import { supplementAdherence } from './supplements'
import type { Supplement } from '../domain/types'

const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
const im8: Supplement = { id: 'im8', name: 'IM8 Daily Essentials', active: true }

describe('supplementAdherence', () => {
  test('counts the days ticked out of the week', () => {
    const days = week.map((d, i) => mkDay(d, { supplementsTaken: i < 5 ? ['im8'] : [] }))
    const [a] = supplementAdherence(days, [im8], week[0], week[6])
    expect(a.taken).toBe(5)
    expect(a.eligibleDays).toBe(7)
    expect(a.pct).toBeCloseTo(71.4, 1)
  })

  test('starts the denominator at addedOn', () => {
    const days = week.map((d, i) => mkDay(d, { supplementsTaken: i >= 4 ? ['cr'] : [] }))
    const cr: Supplement = { id: 'cr', name: 'Creatine', active: true, addedOn: week[4] }
    const [a] = supplementAdherence(days, [cr], week[0], week[6])
    expect(a.eligibleDays).toBe(3)
    expect(a.taken).toBe(3)
    expect(a.pct).toBe(100)
  })

  test('counts the streak ending at the end date, reaching back past the week', () => {
    const days = [
      mkDay('2026-09-11', { supplementsTaken: ['im8'] }),
      mkDay('2026-09-12', { supplementsTaken: [] }),
      ...week.map((d) => mkDay(d, { supplementsTaken: ['im8'] })),
    ]
    const [a] = supplementAdherence(days, [im8], week[0], week[6])
    expect(a.streak).toBe(7)
  })

  test('reports a zero streak when the last day was missed', () => {
    const days = week.map((d, i) => mkDay(d, { supplementsTaken: i < 6 ? ['im8'] : [] }))
    expect(supplementAdherence(days, [im8], week[0], week[6])[0].streak).toBe(0)
  })

  test('leaves inactive supplements out', () => {
    const list: Supplement[] = [im8, { id: 'old', name: 'Retired', active: false }]
    expect(supplementAdherence([], list, week[0], week[6]).map((a) => a.id)).toEqual(['im8'])
  })

  test('reports zero rather than nothing when a supplement was never ticked', () => {
    const [a] = supplementAdherence(week.map((d) => mkDay(d)), [im8], week[0], week[6])
    expect(a).toEqual({ id: 'im8', name: 'IM8 Daily Essentials', taken: 0, eligibleDays: 7, pct: 0, streak: 0 })
  })

  test('gives no eligible days when it was added after the week', () => {
    const cr: Supplement = { id: 'cr', name: 'Creatine', active: true, addedOn: '2026-10-01' }
    const [a] = supplementAdherence([], [cr], week[0], week[6])
    expect(a.eligibleDays).toBe(0)
    expect(a.pct).toBe(0)
  })
})
