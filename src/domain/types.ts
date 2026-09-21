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

export type FoodKind = 'food' | 'drink' | 'alcohol'

export interface FoodItem {
  name: string
  /** Free text such as "2 large" or "1 cup". */
  amount?: string
  kind: FoodKind
  calories: number
  protein: number
  carbs?: number
  fat?: number
  fibre?: number
}

export type MealSource = 'ai' | 'saved' | 'quick'
export type Confidence = 'low' | 'medium' | 'high'

export interface MealEntry {
  id: string
  date: string
  /** HH:MM, 24 hour, local. */
  time: string
  description: string
  /** Totals are always summed from items, never stored. Empty only while needsEstimate is set. */
  items: FoodItem[]
  source: MealSource
  confidence?: Confidence
  /** Set when Describe could not reach Claude. Left out of every average until resolved. */
  needsEstimate?: boolean
  savedMealId?: string
  createdAt: string
  updatedAt: string
}

export interface SavedMeal {
  id: string
  name: string
  items: FoodItem[]
  useCount: number
  lastUsedAt: string
}

export type Sex = 'male' | 'female'
export type AiModel = 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5'
export const AI_MODELS: { id: AiModel; label: string }[] = [
  { id: 'claude-opus-5', label: 'Opus 5 (best estimates)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (cheapest)' },
]

export type SyncStatus = 'not_set_up' | 'synced' | 'pending' | 'error'

/** Settings that travel in data.json. */
export interface SyncedSettings {
  targetBodyWeight?: number
  dailyStepGoal?: number
  /** Four-digit year, used for age-banded strength standards in the weekly report. */
  birthYear?: number
  defaultWithTrainer: boolean
  customCardioTypes: string[]
  /** Used with sex, birth year and body weight for the formula maintenance estimate. */
  heightInches?: number
  sex?: Sex
  /** When set, these replace the computed targets. */
  calorieTargetOverride?: number
  proteinTargetOverride?: number
}

/** Full settings row stored on the phone. */
export interface Settings extends SyncedSettings {
  id: 'settings'
  githubToken?: string
  /** Anthropic API key for meal estimates. Phone only, never exported. */
  anthropicKey?: string
  aiModel: AiModel
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
  meals: MealEntry[]
  savedMeals: SavedMeal[]
  settings: SyncedSettings
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  dataRepo: 'jmannella/mannpower-data',
  defaultWithTrainer: true,
  customCardioTypes: [],
  syncStatus: 'not_set_up',
  aiModel: 'claude-opus-5',
}
