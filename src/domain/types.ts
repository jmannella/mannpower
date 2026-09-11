export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
]

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves', core: 'Core',
}

export interface Exercise {
  id: string
  name: string
  primary: MuscleGroup
  secondary: MuscleGroup[]
  custom: boolean
  /** Other names people use for it, matched by search. */
  aliases?: string[]
}

export interface SetRecord {
  weight: number
  reps: number
  warmup: boolean
}

export interface WorkoutEntry {
  id: string
  exerciseId: string
  sets: SetRecord[]
  /** Linked to the entry that follows it as a superset pair. */
  supersetWithNext?: boolean
  /** Comma-separated tags such as "Seated, 3 second hold". A variant is tracked as its own lift. */
  variation?: string
}

export interface Workout {
  id: string
  date: string
  withTrainer: boolean
  notes?: string
  entries: WorkoutEntry[]
  createdAt: string
  updatedAt: string
}

export interface CardioSession {
  id: string
  type: string
  minutes: number
  distance?: number
  notes?: string
}

export interface DayRecord {
  date: string
  bodyWeight?: number
  steps?: number
  cardio: CardioSession[]
  updatedAt: string
}

export type BodyArea =
  | 'neck' | 'shoulder_left' | 'shoulder_right' | 'elbow_left' | 'elbow_right'
  | 'wrist_left' | 'wrist_right' | 'upper_back' | 'lower_back' | 'hip_left' | 'hip_right'
  | 'knee_left' | 'knee_right' | 'ankle_left' | 'ankle_right' | 'other'

export type Severity = 1 | 2 | 3 | 4 | 5

export interface PainEntry {
  id: string
  date: string
  area: BodyArea
  severity: Severity
  limited: boolean
  note?: string
  workoutId?: string
  exerciseId?: string
  createdAt: string
}

export type SyncStatus = 'not_set_up' | 'synced' | 'pending' | 'error'

/** Settings that travel in data.json. */
export interface SyncedSettings {
  targetBodyWeight?: number
  dailyStepGoal?: number
  defaultWithTrainer: boolean
  customCardioTypes: string[]
}

/** Full settings row stored on the phone. */
export interface Settings extends SyncedSettings {
  id: 'settings'
  githubToken?: string
  dataRepo: string
  lastSyncedAt?: string
  lastSyncSha?: string
  syncStatus: SyncStatus
  lastSyncError?: string
}

export interface Meta {
  id: 'meta'
  schemaVersion: 1
  updatedAt: string
}

/** The whole dataset as serialized to data.json. */
export interface Dataset {
  meta: { schemaVersion: 1; updatedAt: string }
  exercises: Exercise[]
  workouts: Workout[]
  days: DayRecord[]
  pain: PainEntry[]
  settings: SyncedSettings
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  dataRepo: 'jmannella/mannpower-data',
  defaultWithTrainer: true,
  customCardioTypes: [],
  syncStatus: 'not_set_up',
}
