import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, Exercise, PainEntry, Settings, Workout } from '../domain/types'
import { MannpowerDB } from './db'

/** A standalone Dexie database holding only the version 1 schema, the shape every phone in the field has today. */
class V1OnlyDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  days!: EntityTable<DayRecord, 'date'>
  pain!: EntityTable<PainEntry, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      exercises: 'id, name',
      workouts: 'id, date',
      days: 'date',
      pain: 'id, date, workoutId, exerciseId',
      settings: 'id',
      meta: 'id',
    })
  }
}

describe('the version 1 to version 2 Dexie upgrade', () => {
  test('a real v1 database opens cleanly under v2 with every old record intact and meals ready to use', async () => {
    const name = `mannpower-upgrade-test-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const workout: Workout = {
      id: 'w1', date: '2026-09-01', withTrainer: true,
      entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }],
      createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
    }
    const day: DayRecord = { date: '2026-09-01', bodyWeight: 240, steps: 8000, cardio: [], updatedAt: '2026-09-01T12:00:00.000Z' }
    const pain: PainEntry = { id: 'p1', date: '2026-09-01', area: 'lower_back', severity: 3, limited: false, createdAt: '2026-09-01T12:00:00.000Z' }
    const exercise: Exercise = { id: 'custom-1', name: 'Custom curl', primary: 'biceps', secondary: [], custom: true }
    const settings: Settings = {
      id: 'settings', defaultWithTrainer: true, customCardioTypes: [], aiModel: 'claude-opus-5',
      dataRepo: 'jeremymannella/mannpower-data', syncStatus: 'not_set_up',
    }

    const v1 = new V1OnlyDB(name)
    await v1.open()
    await v1.table('workouts').put(workout)
    await v1.table('days').put(day)
    await v1.table('pain').put(pain)
    await v1.table('exercises').put(exercise)
    await v1.table('settings').put(settings)
    v1.close()

    const upgraded = new MannpowerDB(name)
    await expect(upgraded.open()).resolves.toBeDefined()

    expect(await upgraded.workouts.get('w1')).toEqual(workout)
    expect(await upgraded.days.get('2026-09-01')).toEqual(day)
    expect(await upgraded.pain.get('p1')).toEqual(pain)
    expect(await upgraded.exercises.get('custom-1')).toEqual(exercise)
    expect(await upgraded.settings.get('settings')).toEqual(settings)

    expect(await upgraded.meals.toArray()).toEqual([])
    expect(await upgraded.savedMeals.toArray()).toEqual([])
    await upgraded.meals.put({
      id: 'm1', date: '2026-09-21', time: '12:00', description: 'Test meal', items: [], source: 'quick',
      createdAt: '2026-09-21T12:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z',
    })
    expect(await upgraded.meals.count()).toBe(1)
    await upgraded.savedMeals.put({ id: 's1', name: 'Test saved', items: [], useCount: 0, lastUsedAt: '2026-09-21T12:00:00.000Z' })
    expect(await upgraded.savedMeals.count()).toBe(1)

    upgraded.close()
    await Dexie.delete(name)
  })
})
