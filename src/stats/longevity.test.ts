import { mkDay, mkEntry, mkWorkout } from './testData'
import { exerciseMap, epley } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { ageFactor, ageBand, classifyLift, MAIN_LIFTS } from '../library/standards'
import {
  ageOn, balanceSummary, bodyCompSignal, consistency, daysSinceGroup, guidelineCheck, isLastSundayOfMonth, mainLiftBenchmarks,
} from './longevity'

const exMap = exerciseMap(BUILTIN_EXERCISES)

describe('standards', () => {
  test('age factor and band', () => {
    expect(ageFactor(30)).toBe(1)
    expect(ageFactor(47)).toBe(0.9)
    expect(ageBand(47)).toBe('45 to 49')
    expect(ageOn(1979, '2026-09-13')).toBe(47)
  })

  test('classifyLift scales thresholds by age and names the next level', () => {
    const squat = MAIN_LIFTS.find((l) => l.key === 'squat')!
    // 47 year old at 240 lb, squat e1RM 300 -> ratio 1.25; novice needs 1.25 * 0.9 = 1.125, intermediate 1.35
    const r = classifyLift(squat, 300, 240, 47)
    expect(r.level).toBe('novice')
    expect(r.next).toEqual({ level: 'intermediate', e1rm: 325 }) // 1.5 * 0.9 * 240 = 324, rounded to 5
    expect(classifyLift(squat, 100, 240, 47).level).toBe('untrained')
    expect(classifyLift(squat, 800, 240, 47).level).toBe('elite')
    expect(classifyLift(squat, 800, 240, 47).next).toBeUndefined()
  })
})

describe('balanceSummary', () => {
  test('classifies push, pull, upper, lower, hinge, squat, unilateral and carries', () => {
    const ws = [mkWorkout('2026-09-08', [
      mkEntry('barbell-bench-press', [[135, 10], [135, 10]]), // push, upper: 2700
      mkEntry('barbell-row', [[135, 10]]),                    // pull, upper: 1350
      mkEntry('back-squat', [[185, 5]]),                      // lower, squat pattern: 925
      mkEntry('deadlift', [[225, 5]]),                        // hinge: 1125 (back primary, so upper by group)
      mkEntry('bulgarian-split-squat', [[40, 10]]),           // lower, unilateral, squat pattern: 400
      { ...mkEntry('dumbbell-row', [[50, 10]]), variation: 'Single-arm' }, // pull, unilateral by tag
      mkEntry('farmers-carry', [[70, 1]]),                    // carry
    ])]
    const b = balanceSummary(ws, exMap, '2026-09-07', '2026-09-13')
    expect(b.pushVolume).toBe(2700)
    expect(b.pullVolume).toBe(1350 + 1125 + 500)
    expect(b.lowerVolume).toBe(925 + 400)
    expect(b.hingeSets).toBe(1)
    expect(b.squatSets).toBe(2)
    expect(b.unilateralSets).toBe(2)
    expect(b.carrySets).toBe(1)
    expect(b.totalSets).toBe(8)
  })
})

describe('daysSinceGroup', () => {
  test('reports days since each group was trained, undefined when never', () => {
    const ws = [
      mkWorkout('2026-09-01', [mkEntry('leg-extension', [[100, 10]])]),
      mkWorkout('2026-09-10', [mkEntry('barbell-bench-press', [[135, 10]])]),
    ]
    const d = daysSinceGroup(ws, exMap, '2026-09-13')
    expect(d.quads).toBe(12)
    expect(d.chest).toBe(3)
    expect(d.triceps).toBe(3) // secondary counts as trained
    expect(d.calves).toBeUndefined()
  })
})

describe('mainLiftBenchmarks', () => {
  test('best ever, best 4 weeks, this week, slope and level per lift', () => {
    const ws = [
      mkWorkout('2026-07-01', [mkEntry('back-squat', [[225, 5]])]),   // best ever 262.5
      mkWorkout('2026-08-20', [mkEntry('back-squat', [[185, 5]])]),   // 215.8
      mkWorkout('2026-09-03', [mkEntry('trap-bar-deadlift', [[225, 5]])]),
      mkWorkout('2026-09-10', [mkEntry('back-squat', [[195, 5]]), { ...mkEntry('back-squat', [[135, 5]]), variation: 'Pause' }]),
    ]
    const b = mainLiftBenchmarks(ws, exMap, '2026-09-13', 240, 47)
    const squat = b.find((x) => x.key === 'squat')!
    expect(squat.bestEver).toBeCloseTo(epley(225, 5), 5)
    expect(squat.best4w).toBeCloseTo(epley(195, 5), 5)  // paused variant excluded
    expect(squat.thisWeek).toBeCloseTo(epley(195, 5), 5)
    expect(squat.slope8wPerWeek).toBeCloseTo((epley(195, 5) - epley(185, 5)) / 3, 5) // two points, 21 days apart
    expect(squat.level).toBe('beginner')                 // 227.5 / 240 = 0.95, beginner needs 0.75 * 0.9 = 0.675, novice 1.125
    const dead = b.find((x) => x.key === 'deadlift')!
    expect(dead.bestEver).toBeCloseTo(epley(225, 5), 5)
    expect(dead.thisWeek).toBeUndefined()
    expect(b.find((x) => x.key === 'bench')!.bestEver).toBeUndefined()
  })
})

describe('bodyCompSignal, guidelines, consistency, month lens', () => {
  test('bodyCompSignal reads weight and strength direction together', () => {
    expect(bodyCompSignal(-2.5, 1)).toBe('likely_fat_loss')
    expect(bodyCompSignal(-2.5, -0.5)).toBe('likely_fat_loss') // small strength dip is noise
    expect(bodyCompSignal(-2.5, -4)).toBe('possible_muscle_loss')
    expect(bodyCompSignal(-3, -2)).toBe('losing_unclear')
    expect(bodyCompSignal(2.0, 3)).toBe('gaining')
    expect(bodyCompSignal(undefined, 3)).toBe('unclear')
    expect(bodyCompSignal(-1.0, 0.5)).toBe('holding') // under the four week threshold
  })

  test('guidelineCheck compares to 150 cardio minutes and 8000 steps', () => {
    const g = guidelineCheck(120, 9000)
    expect(g.cardioMinutesShort).toBe(30)
    expect(g.stepsMeetsGuideline).toBe(true)
    expect(guidelineCheck(200, undefined).cardioMinutesShort).toBe(0)
    expect(guidelineCheck(200, undefined).stepsMeetsGuideline).toBeUndefined()
  })

  test('consistency counts sessions over 4 and 12 weeks and weeks with 2 or more', () => {
    const ws = [
      mkWorkout('2026-09-08', []), mkWorkout('2026-09-10', []),
      mkWorkout('2026-09-01', []),
      mkWorkout('2026-08-25', []), mkWorkout('2026-08-27', []),
      mkWorkout('2026-07-01', []),
    ]
    const c = consistency(ws, '2026-09-13')
    expect(c.sessions4w).toBe(5)
    expect(c.sessions12w).toBe(6)
    expect(c.weeksWithTwoPlus4w).toBe(2)
    expect(mkDay('2026-09-13').date).toBe('2026-09-13')
  })

  test('isLastSundayOfMonth', () => {
    expect(isLastSundayOfMonth('2026-09-27')).toBe(true)
    expect(isLastSundayOfMonth('2026-09-20')).toBe(false)
  })
})
