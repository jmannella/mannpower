import { db } from './db'
import { emitDataChange } from './changes'
import { nowISO } from '../domain/dates'
import { newId } from '../domain/ids'
import { BUILTIN_EXERCISES } from '../library/exercises'
import {
  DEFAULT_SETTINGS, type DayRecord, type Exercise, type MealEntry, type Meta, type PainEntry, type SavedMeal, type Settings, type Workout,
} from '../domain/types'

async function afterWrite(): Promise<void> {
  await touchMeta()
  emitDataChange()
}

// Exercises: built-ins live in code, only custom ones are stored.
export async function listExercises(): Promise<Exercise[]> {
  const custom = await db.exercises.toArray()
  return [...BUILTIN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveExercise(e: Exercise): Promise<void> {
  await db.exercises.put({ ...e, custom: true })
  await afterWrite()
}

export async function exerciseHasSets(exerciseId: string): Promise<boolean> {
  const workouts = await db.workouts.toArray()
  return workouts.some((w) => w.entries.some((en) => en.exerciseId === exerciseId && en.sets.length > 0))
}

export async function deleteExercise(id: string): Promise<void> {
  if (await exerciseHasSets(id)) throw new Error('This exercise has logged sets and cannot be deleted.')
  await db.exercises.delete(id)
  await afterWrite()
}

// Workouts
export async function listWorkouts(): Promise<Workout[]> {
  return db.workouts.orderBy('date').toArray()
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  return db.workouts.get(id)
}

export async function getWorkoutByDate(date: string): Promise<Workout | undefined> {
  return db.workouts.where('date').equals(date).first()
}

export async function saveWorkout(w: Workout): Promise<void> {
  await db.workouts.put({ ...w, updatedAt: nowISO() })
  await afterWrite()
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id)
  await afterWrite()
}

/**
 * Read, transform and write the workout for a date inside one transaction so two
 * quick edits can never overwrite each other. `draft` supplies the record when none exists.
 */
export async function modifyWorkoutByDate(date: string, draft: () => Workout, fn: (w: Workout) => Workout): Promise<Workout> {
  const next = await db.transaction('rw', [db.workouts, db.meta], async () => {
    const cur = (await db.workouts.where('date').equals(date).first()) ?? draft()
    const n: Workout = { ...fn(cur), updatedAt: nowISO() }
    await db.workouts.put(n)
    await touchMeta()
    return n
  })
  emitDataChange()
  return next
}

// Days
export async function listDays(): Promise<DayRecord[]> {
  return db.days.orderBy('date').toArray()
}

export async function getDay(date: string): Promise<DayRecord | undefined> {
  return db.days.get(date)
}

export async function saveDay(d: DayRecord): Promise<void> {
  await db.days.put({ ...d, updatedAt: nowISO() })
  await afterWrite()
}

/** Same guarantee for a day record. */
export async function modifyDay(date: string, fn: (d: DayRecord) => Partial<DayRecord>): Promise<DayRecord> {
  const next = await db.transaction('rw', [db.days, db.meta], async () => {
    const cur = (await db.days.get(date)) ?? { date, cardio: [], updatedAt: '' }
    const n: DayRecord = { ...cur, ...fn(cur), updatedAt: nowISO() }
    await db.days.put(n)
    await touchMeta()
    return n
  })
  emitDataChange()
  return next
}

// Pain
export async function listPain(): Promise<PainEntry[]> {
  return db.pain.orderBy('date').toArray()
}

export async function savePain(p: PainEntry): Promise<void> {
  await db.pain.put({ ...p, createdAt: p.createdAt || nowISO() })
  await afterWrite()
}

export async function deletePain(id: string): Promise<void> {
  await db.pain.delete(id)
  await afterWrite()
}

// Meals
export async function listMeals(): Promise<MealEntry[]> {
  return db.meals.orderBy('date').toArray()
}

export async function mealsForDate(date: string): Promise<MealEntry[]> {
  const meals = await db.meals.where('date').equals(date).toArray()
  return meals.sort((a, b) => a.time.localeCompare(b.time))
}

/**
 * Writes the meal and touches meta in one transaction, the same guarantee saveDay and saveWorkout
 * get from modifyDay and modifyWorkoutByDate. Two separate writes here let another reader see the
 * meal before meta (and its own change signal) settle, so a caller that awaits saveMeal and then
 * acts on that signal can run ahead of a concurrent read.
 */
export async function saveMeal(m: MealEntry): Promise<void> {
  const now = nowISO()
  await db.transaction('rw', [db.meals, db.meta], async () => {
    await db.meals.put({ ...m, createdAt: m.createdAt || now, updatedAt: now })
    await touchMeta()
  })
  emitDataChange()
}

export async function deleteMeal(id: string): Promise<void> {
  await db.meals.delete(id)
  await afterWrite()
}

export async function listSavedMeals(): Promise<SavedMeal[]> {
  return db.savedMeals.orderBy('lastUsedAt').reverse().toArray()
}

export async function saveSavedMeal(s: SavedMeal): Promise<void> {
  await db.savedMeals.put(s)
  await afterWrite()
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await db.savedMeals.delete(id)
  await afterWrite()
}

/** Log a saved meal on a date and bump its use count in one transaction. */
export async function logSavedMeal(savedId: string, date: string, time: string): Promise<MealEntry> {
  const meal = await db.transaction('rw', [db.meals, db.savedMeals, db.meta], async () => {
    const saved = await db.savedMeals.get(savedId)
    if (!saved) throw new Error('That saved meal no longer exists.')
    const now = nowISO()
    const entry: MealEntry = {
      id: newId(), date, time, description: saved.name, items: saved.items.map((i) => ({ ...i })),
      source: 'saved', savedMealId: saved.id, createdAt: now, updatedAt: now,
    }
    await db.meals.put(entry)
    await db.savedMeals.put({ ...saved, useCount: saved.useCount + 1, lastUsedAt: now })
    await touchMeta()
    return entry
  })
  emitDataChange()
  return meal
}

// Settings and meta
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

/** Sync bookkeeping fields do not touch meta, so a status update never triggers another sync. */
const SYNC_ONLY_KEYS: (keyof Settings)[] = ['lastSyncedAt', 'lastSyncSha', 'syncStatus', 'lastSyncError', 'githubToken', 'dataRepo', 'anthropicKey', 'aiModel']

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const touchesData = Object.keys(patch).some((k) => !SYNC_ONLY_KEYS.includes(k as keyof Settings))
  await db.transaction('rw', [db.settings, db.meta], async () => {
    const s = await db.settings.get('settings')
    const current = { ...DEFAULT_SETTINGS, ...(s ?? {}) }
    await db.settings.put({ ...current, ...patch, id: 'settings' })
    if (touchesData) await touchMeta()
  })
  if (touchesData) emitDataChange()
}

export async function getMeta(): Promise<Meta> {
  const m = await db.meta.get('meta')
  return m ?? { id: 'meta', schemaVersion: 1, updatedAt: '1970-01-01T00:00:00.000Z' }
}

export async function touchMeta(): Promise<void> {
  await db.meta.put({ id: 'meta', schemaVersion: 1, updatedAt: nowISO() })
}
