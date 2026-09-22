import {
  addDays, daysBetween, eachDay, formatShort, formatWeekLabel, inRange,
  lastSunday, nowTime, parseISO, toISO, todayISO, weekEnd, weekStart,
} from './dates'

describe('dates', () => {
  test('toISO and parseISO round trip in local time', () => {
    const d = parseISO('2026-09-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(8)
    expect(toISO(d)).toBe('2026-09-08')
  })

  test('todayISO uses the given clock', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01')
  })

  test('weekStart is Monday and weekEnd is Sunday', () => {
    expect(weekStart('2026-09-08')).toBe('2026-09-07') // Tuesday -> Monday
    expect(weekStart('2026-09-07')).toBe('2026-09-07') // Monday stays
    expect(weekStart('2026-09-13')).toBe('2026-09-07') // Sunday -> previous Monday
    expect(weekEnd('2026-09-08')).toBe('2026-09-13')
  })

  test('daysBetween and eachDay', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7)
    expect(eachDay('2026-09-06', '2026-09-08')).toEqual(['2026-09-06', '2026-09-07', '2026-09-08'])
    expect(eachDay('2026-09-08', '2026-09-06')).toEqual([])
  })

  test('inRange is inclusive', () => {
    expect(inRange('2026-09-07', '2026-09-07', '2026-09-13')).toBe(true)
    expect(inRange('2026-09-13', '2026-09-07', '2026-09-13')).toBe(true)
    expect(inRange('2026-09-14', '2026-09-07', '2026-09-13')).toBe(false)
  })

  test('formatting', () => {
    expect(formatShort('2026-09-08')).toBe('Tue Sep 8')
    expect(formatWeekLabel('2026-09-07')).toBe('Sep 7')
  })

  test('nowTime is zero padded local HH:MM', () => {
    expect(nowTime(new Date(2026, 8, 21, 7, 5))).toBe('07:05')
    expect(nowTime(new Date(2026, 8, 21, 20, 30))).toBe('20:30')
  })

  test('lastSunday is today on a Sunday and the previous Sunday otherwise', () => {
    expect(lastSunday('2026-09-20')).toBe('2026-09-20')
    expect(lastSunday('2026-09-21')).toBe('2026-09-20')
    expect(lastSunday('2026-09-26')).toBe('2026-09-20')
    expect(lastSunday('2026-09-27')).toBe('2026-09-27')
  })
})
