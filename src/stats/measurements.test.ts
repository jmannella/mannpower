import { mkDay } from './testData'
import { needsMonthlyMeasurement, needsWaist, waistTrend } from './measurements'

describe('needsWaist', () => {
  test('is true when no waist has ever been recorded', () => {
    expect(needsWaist([mkDay('2026-09-20', { bodyWeight: 250 })], '2026-09-23')).toBe(true)
  })

  test('is false within six days of the last measurement', () => {
    expect(needsWaist([mkDay('2026-09-20', { waist: 38 })], '2026-09-23')).toBe(false)
    expect(needsWaist([mkDay('2026-09-17', { waist: 38 })], '2026-09-23')).toBe(false)
  })

  test('is true at seven days', () => {
    expect(needsWaist([mkDay('2026-09-16', { waist: 38 })], '2026-09-23')).toBe(true)
  })

  test('ignores measurements after the date being viewed', () => {
    const days = [mkDay('2026-09-10', { waist: 38 }), mkDay('2026-09-30', { waist: 37 })]
    expect(needsWaist(days, '2026-09-23')).toBe(true)
  })
})

describe('waistTrend', () => {
  const weights = (start: string, n: number, from: number, step: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${start}T00:00:00`)
      d.setDate(d.getDate() + i)
      return mkDay(d.toISOString().slice(0, 10), { bodyWeight: from + step * i })
    })

  test('reads fat loss when weight and waist both fall', () => {
    const days = [
      ...weights('2026-08-26', 29, 254, -4 / 28),
      mkDay('2026-08-26', { waist: 39 }), mkDay('2026-09-09', { waist: 38.5 }), mkDay('2026-09-23', { waist: 38 }),
    ]
    const t = waistTrend(days, '2026-09-23')
    expect(t.signal).toBe('fat_loss')
    expect(t.change4w).toBeCloseTo(-1, 5)
  })

  test('reads recomposition when weight holds and waist falls', () => {
    const days = [
      ...weights('2026-08-26', 29, 250, 0),
      mkDay('2026-08-26', { waist: 39 }), mkDay('2026-09-09', { waist: 38.5 }), mkDay('2026-09-23', { waist: 38 }),
    ]
    expect(waistTrend(days, '2026-09-23').signal).toBe('recomposition')
  })

  test('reads gaining mass when weight rises and waist holds', () => {
    const days = [
      ...weights('2026-08-26', 29, 246, 4 / 28),
      mkDay('2026-08-26', { waist: 38 }), mkDay('2026-09-09', { waist: 38 }), mkDay('2026-09-23', { waist: 38.1 }),
    ]
    expect(waistTrend(days, '2026-09-23').signal).toBe('gaining_mass')
  })

  test('reads a surplus that is too large when both rise', () => {
    const days = [
      ...weights('2026-08-26', 29, 246, 4 / 28),
      mkDay('2026-08-26', { waist: 38 }), mkDay('2026-09-09', { waist: 38.5 }), mkDay('2026-09-23', { waist: 39 }),
    ]
    expect(waistTrend(days, '2026-09-23').signal).toBe('surplus_too_large')
  })

  test('reads flat when both sit inside the bands', () => {
    const days = [
      ...weights('2026-08-26', 29, 250, 0),
      mkDay('2026-08-26', { waist: 38 }), mkDay('2026-09-09', { waist: 38 }), mkDay('2026-09-23', { waist: 38.1 }),
    ]
    expect(waistTrend(days, '2026-09-23').signal).toBe('flat')
  })

  test('reads unclear when weight and waist move in conflicting directions, even though both are fully measured', () => {
    const days = [
      ...weights('2026-08-26', 29, 254, -4 / 28),
      mkDay('2026-08-26', { waist: 38 }), mkDay('2026-09-09', { waist: 38.5 }), mkDay('2026-09-23', { waist: 39 }),
    ]
    const t = waistTrend(days, '2026-09-23')
    expect(t.signal).toBe('unclear')
    expect(t.change4w).toBeDefined()
    expect(t.weightChange4wLbs).toBeDefined()
  })

  test('will not read a signal from fewer than three measurements', () => {
    const days = [...weights('2026-08-26', 29, 254, -4 / 28), mkDay('2026-08-26', { waist: 39 }), mkDay('2026-09-23', { waist: 38 })]
    const t = waistTrend(days, '2026-09-23')
    expect(t.signal).toBe('unclear')
    expect(t.change4w).toBeUndefined()
    expect(t.measurements4w).toBe(2)
  })

  test('reports the latest measurement even when the trend is unclear', () => {
    const t = waistTrend([mkDay('2026-09-20', { waist: 38.5 })], '2026-09-23')
    expect(t.latest).toEqual({ date: '2026-09-20', waist: 38.5 })
  })
})

describe('needsMonthlyMeasurement', () => {
  test('asks when that site has never been recorded', () => {
    expect(needsMonthlyMeasurement([mkDay('2026-09-20', { waist: 38 })], '2026-09-20', 'neck')).toBe(true)
  })

  test('stays quiet inside 28 days', () => {
    expect(needsMonthlyMeasurement([mkDay('2026-08-25', { neck: 15 })], '2026-09-20', 'neck')).toBe(false)
  })

  test('asks again at 28 days', () => {
    expect(needsMonthlyMeasurement([mkDay('2026-08-23', { neck: 15 })], '2026-09-20', 'neck')).toBe(true)
  })

  test('judges each site on its own', () => {
    const days = [mkDay('2026-09-17', { neck: 15 })]
    expect(needsMonthlyMeasurement(days, '2026-09-20', 'neck')).toBe(false)
    expect(needsMonthlyMeasurement(days, '2026-09-20', 'hip')).toBe(true)
  })

  test('uses the date being viewed, not the latest record', () => {
    const days = [mkDay('2026-08-01', { neck: 15 }), mkDay('2026-09-19', { neck: 15 })]
    expect(needsMonthlyMeasurement(days, '2026-08-10', 'neck')).toBe(false)
  })
})
