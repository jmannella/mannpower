import { db } from './db'
import { emitDataChange } from './changes'
import { nowISO } from '../domain/dates'
import { BUILTIN_EXERCISES } from '../library/exercises'
import {
  DEFAULT_SETTINGS, type DayRecord, type Exercise, type Meta, type PainEntry, type Settings, type Workout,
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

// Settings and meta
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

/** Sync bookkeeping fields do not touch meta, so a status update never triggers another sync. */
const SYNC_ONLY_KEYS: (keyof Settings)[] = ['lastSyncedAt', 'lastSyncSha', 'syncStatus', 'lastSyncError', 'githubToken', 'dataRepo']

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
