import { db } from './db'
import { onDataChange } from './changes'
import { getSettings, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listWorkouts, listExercises } from './repo'
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
})
