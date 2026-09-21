import type { Dataset, FoodItem, SyncedSettings } from './types'

export type Validation = { ok: true; dataset: Dataset } | { ok: false; errors: string[] }

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

const FOOD_KINDS = ['food', 'drink', 'alcohol']
const MEAL_SOURCES = ['ai', 'saved', 'quick']
const CONFIDENCES = ['low', 'medium', 'high']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const optAmount = (v: unknown): boolean => v === undefined || isAmount(v)

export function isFoodItem(x: unknown): x is FoodItem {
  return isObj(x) && typeof x.name === 'string' && FOOD_KINDS.includes(x.kind as string)
    && (x.amount === undefined || typeof x.amount === 'string')
    && isAmount(x.calories) && isAmount(x.protein) && optAmount(x.carbs) && optAmount(x.fat) && optAmount(x.fibre)
}

function isMeal(m: unknown): boolean {
  return isObj(m) && typeof m.id === 'string' && typeof m.date === 'string' && DATE_RE.test(m.date)
    && typeof m.time === 'string' && TIME_RE.test(m.time) && typeof m.description === 'string'
    && Array.isArray(m.items) && m.items.every(isFoodItem) && MEAL_SOURCES.includes(m.source as string)
    && (m.confidence === undefined || CONFIDENCES.includes(m.confidence as string))
}

function isSavedMeal(s: unknown): boolean {
  return isObj(s) && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.items) && s.items.every(isFoodItem)
    && isAmount(s.useCount) && typeof s.lastUsedAt === 'string'
}

export function validateDataset(x: unknown): Validation {
  const errors: string[] = []
  if (!isObj(x)) return { ok: false, errors: ['Backup is not a JSON object.'] }
  const meta = x.meta
  if (!isObj(meta) || meta.schemaVersion !== 1) errors.push('meta.schemaVersion must be 1.')
  else if (typeof meta.updatedAt !== 'string') errors.push('meta.updatedAt must be a string.')
  for (const key of ['exercises', 'workouts', 'days', 'pain'] as const) {
    if (!Array.isArray(x[key])) errors.push(`${key} must be an array.`)
  }
  if (!isObj(x.settings)) errors.push('settings must be an object.')
  if (Array.isArray(x.workouts)) {
    x.workouts.forEach((w, i) => {
      if (!isObj(w) || typeof w.id !== 'string' || typeof w.date !== 'string' || !Array.isArray(w.entries)) {
        errors.push(`workouts[${i}] is malformed.`)
      }
    })
  }
  if (Array.isArray(x.days)) {
    x.days.forEach((d, i) => {
      if (!isObj(d) || typeof d.date !== 'string' || !Array.isArray(d.cardio)) errors.push(`days[${i}] is malformed.`)
    })
  }
  if (Array.isArray(x.pain)) {
    x.pain.forEach((p, i) => {
      if (!isObj(p) || typeof p.id !== 'string' || typeof p.area !== 'string' || typeof p.severity !== 'number') {
        errors.push(`pain[${i}] is malformed.`)
      }
    })
  }
  if (Array.isArray(x.exercises)) {
    x.exercises.forEach((e, i) => {
      if (!isObj(e) || typeof e.id !== 'string' || typeof e.name !== 'string' || typeof e.primary !== 'string') {
        errors.push(`exercises[${i}] is malformed.`)
      }
    })
  }
  for (const key of ['meals', 'savedMeals'] as const) {
    const list = x[key]
    if (list === undefined) continue
    if (!Array.isArray(list)) { errors.push(`${key} must be an array.`); continue }
    const check = key === 'meals' ? isMeal : isSavedMeal
    list.forEach((entry, i) => { if (!check(entry)) errors.push(`${key}[${i}] is malformed.`) })
  }
  if (errors.length) return { ok: false, errors }
  const ds = x as unknown as Dataset
  const raw = ds.settings
  const positive = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
  const settings: SyncedSettings = {
    targetBodyWeight: raw.targetBodyWeight,
    birthYear: typeof raw.birthYear === 'number' && raw.birthYear >= 1900 && raw.birthYear <= new Date().getFullYear() ? raw.birthYear : undefined,
    dailyStepGoal: raw.dailyStepGoal,
    defaultWithTrainer: raw.defaultWithTrainer ?? true,
    customCardioTypes: Array.isArray(raw.customCardioTypes) ? raw.customCardioTypes : [],
    heightInches: typeof raw.heightInches === 'number' && raw.heightInches >= 36 && raw.heightInches <= 96 ? raw.heightInches : undefined,
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : undefined,
    calorieTargetOverride: positive(raw.calorieTargetOverride),
    proteinTargetOverride: positive(raw.proteinTargetOverride),
  }
  return { ok: true, dataset: { ...ds, meals: ds.meals ?? [], savedMeals: ds.savedMeals ?? [], settings } }
}
