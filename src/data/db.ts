import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, Exercise, MealEntry, Meta, PainEntry, SavedMeal, Settings, Workout } from '../domain/types'

export class MannpowerDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  days!: EntityTable<DayRecord, 'date'>
  pain!: EntityTable<PainEntry, 'id'>
  settings!: EntityTable<Settings, 'id'>
  meta!: EntityTable<Meta, 'id'>
  meals!: EntityTable<MealEntry, 'id'>
  savedMeals!: EntityTable<SavedMeal, 'id'>

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
    this.version(2).stores({
      meals: 'id, date',
      savedMeals: 'id, lastUsedAt',
    })
  }
}

export const db = new MannpowerDB()
