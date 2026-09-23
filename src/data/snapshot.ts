import { db } from './db'
import { emitDataChange } from './changes'
import { getMeta, getSettings } from './repo'
import type { Dataset, SyncedSettings } from '../domain/types'

export { validateDataset } from '../domain/validate'

export async function exportDataset(): Promise<Dataset> {
  const [meta, exercises, workouts, days, pain, meals, savedMeals, settings] = await Promise.all([
    getMeta(), db.exercises.toArray(), db.workouts.orderBy('date').toArray(),
    db.days.orderBy('date').toArray(), db.pain.orderBy('date').toArray(),
    db.meals.orderBy('date').toArray(), db.savedMeals.toArray(), getSettings(),
  ])
  const synced: SyncedSettings = {
    targetBodyWeight: settings.targetBodyWeight,
    birthYear: settings.birthYear,
    dailyStepGoal: settings.dailyStepGoal,
    defaultWithTrainer: settings.defaultWithTrainer,
    customCardioTypes: settings.customCardioTypes,
    heightInches: settings.heightInches,
    sex: settings.sex,
    calorieTargetOverride: settings.calorieTargetOverride,
    proteinTargetOverride: settings.proteinTargetOverride,
    supplements: settings.supplements,
    waterGoalGlasses: settings.waterGoalGlasses,
  }
  return { meta: { schemaVersion: 1, updatedAt: meta.updatedAt }, exercises, workouts, days, pain, meals, savedMeals, settings: synced }
}

/**
 * Replace every synced table with the dataset. Token and repo name on the phone are kept.
 * `stampNow` is for a manual restore from a backup file: meta gets the current time and a
 * change is emitted so the restored data is pushed. Sync pulls leave it false so the remote
 * timestamp is preserved and no push loop starts.
 */
export async function importDataset(ds: Dataset, opts: { stampNow?: boolean } = {}): Promise<void> {
  const updatedAt = opts.stampNow ? new Date().toISOString() : ds.meta.updatedAt
  await db.transaction('rw', [db.exercises, db.workouts, db.days, db.pain, db.meals, db.savedMeals, db.settings, db.meta], async () => {
    await Promise.all([db.exercises.clear(), db.workouts.clear(), db.days.clear(), db.pain.clear(), db.meals.clear(), db.savedMeals.clear()])
    await db.exercises.bulkPut(ds.exercises.map((e) => ({ ...e, custom: true })))
    await db.workouts.bulkPut(ds.workouts)
    await db.days.bulkPut(ds.days)
    await db.pain.bulkPut(ds.pain)
    await db.meals.bulkPut(ds.meals ?? [])
    await db.savedMeals.bulkPut(ds.savedMeals ?? [])
    const current = await getSettings()
    await db.settings.put({ ...current, ...ds.settings, id: 'settings' })
    await db.meta.put({ id: 'meta', schemaVersion: 1, updatedAt })
  })
  if (opts.stampNow) emitDataChange()
}
