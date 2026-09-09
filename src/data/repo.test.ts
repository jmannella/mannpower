import { db } from './db'
import { onDataChange } from './changes'
import {
  deleteExercise, deleteWorkout, exerciseHasSets, getDay, getMeta, getSettings, getWorkoutByDate,
  listExercises, listWorkouts, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listPain,
} from './repo'
import type { Workout } from '../domain/types'

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
    await saveSettings({ syncStatus: 'synced', lastSyncedAt: '2026-09-08T12:00:00.000Z', lastSyncSha: 'abc', lastSyncError: undefined, githubToken: 'tok', dataRepo: 'x/y' })
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
})
