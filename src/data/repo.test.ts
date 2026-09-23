import { db } from './db'
import { onDataChange } from './changes'
import {
  deleteExercise, deleteWorkout, exerciseHasSets, getDay, getMeta, getSettings, getWorkoutByDate,
  listExercises, listWorkouts, modifyDay, modifyWorkoutByDate, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listPain,
  saveMeal, mealsForDate, listMeals, deleteMeal, saveSavedMeal, listSavedMeals, deleteSavedMeal, logSavedMeal, renameSavedMeal,
  toggleSupplement, addWater,
} from './repo'
import type { MealEntry, Workout } from '../domain/types'

function workout(date: string, exerciseId = 'back-squat'): Workout {
  return {
    id: `w-${date}`, date, withTrainer: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    entries: [{ id: 'e1', exerciseId, sets: [{ weight: 135, reps: 5, warmup: false }] }],
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('repo', () => {
  test('listExercises returns built-ins plus custom sorted by name', async () => {
    await saveExercise({ id: 'custom-1', name: 'Aardvark Press', primary: 'chest', secondary: [], custom: true })
    const all = await listExercises()
    expect(all[0].name).toBe('Aardvark Press')
    expect(all.some((e) => e.id === 'back-squat')).toBe(true)
  })

  test('deleteExercise refuses when the exercise has logged sets', async () => {
    await saveExercise({ id: 'custom-1', name: 'Thing', primary: 'chest', secondary: [], custom: true })
    await saveWorkout(workout('2026-09-08', 'custom-1'))
    expect(await exerciseHasSets('custom-1')).toBe(true)
    await expect(deleteExercise('custom-1')).rejects.toThrow(/logged sets/)
  })

  test('saveWorkout stamps updatedAt, touches meta, and emits a change', async () => {
    const before = (await getMeta()).updatedAt
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    const w = workout('2026-09-08')
    await saveWorkout(w)
    off()
    const saved = await getWorkoutByDate('2026-09-08')
    expect(saved?.id).toBe(w.id)
    expect(saved?.updatedAt).not.toBe(w.updatedAt)
    expect((await getMeta()).updatedAt > before).toBe(true)
    expect(seen).toHaveLength(1)
  })

  test('listWorkouts is sorted by date ascending and deleteWorkout removes', async () => {
    await saveWorkout(workout('2026-09-10'))
    await saveWorkout(workout('2026-09-08'))
    expect((await listWorkouts()).map((w) => w.date)).toEqual(['2026-09-08', '2026-09-10'])
    await deleteWorkout('w-2026-09-08')
    expect((await listWorkouts()).map((w) => w.date)).toEqual(['2026-09-10'])
  })

  test('saveDay upserts by date', async () => {
    await saveDay({ date: '2026-09-08', bodyWeight: 240, cardio: [], updatedAt: '' })
    await saveDay({ date: '2026-09-08', bodyWeight: 239, steps: 8000, cardio: [], updatedAt: '' })
    const d = await getDay('2026-09-08')
    expect(d?.bodyWeight).toBe(239)
    expect(d?.steps).toBe(8000)
  })

  test('settings default and patch', async () => {
    const s = await getSettings()
    expect(s.dataRepo).toBe('jmannella/mannpower-data')
    expect(s.defaultWithTrainer).toBe(true)
    await saveSettings({ dailyStepGoal: 10000 })
    expect((await getSettings()).dailyStepGoal).toBe(10000)
    expect((await getSettings()).dataRepo).toBe('jmannella/mannpower-data')
  })

  test('sync-only settings keys do not touch meta or emit a change', async () => {
    await saveSettings({ dailyStepGoal: 8000 }) // establishes a real meta timestamp
    const before = (await getMeta()).updatedAt
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    await saveSettings({ syncStatus: 'synced', lastSyncedAt: '2026-09-08T12:00:00.000Z', lastSyncSha: 'abc', lastSyncUpdatedAt: '2026-09-08T11:00:00.000Z', lastSyncError: undefined, githubToken: 'tok', dataRepo: 'x/y' })
    off()
    expect((await getMeta()).updatedAt).toBe(before)
    expect(seen).toHaveLength(0)
    const s = await getSettings()
    expect(s.syncStatus).toBe('synced')
    expect(s.githubToken).toBe('tok')
    expect(s.dailyStepGoal).toBe(8000)
  })

  test('pain entries save and list', async () => {
    await savePain({ id: 'p1', date: '2026-09-08', area: 'lower_back', severity: 3, limited: true, createdAt: '' })
    expect((await listPain()).map((p) => p.id)).toEqual(['p1'])
  })

  test('modifyWorkoutByDate serialises concurrent edits', async () => {
    const draft = (): Workout => ({ id: 'w-draft', date: '2026-09-08', withTrainer: true, entries: [], createdAt: '', updatedAt: '' })
    await Promise.all([
      modifyWorkoutByDate('2026-09-08', draft, (w) => ({ ...w, entries: [...w.entries, { id: 'a', exerciseId: 'plank', sets: [] }] })),
      modifyWorkoutByDate('2026-09-08', draft, (w) => ({ ...w, withTrainer: false })),
      modifyWorkoutByDate('2026-09-08', draft, (w) => ({ ...w, entries: [...w.entries, { id: 'b', exerciseId: 'push-up', sets: [] }] })),
    ])
    const all = await listWorkouts()
    expect(all).toHaveLength(1)
    expect(all[0].withTrainer).toBe(false)
    expect(all[0].entries.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  test('saveSettings serialises concurrent edits atomically', async () => {
    await Promise.all([
      saveSettings({ dailyStepGoal: 1 }),
      saveSettings({ syncStatus: 'synced' }),
      saveSettings({ customCardioTypes: ['Hike'] }),
    ])
    const s = await getSettings()
    expect(s.dailyStepGoal).toBe(1)
    expect(s.syncStatus).toBe('synced')
    expect(s.customCardioTypes).toEqual(['Hike'])
  })

  test('modifyDay serialises concurrent edits', async () => {
    await Promise.all([
      modifyDay('2026-09-08', () => ({ bodyWeight: 240 })),
      modifyDay('2026-09-08', () => ({ steps: 9000 })),
      modifyDay('2026-09-08', (d) => ({ cardio: [...d.cardio, { id: 'c', type: 'Walk', minutes: 10 }] })),
    ])
    const d = await getDay('2026-09-08')
    expect(d?.bodyWeight).toBe(240)
    expect(d?.steps).toBe(9000)
    expect(d?.cardio).toHaveLength(1)
  })
})

describe('meals', () => {
  const meal = (id: string, date: string, time: string): MealEntry => ({
    id, date, time, description: 'Lunch', source: 'quick',
    items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], createdAt: '', updatedAt: '',
  })

  test('saveMeal stores, stamps and emits; mealsForDate sorts by time', async () => {
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    await saveMeal(meal('b', '2026-09-21', '18:00'))
    await saveMeal(meal('a', '2026-09-21', '08:00'))
    await saveMeal(meal('c', '2026-09-22', '09:00'))
    off()
    const day = await mealsForDate('2026-09-21')
    expect(day.map((m) => m.id)).toEqual(['a', 'b'])
    expect(day[0].createdAt).not.toBe('')
    expect(day[0].updatedAt).not.toBe('')
    expect(seen).toHaveLength(3)
    expect((await listMeals()).map((m) => m.id).pop()).toBe('c')
  })

  test('deleteMeal removes the meal', async () => {
    await saveMeal(meal('a', '2026-09-21', '08:00'))
    await deleteMeal('a')
    expect(await mealsForDate('2026-09-21')).toEqual([])
  })

  test('logSavedMeal copies the items, links the saved meal and bumps its use count', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const logged = await logSavedMeal('s1', '2026-09-21', '07:45')
    expect(logged).toMatchObject({ date: '2026-09-21', time: '07:45', description: 'Eggs and toast', source: 'saved', savedMealId: 's1' })
    expect(logged.items[0].calories).toBe(450)
    const saved = await listSavedMeals()
    expect(saved[0].useCount).toBe(2)
    expect(saved[0].lastUsedAt > '2026-09-01').toBe(true)
    await deleteSavedMeal('s1')
    expect(await listSavedMeals()).toEqual([])
  })

  test('renameSavedMeal changes only the name and keeps the items and use count', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 3, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    await renameSavedMeal('s1', '  Big breakfast  ')
    const [saved] = await listSavedMeals()
    expect(saved).toMatchObject({ id: 's1', name: 'Big breakfast', useCount: 3, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    expect(saved.items[0].name).toBe('Eggs and toast')
  })

  test('renameSavedMeal ignores a blank name and a missing meal', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    await renameSavedMeal('s1', '   ')
    await renameSavedMeal('nope', 'Anything')
    expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Eggs and toast'])
  })

  test('saving the AI key or model does not touch meta', async () => {
    const before = (await getMeta()).updatedAt
    await saveSettings({ anthropicKey: 'sk-test', aiModel: 'claude-haiku-4-5' })
    expect((await getMeta()).updatedAt).toBe(before)
    expect((await getSettings()).anthropicKey).toBe('sk-test')
  })
})

describe('check in helpers', () => {
  test('toggles a supplement on and then off', async () => {
    await toggleSupplement('2026-09-23', 'im8')
    expect((await getDay('2026-09-23'))?.supplementsTaken).toEqual(['im8'])
    await toggleSupplement('2026-09-23', 'im8')
    expect((await getDay('2026-09-23'))?.supplementsTaken).toEqual([])
  })

  test('keeps other supplements when one is toggled', async () => {
    await toggleSupplement('2026-09-23', 'im8')
    await toggleSupplement('2026-09-23', 'cr')
    await toggleSupplement('2026-09-23', 'im8')
    expect((await getDay('2026-09-23'))?.supplementsTaken).toEqual(['cr'])
  })

  test('adds water and clamps at zero', async () => {
    await addWater('2026-09-23', 1)
    await addWater('2026-09-23', 1)
    expect((await getDay('2026-09-23'))?.waterGlasses).toBe(2)
    await addWater('2026-09-23', -5)
    expect((await getDay('2026-09-23'))?.waterGlasses).toBe(0)
  })

  test('stamps meta so a check in write is synced', async () => {
    const before = (await getMeta()).updatedAt
    await addWater('2026-09-23', 1)
    expect((await getMeta()).updatedAt).not.toBe(before)
  })
})
