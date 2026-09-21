import type { BodyArea, DayRecord, MealEntry, PainEntry, SetRecord, Severity, Workout, WorkoutEntry } from '../domain/types'

let counter = 0
const nextId = (prefix: string) => `${prefix}-${++counter}`

export function mkSet(weight: number, reps: number, warmup = false): SetRecord {
  return { weight, reps, warmup }
}

export function mkEntry(exerciseId: string, sets: [number, number][], warmups: [number, number][] = []): WorkoutEntry {
  return {
    id: nextId('e'),
    exerciseId,
    sets: [...warmups.map(([w, r]) => mkSet(w, r, true)), ...sets.map(([w, r]) => mkSet(w, r))],
  }
}

export function mkWorkout(date: string, entries: WorkoutEntry[], opts: { withTrainer?: boolean; id?: string } = {}): Workout {
  return {
    id: opts.id ?? nextId('w'),
    date,
    withTrainer: opts.withTrainer ?? true,
    entries,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  }
}

export function mkDay(date: string, patch: Partial<DayRecord> = {}): DayRecord {
  return { date, cardio: [], updatedAt: `${date}T12:00:00.000Z`, ...patch }
}

export function mkPain(date: string, area: BodyArea, severity: Severity, patch: Partial<PainEntry> = {}): PainEntry {
  return { id: nextId('p'), date, area, severity, limited: false, createdAt: `${date}T12:00:00.000Z`, ...patch }
}

export function mkMeal(date: string, calories: number, protein = 0, patch: Partial<MealEntry> = {}): MealEntry {
  return {
    id: nextId('m'), date, time: '12:00', description: 'Meal', source: 'quick',
    items: [{ name: 'Meal', kind: 'food', calories, protein }],
    createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`, ...patch,
  }
}
