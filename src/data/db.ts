import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, Exercise, Meta, PainEntry, Settings, Workout } from '../domain/types'

export class MannpowerDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  days!: EntityTable<DayRecord, 'date'>
  pain!: EntityTable<PainEntry, 'id'>
  settings!: EntityTable<Settings, 'id'>
  meta!: EntityTable<Meta, 'id'>

  constructor(name = 'mannpower') {
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

export const db = new MannpowerDB()
