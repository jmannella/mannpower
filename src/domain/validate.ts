import type { Dataset, SyncedSettings } from './types'

export type Validation = { ok: true; dataset: Dataset } | { ok: false; errors: string[] }

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
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
  if (errors.length) return { ok: false, errors }
  const ds = x as unknown as Dataset
  const settings: SyncedSettings = {
    targetBodyWeight: ds.settings.targetBodyWeight,
    birthYear: typeof ds.settings.birthYear === 'number' ? ds.settings.birthYear : undefined,
    dailyStepGoal: ds.settings.dailyStepGoal,
    defaultWithTrainer: ds.settings.defaultWithTrainer ?? true,
    customCardioTypes: Array.isArray(ds.settings.customCardioTypes) ? ds.settings.customCardioTypes : [],
  }
  return { ok: true, dataset: { ...ds, settings } }
}
