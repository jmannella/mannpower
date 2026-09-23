import { isFoodItem, validateDataset } from './validate'

const base = () => ({
  meta: { schemaVersion: 1, updatedAt: '2026-09-21T00:00:00.000Z' },
  exercises: [], workouts: [], days: [], pain: [],
  settings: { defaultWithTrainer: true, customCardioTypes: [] },
})
const item = () => ({ name: 'Chicken wrap', amount: '1', kind: 'food', calories: 520, protein: 32, carbs: 48, fat: 20, fibre: 4 })
const meal = () => ({
  id: 'm1', date: '2026-09-21', time: '12:30', description: 'Chicken wrap', source: 'ai', confidence: 'medium',
  items: [item()], createdAt: '', updatedAt: '',
})

describe('validateDataset nutrition', () => {
  test('a dataset from before meals existed loads with empty arrays', () => {
    const v = validateDataset(base())
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.dataset.meals).toEqual([])
      expect(v.dataset.savedMeals).toEqual([])
    }
  })

  test('accepts a valid meal and saved meal', () => {
    const v = validateDataset({ ...base(), meals: [meal()], savedMeals: [{ id: 's1', name: 'Wrap', items: [item()], useCount: 2, lastUsedAt: '2026-09-20T12:00:00.000Z' }] })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.dataset.meals[0].items[0].calories).toBe(520)
  })

  test('accepts a meal waiting for an estimate with no items', () => {
    const v = validateDataset({ ...base(), meals: [{ ...meal(), items: [], needsEstimate: true }] })
    expect(v.ok).toBe(true)
  })

  test.each([
    ['negative calories', { ...meal(), items: [{ ...item(), calories: -5 }] }],
    ['unknown kind', { ...meal(), items: [{ ...item(), kind: 'snack' }] }],
    ['bad time', { ...meal(), time: '7pm' }],
    ['bad date', { ...meal(), date: 'Sept 21' }],
    ['unknown source', { ...meal(), source: 'guess' }],
    ['unknown confidence', { ...meal(), confidence: 'sure' }],
  ])('rejects a meal with %s', (_label, bad) => {
    const v = validateDataset({ ...base(), meals: [bad] })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors[0]).toBe('meals[0] is malformed.')
  })

  test('rejects a malformed saved meal and a non array', () => {
    const a = validateDataset({ ...base(), savedMeals: [{ id: 's1', name: 'Wrap', items: 'nope', useCount: 1, lastUsedAt: '' }] })
    expect(a.ok).toBe(false)
    const b = validateDataset({ ...base(), meals: 'nope' })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.errors[0]).toBe('meals must be an array.')
  })

  test('sanitises the new settings', () => {
    const v = validateDataset({ ...base(), settings: { defaultWithTrainer: true, customCardioTypes: [], heightInches: 500, sex: 'other', calorieTargetOverride: -1, proteinTargetOverride: 180 } })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.dataset.settings.heightInches).toBeUndefined()
      expect(v.dataset.settings.sex).toBeUndefined()
      expect(v.dataset.settings.calorieTargetOverride).toBeUndefined()
      expect(v.dataset.settings.proteinTargetOverride).toBe(180)
    }
    const ok = validateDataset({ ...base(), settings: { defaultWithTrainer: true, customCardioTypes: [], heightInches: 70, sex: 'male' } })
    if (ok.ok) {
      expect(ok.dataset.settings.heightInches).toBe(70)
      expect(ok.dataset.settings.sex).toBe('male')
    }
  })

  test('isFoodItem allows missing optional macros', () => {
    expect(isFoodItem({ name: 'Dinner', kind: 'food', calories: 900, protein: 55 })).toBe(true)
    expect(isFoodItem({ name: 'Dinner', kind: 'food', calories: Number.NaN, protein: 55 })).toBe(false)
  })
})

describe('check in fields', () => {
  test('keeps every new day field when they are in range', () => {
    const ds = base()
    ds.days = [{ date: '2026-09-23', cardio: [], updatedAt: '', sleepScore: 81, sleepHours: 7.2, readiness: 74, restingHr: 52, waterGlasses: 6, waist: 38.5, supplementsTaken: ['im8'] }] as never
    const r = validateDataset(ds)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dataset.days[0].sleepScore).toBe(81)
    expect(r.dataset.days[0].waist).toBe(38.5)
    expect(r.dataset.days[0].supplementsTaken).toEqual(['im8'])
  })

  test.each([
    ['sleepScore', 101],
    ['readiness', -1],
    ['sleepHours', 25],
    ['restingHr', 20],
    ['waterGlasses', 41],
    ['waist', 19],
  ])('rejects %s out of range', (field, value) => {
    const ds = base()
    ds.days = [{ date: '2026-09-23', cardio: [], updatedAt: '', [field]: value }] as never
    const r = validateDataset(ds)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors[0]).toContain('days[0]')
  })

  test('rejects a supplementsTaken that is not an array of strings', () => {
    const ds = base()
    ds.days = [{ date: '2026-09-23', cardio: [], updatedAt: '', supplementsTaken: [1] }] as never
    expect(validateDataset(ds).ok).toBe(false)
  })

  test('defaults supplements to IM8 when the settings have none', () => {
    const r = validateDataset(base())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dataset.settings.supplements).toEqual([{ id: 'im8', name: 'IM8 Daily Essentials', active: true }])
  })

  test('keeps a supplement list that is already there and drops malformed entries', () => {
    const ds = base()
    ds.settings = { ...ds.settings, supplements: [{ id: 'cr', name: 'Creatine', active: true, addedOn: '2026-09-01' }, { id: 5 }] } as never
    const r = validateDataset(ds)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dataset.settings.supplements).toEqual([{ id: 'cr', name: 'Creatine', active: true, addedOn: '2026-09-01' }])
  })

  test('does not resurrect IM8 when the list was deliberately emptied', () => {
    const ds = base()
    ds.settings = { ...ds.settings, supplements: [] } as never
    const r = validateDataset(ds)
    expect(r.ok && r.dataset.settings.supplements).toEqual([])
  })

  test('clamps an out of range water goal to undefined', () => {
    const ds = base()
    ds.settings = { ...ds.settings, waterGoalGlasses: 0 } as never
    const r = validateDataset(ds)
    expect(r.ok && r.dataset.settings.waterGoalGlasses).toBeUndefined()
  })
})
