import { mkDay } from './testData'
import { bodyMetrics, navyBodyFat } from './bodyMetrics'
import type { SyncedSettings } from '../domain/types'

const male: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male', heightInches: 70 }
const female: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'female', heightInches: 65 }

describe('navyBodyFat', () => {
  // Hand worked: 86.010 * log10(34 - 15) - 70.041 * log10(70) + 36.76 = 17.513
  test('works the male formula', () => {
    expect(navyBodyFat({ waist: 34, neck: 15, heightInches: 70, sex: 'male' })).toBeCloseTo(17.513, 2)
  })

  // Hand worked: 163.205 * log10(30 + 38 - 13) - 97.684 * log10(65) - 78.387 = 28.556
  test('works the female formula, which needs the hip', () => {
    expect(navyBodyFat({ waist: 30, neck: 13, hip: 38, heightInches: 65, sex: 'female' })).toBeCloseTo(28.556, 2)
  })

  test('is undefined for a woman without a hip measurement', () => {
    expect(navyBodyFat({ waist: 30, neck: 13, heightInches: 65, sex: 'female' })).toBeUndefined()
  })

  test('ignores the hip for a man, since his formula does not use it', () => {
    const withHip = navyBodyFat({ waist: 34, neck: 15, hip: 41, heightInches: 70, sex: 'male' })
    const without = navyBodyFat({ waist: 34, neck: 15, heightInches: 70, sex: 'male' })
    expect(withHip).toBe(without)
  })

  test('is undefined when anything it needs is missing', () => {
    expect(navyBodyFat({ waist: 34, neck: 15, sex: 'male' })).toBeUndefined()
    expect(navyBodyFat({ waist: 34, heightInches: 70, sex: 'male' })).toBeUndefined()
    expect(navyBodyFat({ neck: 15, heightInches: 70, sex: 'male' })).toBeUndefined()
    expect(navyBodyFat({ waist: 34, neck: 15, heightInches: 70 })).toBeUndefined()
  })

  test('refuses a waist that is not larger than the neck rather than returning a nonsense number', () => {
    expect(navyBodyFat({ waist: 15, neck: 15, heightInches: 70, sex: 'male' })).toBeUndefined()
    expect(navyBodyFat({ waist: 14, neck: 15, heightInches: 70, sex: 'male' })).toBeUndefined()
  })

  // Hand worked: that combination returns 66.75, which no living person measures.
  test('drops an implausible result rather than reporting it', () => {
    expect(navyBodyFat({ waist: 80, neck: 9, heightInches: 70, sex: 'male' })).toBeUndefined()
  })
})

describe('bodyMetrics', () => {
  const end = '2026-09-20'

  test('reads the latest of each measurement with its date', () => {
    const days = [
      mkDay('2026-08-20', { waist: 40, neck: 16, hip: 42 }),
      mkDay('2026-09-17', { waist: 38, neck: 15.5, hip: 41 }),
    ]
    const m = bodyMetrics(days, male, end)
    expect(m.waist).toEqual({ date: '2026-09-17', value: 38 })
    expect(m.neck).toEqual({ date: '2026-09-17', value: 15.5 })
    expect(m.hip).toEqual({ date: '2026-09-17', value: 41 })
  })

  test('takes each measurement from its own most recent day', () => {
    const days = [
      mkDay('2026-08-20', { neck: 16, hip: 42 }),
      mkDay('2026-09-17', { waist: 38 }),
    ]
    const m = bodyMetrics(days, male, end)
    expect(m.waist?.date).toBe('2026-09-17')
    expect(m.neck?.date).toBe('2026-08-20')
  })

  test('ignores measurements after the week end', () => {
    const days = [mkDay('2026-09-17', { waist: 38 }), mkDay('2026-09-28', { waist: 36 })]
    expect(bodyMetrics(days, male, end).waist).toEqual({ date: '2026-09-17', value: 38 })
  })

  test('works out waist to height against the 0.5 marker', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 38 })], male, end)
    expect(m.waistToHeight).toBe(0.54)
    expect(m.waistToHeightOver).toBe(true)
  })

  test('reports waist to height under the marker as under', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 34 })], male, end)
    expect(m.waistToHeight).toBe(0.49)
    expect(m.waistToHeightOver).toBe(false)
  })

  test('works out waist to hip against the 0.90 marker for a man', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 38, hip: 41 })], male, end)
    expect(m.waistToHip).toBe(0.93)
    expect(m.waistToHipThreshold).toBe(0.9)
    expect(m.waistToHipOver).toBe(true)
  })

  test('uses the 0.85 marker for a woman', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 30, hip: 38 })], female, end)
    expect(m.waistToHip).toBe(0.79)
    expect(m.waistToHipThreshold).toBe(0.85)
    expect(m.waistToHipOver).toBe(false)
  })

  test('carries the body fat estimate when neck and waist are both there', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 34, neck: 15 })], male, end)
    expect(m.bodyFatPct).toBeCloseTo(17.513, 2)
  })

  test('returns nothing at all when no measurement has ever been taken', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { bodyWeight: 240 })], male, end)
    expect(m.waist).toBeUndefined()
    expect(m.neck).toBeUndefined()
    expect(m.hip).toBeUndefined()
    expect(m.waistToHeight).toBeUndefined()
    expect(m.waistToHip).toBeUndefined()
    expect(m.bodyFatPct).toBeUndefined()
    expect(m.anything).toBe(false)
  })

  test('will not compute anything that needs a height when no height is set', () => {
    const noHeight: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [] }
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 38, neck: 15 })], noHeight, end)
    expect(m.waistToHeight).toBeUndefined()
    expect(m.bodyFatPct).toBeUndefined()
    expect(m.anything).toBe(true)
  })

  // Hand worked: waist 36 neck 15 height 70 gives 21.252, waist 34 gives 17.513.
  test('tracks the body fat estimate four weeks back so a direction can be reported', () => {
    const days = [
      mkDay('2026-08-20', { waist: 36, neck: 15 }),
      mkDay('2026-09-17', { waist: 34, neck: 15 }),
    ]
    const m = bodyMetrics(days, male, end)
    expect(m.bodyFatPct).toBeCloseTo(17.513, 2)
    expect(m.bodyFatPct4wAgo).toBeCloseTo(21.252, 2)
  })

  test('gives no earlier estimate when there is nothing four weeks back', () => {
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 34, neck: 15 })], male, end)
    expect(m.bodyFatPct4wAgo).toBeUndefined()
  })
})

describe('bodyMetrics heightSet', () => {
  test('is true when Settings carries a usable height', () => {
    expect(bodyMetrics([], male, '2026-09-20').heightSet).toBe(true)
  })

  test('is false when there is no height, and false for a nonsense one', () => {
    const none: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [] }
    const zero: SyncedSettings = { ...none, heightInches: 0 }
    expect(bodyMetrics([], none, '2026-09-20').heightSet).toBe(false)
    expect(bodyMetrics([], zero, '2026-09-20').heightSet).toBe(false)
  })
})

describe('bodyFatUsedHip', () => {
  test('is false for a man, whose formula ignores the hip', () => {
    expect(bodyMetrics([], male, '2026-09-20').bodyFatUsedHip).toBe(false)
  })

  test('is true for a woman, whose formula needs it', () => {
    expect(bodyMetrics([], female, '2026-09-20').bodyFatUsedHip).toBe(true)
  })
})

describe('bodyMetrics guards the email against misleading figures', () => {
  const end = '2026-09-20'

  test('gives no four week comparison when both estimates come from the same readings', () => {
    const m = bodyMetrics([mkDay('2026-06-01', { waist: 34, neck: 15 })], male, end)
    expect(m.bodyFatPct).toBeCloseTo(17.513, 2)
    expect(m.bodyFatPct4wAgo).toBeUndefined()
  })

  test('still gives a comparison when the earlier readings really are different', () => {
    const days = [mkDay('2026-08-01', { waist: 36, neck: 15 }), mkDay('2026-09-17', { waist: 34, neck: 15 })]
    expect(bodyMetrics(days, male, end).bodyFatPct4wAgo).toBeCloseTo(21.252, 2)
  })

  test('flags a waist and hip taken more than 35 days apart', () => {
    const days = [mkDay('2026-06-01', { hip: 41 }), mkDay('2026-09-17', { waist: 38 })]
    expect(bodyMetrics(days, male, end).waistToHipGapDays).toBe(108)
  })

  test('does not flag a waist and hip taken together', () => {
    const days = [mkDay('2026-09-17', { waist: 38, hip: 41 })]
    expect(bodyMetrics(days, male, end).waistToHipGapDays).toBeUndefined()
  })

  test('treats a ratio sitting exactly on its marker as at it, matching the published cut points', () => {
    const whr = bodyMetrics([mkDay('2026-09-17', { waist: 36, hip: 40 })], male, end)
    expect(whr.waistToHip).toBe(0.9)
    expect(whr.waistToHipOver).toBe(true)
    const whtr = bodyMetrics([mkDay('2026-09-17', { waist: 35 })], male, end)
    expect(whtr.waistToHeight).toBe(0.5)
    expect(whtr.waistToHeightOver).toBe(true)
  })

  test('compares the ratio at the same two decimals it is printed at, so number and wording agree', () => {
    // 34.99 / 70 is 0.49986, which prints as 0.50, so it must not also be called under the marker.
    const m = bodyMetrics([mkDay('2026-09-17', { waist: 34.99 })], male, end)
    expect(m.waistToHeight).toBe(0.5)
    expect(m.waistToHeightOver).toBe(true)
  })

  test('names what is missing instead of going quiet', () => {
    const noSex: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], heightInches: 70 }
    const noHeight: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male' }
    expect(bodyMetrics([mkDay('2026-09-17', { neck: 15 })], male, end).bodyFatMissing).toBe('waist')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 38 })], male, end).bodyFatMissing).toBe('neck')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 38, neck: 15 })], noHeight, end).bodyFatMissing).toBe('height')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 38, neck: 15 })], noSex, end).bodyFatMissing).toBe('sex')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 30, neck: 13 })], female, end).bodyFatMissing).toBe('hip')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 15, neck: 16 })], male, end).bodyFatMissing).toBe('sites')
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 80, neck: 9 })], male, end).bodyFatMissing).toBe('implausible')
  })

  test('sets no missing reason when the estimate came out fine', () => {
    expect(bodyMetrics([mkDay('2026-09-17', { waist: 34, neck: 15 })], male, end).bodyFatMissing).toBeUndefined()
  })
})
