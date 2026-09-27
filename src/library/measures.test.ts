import { describeDuration, describeSet, forMeasure } from './measures'
import type { SetRecord } from '../domain/types'

const set = (patch: Partial<SetRecord> = {}): SetRecord => ({ weight: 0, reps: 0, warmup: false, ...patch })

describe('forMeasure', () => {
  test('drops a stale rep count from a carry, which no carry row can show or clear', () => {
    const out = forMeasure(set({ weight: 150, reps: 10, seconds: 45, feet: 120 }), 'carry')
    expect(out).toEqual({ weight: 150, reps: 0, warmup: false, seconds: 45, feet: 120 })
  })

  test('drops feet from a hold, which is time only', () => {
    const out = forMeasure(set({ reps: 10, seconds: 60, feet: 90 }), 'time')
    expect(out).toEqual({ weight: 0, reps: 0, warmup: false, seconds: 60 })
  })

  test('drops seconds and feet from a rep exercise', () => {
    const out = forMeasure(set({ weight: 225, reps: 5, seconds: 45, feet: 120 }), 'reps')
    expect(out).toEqual({ weight: 225, reps: 5, warmup: false })
  })

  test('keeps the warmup flag whatever the measure', () => {
    expect(forMeasure(set({ warmup: true, seconds: 30 }), 'carry').warmup).toBe(true)
    expect(forMeasure(set({ warmup: true, reps: 5 }), 'reps').warmup).toBe(true)
  })
})

describe('describeSet', () => {
  test('reads a rep set as weight times reps', () => {
    expect(describeSet(set({ weight: 185, reps: 5 }), 'reps')).toBe('185 x 5')
  })

  test('reads a loaded carry with both its measures', () => {
    expect(describeSet(set({ weight: 150, seconds: 45, feet: 120 }), 'carry')).toBe('150 lb 45s 120 ft')
  })

  test('leaves out a measure that was not recorded', () => {
    expect(describeSet(set({ weight: 150, seconds: 45 }), 'carry')).toBe('150 lb 45s')
    expect(describeSet(set({ weight: 150, feet: 120 }), 'carry')).toBe('150 lb 120 ft')
  })

  test('drops the weight on a bodyweight hold rather than saying zero pounds', () => {
    expect(describeSet(set({ seconds: 60 }), 'time')).toBe('60s')
  })

  test('says 0s rather than nothing for an empty set', () => {
    expect(describeSet(set(), 'time')).toBe('0s')
  })
})

describe('describeDuration', () => {
  test('stays in seconds under a minute', () => {
    expect(describeDuration(45)).toBe('45 seconds')
  })

  test('reads whole minutes without a trailing zero', () => {
    expect(describeDuration(180)).toBe('3 minutes')
  })

  test('reads minutes and seconds together', () => {
    expect(describeDuration(270)).toBe('4 minutes 30 seconds')
  })
})
