import { db } from './db'
import { onDataChange } from './changes'
import {
  getSettings, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listWorkouts, listExercises,
  saveMeal, saveSavedMeal, listMeals, listSavedMeals,
} from './repo'
import { exportDataset, importDataset, validateDataset } from './snapshot'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('snapshot', () => {
  test('exportDataset includes only custom exercises and synced settings', async () => {
    await saveExercise({ id: 'c1', name: 'Custom', primary: 'core', secondary: [], custom: true })
    await saveSettings({ githubToken: 'secret', dailyStepGoal: 9000 })
    await saveWorkout({ id: 'w1', date: '2026-09-08', withTrainer: false, entries: [], createdAt: '', updatedAt: '' })
    await saveDay({ date: '2026-09-08', steps: 5000, cardio: [], updatedAt: '' })
    await savePain({ id: 'p1', date: '2026-09-08', area: 'neck', severity: 2, limited: false, createdAt: '' })
    const ds = await exportDataset()
    expect(ds.meta.schemaVersion).toBe(1)
    expect(ds.exercises.map((e) => e.id)).toEqual(['c1'])
    expect(ds.workouts).toHaveLength(1)
    expect(ds.days).toHaveLength(1)
    expect(ds.pain).toHaveLength(1)
    expect(ds.settings.dailyStepGoal).toBe(9000)
    expect(JSON.stringify(ds)).not.toContain('secret')
  })

  test('validateDataset rejects junk and accepts an export', async () => {
    expect(validateDataset(null).ok).toBe(false)
    expect(validateDataset({ meta: { schemaVersion: 2 } }).ok).toBe(false)
    const bad = validateDataset({ meta: { schemaVersion: 1, updatedAt: 'x' }, exercises: 'nope', workouts: [], days: [], pain: [], settings: {} })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/exercises/)
    const ds = await exportDataset()
    expect(validateDataset(JSON.parse(JSON.stringify(ds))).ok).toBe(true)
  })

  test('importDataset replaces synced tables and keeps the token', async () => {
    await saveSettings({ githubToken: 'keep-me' })
    await saveWorkout({ id: 'old', date: '2026-01-01', withTrainer: true, entries: [], createdAt: '', updatedAt: '' })
    await importDataset({
      meta: { schemaVersion: 1, updatedAt: '2026-09-08T00:00:00.000Z' },
      exercises: [{ id: 'c9', name: 'Imported', primary: 'back', secondary: [], custom: true }],
      workouts: [{ id: 'new', date: '2026-09-08', withTrainer: false, entries: [], createdAt: '', updatedAt: '' }],
      days: [], pain: [], meals: [], savedMeals: [],
      settings: { defaultWithTrainer: false, customCardioTypes: ['Hike'] },
    })
    expect((await listWorkouts()).map((w) => w.id)).toEqual(['new'])
    expect((await listExercises()).some((e) => e.id === 'c9')).toBe(true)
    const s = await getSettings()
    expect(s.githubToken).toBe('keep-me')
    expect(s.defaultWithTrainer).toBe(false)
    expect(s.customCardioTypes).toEqual(['Hike'])
    expect((await db.meta.get('meta'))?.updatedAt).toBe('2026-09-08T00:00:00.000Z')
  })

  test('importDataset with stampNow uses the current time and emits a change', async () => {
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    await importDataset({
      meta: { schemaVersion: 1, updatedAt: '2020-01-01T00:00:00.000Z' },
      exercises: [], workouts: [], days: [], pain: [], meals: [], savedMeals: [],
      settings: { defaultWithTrainer: true, customCardioTypes: [] },
    }, { stampNow: true })
    off()
    expect((await db.meta.get('meta'))!.updatedAt > '2026-01-01').toBe(true)
    expect(seen).toHaveLength(1)
  })

  test('meals and saved meals round trip and the AI key never leaves the phone', async () => {
    await saveSettings({ anthropicKey: 'sk-ant-secret', heightInches: 70, sex: 'male', proteinTargetOverride: 180 })
    await saveMeal({ id: 'm1', date: '2026-09-21', time: '12:00', description: 'Lunch', source: 'quick', items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], createdAt: '', updatedAt: '' })
    await saveSavedMeal({ id: 's1', name: 'Lunch', items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], useCount: 1, lastUsedAt: '2026-09-21T12:00:00.000Z' })
    const ds = await exportDataset()
    expect(ds.meals).toHaveLength(1)
    expect(ds.savedMeals).toHaveLength(1)
    expect(ds.settings).toMatchObject({ heightInches: 70, sex: 'male', proteinTargetOverride: 180 })
    expect(JSON.stringify(ds)).not.toContain('sk-ant-secret')
    expect(JSON.stringify(ds)).not.toContain('aiModel')

    await db.meals.clear(); await db.savedMeals.clear()
    const v = validateDataset(JSON.parse(JSON.stringify(ds)))
    expect(v.ok).toBe(true)
    if (v.ok) await importDataset(v.dataset)
    expect((await listMeals()).map((m) => m.id)).toEqual(['m1'])
    expect((await listSavedMeals()).map((s) => s.id)).toEqual(['s1'])
    expect((await getSettings()).anthropicKey).toBe('sk-ant-secret')
  })

  test('round trips the new synced settings and day fields', async () => {
    await saveSettings({ supplements: [{ id: 'cr', name: 'Creatine', active: true, addedOn: '2026-09-01' }], waterGoalGlasses: 10 })
    await saveDay({ date: '2026-09-23', cardio: [], updatedAt: '', sleepScore: 81, sleepHours: 7.2, readiness: 74, restingHr: 52, waterGlasses: 6, waist: 38.5, supplementsTaken: ['cr'] })

    const ds = await exportDataset()
    expect(ds.settings.supplements).toEqual([{ id: 'cr', name: 'Creatine', active: true, addedOn: '2026-09-01' }])
    expect(ds.settings.waterGoalGlasses).toBe(10)
    expect(ds.days[0].sleepScore).toBe(81)

    await importDataset(ds)
    const back = await exportDataset()
    expect(back).toEqual(ds)
  })

  test('never exports a synced settings key by accident', async () => {
    const ds = await exportDataset()
    const expected = [
      'targetBodyWeight', 'birthYear', 'dailyStepGoal', 'defaultWithTrainer', 'customCardioTypes',
      'heightInches', 'sex', 'calorieTargetOverride', 'proteinTargetOverride', 'supplements', 'waterGoalGlasses',
    ].sort()
    expect(Object.keys(ds.settings).sort()).toEqual(expected)
  })
})
