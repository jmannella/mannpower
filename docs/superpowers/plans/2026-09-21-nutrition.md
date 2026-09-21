# Mannpower Nutrition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meal and calorie tracking to Mannpower: a Food tab with saved meals, quick add and AI estimates, targets worked out from Jeremy's own data, nutrition charts, and a Nutrition block in the Sunday digest.

**Architecture:** Meals live in the same Dexie database and the same synced `data.json` as everything else. All maths sits in pure functions (`src/nutrition/totals.ts`, `src/nutrition/targets.ts`, `src/stats/nutrition.ts`) that take plain arrays, so the phone UI, Trends and the Node report script share them. The AI estimator is one module that calls the Claude API from the browser through the official SDK behind an injectable client, so every test runs offline.

**Tech Stack:** Vite, React 19, TypeScript (strict), Dexie 4, Recharts 3, Vitest with jsdom and fake-indexeddb, `@anthropic-ai/sdk` 0.127 or newer.

**Spec:** `docs/superpowers/specs/2026-09-21-nutrition-design.md`. Read it before starting any task.

## Global Constraints

- Work on the `nutrition` branch. Never commit to `main`.
- Tests first for every task. Run one file with `npx vitest run <path>`, everything with `npm test`, and the type check with `npx tsc -p tsconfig.json`. `tsconfig.json` has `noUnusedLocals` and `noUnusedParameters` on, so unused imports fail the build.
- Units are pounds and inches. Calories are kcal. Dates are `YYYY-MM-DD` strings, times are `HH:MM` 24 hour strings.
- No em dashes and no hyphens used as sentence connectors in any user facing text, README text or commit message. Use commas, colons or separate sentences.
- The Anthropic API key is phone only. It must never appear in `exportDataset()` output, in `data.json`, in logs, or in test snapshots other than as an obvious fake such as `sk-test`.
- Any browser API stored as a default or passed into a library must be wrapped in an arrow function (`(input, init) => globalThis.fetch(input, init)`), never stored bare. Browsers throw "Illegal invocation" otherwise and Node tests will not catch it.
- Default model is the exact string `claude-opus-5`. Allowed models: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Never add date suffixes.
- Follow existing patterns: repo writes call `afterWrite()`, screens use hooks from `src/ui/hooks.ts`, shared components from `src/ui/components`, CSS classes from `src/styles/theme.css`.
- Late eating means `time >= '20:00'`. Weekend means Saturday and Sunday. Weeks run Monday to Sunday (`weekStart`, `weekEnd` in `src/domain/dates.ts`).

## File Structure

Create:

| File | Responsibility |
|---|---|
| `src/domain/validate.test.ts` | Validator tests for meals, saved meals and new settings |
| `src/nutrition/totals.ts` (+ test) | Sum items, meal totals, day totals, scale items by a portion factor |
| `src/nutrition/targets.ts` (+ test) | BMR, activity factor, formula and measured maintenance, complete day rule, calorie and protein targets |
| `src/nutrition/estimate.ts` (+ test) | Build the Claude request, parse and validate the reply, map errors, `estimateMeal()` |
| `src/nutrition/photo.ts` | Downscale a photo to a 1024 px JPEG and return base64 (browser only, no test) |
| `src/stats/nutrition.ts` (+ test) | Weekly nutrition block for the digest, daily series for Trends |
| `src/ui/MealConfirm.tsx` | Confirm view: editable items, portion multiplier, time, save as saved meal |
| `src/ui/MealSheet.tsx` (+ test) | Add meal sheet with Describe, Saved and Quick add modes |
| `src/ui/screens/Food.tsx` (+ test) | Food tab day view |

Modify: `src/domain/types.ts`, `src/domain/validate.ts`, `src/domain/dates.ts`, `src/data/db.ts`, `src/data/repo.ts`, `src/data/snapshot.ts`, `src/sync/github.ts`, `src/sync/engine.ts`, `src/stats/testData.ts`, `src/stats/digest.ts`, `src/ui/hooks.ts`, `src/ui/components/NumberField.tsx`, `src/ui/components/TabBar.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/ui/screens/Today.tsx`, `src/ui/screens/Settings.tsx`, `src/ui/screens/Trends.tsx`, `src/styles/theme.css`, `scripts/fixtures/week.json`, `scripts/report.test.ts`, `README.md`, and the existing tests that build `Dataset` literals (`src/data/snapshot.test.ts`, `src/stats/digest.test.ts`, `src/sync/engine.test.ts`).

Outside the repo: `~/.claude/scheduled-tasks/mannpower-weekly-report/SKILL.md` (Task 14).

---

### Task 1: Domain types and validator

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/validate.ts`
- Modify: `src/data/snapshot.test.ts`, `src/stats/digest.test.ts`, `src/sync/engine.test.ts` (add the two new arrays to `Dataset` literals)
- Test: `src/domain/validate.test.ts` (new)

**Interfaces:**
- Produces: types `FoodKind`, `FoodItem`, `MealSource`, `Confidence`, `MealEntry`, `SavedMeal`, `Sex`, `AiModel`; `Dataset.meals`, `Dataset.savedMeals`; `SyncedSettings.heightInches/sex/calorieTargetOverride/proteinTargetOverride`; `Settings.anthropicKey/aiModel`; `isFoodItem(x: unknown): x is FoodItem` exported from `validate.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/validate.test.ts`:

```ts
import { isFoodItem, validateDataset } from './validate'

const base = () => ({
  meta: { schemaVersion: 1, updatedAt: '2026-09-21T00:00:00.000Z' },
  exercises: [], workouts: [], days: [], pain: [],
  settings: { defaultWithTrainer: true, customCardioTypes: [] },
})
const item = () => ({ name: 'Chicken wrap', amount: '1', kind: 'food', calories: 520, protein: 32, carbs: 48, fat: 20, fibre: 4 })
const meal = () => ({
  id: 'm1', date: '2026-09-21', time: '12:30', description: 'Chicken wrap', source: 'ai', confidence: 'medium',
  items: [item()], createdAt: '', updatedAt: '',
})

describe('validateDataset nutrition', () => {
  test('a dataset from before meals existed loads with empty arrays', () => {
    const v = validateDataset(base())
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.dataset.meals).toEqual([])
      expect(v.dataset.savedMeals).toEqual([])
    }
  })

  test('accepts a valid meal and saved meal', () => {
    const v = validateDataset({ ...base(), meals: [meal()], savedMeals: [{ id: 's1', name: 'Wrap', items: [item()], useCount: 2, lastUsedAt: '2026-09-20T12:00:00.000Z' }] })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.dataset.meals[0].items[0].calories).toBe(520)
  })

  test('accepts a meal waiting for an estimate with no items', () => {
    const v = validateDataset({ ...base(), meals: [{ ...meal(), items: [], needsEstimate: true }] })
    expect(v.ok).toBe(true)
  })

  test.each([
    ['negative calories', { ...meal(), items: [{ ...item(), calories: -5 }] }],
    ['unknown kind', { ...meal(), items: [{ ...item(), kind: 'snack' }] }],
    ['bad time', { ...meal(), time: '7pm' }],
    ['bad date', { ...meal(), date: 'Sept 21' }],
    ['unknown source', { ...meal(), source: 'guess' }],
    ['unknown confidence', { ...meal(), confidence: 'sure' }],
  ])('rejects a meal with %s', (_label, bad) => {
    const v = validateDataset({ ...base(), meals: [bad] })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors[0]).toBe('meals[0] is malformed.')
  })

  test('rejects a malformed saved meal and a non array', () => {
    const a = validateDataset({ ...base(), savedMeals: [{ id: 's1', name: 'Wrap', items: 'nope', useCount: 1, lastUsedAt: '' }] })
    expect(a.ok).toBe(false)
    const b = validateDataset({ ...base(), meals: 'nope' })
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.errors[0]).toBe('meals must be an array.')
  })

  test('sanitises the new settings', () => {
    const v = validateDataset({ ...base(), settings: { defaultWithTrainer: true, customCardioTypes: [], heightInches: 500, sex: 'other', calorieTargetOverride: -1, proteinTargetOverride: 180 } })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.dataset.settings.heightInches).toBeUndefined()
      expect(v.dataset.settings.sex).toBeUndefined()
      expect(v.dataset.settings.calorieTargetOverride).toBeUndefined()
      expect(v.dataset.settings.proteinTargetOverride).toBe(180)
    }
    const ok = validateDataset({ ...base(), settings: { defaultWithTrainer: true, customCardioTypes: [], heightInches: 70, sex: 'male' } })
    if (ok.ok) {
      expect(ok.dataset.settings.heightInches).toBe(70)
      expect(ok.dataset.settings.sex).toBe('male')
    }
  })

  test('isFoodItem allows missing optional macros', () => {
    expect(isFoodItem({ name: 'Dinner', kind: 'food', calories: 900, protein: 55 })).toBe(true)
    expect(isFoodItem({ name: 'Dinner', kind: 'food', calories: Number.NaN, protein: 55 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/domain/validate.test.ts`
Expected: FAIL, `isFoodItem` is not exported and `meals` is undefined.

- [ ] **Step 3: Add the types**

In `src/domain/types.ts`, add after the `PainEntry` interface:

```ts
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
```

Extend `SyncedSettings` (keep the existing fields):

```ts
  /** Used with sex, birth year and body weight for the formula maintenance estimate. */
  heightInches?: number
  sex?: Sex
  /** When set, these replace the computed targets. */
  calorieTargetOverride?: number
  proteinTargetOverride?: number
```

Extend `Settings` (phone only fields, next to `githubToken`):

```ts
  /** Anthropic API key for meal estimates. Phone only, never exported. */
  anthropicKey?: string
  aiModel: AiModel
```

Extend `Dataset`:

```ts
  meals: MealEntry[]
  savedMeals: SavedMeal[]
```

Add `aiModel: 'claude-opus-5',` to `DEFAULT_SETTINGS`.

- [ ] **Step 4: Extend the validator**

In `src/domain/validate.ts`, change the import and add helpers above `validateDataset`:

```ts
import type { Dataset, FoodItem, SyncedSettings } from './types'

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
```

Inside `validateDataset`, after the `exercises` block and before `if (errors.length)`:

```ts
  for (const key of ['meals', 'savedMeals'] as const) {
    const list = x[key]
    if (list === undefined) continue
    if (!Array.isArray(list)) { errors.push(`${key} must be an array.`); continue }
    const check = key === 'meals' ? isMeal : isSavedMeal
    list.forEach((entry, i) => { if (!check(entry)) errors.push(`${key}[${i}] is malformed.`) })
  }
```

Replace the tail of the function (from `const ds = ...`) with:

```ts
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
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run src/domain/validate.test.ts`
Expected: PASS.

Run: `npx tsc -p tsconfig.json`
Expected: errors only about `Dataset` literals missing `meals` and `savedMeals` in `src/data/snapshot.ts`, `src/data/snapshot.test.ts`, `src/stats/digest.test.ts` and `src/sync/engine.test.ts`.

- [ ] **Step 6: Fix the Dataset literals in tests**

In `src/data/snapshot.test.ts` (two `importDataset` calls), `src/stats/digest.test.ts` (`dataset()`) and `src/sync/engine.test.ts` (the `ds()` helper), add `meals: [], savedMeals: [],` next to `pain`. In `src/data/snapshot.ts`, make `exportDataset` compile for now by adding `meals: [], savedMeals: []` to the returned object (Task 2 replaces this with real data).

Run: `npx tsc -p tsconfig.json && npm test`
Expected: clean type check, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain src/data/snapshot.ts src/data/snapshot.test.ts src/stats/digest.test.ts src/sync/engine.test.ts
git commit -m "Add meal types and validate meals in the dataset"
```

---

### Task 2: Database, repo, snapshot and hooks

**Files:**
- Modify: `src/data/db.ts`, `src/data/repo.ts`, `src/data/snapshot.ts`, `src/sync/engine.ts`, `src/ui/hooks.ts`
- Test: `src/data/repo.test.ts`, `src/data/snapshot.test.ts`

**Interfaces:**
- Consumes: `MealEntry`, `SavedMeal` from Task 1.
- Produces (all in `src/data/repo.ts`):
  - `listMeals(): Promise<MealEntry[]>` ordered by date
  - `mealsForDate(date: string): Promise<MealEntry[]>` ordered by time
  - `saveMeal(m: MealEntry): Promise<void>` (insert or update, stamps `updatedAt`, fills `createdAt` when blank)
  - `deleteMeal(id: string): Promise<void>`
  - `listSavedMeals(): Promise<SavedMeal[]>` most recently used first
  - `saveSavedMeal(s: SavedMeal): Promise<void>`, `deleteSavedMeal(id: string): Promise<void>`
  - `logSavedMeal(savedId: string, date: string, time: string): Promise<MealEntry>`
- Produces hooks: `useMeals()`, `useMealsForDate(date)`, `useSavedMeals()`.

- [ ] **Step 1: Write the failing tests**

Append to `src/data/repo.test.ts` (keep its existing imports and `beforeEach`). Make sure the import from `./repo` includes `saveMeal, mealsForDate, listMeals, deleteMeal, saveSavedMeal, listSavedMeals, deleteSavedMeal, logSavedMeal, saveSettings, getSettings, getMeta`, and import `onDataChange` from `./changes` if it is not already imported:

```ts
describe('meals', () => {
  const meal = (id: string, date: string, time: string): MealEntry => ({
    id, date, time, description: 'Lunch', source: 'quick',
    items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], createdAt: '', updatedAt: '',
  })

  test('saveMeal stores, stamps and emits; mealsForDate sorts by time', async () => {
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    await saveMeal(meal('b', '2026-09-21', '18:00'))
    await saveMeal(meal('a', '2026-09-21', '08:00'))
    await saveMeal(meal('c', '2026-09-22', '09:00'))
    off()
    const day = await mealsForDate('2026-09-21')
    expect(day.map((m) => m.id)).toEqual(['a', 'b'])
    expect(day[0].createdAt).not.toBe('')
    expect(day[0].updatedAt).not.toBe('')
    expect(seen).toHaveLength(3)
    expect((await listMeals()).map((m) => m.id).pop()).toBe('c')
  })

  test('deleteMeal removes the meal', async () => {
    await saveMeal(meal('a', '2026-09-21', '08:00'))
    await deleteMeal('a')
    expect(await mealsForDate('2026-09-21')).toEqual([])
  })

  test('logSavedMeal copies the items, links the saved meal and bumps its use count', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const logged = await logSavedMeal('s1', '2026-09-21', '07:45')
    expect(logged).toMatchObject({ date: '2026-09-21', time: '07:45', description: 'Eggs and toast', source: 'saved', savedMealId: 's1' })
    expect(logged.items[0].calories).toBe(450)
    const saved = await listSavedMeals()
    expect(saved[0].useCount).toBe(2)
    expect(saved[0].lastUsedAt > '2026-09-01').toBe(true)
    await deleteSavedMeal('s1')
    expect(await listSavedMeals()).toEqual([])
  })

  test('saving the AI key or model does not touch meta', async () => {
    const before = (await getMeta()).updatedAt
    await saveSettings({ anthropicKey: 'sk-test', aiModel: 'claude-haiku-4-5' })
    expect((await getMeta()).updatedAt).toBe(before)
    expect((await getSettings()).anthropicKey).toBe('sk-test')
  })
})
```

Add `import type { MealEntry } from '../domain/types'` at the top if the file does not already import types from there. `listMeals` orders by date only, so the test checks just that the later date comes last.

Append to `src/data/snapshot.test.ts` (add `saveMeal`, `saveSavedMeal`, `listMeals`, `listSavedMeals` to the repo import):

```ts
  test('meals and saved meals round trip and the AI key never leaves the phone', async () => {
    await saveSettings({ anthropicKey: 'sk-ant-secret', heightInches: 70, sex: 'male', proteinTargetOverride: 180 })
    await saveMeal({ id: 'm1', date: '2026-09-21', time: '12:00', description: 'Lunch', source: 'quick', items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], createdAt: '', updatedAt: '' })
    await saveSavedMeal({ id: 's1', name: 'Lunch', items: [{ name: 'Lunch', kind: 'food', calories: 700, protein: 40 }], useCount: 1, lastUsedAt: '2026-09-21T12:00:00.000Z' })
    const ds = await exportDataset()
    expect(ds.meals).toHaveLength(1)
    expect(ds.savedMeals).toHaveLength(1)
    expect(ds.settings).toMatchObject({ heightInches: 70, sex: 'male', proteinTargetOverride: 180 })
    expect(JSON.stringify(ds)).not.toContain('sk-ant-secret')
    expect(JSON.stringify(ds)).not.toContain('aiModel')

    await db.meals.clear(); await db.savedMeals.clear()
    const v = validateDataset(JSON.parse(JSON.stringify(ds)))
    expect(v.ok).toBe(true)
    if (v.ok) await importDataset(v.dataset)
    expect((await listMeals()).map((m) => m.id)).toEqual(['m1'])
    expect((await listSavedMeals()).map((s) => s.id)).toEqual(['s1'])
    expect((await getSettings()).anthropicKey).toBe('sk-ant-secret')
  })
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/data`
Expected: FAIL, the new repo functions do not exist.

- [ ] **Step 3: Add the tables**

In `src/data/db.ts`, import `MealEntry` and `SavedMeal`, declare the tables, and add version 2 after the existing `this.version(1)` block (leave version 1 untouched so existing phones upgrade):

```ts
  meals!: EntityTable<MealEntry, 'id'>
  savedMeals!: EntityTable<SavedMeal, 'id'>
```

```ts
    this.version(2).stores({
      meals: 'id, date',
      savedMeals: 'id, lastUsedAt',
    })
```

- [ ] **Step 4: Add the repo functions**

In `src/data/repo.ts`, add `MealEntry` and `SavedMeal` to the type import, import `newId` from `'../domain/ids'`, and add before the `// Settings and meta` comment:

```ts
// Meals
export async function listMeals(): Promise<MealEntry[]> {
  return db.meals.orderBy('date').toArray()
}

export async function mealsForDate(date: string): Promise<MealEntry[]> {
  const meals = await db.meals.where('date').equals(date).toArray()
  return meals.sort((a, b) => a.time.localeCompare(b.time))
}

export async function saveMeal(m: MealEntry): Promise<void> {
  const now = nowISO()
  await db.meals.put({ ...m, createdAt: m.createdAt || now, updatedAt: now })
  await afterWrite()
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
```

Add `'anthropicKey', 'aiModel'` to `SYNC_ONLY_KEYS`.

- [ ] **Step 5: Extend the snapshot**

In `src/data/snapshot.ts`:

```ts
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
  }
  return { meta: { schemaVersion: 1, updatedAt: meta.updatedAt }, exercises, workouts, days, pain, meals, savedMeals, settings: synced }
}
```

In `importDataset`, add `db.meals, db.savedMeals` to the transaction table list, add `db.meals.clear(), db.savedMeals.clear()` to the `Promise.all` of clears, and after `await db.pain.bulkPut(ds.pain)`:

```ts
    await db.meals.bulkPut(ds.meals ?? [])
    await db.savedMeals.bulkPut(ds.savedMeals ?? [])
```

In `src/sync/engine.ts`, the never synced guard counts remote records. Change its sum to include meals:

```ts
      && remoteDs.workouts.length + remoteDs.days.length + remoteDs.pain.length + remoteDs.meals.length > 0) {
```

- [ ] **Step 6: Add the hooks**

In `src/ui/hooks.ts`, add `listMeals, listSavedMeals, mealsForDate` to the repo import and:

```ts
export function useMeals() {
  return useLiveQuery(() => listMeals(), []) ?? []
}
export function useMealsForDate(date: string) {
  return useLiveQuery(() => mealsForDate(date), [date]) ?? []
}
export function useSavedMeals() {
  return useLiveQuery(() => listSavedMeals(), []) ?? []
}
```

- [ ] **Step 7: Run everything**

Run: `npx tsc -p tsconfig.json && npm test`
Expected: clean, all pass.

- [ ] **Step 8: Commit**

```bash
git add src/data src/sync/engine.ts src/ui/hooks.ts
git commit -m "Store and sync meals and saved meals"
```

---

### Task 3: Sync reads files over 1 MB and writes compact JSON

**Files:**
- Modify: `src/sync/github.ts`, `src/sync/engine.ts`
- Test: `src/sync/github.test.ts`, `src/sync/engine.test.ts`

**Interfaces:**
- Produces: `GitHubContents.get()` keeps its signature and now works for files from 1 to 100 MB.

Background: for files over 1 MB the GitHub Contents API still returns the JSON envelope with the `sha`, but `content` is an empty string and `encoding` is `"none"`. A second request with `Accept: application/vnd.github.raw` returns the file body as plain text.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('GitHubContents', ...)` in `src/sync/github.test.ts`:

```ts
  test('get falls back to a raw request when the file is over 1 MB', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const replies = [
      { status: 200, ok: true, json: async () => ({ content: '', encoding: 'none', sha: 'big1' }), text: async () => '' },
      { status: 200, ok: true, json: async () => ({}), text: async () => '{"big":true}' },
    ]
    const fn = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return replies.shift() as unknown as Response }) as unknown as typeof fetch
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.get()).toEqual({ content: '{"big":true}', sha: 'big1' })
    expect(calls).toHaveLength(2)
    expect((calls[1].init?.headers as Record<string, string>).Accept).toBe('application/vnd.github.raw')
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
```

In `src/sync/engine.test.ts`, find a test that pushes (it captures `puts`) and add one assertion after the push: `expect(puts[0].content).not.toContain('\n')`. If `puts` entries use a different property name for the body, use that name.

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/sync`
Expected: FAIL, one request made instead of two, and the pushed JSON contains newlines.

- [ ] **Step 3: Implement**

Replace `get()` in `src/sync/github.ts`:

```ts
  async get(): Promise<RemoteFile | null> {
    const res = await this.fetchFn(this.url(), { headers: this.headers() })
    if (res.status === 404) return null
    this.check(res, 'read')
    const body = (await res.json()) as { content?: string; encoding?: string; sha: string }
    if (body.content && body.encoding !== 'none') return { content: decodeBase64(body.content), sha: body.sha }
    // Over 1 MB GitHub leaves content empty. The raw media type serves files up to 100 MB.
    const raw = await this.fetchFn(this.url(), { headers: { ...this.headers(), Accept: 'application/vnd.github.raw' } })
    this.check(raw, 'read')
    return { content: await raw.text(), sha: body.sha }
  }
```

In `src/sync/engine.ts`, change `JSON.stringify(local, null, 2)` to `JSON.stringify(local)`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/sync && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/sync
git commit -m "Read data files over 1 MB and sync compact JSON"
```

---

### Task 4: Meal totals

**Files:**
- Create: `src/nutrition/totals.ts`, `src/nutrition/totals.test.ts`
- Modify: `src/stats/testData.ts`

**Interfaces:**
- Produces:
  - `interface Totals { calories: number; protein: number; carbs: number; fat: number; fibre: number }`
  - `sumItems(items: FoodItem[]): Totals`
  - `mealTotals(meal: MealEntry): Totals`
  - `dayTotals(meals: MealEntry[], date: string): Totals & { meals: number; pending: number }`
  - `scaleItems(items: FoodItem[], factor: number): FoodItem[]`
  - test helper `mkMeal(date: string, calories: number, protein?: number, patch?: Partial<MealEntry>): MealEntry` in `src/stats/testData.ts`

- [ ] **Step 1: Add the test helper**

In `src/stats/testData.ts`, add `MealEntry` to the type import and append:

```ts
export function mkMeal(date: string, calories: number, protein = 0, patch: Partial<MealEntry> = {}): MealEntry {
  return {
    id: nextId('m'), date, time: '12:00', description: 'Meal', source: 'quick',
    items: [{ name: 'Meal', kind: 'food', calories, protein }],
    createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`, ...patch,
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/nutrition/totals.test.ts`:

```ts
import { mkMeal } from '../stats/testData'
import { dayTotals, mealTotals, scaleItems, sumItems } from './totals'

describe('totals', () => {
  test('sumItems treats missing macros as zero', () => {
    expect(sumItems([
      { name: 'Wrap', kind: 'food', calories: 520, protein: 32, carbs: 48, fat: 20, fibre: 4 },
      { name: 'Coffee', kind: 'drink', calories: 230, protein: 4 },
    ])).toEqual({ calories: 750, protein: 36, carbs: 48, fat: 20, fibre: 4 })
    expect(sumItems([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 })
  })

  test('mealTotals and dayTotals', () => {
    const meals = [mkMeal('2026-09-21', 700, 40), mkMeal('2026-09-21', 500, 30), mkMeal('2026-09-22', 900, 50),
      mkMeal('2026-09-21', 0, 0, { items: [], needsEstimate: true })]
    expect(mealTotals(meals[0]).calories).toBe(700)
    expect(dayTotals(meals, '2026-09-21')).toMatchObject({ calories: 1200, protein: 70, meals: 3, pending: 1 })
    expect(dayTotals(meals, '2026-09-23')).toMatchObject({ calories: 0, meals: 0, pending: 0 })
  })

  test('scaleItems rounds calories to whole numbers and macros to one decimal, and does not mutate', () => {
    const items = [{ name: 'Burger', kind: 'food' as const, calories: 615, protein: 30.5, carbs: 41, fat: 33 }]
    const half = scaleItems(items, 0.5)
    expect(half[0]).toMatchObject({ calories: 308, protein: 15.3, carbs: 20.5, fat: 16.5 })
    expect(half[0].fibre).toBeUndefined()
    expect(items[0].calories).toBe(615)
    expect(scaleItems(items, 1)[0]).toEqual(items[0])
  })
})
```

- [ ] **Step 3: Run and confirm it fails**

Run: `npx vitest run src/nutrition/totals.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

Create `src/nutrition/totals.ts`:

```ts
import type { FoodItem, MealEntry } from '../domain/types'

export interface Totals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fibre: number
}

export function sumItems(items: FoodItem[]): Totals {
  const t: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
  for (const i of items) {
    t.calories += i.calories
    t.protein += i.protein
    t.carbs += i.carbs ?? 0
    t.fat += i.fat ?? 0
    t.fibre += i.fibre ?? 0
  }
  return t
}

export function mealTotals(meal: MealEntry): Totals {
  return sumItems(meal.items)
}

export function dayTotals(meals: MealEntry[], date: string): Totals & { meals: number; pending: number } {
  const day = meals.filter((m) => m.date === date)
  return { ...sumItems(day.flatMap((m) => m.items)), meals: day.length, pending: day.filter((m) => m.needsEstimate).length }
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** Portion multiplier for the confirm view. */
export function scaleItems(items: FoodItem[], factor: number): FoodItem[] {
  if (factor === 1) return items.map((i) => ({ ...i }))
  return items.map((i) => ({
    ...i,
    calories: Math.round(i.calories * factor),
    protein: round1(i.protein * factor),
    ...(i.carbs === undefined ? {} : { carbs: round1(i.carbs * factor) }),
    ...(i.fat === undefined ? {} : { fat: round1(i.fat * factor) }),
    ...(i.fibre === undefined ? {} : { fibre: round1(i.fibre * factor) }),
  }))
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/nutrition/totals.test.ts && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/nutrition src/stats/testData.ts
git commit -m "Add meal totals and portion scaling"
```

---

### Task 5: Maintenance and targets

**Files:**
- Create: `src/nutrition/targets.ts`, `src/nutrition/targets.test.ts`

**Interfaces:**
- Consumes: `sumItems` (Task 4), `bodyWeightAvg7(days, date)` from `src/stats/bodyweight.ts`, `ageOn(birthYear, date)` from `src/stats/longevity.ts`, `mkMeal`, `mkDay`, `mkWorkout`, `mkEntry` from `src/stats/testData.ts`.
- Produces:
  - `interface NutritionInput { meals: MealEntry[]; days: DayRecord[]; workouts: Workout[]; settings: SyncedSettings }` (a `Dataset` satisfies it)
  - `KCAL_PER_LB = 3500`
  - `bmr(sex: Sex, weightLb: number, heightInches: number, age: number): number`
  - `weightAt(days: DayRecord[], date: string): number | undefined`
  - `activityFactor(days: DayRecord[], workouts: Workout[], date: string): number`
  - `missingProfileFields(input: NutritionInput, date: string): string[]`
  - `formulaMaintenance(input: NutritionInput, date: string): number | undefined`
  - `interface DayIntake { date: string; calories: number; protein: number; fibre: number; pending: boolean; complete: boolean }`
  - `dailyIntake(input: NutritionInput, from: string, to: string): DayIntake[]` (only dates that have at least one meal)
  - `measuredMaintenance(input: NutritionInput, date: string): number | undefined`
  - `type MaintenanceSource = 'measured' | 'formula' | 'none'`
  - `maintenanceAt(input: NutritionInput, date: string): { value?: number; source: MaintenanceSource }`
  - `interface Targets { maintenance?: number; source: MaintenanceSource; calories?: number; protein?: number; caloriesOverridden: boolean; proteinOverridden: boolean; missing: string[] }`
  - `targetsFor(input: NutritionInput, date: string): Targets`

- [ ] **Step 1: Write the failing test**

Create `src/nutrition/targets.test.ts`:

```ts
import { addDays, eachDay } from '../domain/dates'
import { mkDay, mkEntry, mkMeal, mkWorkout } from '../stats/testData'
import type { SyncedSettings } from '../domain/types'
import {
  activityFactor, bmr, dailyIntake, formulaMaintenance, maintenanceAt, measuredMaintenance, missingProfileFields, targetsFor,
  type NutritionInput,
} from './targets'

const settings: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male', heightInches: 70, birthYear: 1979, targetBodyWeight: 220 }
const flatDays = (from: string, to: string, weight = 240, steps = 8000) => eachDay(from, to).map((d) => mkDay(d, { bodyWeight: weight, steps }))
const input = (patch: Partial<NutritionInput> = {}): NutritionInput => ({
  meals: [], workouts: [], days: flatDays('2026-08-10', '2026-09-20'), settings, ...patch,
})

describe('formula maintenance', () => {
  test('bmr is Mifflin St Jeor in pounds and inches', () => {
    expect(bmr('male', 240, 70, 47)).toBeCloseTo(1969.87, 1)
    expect(bmr('female', 240, 70, 47)).toBeCloseTo(1803.87, 1)
  })

  test('activity factor steps up with steps and with five sessions in 14 days', () => {
    const at = '2026-09-20'
    expect(activityFactor([], [], at)).toBe(1.4)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 4000), [], at)).toBe(1.3)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 6000), [], at)).toBe(1.4)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), [], at)).toBe(1.5)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 12000), [], at)).toBe(1.6)
    const five = ['2026-09-08', '2026-09-10', '2026-09-12', '2026-09-15', '2026-09-17'].map((d) => mkWorkout(d, [mkEntry('back-squat', [[185, 5]])]))
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), five, at)).toBeCloseTo(1.55, 5)
    expect(activityFactor(flatDays('2026-09-07', at, 240, 8000), five.slice(0, 4), at)).toBe(1.5)
  })

  test('formulaMaintenance needs sex, height, birth year and a weight', () => {
    expect(formulaMaintenance(input(), '2026-09-20')).toBeCloseTo(2954.8, 0)
    expect(formulaMaintenance(input({ settings: { ...settings, sex: undefined } }), '2026-09-20')).toBeUndefined()
    expect(missingProfileFields(input({ settings: { ...settings, sex: undefined, heightInches: undefined } }), '2026-09-20')).toEqual(['sex', 'height'])
    expect(missingProfileFields(input({ days: [] }), '2026-09-20')).toEqual(['body weight'])
    expect(missingProfileFields(input(), '2026-09-20')).toEqual([])
  })
})

describe('complete days', () => {
  test('a day under half of formula maintenance or with a pending meal is not complete', () => {
    const meals = [mkMeal('2026-09-18', 2400, 150), mkMeal('2026-09-19', 1200, 60),
      mkMeal('2026-09-20', 2000, 100), mkMeal('2026-09-20', 0, 0, { items: [], needsEstimate: true })]
    const rows = dailyIntake(input({ meals }), '2026-09-14', '2026-09-20')
    expect(rows.map((r) => [r.date, r.calories, r.complete])).toEqual([
      ['2026-09-18', 2400, true], ['2026-09-19', 1200, false], ['2026-09-20', 2000, false],
    ])
    expect(rows[2].pending).toBe(true)
  })

  test('with no formula value the threshold is a flat 1000', () => {
    const meals = [mkMeal('2026-09-19', 1200, 60), mkMeal('2026-09-20', 900, 40)]
    const rows = dailyIntake(input({ meals, settings: { ...settings, sex: undefined } }), '2026-09-14', '2026-09-20')
    expect(rows.map((r) => r.complete)).toEqual([true, false])
  })
})

describe('measured maintenance', () => {
  const end = '2026-09-20'
  const start = addDays(end, -27)
  const falling = eachDay(start, end).map((d, i) => mkDay(d, { bodyWeight: 240 - 0.2 * i, steps: 8000 }))
  const eat = (kcal: number, count = 28) => eachDay(start, end).slice(0, count).map((d) => mkMeal(d, kcal, 150))

  test('intake plus the energy in the weight lost', () => {
    // 7 day average falls 4.2 lb across 21 days: 4.2 * 3500 / 21 = 700 kcal a day on top of 2500 eaten.
    expect(measuredMaintenance(input({ days: falling, meals: eat(2500) }), end)).toBeCloseTo(3200, 0)
    expect(maintenanceAt(input({ days: falling, meals: eat(2500) }), end)).toMatchObject({ source: 'measured' })
  })

  test('needs 14 complete days, else falls back to the formula', () => {
    const thin = input({ days: falling, meals: eat(2500, 13) })
    expect(measuredMaintenance(thin, end)).toBeUndefined()
    expect(maintenanceAt(thin, end).source).toBe('formula')
  })

  test('an implausible result is discarded', () => {
    expect(measuredMaintenance(input({ days: falling, meals: eat(6000) }), end)).toBeUndefined()
  })

  test('needs a weight average at both ends', () => {
    expect(measuredMaintenance(input({ days: falling.slice(10), meals: eat(2500) }), end)).toBeUndefined()
  })

  test('no data at all gives source none', () => {
    expect(maintenanceAt(input({ days: [], settings: { defaultWithTrainer: true, customCardioTypes: [] } }), end)).toEqual({ value: undefined, source: 'none' })
  })
})

describe('targetsFor', () => {
  test('formula maintenance minus the capped deficit, protein from target weight', () => {
    // Maintenance 2954.8. Deficit 0.0075 * 240 * 500 = 900, capped at 25 percent = 738.7. 2216.1 rounds to 2220.
    const t = targetsFor(input(), '2026-09-21')
    expect(t).toMatchObject({ source: 'formula', calories: 2220, protein: 220, caloriesOverridden: false, proteinOverridden: false, missing: [] })
    expect(t.maintenance).toBeCloseTo(2954.8, 0)
  })

  test('holds steady through the week and steps on Monday', () => {
    const drop = input({ days: [...flatDays('2026-08-10', '2026-09-20'), mkDay('2026-09-22', { bodyWeight: 200, steps: 8000 })] })
    expect(targetsFor(drop, '2026-09-23').calories).toBe(2220)
    expect(targetsFor(drop, '2026-09-27').calories).toBe(2220)
    expect(targetsFor(drop, '2026-09-28').calories).not.toBe(2220)
  })

  test('overrides win', () => {
    const t = targetsFor(input({ settings: { ...settings, calorieTargetOverride: 2000, proteinTargetOverride: 180 } }), '2026-09-21')
    expect(t).toMatchObject({ calories: 2000, protein: 180, caloriesOverridden: true, proteinOverridden: true })
  })

  test('never below the floor', () => {
    const small = input({ days: flatDays('2026-08-10', '2026-09-20', 110, 2000), settings: { ...settings, heightInches: 60, targetBodyWeight: 100 } })
    expect(targetsFor(small, '2026-09-21').calories).toBe(1500)
    expect(targetsFor({ ...small, settings: { ...small.settings, sex: 'female' } }, '2026-09-21').calories).toBe(1200)
  })

  test('at or below target weight the target is maintenance', () => {
    const t = targetsFor(input({ settings: { ...settings, targetBodyWeight: 240 } }), '2026-09-21')
    expect(t.calories).toBe(2950)
  })

  test('protein falls back to 0.8 g per pound of current weight, rounded to 5', () => {
    expect(targetsFor(input({ settings: { ...settings, targetBodyWeight: undefined } }), '2026-09-21').protein).toBe(190)
  })

  test('a first week with no data on the prior Sunday still gets a target', () => {
    const fresh = input({ days: [mkDay('2026-09-22', { bodyWeight: 240, steps: 8000 })] })
    expect(targetsFor(fresh, '2026-09-22').calories).toBe(2220)
  })

  test('missing profile fields are reported', () => {
    const t = targetsFor(input({ settings: { defaultWithTrainer: true, customCardioTypes: [] } }), '2026-09-21')
    expect(t.calories).toBeUndefined()
    expect(t.missing).toEqual(['sex', 'height', 'birth year'])
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/nutrition/targets.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/nutrition/targets.ts`:

```ts
import type { DayRecord, MealEntry, Sex, SyncedSettings, Workout } from '../domain/types'
import { addDays, inRange, weekStart } from '../domain/dates'
import { bodyWeightAvg7 } from '../stats/bodyweight'
import { ageOn } from '../stats/longevity'
import { sumItems } from './totals'

/** The slice of the dataset the nutrition maths needs. A Dataset satisfies it. */
export interface NutritionInput {
  meals: MealEntry[]
  days: DayRecord[]
  workouts: Workout[]
  settings: SyncedSettings
}

export const KCAL_PER_LB = 3500
const LB_TO_KG = 0.45359237
const IN_TO_CM = 2.54
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Mifflin St Jeor, taking pounds and inches. */
export function bmr(sex: Sex, weightLb: number, heightInches: number, age: number): number {
  return 10 * weightLb * LB_TO_KG + 6.25 * heightInches * IN_TO_CM - 5 * age + (sex === 'male' ? 5 : -161)
}

/** 7 day average on the date, else the last weight logged on or before it. */
export function weightAt(days: DayRecord[], date: string): number | undefined {
  const avg = bodyWeightAvg7(days, date)
  if (avg !== undefined) return avg
  const prior = days.filter((d) => d.bodyWeight !== undefined && d.date <= date).sort((a, b) => a.date.localeCompare(b.date))
  return prior.length ? prior[prior.length - 1].bodyWeight : undefined
}

/** From the last 14 days of real steps and sessions, so it is never a guess Jeremy has to make. */
export function activityFactor(days: DayRecord[], workouts: Workout[], date: string): number {
  const from = addDays(date, -13)
  const steps = days.filter((d) => d.steps !== undefined && inRange(d.date, from, date)).map((d) => d.steps as number)
  const avg = steps.length ? mean(steps) : undefined
  const base = avg === undefined ? 1.4 : avg < 5000 ? 1.3 : avg < 7500 ? 1.4 : avg < 10000 ? 1.5 : 1.6
  const sessions = workouts.filter((w) => inRange(w.date, from, date) && w.entries.length > 0).length
  return base + (sessions >= 5 ? 0.05 : 0)
}

export function missingProfileFields(input: NutritionInput, date: string): string[] {
  const s = input.settings
  const missing: string[] = []
  if (!s.sex) missing.push('sex')
  if (!s.heightInches) missing.push('height')
  if (!s.birthYear) missing.push('birth year')
  if (weightAt(input.days, date) === undefined) missing.push('body weight')
  return missing
}

export function formulaMaintenance(input: NutritionInput, date: string): number | undefined {
  const s = input.settings
  const weight = weightAt(input.days, date)
  if (!s.sex || !s.heightInches || !s.birthYear || weight === undefined) return undefined
  return bmr(s.sex, weight, s.heightInches, ageOn(s.birthYear, date)) * activityFactor(input.days, input.workouts, date)
}

export interface DayIntake {
  date: string
  calories: number
  protein: number
  fibre: number
  pending: boolean
  complete: boolean
}

/**
 * One row per date that has a meal. A day is complete when it reaches half of the formula maintenance
 * (a flat 1000 when there is no formula value) and has no meal waiting for an estimate. The formula value is
 * used on purpose: the measured value depends on complete days, so using it here would be circular.
 */
export function dailyIntake(input: NutritionInput, from: string, to: string): DayIntake[] {
  const formula = formulaMaintenance(input, to)
  const threshold = formula === undefined ? 1000 : formula / 2
  const byDate = new Map<string, MealEntry[]>()
  for (const m of input.meals) {
    if (!inRange(m.date, from, to)) continue
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, meals]) => {
    const t = sumItems(meals.flatMap((m) => m.items))
    const pending = meals.some((m) => m.needsEstimate)
    return { date, calories: t.calories, protein: t.protein, fibre: t.fibre, pending, complete: !pending && t.calories >= threshold }
  })
}

/** Average intake on complete days minus the energy in the weight change, over a trailing 28 day window. */
export function measuredMaintenance(input: NutritionInput, date: string): number | undefined {
  const wEnd = bodyWeightAvg7(input.days, date)
  const wStart = bodyWeightAvg7(input.days, addDays(date, -21))
  if (wEnd === undefined || wStart === undefined) return undefined
  const complete = dailyIntake(input, addDays(date, -27), date).filter((d) => d.complete)
  if (complete.length < 14) return undefined
  const value = mean(complete.map((d) => d.calories)) - ((wEnd - wStart) * KCAL_PER_LB) / 21
  return value >= 1200 && value <= 5000 ? value : undefined
}

export type MaintenanceSource = 'measured' | 'formula' | 'none'

export function maintenanceAt(input: NutritionInput, date: string): { value?: number; source: MaintenanceSource } {
  const measured = measuredMaintenance(input, date)
  if (measured !== undefined) return { value: measured, source: 'measured' }
  const formula = formulaMaintenance(input, date)
  if (formula !== undefined) return { value: formula, source: 'formula' }
  return { value: undefined, source: 'none' }
}

export interface Targets {
  maintenance?: number
  source: MaintenanceSource
  calories?: number
  protein?: number
  caloriesOverridden: boolean
  proteinOverridden: boolean
  /** Settings fields still needed before a target can be computed. */
  missing: string[]
}

/** Middle of the healthy loss band: 0.75 percent of body weight a week. */
const WEEKLY_LOSS_FRACTION = 0.0075

export function targetsFor(input: NutritionInput, date: string): Targets {
  const s = input.settings
  // Computed as of the Sunday before this week so the number holds steady Monday to Sunday.
  const sunday = addDays(weekStart(date), -1)
  const asOf = maintenanceAt(input, sunday).source === 'none' ? date : sunday
  const m = maintenanceAt(input, asOf)
  const weight = weightAt(input.days, asOf)

  let calories: number | undefined
  if (m.value !== undefined && weight !== undefined) {
    const atGoal = s.targetBodyWeight !== undefined && weight <= s.targetBodyWeight
    const deficit = atGoal ? 0 : Math.min((WEEKLY_LOSS_FRACTION * weight * KCAL_PER_LB) / 7, 0.25 * m.value)
    const floor = s.sex === 'female' ? 1200 : 1500
    calories = Math.max(floor, Math.round((m.value - deficit) / 10) * 10)
  }
  const proteinBase = s.targetBodyWeight !== undefined ? s.targetBodyWeight : weight === undefined ? undefined : 0.8 * weight
  const protein = proteinBase === undefined ? undefined : Math.round(proteinBase / 5) * 5

  return {
    maintenance: m.value,
    source: m.source,
    calories: s.calorieTargetOverride ?? calories,
    protein: s.proteinTargetOverride ?? protein,
    caloriesOverridden: s.calorieTargetOverride !== undefined,
    proteinOverridden: s.proteinTargetOverride !== undefined,
    missing: m.source === 'measured' ? [] : missingProfileFields(input, asOf),
  }
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/nutrition/targets.test.ts && npx tsc -p tsconfig.json`
Expected: PASS and clean. If a hand worked number is off by a rounding step, recheck the arithmetic in the test comment before touching the implementation; the formulas above are the spec.

```bash
git add src/nutrition
git commit -m "Work out maintenance calories and daily targets from logged data"
```

---

### Task 6: AI meal estimator

**Files:**
- Create: `src/nutrition/estimate.ts`, `src/nutrition/estimate.test.ts`, `src/nutrition/photo.ts`
- Modify: `package.json` (dependency)

**Interfaces:**
- Consumes: `isFoodItem` (Task 1), `getSettings` from `src/data/repo.ts`.
- Produces:
  - `type EstimateFailure = 'no_key' | 'offline' | 'auth' | 'rate_limit' | 'refused' | 'failed'`
  - `type EstimateResult = { ok: true; items: FoodItem[]; confidence: Confidence; note?: string } | { ok: false; reason: EstimateFailure; message: string }`
  - `interface EstimateRequest { model: AiModel; system: string; content: EstimateContent[]; effort: boolean; fallbacks: boolean }`
  - `interface EstimateClient { send(req: EstimateRequest): Promise<{ stopReason: string | null; output: unknown }> }`
  - `interface EstimateDeps { getSettings(): Promise<{ anthropicKey?: string; aiModel: AiModel }>; makeClient(apiKey: string): EstimateClient; online(): boolean; encodePhoto(photo: Blob): Promise<string> }`
  - `buildRequest(model: AiModel, text: string, photoBase64?: string): EstimateRequest`
  - `parseEstimate(output: unknown): EstimateResult`
  - `estimateMeal(input: { text: string; photo?: Blob }, deps?: EstimateDeps): Promise<EstimateResult>`
  - `photoToBase64Jpeg(photo: Blob, maxEdge?: number): Promise<string>` in `photo.ts`

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` appears in `dependencies` at 0.127.0 or newer.

- [ ] **Step 2: Write the failing test**

Create `src/nutrition/estimate.test.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { buildRequest, estimateMeal, parseEstimate, type EstimateClient, type EstimateDeps, type EstimateRequest } from './estimate'

const goodOutput = {
  items: [
    { name: 'Farmers wrap', amount: '1', kind: 'food', calories: 640, protein: 27, carbs: 50, fat: 36, fibre: 3 },
    { name: 'Double double, large', amount: '1', kind: 'drink', calories: 270, protein: 5, carbs: 33, fat: 14, fibre: 0 },
  ],
  confidence: 'high',
  note: '',
}

function deps(patch: Partial<EstimateDeps> = {}, reply: { stopReason: string | null; output: unknown } | Error = { stopReason: 'end_turn', output: goodOutput }) {
  const sent: EstimateRequest[] = []
  const client: EstimateClient = { send: async (req) => { sent.push(req); if (reply instanceof Error) throw reply; return reply } }
  const d: EstimateDeps = {
    getSettings: async () => ({ anthropicKey: 'sk-test', aiModel: 'claude-opus-5' }),
    makeClient: () => client,
    online: () => true,
    encodePhoto: async () => 'BASE64JPEG',
    ...patch,
  }
  return { d, sent }
}

describe('buildRequest', () => {
  test('opus 5 gets low effort and server side fallbacks', () => {
    const r = buildRequest('claude-opus-5', 'two eggs and toast')
    expect(r).toMatchObject({ model: 'claude-opus-5', effort: true, fallbacks: true })
    expect(r.content).toEqual([{ type: 'text', text: 'two eggs and toast' }])
    expect(r.system).toContain('Canada')
  })

  test('sonnet keeps effort without fallbacks, haiku drops effort', () => {
    expect(buildRequest('claude-sonnet-5', 'x')).toMatchObject({ effort: true, fallbacks: false })
    expect(buildRequest('claude-haiku-4-5', 'x')).toMatchObject({ effort: false, fallbacks: false })
  })

  test('a photo goes first as a base64 jpeg block, and an empty note gets a default instruction', () => {
    const r = buildRequest('claude-opus-5', '  ', 'BASE64JPEG')
    expect(r.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64JPEG' } })
    expect(r.content[1]).toEqual({ type: 'text', text: 'Estimate the meal in this photo.' })
  })
})

describe('parseEstimate', () => {
  test('accepts a good reply and drops empty amounts and notes', () => {
    const r = parseEstimate({ ...goodOutput, items: [{ ...goodOutput.items[0], amount: '' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.items[0].amount).toBeUndefined()
      expect(r.note).toBeUndefined()
      expect(r.confidence).toBe('high')
    }
  })

  test.each([
    ['null', null],
    ['no items', { ...goodOutput, items: [] }],
    ['negative calories', { ...goodOutput, items: [{ ...goodOutput.items[0], calories: -1 }] }],
    ['bad confidence', { ...goodOutput, confidence: 'certain' }],
  ])('rejects %s', (_label, bad) => {
    expect(parseEstimate(bad)).toMatchObject({ ok: false, reason: 'failed' })
  })
})

describe('estimateMeal', () => {
  test('returns items from a good reply', async () => {
    const { d, sent } = deps()
    const r = await estimateMeal({ text: 'farmers wrap and a large double double' }, d)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items.map((i) => i.calories)).toEqual([640, 270])
    expect(sent[0].model).toBe('claude-opus-5')
  })

  test('passes low confidence and its note through', async () => {
    const { d } = deps({}, { stopReason: 'end_turn', output: { ...goodOutput, confidence: 'low', note: 'Portion size unclear.' } })
    const r = await estimateMeal({ text: 'some pasta' }, d)
    expect(r).toMatchObject({ ok: true, confidence: 'low', note: 'Portion size unclear.' })
  })

  test('sends the encoded photo', async () => {
    const { d, sent } = deps()
    await estimateMeal({ text: 'large', photo: new Blob(['x']) }, d)
    expect(sent[0].content[0]).toMatchObject({ type: 'image' })
  })

  test('no key, offline, and empty input never call the client', async () => {
    const noKey = deps({ getSettings: async () => ({ aiModel: 'claude-opus-5' }) })
    expect(await estimateMeal({ text: 'x' }, noKey.d)).toMatchObject({ ok: false, reason: 'no_key' })
    const offline = deps({ online: () => false })
    expect(await estimateMeal({ text: 'x' }, offline.d)).toMatchObject({ ok: false, reason: 'offline' })
    const empty = deps()
    expect(await estimateMeal({ text: '   ' }, empty.d)).toMatchObject({ ok: false, reason: 'failed' })
    expect(noKey.sent.length + offline.sent.length + empty.sent.length).toBe(0)
  })

  test('refusal and max_tokens stop reasons fail before the content is read', async () => {
    expect(await estimateMeal({ text: 'x' }, deps({}, { stopReason: 'refusal', output: null }).d)).toMatchObject({ ok: false, reason: 'refused' })
    expect(await estimateMeal({ text: 'x' }, deps({}, { stopReason: 'max_tokens', output: goodOutput }).d)).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('maps SDK errors', async () => {
    const api = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers())
    expect(await estimateMeal({ text: 'x' }, deps({}, api(401)).d)).toMatchObject({ ok: false, reason: 'auth' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(403)).d)).toMatchObject({ ok: false, reason: 'auth' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(429)).d)).toMatchObject({ ok: false, reason: 'rate_limit' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(500)).d)).toMatchObject({ ok: false, reason: 'failed' })
    expect(await estimateMeal({ text: 'x' }, deps({}, new Anthropic.APIConnectionError({ message: 'down' })).d)).toMatchObject({ ok: false, reason: 'offline' })
    expect(await estimateMeal({ text: 'x' }, deps({}, new Error('boom')).d)).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('failure messages never contain the key', async () => {
    const r = await estimateMeal({ text: 'x' }, deps({}, new Error('bad key sk-test')).d)
    expect(JSON.stringify(r)).not.toContain('sk-test')
  })
})
```

- [ ] **Step 3: Run and confirm it fails**

Run: `npx vitest run src/nutrition/estimate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the photo helper**

Create `src/nutrition/photo.ts`:

```ts
/** Downscale a photo to a JPEG no larger than maxEdge on its long side and return the base64 body. Browser only. */
export async function photoToBase64Jpeg(photo: Blob, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(photo)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the photo.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
```

- [ ] **Step 5: Implement the estimator**

Create `src/nutrition/estimate.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import type { AiModel, Confidence, FoodItem } from '../domain/types'
import { isFoodItem } from '../domain/validate'
import { getSettings } from '../data/repo'
import { photoToBase64Jpeg } from './photo'

export type EstimateFailure = 'no_key' | 'offline' | 'auth' | 'rate_limit' | 'refused' | 'failed'

export type EstimateResult =
  | { ok: true; items: FoodItem[]; confidence: Confidence; note?: string }
  | { ok: false; reason: EstimateFailure; message: string }

export type EstimateContent =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'text'; text: string }

export interface EstimateRequest {
  model: AiModel
  system: string
  content: EstimateContent[]
  /** Send output_config.effort low. Haiku 4.5 rejects the field. */
  effort: boolean
  /** Opus 5 only: retry a mistaken safety decline on another model inside the same call. */
  fallbacks: boolean
}

export interface EstimateClient {
  send(req: EstimateRequest): Promise<{ stopReason: string | null; output: unknown }>
}

export interface EstimateDeps {
  getSettings(): Promise<{ anthropicKey?: string; aiModel: AiModel }>
  makeClient(apiKey: string): EstimateClient
  online(): boolean
  encodePhoto(photo: Blob): Promise<string>
}

export const SYSTEM_PROMPT = [
  'You estimate calories and macronutrients for meals logged in a personal fitness app.',
  'The user lives in Ontario, Canada. Prefer Canadian chains, products and portion sizes (Tim Hortons, not Dunkin).',
  'Assume a typical restaurant or packaged portion unless the description says otherwise.',
  'Split the meal into separate items, one per distinct food or drink. Put the quantity in amount, for example "2 large" or "1 cup".',
  'Set kind to alcohol for alcoholic drinks, drink for every other beverage, and food for everything else.',
  'Give one realistic middle estimate per number, never a range. Calories in kcal, everything else in grams.',
  'Set confidence to low when the description or photo is too vague to estimate well, and say why in note in one short sentence. Otherwise leave note empty.',
  'Never refuse a vague meal. Estimate it and flag it.',
].join(' ')

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'amount', 'kind', 'calories', 'protein', 'carbs', 'fat', 'fibre'],
  properties: {
    name: { type: 'string' },
    amount: { type: 'string' },
    kind: { type: 'string', enum: ['food', 'drink', 'alcohol'] },
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    fibre: { type: 'number' },
  },
} as const

export const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'confidence', 'note'],
  properties: {
    items: { type: 'array', items: ITEM_SCHEMA },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    note: { type: 'string' },
  },
} as const

export function buildRequest(model: AiModel, text: string, photoBase64?: string): EstimateRequest {
  const content: EstimateContent[] = []
  if (photoBase64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } })
  content.push({ type: 'text', text: text.trim() || 'Estimate the meal in this photo.' })
  return { model, system: SYSTEM_PROMPT, content, effort: model !== 'claude-haiku-4-5', fallbacks: model === 'claude-opus-5' }
}

const fail = (reason: EstimateFailure, message: string): EstimateResult => ({ ok: false, reason, message })
const BAD_REPLY = 'Claude sent back something the app could not read. Try again or enter the numbers by hand.'

export function parseEstimate(output: unknown): EstimateResult {
  if (typeof output !== 'object' || output === null) return fail('failed', BAD_REPLY)
  const o = output as { items?: unknown; confidence?: unknown; note?: unknown }
  if (!Array.isArray(o.items) || o.items.length === 0) return fail('failed', BAD_REPLY)
  const items = o.items.map((raw) => (typeof raw === 'object' && raw !== null && (raw as { amount?: unknown }).amount === '' ? { ...raw, amount: undefined } : raw))
  if (!items.every(isFoodItem)) return fail('failed', BAD_REPLY)
  if (o.confidence !== 'low' && o.confidence !== 'medium' && o.confidence !== 'high') return fail('failed', BAD_REPLY)
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined
  return { ok: true, items: items as FoodItem[], confidence: o.confidence, note }
}

/** The real client. Requests go straight from the phone to the Claude API with the key from Settings. */
export function sdkClient(apiKey: string): EstimateClient {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    // Wrapped so fetch is called on the global; browsers throw "Illegal invocation" on a bare reference.
    fetch: (input, init) => globalThis.fetch(input, init),
    maxRetries: 1,
    timeout: 60_000,
  })
  return {
    async send(req) {
      const base = { model: req.model, max_tokens: 4000, system: req.system, messages: [{ role: 'user' as const, content: req.content }] }
      const effort = req.effort ? { effort: 'low' as const } : {}
      if (req.fallbacks) {
        const r = await client.beta.messages.parse({
          ...base,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { ...effort, format: betaJSONSchemaOutputFormat(ESTIMATE_SCHEMA) },
        })
        return { stopReason: r.stop_reason, output: r.parsed_output }
      }
      const r = await client.messages.parse({ ...base, output_config: { ...effort, format: jsonSchemaOutputFormat(ESTIMATE_SCHEMA) } })
      return { stopReason: r.stop_reason, output: r.parsed_output }
    },
  }
}

const defaultDeps: EstimateDeps = {
  getSettings: async () => { const s = await getSettings(); return { anthropicKey: s.anthropicKey, aiModel: s.aiModel } },
  makeClient: sdkClient,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  encodePhoto: (photo) => photoToBase64Jpeg(photo),
}

/** Fixed messages only, so nothing from the request (including the key) can leak into the UI. */
function mapError(err: unknown): EstimateResult {
  if (err instanceof Anthropic.APIConnectionError) return fail('offline', 'Could not reach Claude. Check your signal and try again.')
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403) return fail('auth', 'Claude rejected the API key. Check it in Settings.')
    if (err.status === 429) return fail('rate_limit', 'Claude is rate limiting this key, or the account is out of credit. Try again in a minute.')
    return fail('failed', `Claude returned an error (${err.status ?? 'unknown'}). Try again or enter the numbers by hand.`)
  }
  return fail('failed', 'The estimate did not work. Try again or enter the numbers by hand.')
}

export async function estimateMeal(input: { text: string; photo?: Blob }, deps: EstimateDeps = defaultDeps): Promise<EstimateResult> {
  if (!input.text.trim() && !input.photo) return fail('failed', 'Describe the meal or add a photo first.')
  const settings = await deps.getSettings()
  if (!settings.anthropicKey) return fail('no_key', 'Add your Anthropic API key in Settings to use Describe.')
  if (!deps.online()) return fail('offline', 'You are offline. Save the meal for later or enter the numbers by hand.')
  try {
    const photo = input.photo ? await deps.encodePhoto(input.photo) : undefined
    const reply = await deps.makeClient(settings.anthropicKey).send(buildRequest(settings.aiModel, input.text, photo))
    if (reply.stopReason === 'refusal') return fail('refused', 'Claude declined to estimate that. Enter the numbers by hand.')
    if (reply.stopReason === 'max_tokens') return fail('failed', 'The estimate was cut off. Try a shorter description.')
    return parseEstimate(reply.output)
  } catch (err) {
    return mapError(err)
  }
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/nutrition/estimate.test.ts && npx tsc -p tsconfig.json`
Expected: PASS and clean. If `tsc` rejects the `fetch` wrapper's parameter types, annotate it as `fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch`. If it rejects the `as const` schema because the helper wants a mutable type, keep `as const` on the schema and pass it through unchanged; do not loosen the schema itself. Do not switch to raw `fetch` calls against the API: the project standard is the official SDK.

- [ ] **Step 7: Confirm the production build still works**

Run: `npm run build`
Expected: build succeeds. Note the size of the main chunk in the output for the commit message body if it grew by more than 150 kB.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/nutrition
git commit -m "Add Claude meal estimator with structured output and offline safe failures"
```

---

### Task 7: Add meal sheet and confirm view

**Files:**
- Create: `src/ui/MealConfirm.tsx`, `src/ui/MealSheet.tsx`, `src/ui/MealSheet.test.tsx`
- Modify: `src/domain/dates.ts`, `src/domain/dates.test.ts`, `src/ui/components/NumberField.tsx`, `src/styles/theme.css`

**Interfaces:**
- Consumes: `estimateMeal`, `EstimateResult` (Task 6); `scaleItems`, `sumItems` (Task 4); `saveMeal`, `saveSavedMeal`, `logSavedMeal` and hooks `useMeals`, `useSavedMeals` (Task 2).
- Produces:
  - `nowTime(now?: Date): string` in `src/domain/dates.ts` (local `HH:MM`)
  - `NumberField` gains an optional `ariaLabel?: string` prop (accessible name without a visible label)
  - `interface MealDraft { id?: string; createdAt?: string; description: string; items: FoodItem[]; source: MealSource; confidence?: Confidence; note?: string; savedMealId?: string; time?: string }`
  - `MealConfirm({ draft, onSave, onBack })` where `onSave` receives `{ description: string; items: FoodItem[]; time: string; saveAsSaved: boolean }`
  - `MealSheet({ date, editing, onClose }: { date: string; editing?: MealEntry; onClose: () => void })`. It is always open while rendered; parents mount it conditionally, the same way `Today.tsx` mounts `CardioSheet`.

Accessible names used by tests in this and later tasks: mode chips `Describe`, `Saved`, `Quick add`; textbox `Describe the meal`; buttons `Estimate`, `Save for later`, `Enter numbers by hand`, `Save quick add`, `Save meal`, `Back`; portion chips `0.5x`, `1x`, `1.5x`, `2x`; checkbox `Also keep as a saved meal`; dialog title `Add meal` or `Edit meal`.

- [ ] **Step 1: Small helpers first (test, then code)**

Append to `src/domain/dates.test.ts` inside its top level `describe` (add `nowTime` to the import):

```ts
  test('nowTime is zero padded local HH:MM', () => {
    expect(nowTime(new Date(2026, 8, 21, 7, 5))).toBe('07:05')
    expect(nowTime(new Date(2026, 8, 21, 20, 30))).toBe('20:30')
  })
```

Add to `src/domain/dates.ts` after `nowISO`:

```ts
export function nowTime(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
```

In `src/ui/components/NumberField.tsx`, add `ariaLabel?: string` to `Props`, destructure it, and change the input's `aria-label={label}` to `aria-label={ariaLabel ?? label}`.

Run: `npx vitest run src/domain/dates.test.ts src/ui/components/NumberField.test.tsx`
Expected: PASS.

- [ ] **Step 2: Write the failing sheet test**

Create `src/ui/MealSheet.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { listSavedMeals, mealsForDate, saveMeal, saveSavedMeal } from '../data/repo'
import { estimateMeal } from '../nutrition/estimate'
import { MealSheet } from './MealSheet'

vi.mock('../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))
const mockEstimate = vi.mocked(estimateMeal)
const DATE = '2026-09-21'

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
  mockEstimate.mockReset()
})

describe('MealSheet', () => {
  test('quick add saves a one item meal and closes', async () => {
    const onClose = vi.fn()
    render(<MealSheet date={DATE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    await userEvent.type(screen.getByLabelText('Calories'), '650')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Protein'), '40')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Name'), 'Poutine')
    await userEvent.click(screen.getByRole('button', { name: 'Save quick add' }))
    await waitFor(async () => {
      const meals = await mealsForDate(DATE)
      expect(meals).toHaveLength(1)
      expect(meals[0]).toMatchObject({ description: 'Poutine', source: 'quick' })
      expect(meals[0].items[0]).toMatchObject({ name: 'Poutine', kind: 'food', calories: 650, protein: 40 })
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('describe, confirm with a double portion, save', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'medium', items: [{ name: 'Burger', amount: '1', kind: 'food', calories: 600, protein: 30, carbs: 40, fat: 32, fibre: 2 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'cheeseburger')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByDisplayValue('Burger')).toBeInTheDocument()
    expect(mockEstimate).toHaveBeenCalledWith({ text: 'cheeseburger', photo: undefined })
    await userEvent.click(screen.getByRole('button', { name: '2x' }))
    expect(screen.getByText(/1200 kcal/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'cheeseburger', source: 'ai', confidence: 'medium' })
      expect(m.items[0]).toMatchObject({ calories: 1200, protein: 60, fat: 64 })
      expect(m.needsEstimate).toBeUndefined()
    })
  })

  test('a low confidence estimate shows the warning and its reason', async () => {
    mockEstimate.mockResolvedValue({ ok: true, confidence: 'low', note: 'Portion size unclear.', items: [{ name: 'Pasta', kind: 'food', calories: 700, protein: 25 }] })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'some pasta')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByText(/Rough estimate/)).toBeInTheDocument()
    expect(screen.getByText(/Portion size unclear/)).toBeInTheDocument()
  })

  test('a failed estimate keeps the text and can be saved for later', async () => {
    mockEstimate.mockResolvedValue({ ok: false, reason: 'offline', message: 'You are offline.' })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    expect(await screen.findByText('You are offline.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich and fries')
    await userEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'club sandwich and fries', needsEstimate: true, items: [] })
    })
  })

  test('a failed estimate can fall through to quick add with the name filled in', async () => {
    mockEstimate.mockResolvedValue({ ok: false, reason: 'no_key', message: 'Add your Anthropic API key in Settings to use Describe.' })
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Describe the meal' }), 'club sandwich')
    await userEvent.click(screen.getByRole('button', { name: 'Estimate' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enter numbers by hand' }))
    expect(screen.getByLabelText('Name')).toHaveValue('club sandwich')
  })

  test('a saved meal logs in one tap and its use count goes up', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const onClose = vi.fn()
    render(<MealSheet date={DATE} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Log Eggs and toast' }))
    await waitFor(async () => {
      const [m] = await mealsForDate(DATE)
      expect(m).toMatchObject({ description: 'Eggs and toast', source: 'saved', savedMealId: 's1' })
      expect((await listSavedMeals())[0].useCount).toBe(2)
    })
    expect(onClose).toHaveBeenCalled()
  })

  test('a saved meal can be removed after a confirm', async () => {
    await saveSavedMeal({ id: 's1', name: 'Eggs and toast', items: [{ name: 'Eggs and toast', kind: 'food', calories: 450, protein: 28 }], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' })
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Remove saved meal Eggs and toast' }))
    await waitFor(async () => expect(await listSavedMeals()).toEqual([]))
    ask.mockRestore()
  })

  test('recent meals appear under Saved and the last mode is remembered', async () => {
    await saveMeal({ id: 'old', date: '2026-09-18', time: '12:00', description: 'Chicken wrap', source: 'ai', items: [{ name: 'Chicken wrap', kind: 'food', calories: 620, protein: 38 }], createdAt: '', updatedAt: '' })
    const first = render(<MealSheet date={DATE} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Saved' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Log Chicken wrap' }))
    await waitFor(async () => expect(await mealsForDate(DATE)).toHaveLength(1))
    first.unmount()
    render(<MealSheet date={DATE} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('editing opens the confirm view, keeps the id and can also keep a saved meal', async () => {
    const meal = { id: 'm1', date: DATE, time: '12:15', description: 'Lunch', source: 'quick' as const, items: [{ name: 'Lunch', kind: 'food' as const, calories: 700, protein: 40 }], createdAt: '2026-09-21T16:15:00.000Z', updatedAt: '' }
    await saveMeal(meal)
    render(<MealSheet date={DATE} editing={meal} onClose={() => {}} />)
    const cal = screen.getByLabelText('Item 1 calories')
    await userEvent.clear(cal)
    await userEvent.type(cal, '800')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also keep as a saved meal' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save meal' }))
    await waitFor(async () => {
      const meals = await mealsForDate(DATE)
      expect(meals).toHaveLength(1)
      expect(meals[0]).toMatchObject({ id: 'm1', time: '12:15' })
      expect(meals[0].items[0].calories).toBe(800)
      const saved = await listSavedMeals()
      expect(saved).toHaveLength(1)
      expect(meals[0].savedMealId).toBe(saved[0].id)
    })
  })

  test('a meal waiting for an estimate reopens in Describe with its text', async () => {
    const pending = { id: 'p1', date: DATE, time: '13:00', description: 'club sandwich', source: 'ai' as const, items: [], needsEstimate: true, createdAt: '', updatedAt: '' }
    render(<MealSheet date={DATE} editing={pending} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich')
  })
})
```

- [ ] **Step 3: Run and confirm it fails**

Run: `npx vitest run src/ui/MealSheet.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Add the styles**

Append to `src/styles/theme.css`:

```css
.meter { height: 10px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.meter-fill { height: 100%; border-radius: 999px; background: var(--accent); }
.meter-fill.meter-cyan { background: var(--cyan); }
.meter-fill.meter-over { background: var(--red); }
.meter-value { font-family: var(--font-display); font-size: 40px; line-height: 1; }
.meter-value small { font-family: var(--font-body); font-size: 13px; color: var(--muted); margin-left: 6px; }
.item-row { display: grid; grid-template-columns: minmax(0, 1fr) 84px 72px var(--tap); gap: 6px; align-items: end; }
.item-row .field { margin: 0; }
.meal-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: var(--tap); }
.meal-row .meal-main { flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0; }
.meal-time { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
.check-row { display: flex; align-items: center; gap: 10px; min-height: var(--tap); }
textarea.input { min-height: 96px; resize: vertical; }
```

- [ ] **Step 5: Implement the confirm view**

Create `src/ui/MealConfirm.tsx`:

```tsx
import { useState } from 'react'
import { Chip } from './components/Chip'
import { NumberField } from './components/NumberField'
import { nowTime } from '../domain/dates'
import { scaleItems, sumItems } from '../nutrition/totals'
import type { Confidence, FoodItem, MealSource } from '../domain/types'

export interface MealDraft {
  id?: string
  createdAt?: string
  description: string
  items: FoodItem[]
  source: MealSource
  confidence?: Confidence
  note?: string
  savedMealId?: string
  time?: string
}

export interface ConfirmedMeal {
  description: string
  items: FoodItem[]
  time: string
  saveAsSaved: boolean
}

const FACTORS = [0.5, 1, 1.5, 2]

/** Review an estimate or an existing meal. Calories and protein are editable per item; carbs, fat and fibre ride along. */
export function MealConfirm({ draft, onSave, onBack }: { draft: MealDraft; onSave: (m: ConfirmedMeal) => void; onBack: () => void }) {
  const [description, setDescription] = useState(draft.description)
  const [items, setItems] = useState<FoodItem[]>(draft.items)
  const [factor, setFactor] = useState(1)
  const [time, setTime] = useState(draft.time ?? nowTime())
  const [saveAsSaved, setSaveAsSaved] = useState(false)

  const scaled = scaleItems(items, factor)
  const totals = sumItems(scaled)
  const patch = (i: number, p: Partial<FoodItem>) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const remove = (i: number) => setItems((cur) => cur.filter((_, j) => j !== i))
  const canSave = items.length > 0 && description.trim() !== ''

  return (
    <div className="stack">
      {draft.confidence === 'low' && (
        <div className="banner banner-error">Rough estimate. {draft.note ?? 'Check the numbers before saving.'}</div>
      )}
      <label className="field"><span className="field-label">Meal</span>
        <input className="input" aria-label="Meal name" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {items.map((it, i) => (
        <div key={i} className="item-row">
          <label className="field">{i === 0 && <span className="field-label">Item</span>}
            <input className="input" aria-label={`Item ${i + 1} name`} value={it.name} onChange={(e) => patch(i, { name: e.target.value })} />
          </label>
          <NumberField label={i === 0 ? 'kcal' : undefined} ariaLabel={`Item ${i + 1} calories`} value={it.calories} onCommit={(v) => patch(i, { calories: v ?? 0 })} allowDecimal={false} />
          <NumberField label={i === 0 ? 'Protein' : undefined} ariaLabel={`Item ${i + 1} protein`} value={it.protein} onCommit={(v) => patch(i, { protein: v ?? 0 })} />
          <button type="button" className="icon-btn" aria-label={`Remove ${it.name || `item ${i + 1}`}`} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <div>
        <span className="field-label">Portion</span>
        <div className="chips">
          {FACTORS.map((f) => <Chip key={f} on={factor === f} onClick={() => setFactor(f)}>{`${f}x`}</Chip>)}
        </div>
      </div>
      <label className="field"><span className="field-label">Time</span>
        <input className="input" type="time" aria-label="Time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
      </label>
      <div className="card">
        <strong>{Math.round(totals.calories)} kcal</strong> <span className="muted">{Math.round(totals.protein)} g protein</span>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={saveAsSaved} onChange={(e) => setSaveAsSaved(e.target.checked)} />
        <span>Also keep as a saved meal</span>
      </label>
      <div className="grid-2">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => onSave({ description: description.trim(), items: scaled, time, saveAsSaved })}>Save meal</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement the sheet**

Create `src/ui/MealSheet.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import { Sheet } from './components/Sheet'
import { Chip } from './components/Chip'
import { NumberField } from './components/NumberField'
import { MealConfirm, type ConfirmedMeal, type MealDraft } from './MealConfirm'
import { useMeals, useSavedMeals } from './hooks'
import { deleteSavedMeal, logSavedMeal, saveMeal, saveSavedMeal } from '../data/repo'
import { estimateMeal } from '../nutrition/estimate'
import { sumItems } from '../nutrition/totals'
import { newId } from '../domain/ids'
import { addDays, nowISO, nowTime } from '../domain/dates'
import type { FoodItem, MealEntry } from '../domain/types'

type Mode = 'describe' | 'saved' | 'quick'
const MODE_KEY = 'mannpower.mealMode'

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'saved' || m === 'quick' ? m : 'describe'
  } catch { return 'describe' }
}
function storeMode(m: Mode): void {
  try { localStorage.setItem(MODE_KEY, m) } catch { /* storage can be blocked; the default mode is fine */ }
}

const summary = (items: FoodItem[]) => { const t = sumItems(items); return `${Math.round(t.calories)} kcal, ${Math.round(t.protein)} g protein` }

/** Rendered only while open. Parents mount it conditionally so every open starts from clean state. */
export function MealSheet({ date, editing, onClose }: { date: string; editing?: MealEntry; onClose: () => void }) {
  const meals = useMeals()
  const saved = useSavedMeals()
  // A meal saved for later reopens in Describe and keeps its id and time; any other meal opens straight in the confirm view.
  const pendingMeal = editing?.needsEstimate ? editing : undefined
  const [mode, setModeState] = useState<Mode>(pendingMeal ? 'describe' : loadMode())
  const [draft, setDraft] = useState<MealDraft | null>(editing && !pendingMeal
    ? { id: editing.id, createdAt: editing.createdAt, description: editing.description, items: editing.items, source: editing.source, confidence: editing.confidence, savedMealId: editing.savedMealId, time: editing.time }
    : null)
  const [text, setText] = useState(pendingMeal?.description ?? '')
  const [photo, setPhoto] = useState<File | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickCalories, setQuickCalories] = useState<number | undefined>()
  const [quickProtein, setQuickProtein] = useState<number | undefined>()
  const photoRef = useRef<HTMLInputElement>(null)

  const setMode = (m: Mode) => { setModeState(m); storeMode(m) }
  const mealDate = editing?.date ?? date
  const keepId = pendingMeal ? { id: pendingMeal.id, createdAt: pendingMeal.createdAt } : {}
  const newTime = () => pendingMeal?.time ?? nowTime()

  const recents = useMemo(() => {
    const cutoff = addDays(date, -14)
    const savedNames = new Set(saved.map((s) => s.name.trim().toLowerCase()))
    const seen = new Map<string, MealEntry>()
    for (const m of [...meals].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))) {
      if (m.needsEstimate || m.items.length === 0 || m.date < cutoff) continue
      const key = m.description.trim().toLowerCase()
      if (savedNames.has(key) || seen.has(key)) continue
      seen.set(key, m)
    }
    return [...seen.values()].slice(0, 10)
  }, [meals, saved, date])
  const q = search.trim().toLowerCase()
  const match = (name: string) => q === '' || name.toLowerCase().includes(q)

  const runEstimate = async () => {
    setBusy(true); setError(null)
    const r = await estimateMeal({ text, photo })
    setBusy(false)
    if (!r.ok) { setError(r.message); return }
    setDraft({ ...keepId, description: text.trim() || 'Photo meal', items: r.items, source: 'ai', confidence: r.confidence, note: r.note, time: pendingMeal?.time })
  }

  const saveForLater = async () => {
    await saveMeal({ id: newId(), createdAt: '', ...keepId, date: mealDate, time: newTime(), description: text.trim(), items: [], source: 'ai', needsEstimate: true, updatedAt: '' })
    onClose()
  }

  const byHand = () => { setQuickName(text.trim()); setError(null); setMode('quick') }

  const saveConfirmed = async (c: ConfirmedMeal) => {
    if (!draft) return
    let savedMealId = draft.savedMealId
    if (c.saveAsSaved) {
      savedMealId = newId()
      await saveSavedMeal({ id: savedMealId, name: c.description, items: c.items, useCount: 1, lastUsedAt: nowISO() })
    }
    await saveMeal({
      id: draft.id ?? newId(), date: mealDate, time: c.time, description: c.description, items: c.items,
      source: draft.source, confidence: draft.confidence, savedMealId, createdAt: draft.createdAt ?? '', updatedAt: '',
    })
    onClose()
  }

  const logSaved = async (id: string) => { await logSavedMeal(id, date, nowTime()); onClose() }
  const logRecent = async (m: MealEntry) => {
    await saveMeal({ ...m, id: newId(), date, time: nowTime(), items: m.items.map((i) => ({ ...i })), createdAt: '', updatedAt: '' })
    onClose()
  }

  const saveQuick = async () => {
    if (!quickCalories || quickCalories <= 0) return
    const name = quickName.trim() || 'Quick add'
    await saveMeal({
      id: newId(), createdAt: '', ...keepId, date: mealDate, time: newTime(), description: name,
      items: [{ name, kind: 'food', calories: quickCalories, protein: quickProtein ?? 0 }], source: 'quick', updatedAt: '',
    })
    onClose()
  }

  if (draft) {
    return (
      <Sheet open onClose={onClose} title={editing && !pendingMeal ? 'Edit meal' : 'Add meal'}>
        <MealConfirm draft={draft} onSave={saveConfirmed} onBack={() => (editing && !pendingMeal ? onClose() : setDraft(null))} />
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title="Add meal">
      <div className="chips">
        <Chip on={mode === 'describe'} onClick={() => setMode('describe')}>Describe</Chip>
        <Chip on={mode === 'saved'} onClick={() => setMode('saved')}>Saved</Chip>
        <Chip on={mode === 'quick'} onClick={() => setMode('quick')}>Quick add</Chip>
      </div>

      {mode === 'describe' && (
        <div className="stack">
          <textarea className="input" aria-label="Describe the meal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Two eggs, toast with butter, large double double" />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden aria-label="Meal photo" onChange={(e) => { setPhoto(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" className="btn" onClick={() => (photo ? setPhoto(undefined) : photoRef.current?.click())}>{photo ? 'Photo added, tap to remove' : 'Add a photo'}</button>
          {error && (
            <div className="stack">
              <div className="banner banner-error">{error}</div>
              <div className="grid-2">
                <button type="button" className="btn" onClick={byHand}>Enter numbers by hand</button>
                <button type="button" className="btn" disabled={!text.trim()} onClick={saveForLater}>Save for later</button>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={busy || (!text.trim() && !photo)} onClick={runEstimate}>{busy ? 'Estimating' : 'Estimate'}</button>
        </div>
      )}

      {mode === 'saved' && (
        <div className="stack">
          <input className="input" aria-label="Search saved meals" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          {saved.length === 0 && recents.length === 0 && <div className="muted">Nothing yet. Star a meal on the Food tab and it will show up here.</div>}
          <div className="list">
            {saved.filter((s) => match(s.name)).map((s) => (
              <div key={s.id} className="meal-row">
                <button type="button" className="meal-main" aria-label={`Log ${s.name}`} onClick={() => logSaved(s.id)}>
                  <strong>{s.name}</strong><div className="muted">{summary(s.items)}</div>
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Adjust ${s.name}`} onClick={() => setDraft({ description: s.name, items: s.items, source: 'saved', savedMealId: s.id })}>Adjust</button>
                <button type="button" className="icon-btn" aria-label={`Remove saved meal ${s.name}`} onClick={() => { if (confirm(`Remove ${s.name} from saved meals? Meals already logged stay.`)) void deleteSavedMeal(s.id) }}>×</button>
              </div>
            ))}
          </div>
          {recents.some((m) => match(m.description)) && <span className="field-label">Recent</span>}
          <div className="list">
            {recents.filter((m) => match(m.description)).map((m) => (
              <div key={m.id} className="meal-row">
                <button type="button" className="meal-main" aria-label={`Log ${m.description}`} onClick={() => logRecent(m)}>
                  <strong>{m.description}</strong><div className="muted">{summary(m.items)}</div>
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Adjust ${m.description}`} onClick={() => setDraft({ description: m.description, items: m.items, source: m.source, confidence: m.confidence })}>Adjust</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'quick' && (
        <div className="stack">
          <div className="grid-2">
            <NumberField label="Calories" value={quickCalories} onCommit={setQuickCalories} allowDecimal={false} big />
            <NumberField label="Protein" value={quickProtein} onCommit={setQuickProtein} suffix="g" big />
          </div>
          <label className="field"><span className="field-label">Name</span>
            <input className="input" aria-label="Name" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="btn btn-primary btn-block" onClick={saveQuick}>Save quick add</button>
        </div>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 7: Run and commit**

Run: `npx vitest run src/ui/MealSheet.test.tsx src/domain src/ui/components && npx tsc -p tsconfig.json`
Expected: PASS and clean. Do not use non null assertions to quiet the type checker; `pendingMeal` exists so the optional `editing` prop is read once and narrowed properly.

```bash
git add src/ui src/domain/dates.ts src/domain/dates.test.ts src/styles/theme.css
git commit -m "Add meal sheet with describe, saved and quick add modes"
```

---

### Task 8: Food tab

**Files:**
- Create: `src/ui/screens/Food.tsx`, `src/ui/screens/Food.test.tsx`
- Modify: `src/ui/components/TabBar.tsx`, `src/App.tsx`, `src/App.test.tsx`

**Interfaces:**
- Consumes: `MealSheet` (Task 7), `dayTotals`, `mealTotals` (Task 4), `targetsFor` (Task 5), hooks (Task 2), `deleteMeal`, `saveSavedMeal` (Task 2).
- Produces: default export `Food` at route `/food`; a fifth tab labelled `Food` between Workout and History.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/Food.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { listSavedMeals, mealsForDate, saveMeal, saveSettings } from '../../data/repo'
import { todayISO } from '../../domain/dates'
import type { MealEntry } from '../../domain/types'
import Food from './Food'

vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))

const today = todayISO()
const meal = (id: string, time: string, description: string, calories: number, protein: number, patch: Partial<MealEntry> = {}): MealEntry => ({
  id, date: today, time, description, source: 'quick', items: [{ name: description, kind: 'food', calories, protein }], createdAt: '', updatedAt: '', ...patch,
})
const renderFood = () => render(<MemoryRouter><Food /></MemoryRouter>)

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

describe('Food', () => {
  test('shows the day against the targets, meals in time order', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal(meal('b', '12:30', 'Lunch', 800, 50))
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    expect(await screen.findByText('Lunch')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Calories' })).toHaveAttribute('aria-valuenow', '1200')
    expect(screen.getByText(/1000/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Protein' })).toHaveAttribute('aria-valuenow', '80')
    const rows = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button', { name: /^Edit / }).getAttribute('aria-label'))
    expect(rows).toEqual(['Edit Breakfast', 'Edit Lunch'])
  })

  test('with no target yet it shows totals and points at Settings', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    expect(await screen.findByText('Breakfast')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Calories' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument()
  })

  test('delete and star', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Save Breakfast as a saved meal' }))
    await waitFor(async () => expect((await listSavedMeals()).map((s) => s.name)).toEqual(['Breakfast']))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Breakfast as a saved meal' })).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }))
    await waitFor(async () => expect(await mealsForDate(today)).toEqual([]))
  })

  test('a meal waiting for an estimate is flagged and reopens in Describe', async () => {
    await saveMeal(meal('p', '13:00', 'club sandwich', 0, 0, { items: [], needsEstimate: true, source: 'ai' }))
    renderFood()
    expect(await screen.findByText(/Needs estimate/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Estimate club sandwich' }))
    expect(await screen.findByRole('textbox', { name: 'Describe the meal' })).toHaveValue('club sandwich')
  })

  test('Add meal opens the sheet and tapping a meal opens it for editing', async () => {
    await saveMeal(meal('a', '08:00', 'Breakfast', 400, 30))
    renderFood()
    await userEvent.click(await screen.findByRole('button', { name: 'Add meal' }))
    expect(screen.getByRole('dialog', { name: 'Add meal' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('presentation'))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Breakfast' }))
    expect(screen.getByRole('dialog', { name: 'Edit meal' })).toBeInTheDocument()
  })
})
```

Change `src/App.test.tsx` to expect five tabs:

```tsx
test('renders the wordmark and the five tabs', () => {
  render(<App />)
  expect(screen.getByText('Mannpower')).toBeInTheDocument()
  for (const label of ['Today', 'Workout', 'Food', 'History', 'Trends']) {
    expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
  }
})
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/ui/screens/Food.test.tsx src/App.test.tsx`
Expected: FAIL, `Food` does not exist and there is no Food tab.

- [ ] **Step 3: Implement the screen**

Create `src/ui/screens/Food.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { Section } from '../components/Section'
import { MealSheet } from '../MealSheet'
import { useDays, useMeals, useSettings, useWorkouts } from '../hooks'
import { deleteMeal, saveMeal, saveSavedMeal } from '../../data/repo'
import { newId } from '../../domain/ids'
import { formatShort, nowISO, todayISO } from '../../domain/dates'
import { dayTotals, mealTotals } from '../../nutrition/totals'
import { targetsFor } from '../../nutrition/targets'
import type { MealEntry } from '../../domain/types'

function Meter({ label, value, target, unit, cyan }: { label: string; value: number; target?: number; unit: string; cyan?: boolean }) {
  const left = target === undefined ? undefined : Math.round(target - value)
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row-between">
        <span className="field-label">{label}</span>
        <span className="muted">{Math.round(value)}{target === undefined ? '' : ` of ${target}`} {unit}</span>
      </div>
      <div className="meter-value">
        {left === undefined ? Math.round(value) : Math.abs(left)}
        <small>{left === undefined ? unit : left >= 0 ? `${unit} left` : `${unit} over`}</small>
      </div>
      {target !== undefined && (
        <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)}>
          <div className={`meter-fill ${cyan ? 'meter-cyan' : ''} ${left !== undefined && left < 0 ? 'meter-over' : ''}`} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

export default function Food() {
  const [date, setDate] = useState(todayISO())
  const meals = useMeals()
  const days = useDays()
  const workouts = useWorkouts()
  const settings = useSettings()
  const [sheet, setSheet] = useState<{ editing?: MealEntry } | null>(null)

  const dayMeals = meals.filter((m) => m.date === date).sort((a, b) => a.time.localeCompare(b.time))
  const totals = dayTotals(meals, date)
  const targets = settings ? targetsFor({ meals, days, workouts, settings }, date) : undefined

  const star = async (m: MealEntry) => {
    const id = newId()
    await saveSavedMeal({ id, name: m.description, items: m.items.map((i) => ({ ...i })), useCount: 1, lastUsedAt: nowISO() })
    await saveMeal({ ...m, savedMealId: id })
  }

  return (
    <div className="screen">
      <Header title="Food" />
      <div className="row-between">
        <h2>{date === todayISO() ? 'Today' : formatShort(date)}</h2>
        <input className="input" style={{ width: 'auto' }} type="date" value={date} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      <div className="card stack">
        <Meter label="Calories" value={totals.calories} target={targets?.calories} unit="kcal" />
        <Meter label="Protein" value={totals.protein} target={targets?.protein} unit="g" cyan />
        {targets && targets.calories === undefined && (
          <div className="muted">
            No calorie target yet. Add your {targets.missing.join(', ') || 'details'} in <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>.
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet({})}>Add meal</button>

      <Section title="Meals" right={<span className="muted">{dayMeals.length}</span>}>
        {dayMeals.length === 0 && <div className="muted">Nothing logged.</div>}
        <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {dayMeals.map((m) => {
            const t = mealTotals(m)
            return (
              <li key={m.id} className="list-item meal-row">
                <button type="button" className="meal-main" aria-label={`Edit ${m.description}`} onClick={() => setSheet({ editing: m })}>
                  <div className="meal-time">{m.time}</div>
                  <strong>{m.description}</strong>
                  <div className="muted">
                    {m.needsEstimate ? 'Needs estimate' : `${Math.round(t.calories)} kcal, ${Math.round(t.protein)} g protein`}
                    {m.confidence === 'low' ? ', rough' : ''}
                  </div>
                </button>
                {m.needsEstimate && <button type="button" className="btn btn-sm" aria-label={`Estimate ${m.description}`} onClick={() => setSheet({ editing: m })}>Estimate</button>}
                {!m.needsEstimate && !m.savedMealId && (
                  <button type="button" className="icon-btn" aria-label={`Save ${m.description} as a saved meal`} onClick={() => star(m)}>☆</button>
                )}
                <button type="button" className="icon-btn" aria-label={`Delete ${m.description}`} onClick={() => deleteMeal(m.id)}>×</button>
              </li>
            )
          })}
        </ul>
      </Section>

      {sheet && <MealSheet date={date} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </div>
  )
}
```

Check how `Header` renders a `title` (open `src/ui/components/Header.tsx`); use it the way `Trends.tsx` does.

- [ ] **Step 4: Add the tab and route**

In `src/ui/components/TabBar.tsx`, add an icon and a tab between Workout and History:

```tsx
  food: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10" /></svg>,
```

```tsx
  { to: '/food', label: 'Food', icon: icons.food },
```

In `src/App.tsx`, import `Food` and add `<Route path="/food" element={<Food />} />` after the workout routes.

In `src/styles/theme.css`, five tabs need slightly tighter labels on a 360 px phone. Change `.tab` `font-size: 11px` to `font-size: 10px` and `letter-spacing: 0.06em` to `letter-spacing: 0.04em`.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/ui src/App.test.tsx && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/ui src/App.tsx src/App.test.tsx src/styles/theme.css
git commit -m "Add the Food tab with daily totals, targets and meal list"
```

---

### Task 9: Food card on Today

**Files:**
- Modify: `src/ui/screens/Today.tsx`, `src/ui/screens/Today.test.tsx`

**Interfaces:**
- Consumes: `MealSheet`, `dayTotals`, `targetsFor`, `useMeals`.

- [ ] **Step 1: Write the failing test**

Append to `describe('Today', ...)` in `src/ui/screens/Today.test.tsx` (add `saveMeal, saveSettings` to the repo import, and add `vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))` under the imports):

```tsx
  test('food card shows what is left and opens the meal sheet', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal({ id: 'm', date: todayISO(), time: '08:00', description: 'Breakfast', source: 'quick', items: [{ name: 'Breakfast', kind: 'food', calories: 400, protein: 30 }], createdAt: '', updatedAt: '' })
    renderToday()
    expect(await screen.findByText('1800')).toBeInTheDocument()
    expect(screen.getByText('kcal left')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    expect(screen.getByRole('dialog', { name: 'Add meal' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/ui/screens/Today.test.tsx`
Expected: the new test FAILS, the others still pass.

- [ ] **Step 3: Implement**

In `src/ui/screens/Today.tsx`: import `MealSheet` from `'../MealSheet'`, `useMeals` from the hooks, `dayTotals` from `'../../nutrition/totals'` and `targetsFor` from `'../../nutrition/targets'`. Inside the component:

```tsx
  const meals = useMeals()
  const [mealOpen, setMealOpen] = useState(false)
  const food = dayTotals(meals, date)
  const targets = settings ? targetsFor({ meals, days, workouts, settings }, date) : undefined
  const left = (target: number | undefined, eaten: number) => (target === undefined ? Math.round(eaten) : Math.abs(Math.round(target - eaten)))
  const leftLabel = (target: number | undefined, eaten: number, unit: string) => (target === undefined ? `${unit} eaten` : target - eaten >= 0 ? `${unit} left` : `${unit} over`)
```

Add this section between the Start workout button and the Cardio section:

```tsx
      <Section title="Food" right={<button type="button" className="btn btn-sm" onClick={() => setMealOpen(true)}>Add meal</button>}>
        <div className="card">
          <div className="grid-3">
            <BigNumber value={left(targets?.calories, food.calories)} label={leftLabel(targets?.calories, food.calories, 'kcal')} tone="accent" />
            <BigNumber value={left(targets?.protein, food.protein)} label={leftLabel(targets?.protein, food.protein, 'g protein')} tone="cyan" />
            <BigNumber value={food.meals} label="Meals" />
          </div>
        </div>
      </Section>
```

And next to the other sheets at the bottom: `{mealOpen && <MealSheet date={date} onClose={() => setMealOpen(false)} />}`

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/screens/Today.test.tsx && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/ui/screens/Today.tsx src/ui/screens/Today.test.tsx
git commit -m "Show calories and protein left on Today"
```

---

### Task 10: Settings for body details, food targets and the AI key

**Files:**
- Modify: `src/ui/screens/Settings.tsx`, `src/ui/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `targetsFor` (Task 5), `estimateMeal` (Task 6), `AI_MODELS` (Task 1), hooks `useMeals`, `useDays`, `useWorkouts`.

- [ ] **Step 1: Write the failing tests**

In `src/ui/screens/Settings.test.tsx`, add under the existing `vi.mock`:

```tsx
vi.mock('../../nutrition/estimate', () => ({ estimateMeal: vi.fn() }))
```

Add imports `import { estimateMeal } from '../../nutrition/estimate'` and `import { exportDataset } from '../../data/snapshot'`, then append inside `describe('Settings', ...)`:

```tsx
  test('saves height, sex and target overrides', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Height'), '70')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Male' }))
    await userEvent.type(screen.getByLabelText('Calorie target override'), '2200')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Protein target override'), '180')
    await userEvent.tab()
    await waitFor(async () => {
      expect(await getSettings()).toMatchObject({ heightInches: 70, sex: 'male', calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    })
    expect(await screen.findByText(/Target 2200 kcal and 180 g protein/)).toBeInTheDocument()
  })

  test('rejects an impossible height', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Height'), '700')
    await userEvent.tab()
    expect(await screen.findByText(/Height should be in inches/)).toBeInTheDocument()
    expect((await getSettings()).heightInches).toBeUndefined()
  })

  test('saves the AI key and model on the phone only, and tests the key', async () => {
    vi.mocked(estimateMeal).mockResolvedValueOnce({ ok: true, confidence: 'high', items: [{ name: 'Banana', kind: 'food', calories: 105, protein: 1 }] })
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('Anthropic API key'), 'sk-test-key')
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-haiku-4-5')
    await userEvent.click(screen.getByRole('button', { name: 'Save AI settings' }))
    await waitFor(async () => expect(await getSettings()).toMatchObject({ anthropicKey: 'sk-test-key', aiModel: 'claude-haiku-4-5' }))
    expect(JSON.stringify(await exportDataset())).not.toContain('sk-test-key')
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText('The key works.')).toBeInTheDocument()
    vi.mocked(estimateMeal).mockResolvedValueOnce({ ok: false, reason: 'auth', message: 'Claude rejected the API key. Check it in Settings.' })
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }))
    expect(await screen.findByText(/rejected the API key/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/ui/screens/Settings.test.tsx`
Expected: the three new tests FAIL.

- [ ] **Step 3: Implement**

In `src/ui/screens/Settings.tsx`:

Imports: add `useDays, useMeals, useWorkouts` to the hooks import, `AI_MODELS, type AiModel` to the types import, `import { targetsFor } from '../../nutrition/targets'` and `import { estimateMeal } from '../../nutrition/estimate'`.

State and handlers (inside the component, with the other state; hooks must stay above the `if (!settings)` early return):

```tsx
  const meals = useMeals()
  const days = useDays()
  const workouts = useWorkouts()
  const [aiKey, setAiKey] = useState<string | null>(null)
  const [aiModel, setAiModel] = useState<AiModel | null>(null)
  const [testing, setTesting] = useState(false)
```

After the early return:

```tsx
  const aiKeyValue = aiKey ?? settings.anthropicKey ?? ''
  const aiModelValue = aiModel ?? settings.aiModel
  const targets = targetsFor({ meals, days, workouts, settings }, todayISO())

  const saveAi = async () => {
    await saveSettings({ anthropicKey: aiKeyValue.trim() || undefined, aiModel: aiModelValue })
    setAiKey(null); setAiModel(null)
    setMessage('Saved.')
  }
  const testKey = async () => {
    setTesting(true); setMessage(null)
    const r = await estimateMeal({ text: 'one medium banana' })
    setTesting(false)
    setMessage(r.ok ? 'The key works.' : r.message)
  }
```

In the Goals card grid, add after the Daily step goal field:

```tsx
            <NumberField label="Height" value={settings.heightInches} suffix="in" onCommit={(v) => {
              const ok = v === undefined || (v >= 36 && v <= 96)
              if (ok) void saveSettings({ heightInches: v })
              else setMessage('Height should be in inches, for example 70 for 5 foot 10.')
            }} />
```

Below the grid, inside the same card:

```tsx
          <span className="field-label">Sex (for the calorie formula)</span>
          <div className="chips">
            <Chip on={settings.sex === 'male'} onClick={() => saveSettings({ sex: 'male' })}>Male</Chip>
            <Chip on={settings.sex === 'female'} onClick={() => saveSettings({ sex: 'female' })}>Female</Chip>
          </div>
```

New section after Goals:

```tsx
      <Section title="Food targets">
        <div className="card">
          <div>
            {targets.maintenance === undefined
              ? `No maintenance estimate yet. Still needed: ${targets.missing.join(', ') || 'more logged days'}.`
              : `Maintenance about ${Math.round(targets.maintenance / 10) * 10} kcal (${targets.source === 'measured' ? 'measured from your logged food and weight' : 'formula, until 14 full days are logged'}).`}
          </div>
          {targets.calories !== undefined && targets.protein !== undefined && (
            <div><strong>Target {targets.calories} kcal and {targets.protein} g protein a day.</strong></div>
          )}
          <div className="grid-2">
            <NumberField label="Calorie target override" value={settings.calorieTargetOverride} onCommit={(v) => saveSettings({ calorieTargetOverride: v || undefined })} allowDecimal={false} suffix="kcal" />
            <NumberField label="Protein target override" value={settings.proteinTargetOverride} onCommit={(v) => saveSettings({ proteinTargetOverride: v || undefined })} allowDecimal={false} suffix="g" />
          </div>
          <div className="muted">Leave the overrides blank to let the app work the targets out. The number updates once a week, on Monday.</div>
        </div>
      </Section>

      <Section title="AI meal estimates">
        <div className="card">
          <label className="field"><span className="field-label">Anthropic API key</span>
            <input className="input" type="password" aria-label="Anthropic API key" value={aiKeyValue} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
          </label>
          <label className="field"><span className="field-label">Model</span>
            <select className="input" aria-label="Model" value={aiModelValue} onChange={(e) => setAiModel(e.target.value as AiModel)}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="grid-2">
            <button type="button" className="btn" onClick={saveAi}>Save AI settings</button>
            <button type="button" className="btn btn-primary" disabled={testing || !settings.anthropicKey} onClick={testKey}>{testing ? 'Testing' : 'Test key'}</button>
          </div>
          <div className="muted">Create a key at console.anthropic.com. It stays on this phone and is never synced. Each estimated meal costs a few cents; saved meals and quick add are free.</div>
        </div>
      </Section>
```

Also update the import confirm text in `importBackup` to mention meals: append `, ${v.dataset.meals.length} meals` before ` and ${v.dataset.pain.length} pain entries`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/screens/Settings.test.tsx && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/ui/screens/Settings.tsx src/ui/screens/Settings.test.tsx
git commit -m "Add body details, food targets and AI key to Settings"
```

---

### Task 11: Weekly nutrition stats

**Files:**
- Create: `src/stats/nutrition.ts`, `src/stats/nutrition.test.ts`

**Interfaces:**
- Consumes: `NutritionInput`, `dailyIntake`, `maintenanceAt`, `targetsFor`, `KCAL_PER_LB`, `MaintenanceSource` (Task 5); `bodyWeightAvg7`; `mkMeal`, `mkDay`, `mkWorkout`, `mkEntry`.
- Produces:
  - `LATE_TIME = '20:00'`
  - `interface NutritionWeek` (fields in the code below)
  - `nutritionWeek(input: NutritionInput, start: string, end: string, monthly: boolean): NutritionWeek`
  - `interface NutritionDayRow { date: string; label: string; calories?: number; protein?: number; complete: boolean; avg7?: number }`
  - `nutritionSeries(input: NutritionInput, from: string, to: string): NutritionDayRow[]`
  - `recentDeficit(input: NutritionInput, date: string): number | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/stats/nutrition.test.ts`:

```ts
import { eachDay } from '../domain/dates'
import type { SyncedSettings } from '../domain/types'
import type { NutritionInput } from '../nutrition/targets'
import { mkDay, mkEntry, mkMeal, mkWorkout } from './testData'
import { nutritionSeries, nutritionWeek, recentDeficit } from './nutrition'

const START = '2026-09-14'
const END = '2026-09-20'
const settings: SyncedSettings = { defaultWithTrainer: true, customCardioTypes: [], sex: 'male', heightInches: 70, birthYear: 1979, targetBodyWeight: 220, proteinTargetOverride: 140 }
const days = [
  ...eachDay('2026-08-10', '2026-09-13').map((d) => mkDay(d, { bodyWeight: 240, steps: 8000 })),
  ...eachDay(START, END).map((d) => mkDay(d, { bodyWeight: 239, steps: 8000 })),
]
const weekdayMeals = eachDay('2026-09-14', '2026-09-18').map((d) => mkMeal(d, 2000, 150))
const saturday = mkMeal('2026-09-19', 0, 0, {
  time: '21:00', description: 'Pizza night',
  items: [{ name: 'Pizza', kind: 'food', calories: 2400, protein: 80, fibre: 6 }, { name: 'Beer', kind: 'alcohol', calories: 600, protein: 20 }],
})
const sunday = mkMeal('2026-09-20', 3000, 100)
const workouts = [mkWorkout('2026-09-14', [mkEntry('back-squat', [[185, 5]])]), mkWorkout('2026-09-16', [mkEntry('barbell-bench-press', [[135, 8]])])]
const full = (): NutritionInput => ({ meals: [...weekdayMeals, saturday, sunday], days, workouts, settings })

describe('nutritionWeek', () => {
  test('a full week', () => {
    const w = nutritionWeek(full(), START, END, false)
    expect(w).toMatchObject({ mealsLogged: 7, pendingMeals: 0, completeDays: 7, enoughData: true, calorieTarget: 2220, proteinTarget: 140, proteinDaysHit: 5, maintenanceSource: 'formula' })
    expect(w.avgCalories).toBeCloseTo(2285.7, 1)
    expect(w.avgProtein).toBeCloseTo(135.7, 1)
    expect(w.avgFibre).toBeCloseTo(0.86, 2)
    // Formula maintenance at 239 lb and 8000 steps is about 2948.
    expect(w.maintenance).toBeCloseTo(2948, 0)
    expect(w.avgDeficit).toBeCloseTo(662.3, 0)
    expect(w.predictedChangeLbs).toBeCloseTo(-1.32, 2)
    expect(w.actualChangeLbs).toBeCloseTo(-1.0, 5)
    expect(w.weekdayAvgCalories).toBe(2000)
    expect(w.weekendAvgCalories).toBe(3000)
    expect(w.trainingDay).toEqual({ days: 2, calories: 2000, protein: 150 })
    expect(w.restDay).toEqual({ days: 5, calories: 2400, protein: 130 })
    expect(w.topItems).toEqual([{ name: 'Meal', calories: 13000, count: 6 }, { name: 'Pizza', calories: 2400, count: 1 }, { name: 'Beer', calories: 600, count: 1 }])
    expect(w.alcoholSharePct).toBeCloseTo(3.75, 2)
    expect(w.drinkSharePct).toBe(0)
    expect(w.lateSharePct).toBeCloseTo(18.75, 2)
    expect(w.calorieSpread).toBeCloseTo(451.8, 0)
    expect(w.month).toBeUndefined()
  })

  test('thin logging reports only the counts', () => {
    const w = nutritionWeek({ ...full(), meals: weekdayMeals.slice(0, 2) }, START, END, false)
    expect(w).toMatchObject({ mealsLogged: 2, completeDays: 2, enoughData: false, topItems: [] })
    expect(w.avgCalories).toBeUndefined()
    expect(w.predictedChangeLbs).toBeUndefined()
  })

  test('a meal waiting for an estimate makes its day incomplete', () => {
    const pending = mkMeal('2026-09-14', 0, 0, { items: [], needsEstimate: true })
    const w = nutritionWeek({ ...full(), meals: [...full().meals, pending] }, START, END, false)
    expect(w).toMatchObject({ mealsLogged: 8, pendingMeals: 1, completeDays: 6 })
  })

  test('the monthly lens adds the maintenance trend', () => {
    const w = nutritionWeek(full(), START, END, true)
    expect(w.month?.completeDays).toBe(7)
    expect(w.month?.maintenanceStart).toBeCloseTo(2954.8, 0)
    expect(w.month?.maintenanceEnd).toBeCloseTo(2948, 0)
  })
})

describe('series and recent deficit', () => {
  test('nutritionSeries has one row per day with a trailing average of complete days', () => {
    const rows = nutritionSeries(full(), '2026-09-13', END)
    expect(rows).toHaveLength(8)
    expect(rows[0]).toMatchObject({ date: '2026-09-13', label: '09-13', complete: false })
    expect(rows[0].calories).toBeUndefined()
    expect(rows[1]).toMatchObject({ calories: 2000, protein: 150, complete: true, avg7: 2000 })
    expect(rows[7].avg7).toBeCloseTo(2285.7, 1)
  })

  test('recentDeficit needs three complete days', () => {
    expect(recentDeficit(full(), END)).toBeCloseTo(662.3, 0)
    expect(recentDeficit({ ...full(), meals: weekdayMeals.slice(0, 2) }, END)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/stats/nutrition.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/stats/nutrition.ts`:

```ts
import { addDays, eachDay, inRange, parseISO } from '../domain/dates'
import { bodyWeightAvg7 } from './bodyweight'
import { KCAL_PER_LB, dailyIntake, maintenanceAt, targetsFor, type DayIntake, type MaintenanceSource, type NutritionInput } from '../nutrition/targets'

/** Meals at or after this time count as late eating. */
export const LATE_TIME = '20:00'

export interface NutritionWeek {
  mealsLogged: number
  pendingMeals: number
  completeDays: number
  /** False under 3 complete days. Only the three counts above are meaningful then. */
  enoughData: boolean
  calorieTarget?: number
  proteinTarget?: number
  avgCalories?: number
  avgProtein?: number
  avgFibre?: number
  proteinDaysHit?: number
  maintenance?: number
  maintenanceSource: MaintenanceSource
  /** Maintenance minus average intake. Positive means a deficit. */
  avgDeficit?: number
  /** What that deficit predicts for the week, in pounds. Negative is loss. */
  predictedChangeLbs?: number
  /** Change in the 7 day average weight across the week. */
  actualChangeLbs?: number
  weekdayAvgCalories?: number
  weekendAvgCalories?: number
  trainingDay?: { days: number; calories: number; protein: number }
  restDay?: { days: number; calories: number; protein: number }
  topItems: { name: string; calories: number; count: number }[]
  /** Non alcoholic drinks. */
  drinkSharePct?: number
  alcoholSharePct?: number
  lateSharePct?: number
  /** Standard deviation of complete day calories. */
  calorieSpread?: number
  month?: { completeDays: number; maintenanceStart?: number; maintenanceEnd?: number }
}

const mean = (xs: number[]): number | undefined => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)
const isWeekend = (date: string) => { const d = parseISO(date).getDay(); return d === 0 || d === 6 }

function group(rows: DayIntake[]): { days: number; calories: number; protein: number } | undefined {
  if (rows.length === 0) return undefined
  return { days: rows.length, calories: mean(rows.map((r) => r.calories)) as number, protein: mean(rows.map((r) => r.protein)) as number }
}

export function nutritionWeek(input: NutritionInput, start: string, end: string, monthly: boolean): NutritionWeek {
  const inWeek = input.meals.filter((m) => inRange(m.date, start, end))
  const complete = dailyIntake(input, start, end).filter((d) => d.complete)
  const maintenance = maintenanceAt(input, end)
  const out: NutritionWeek = {
    mealsLogged: inWeek.length,
    pendingMeals: inWeek.filter((m) => m.needsEstimate).length,
    completeDays: complete.length,
    enoughData: complete.length >= 3,
    maintenanceSource: maintenance.source,
    topItems: [],
  }
  if (monthly) {
    out.month = {
      completeDays: dailyIntake(input, addDays(end, -27), end).filter((d) => d.complete).length,
      maintenanceStart: maintenanceAt(input, addDays(end, -28)).value,
      maintenanceEnd: maintenance.value,
    }
  }
  if (!out.enoughData) return out

  // The targets Jeremy actually saw this week.
  const targets = targetsFor(input, start)
  const calories = complete.map((d) => d.calories)
  const avgCalories = mean(calories) as number
  out.calorieTarget = targets.calories
  out.proteinTarget = targets.protein
  out.avgCalories = avgCalories
  out.avgProtein = mean(complete.map((d) => d.protein))
  out.avgFibre = mean(complete.map((d) => d.fibre))
  if (targets.protein !== undefined) out.proteinDaysHit = complete.filter((d) => d.protein >= (targets.protein as number)).length
  out.maintenance = maintenance.value
  if (maintenance.value !== undefined) {
    out.avgDeficit = maintenance.value - avgCalories
    out.predictedChangeLbs = (-out.avgDeficit * 7) / KCAL_PER_LB
  }
  const wEnd = bodyWeightAvg7(input.days, end)
  const wStart = bodyWeightAvg7(input.days, addDays(end, -7))
  if (wEnd !== undefined && wStart !== undefined) out.actualChangeLbs = wEnd - wStart

  out.weekdayAvgCalories = mean(complete.filter((d) => !isWeekend(d.date)).map((d) => d.calories))
  out.weekendAvgCalories = mean(complete.filter((d) => isWeekend(d.date)).map((d) => d.calories))
  const trainingDates = new Set(input.workouts.filter((w) => w.entries.length > 0).map((w) => w.date))
  out.trainingDay = group(complete.filter((d) => trainingDates.has(d.date)))
  out.restDay = group(complete.filter((d) => !trainingDates.has(d.date)))

  const estimated = inWeek.filter((m) => !m.needsEstimate)
  const byName = new Map<string, { name: string; calories: number; count: number }>()
  let total = 0, drink = 0, alcohol = 0, late = 0
  for (const m of estimated) for (const i of m.items) {
    total += i.calories
    if (i.kind === 'drink') drink += i.calories
    if (i.kind === 'alcohol') alcohol += i.calories
    if (m.time >= LATE_TIME) late += i.calories
    const key = i.name.trim().toLowerCase()
    const row = byName.get(key) ?? { name: i.name.trim(), calories: 0, count: 0 }
    row.calories += i.calories
    row.count += 1
    byName.set(key, row)
  }
  out.topItems = [...byName.values()].sort((a, b) => b.calories - a.calories).slice(0, 5)
  if (total > 0) {
    out.drinkSharePct = (drink / total) * 100
    out.alcoholSharePct = (alcohol / total) * 100
    out.lateSharePct = (late / total) * 100
  }
  out.calorieSpread = Math.sqrt(mean(calories.map((c) => (c - avgCalories) ** 2)) as number)
  return out
}

export interface NutritionDayRow {
  date: string
  label: string
  calories?: number
  protein?: number
  complete: boolean
  /** Mean calories of the complete days in the trailing 7 days. */
  avg7?: number
}

export function nutritionSeries(input: NutritionInput, from: string, to: string): NutritionDayRow[] {
  const intake = new Map(dailyIntake(input, addDays(from, -6), to).map((d) => [d.date, d]))
  return eachDay(from, to).map((date) => {
    const d = intake.get(date)
    const trailing = eachDay(addDays(date, -6), date).map((x) => intake.get(x)).filter((x): x is DayIntake => x !== undefined && x.complete)
    return { date, label: date.slice(5), calories: d?.calories, protein: d?.protein, complete: d?.complete ?? false, avg7: mean(trailing.map((x) => x.calories)) }
  })
}

/** Maintenance minus average intake over the last 14 complete days (within 28 days). Needs at least three. */
export function recentDeficit(input: NutritionInput, date: string): number | undefined {
  const maintenance = maintenanceAt(input, date).value
  const complete = dailyIntake(input, addDays(date, -27), date).filter((d) => d.complete).slice(-14)
  if (maintenance === undefined || complete.length < 3) return undefined
  return maintenance - (mean(complete.map((d) => d.calories)) as number)
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/stats/nutrition.test.ts && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/stats/nutrition.ts src/stats/nutrition.test.ts
git commit -m "Add weekly nutrition stats and daily series"
```

---

### Task 12: Nutrition in the weekly digest and report

**Files:**
- Modify: `src/stats/digest.ts`, `src/stats/digest.test.ts`, `scripts/fixtures/week.json`, `scripts/report.test.ts`

**Interfaces:**
- Consumes: `nutritionWeek`, `NutritionWeek`, `LATE_TIME` (Task 11); `isLastSundayOfMonth` (already imported in `digest.ts`).
- Produces: `Digest.nutrition: NutritionWeek`; a `## Nutrition` section in `digestMarkdown` placed after `## Recommendation facts` and before `## Benchmarks`; the JSON block carries `nutrition` automatically.

- [ ] **Step 1: Write the failing tests**

In `src/stats/digest.test.ts`, add `mkMeal` to the `./testData` import and `eachDay` from `'../domain/dates'`, then append inside `describe('weeklyDigest', ...)`:

```ts
  test('with no meals the nutrition section says logging was too thin', () => {
    const d = weeklyDigest(dataset(), '2026-09-13')
    expect(d.nutrition).toMatchObject({ mealsLogged: 0, completeDays: 0, enoughData: false })
    const md = digestMarkdown(d)
    expect(md).toContain('## Nutrition')
    expect(md).toContain('- Food logging too thin to read: 0 complete days of 7, 0 meals logged, 0 waiting for an estimate')
  })

  test('with a logged week the nutrition section carries the reconciliation and splits', () => {
    const ds = dataset()
    ds.settings = { ...ds.settings, sex: 'male', heightInches: 70, birthYear: 1979, proteinTargetOverride: 140 }
    ds.meals = eachDay('2026-09-07', '2026-09-13').map((date, i) => mkMeal(date, i > 4 ? 3000 : 2000, i > 4 ? 100 : 150, i === 5 ? { time: '21:00' } : {}))
    const d = weeklyDigest(ds, '2026-09-13')
    expect(d.nutrition).toMatchObject({ completeDays: 7, enoughData: true, proteinDaysHit: 5, weekdayAvgCalories: 2000, weekendAvgCalories: 3000 })
    const md = digestMarkdown(d)
    expect(md).toContain('- Complete days logged: 7 of 7')
    expect(md).toMatch(/- Calories: avg 2286 a day against a target of \d+/)
    expect(md).toContain('- Protein: avg 136 g against a target of 140 g, target hit on 5 of 7 complete days')
    expect(md).toMatch(/- Maintenance: about \d+ kcal \(formula\)/)
    expect(md).toContain('- Weekday avg 2000 kcal vs weekend avg 3000 kcal')
    expect(md).toContain('- Top calorie items: Meal 16000 kcal (7)')
    expect(md).toContain('after 8 pm 18.8%')
    expect(md).toMatch(/Body composition signal: .*protein target hit on 5 of 7 complete days/)
  })
```

In `scripts/report.test.ts`, add to the first test:

```ts
    expect(r.out).toContain('## Nutrition')
    expect(r.out).toContain('- Complete days logged: 7 of 7')
    expect(r.out).toContain('Double double')
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/stats/digest.test.ts scripts/report.test.ts`
Expected: FAIL, `nutrition` is undefined.

- [ ] **Step 3: Wire the digest**

In `src/stats/digest.ts`:

Import: `import { nutritionWeek, type NutritionWeek } from './nutrition'`.

Add to the `Digest` interface:

```ts
  /** Food logged this week: intake against targets, the intake versus scale reconciliation, and where the calories came from. */
  nutrition: NutritionWeek
```

Add to the object returned by `weeklyDigest`, after `monthlyLens`:

```ts
    nutrition: nutritionWeek(ds, start, end, isLastSundayOfMonth(end)),
```

In `digestMarkdown`, insert after the `## Recommendation facts` block (after the line that pushes `Cardio sessions`):

```ts
  const food = d.nutrition
  lines.push('## Nutrition')
  if (!food.enoughData) {
    lines.push(`- Food logging too thin to read: ${food.completeDays} complete days of 7, ${food.mealsLogged} meals logged, ${food.pendingMeals} waiting for an estimate`)
  } else {
    lines.push(`- Complete days logged: ${food.completeDays} of 7 (${food.mealsLogged} meals, ${food.pendingMeals} waiting for an estimate). Averages use complete days only`)
    lines.push(`- Calories: avg ${n(food.avgCalories)} a day against a target of ${n(food.calorieTarget)}`)
    lines.push(`- Protein: avg ${n(food.avgProtein)} g against a target of ${n(food.proteinTarget)} g, target hit on ${food.proteinDaysHit ?? 'n/a'} of ${food.completeDays} complete days; fibre avg ${n(food.avgFibre)} g`)
    lines.push(`- Maintenance: about ${n(food.maintenance)} kcal (${food.maintenanceSource}${food.maintenanceSource === 'formula' ? ', switches to measured after 14 complete days in 28' : ''}); avg daily deficit ${n(food.avgDeficit)} kcal`)
    lines.push(`- Reconciliation: intake predicts ${n(food.predictedChangeLbs, 1)} lb this week, the 7 day average weight moved ${n(food.actualChangeLbs, 1)} lb`)
    lines.push(`- Weekday avg ${n(food.weekdayAvgCalories)} kcal vs weekend avg ${n(food.weekendAvgCalories)} kcal`)
    const grp = (g?: { days: number; calories: number; protein: number }) => (g ? `${n(g.calories)} kcal and ${n(g.protein)} g protein over ${g.days} days` : 'n/a')
    lines.push(`- Training days: ${grp(food.trainingDay)}; rest days: ${grp(food.restDay)}`)
    lines.push(`- Top calorie items: ${food.topItems.map((t) => `${t.name} ${n(t.calories)} kcal (${t.count})`).join(', ') || 'none'}`)
    lines.push(`- Calorie shares: non alcoholic drinks ${share(food.drinkSharePct)}, alcohol ${share(food.alcoholSharePct)}, after 8 pm ${share(food.lateSharePct)}`)
    lines.push(`- Day to day spread: ${n(food.calorieSpread)} kcal standard deviation`)
  }
  if (food.month) lines.push(`- Month: ${food.month.completeDays} complete days in 28; maintenance ${n(food.month.maintenanceStart)} four weeks ago, ${n(food.month.maintenanceEnd)} now`)
  lines.push('')
```

`pct()` prefixes positive numbers with `+`, which reads wrong for a share. Add a second helper next to `pct` (it is used in the block above):

```ts
const share = (x: number | undefined) => (x === undefined ? 'n/a' : `${x.toFixed(1)}%`)
```

The name `food` is deliberate: `f` and `w` are already taken further down in `digestMarkdown`.

Change the Body composition line to append the protein fact:

```ts
  const proteinFact = d.nutrition.enoughData && d.nutrition.proteinDaysHit !== undefined ? `, protein target hit on ${d.nutrition.proteinDaysHit} of ${d.nutrition.completeDays} complete days` : ''
  lines.push(`- Body composition signal: ${BODY_COMP_LABELS[d.bodyComp.signal]} (4 week weight ${pct(d.bodyComp.weightChange4wPct)}, main lift strength ${pct(d.bodyComp.strengthChange4wPct)}${proteinFact})`)
```

- [ ] **Step 4: Add meals to the report fixture**

Run this once from the repo root (Git Bash):

```bash
node -e "
const fs=require('fs');const p='scripts/fixtures/week.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));
d.settings={...d.settings,birthYear:1979,heightInches:70,sex:'male'};
const dates=['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13'];
d.meals=dates.flatMap((date,i)=>[
 {id:'fm'+i+'a',date,time:'08:00',description:'Eggs and toast',source:'saved',items:[{name:'Eggs and toast',kind:'food',calories:450,protein:28,carbs:30,fat:22,fibre:3}],createdAt:'',updatedAt:''},
 {id:'fm'+i+'b',date,time:'12:30',description:'Chicken wrap and coffee',source:'ai',confidence:'medium',items:[{name:'Chicken wrap',kind:'food',calories:620,protein:38,carbs:55,fat:24,fibre:5},{name:'Double double',kind:'drink',calories:230,protein:4,carbs:28,fat:12,fibre:0}],createdAt:'',updatedAt:''},
 {id:'fm'+i+'c',date,time:i>4?'20:30':'18:30',description:'Dinner',source:'quick',items:[{name:'Dinner',kind:'food',calories:i>4?1400:900,protein:55}],createdAt:'',updatedAt:''},
]);
d.savedMeals=[];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"
```

Expected: `git diff --stat scripts/fixtures/week.json` shows the file grew; `node -e "console.log(require('./scripts/fixtures/week.json').meals.length)"` prints `21`.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/stats scripts && npx tsc -p tsconfig.json`
Expected: PASS and clean. Then eyeball the real output once: `npm run report -- --file scripts/fixtures/week.json --week 2026-09-13` and check the Nutrition section reads sensibly and contains no em dashes.

```bash
git add src/stats/digest.ts src/stats/digest.test.ts scripts
git commit -m "Add a Nutrition section to the weekly digest"
```

---

### Task 13: Nutrition charts on Trends

**Files:**
- Modify: `src/ui/screens/Trends.tsx`, `src/ui/screens/Trends.test.tsx`

**Interfaces:**
- Consumes: `nutritionSeries`, `recentDeficit` (Task 11), `targetsFor` (Task 5), `useMeals` (Task 2).

- [ ] **Step 1: Write the failing test**

In `src/ui/screens/Trends.test.tsx`, add `saveMeal, saveSettings` to the repo import and append inside the `describe`:

```tsx
  test('shows the nutrition charts and stat row once meals exist', async () => {
    await saveSettings({ calorieTargetOverride: 2200, proteinTargetOverride: 180 })
    await saveMeal({ id: 'm', date: '2026-09-01', time: '12:00', description: 'Lunch', source: 'quick', items: [{ name: 'Lunch', kind: 'food', calories: 2100, protein: 150 }], createdAt: '', updatedAt: '' })
    render(<MemoryRouter><Trends /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Calories' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Protein' })).toBeInTheDocument()
    expect(screen.getByText('Target kcal')).toBeInTheDocument()
    expect(screen.getByText('2200')).toBeInTheDocument()
  })

  test('hides the nutrition charts until a meal is logged', async () => {
    render(<MemoryRouter><Trends /></MemoryRouter>)
    expect(await screen.findByText('Body weight')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Calories' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run src/ui/screens/Trends.test.tsx`
Expected: the first new test FAILS.

- [ ] **Step 3: Implement**

In `src/ui/screens/Trends.tsx`:

Imports: add `Cell, ComposedChart` to the recharts import; `useMeals` to the hooks import; `import { BigNumber } from '../components/BigNumber'`; `import { nutritionSeries, recentDeficit } from '../../stats/nutrition'`; `import { targetsFor } from '../../nutrition/targets'`.

Inside the component, after `const settings = useSettings()`: `const meals = useMeals()`. Add `...meals.map((m) => m.date)` to the `earliest` array. After `const span = ...`:

```tsx
  const nutritionInput = settings ? { meals, days, workouts, settings } : undefined
  const foodRows = nutritionInput ? nutritionSeries(nutritionInput, from, today) : []
  const foodTargets = nutritionInput ? targetsFor(nutritionInput, today) : undefined
  const deficit = nutritionInput ? recentDeficit(nutritionInput, today) : undefined
```

Add these sections after the Body weight section:

```tsx
      {meals.length > 0 && (
        <>
          <Section title="Calories">
            <div className="card">
              <div className="grid-3">
                <BigNumber value={foodTargets?.maintenance === undefined ? '–' : Math.round(foodTargets.maintenance / 10) * 10} label={foodTargets?.source === 'measured' ? 'Maintenance, measured' : 'Maintenance, formula'} />
                <BigNumber value={foodTargets?.calories ?? '–'} label="Target kcal" tone="accent" />
                <BigNumber value={deficit === undefined ? '–' : Math.round(deficit)} label="Avg deficit, 14 days" tone="cyan" />
              </div>
            </div>
            <div className="card" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
                <ComposedChart data={foodRows} margin={{ left: -10, right: 10, top: 10 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis />
                  <Tooltip content={<ChartTip />} wrapperStyle={{ outline: 'none' }} />
                  <Legend verticalAlign="top" iconSize={8} wrapperStyle={{ fontSize: 11, paddingBottom: 6 }} />
                  {foodTargets?.calories ? <ReferenceLine y={foodTargets.calories} stroke="#4ade80" strokeDasharray="4 4" label={{ value: 'target', fill: '#4ade80', fontSize: 11 }} /> : null}
                  <Bar dataKey="calories" name="Calories" fill="#ff5a1f" isAnimationActive={false}>
                    {foodRows.map((r) => <Cell key={r.date} fill={r.complete ? '#ff5a1f' : '#b23f14'} fillOpacity={r.complete ? 1 : 0.45} />)}
                  </Bar>
                  <Line dataKey="avg7" name="7 day average" stroke="#22d3ee" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="muted">Faded bars are days that look only partly logged. They are left out of the averages and the maintenance maths.</div>
          </Section>

          <Section title="Protein">
            <div className="card" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%" initialDimension={initialDimension}>
                <BarChart data={foodRows} margin={{ left: -10, right: 10, top: 10 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis />
                  <Tooltip content={<ChartTip />} wrapperStyle={{ outline: 'none' }} />
                  {foodTargets?.protein ? <ReferenceLine y={foodTargets.protein} stroke="#4ade80" strokeDasharray="4 4" label={{ value: 'target', fill: '#4ade80', fontSize: 11 }} /> : null}
                  <Bar dataKey="protein" name="Protein (g)" fill="#22d3ee" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </>
      )}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/screens/Trends.test.tsx && npx tsc -p tsconfig.json`
Expected: PASS and clean.

```bash
git add src/ui/screens/Trends.tsx src/ui/screens/Trends.test.tsx
git commit -m "Add calorie and protein charts to Trends"
```

---

### Task 14: Email prompt, docs and end to end check

**Files:**
- Modify: `C:\Users\Jeremy Mannella\.claude\scheduled-tasks\mannpower-weekly-report\SKILL.md` (outside the repo, not committed)
- Modify: `README.md`, `docs/superpowers/specs/2026-09-21-nutrition-design.md`

- [ ] **Step 1: Update the scheduled task prompt**

Read the file first, then make these edits.

In the frontmatter `description`, replace the text with: `Runs the Mannpower digest and emails Jeremy a weekly strength, food, health and longevity report with food moves for him and questions for his trainer.`

In Step 1, change the section list to: `(Summary, Highlights, Muscle groups, Recommendation facts, Nutrition, Benchmarks, Balance and longevity markers, Pain)`.

In Step 3, replace the sentences from `He does not want a pat on the back unless it is earned.` through `never as an instruction, and never as medical advice.` with:

```
Give credit plainly when the numbers earn it, especially for food: a full week logged, protein hit on most days, a deficit held while strength stayed steady. Never as routine cheerleading, and never when the data does not back it. He wants to know what to change. Food and nutrition recommendations are addressed directly to him as things he can do this week, because he controls what he eats. Training recommendations are phrased as questions or topics to raise with his trainer, never as instructions. Nothing in the email is medical advice.
```

Insert a new section 2 after "This week in numbers" and renumber the rest:

```
2. Food. Only when the Nutrition section has real data; if it says logging was too thin, say so in one sentence, give the count of complete days, and skip the rest of this section. Otherwise: complete days logged, average calories against the target, average protein against the target and days it was hit. Then the reconciliation in plain words: what his intake predicted the scale would do, what the 7 day average weight actually did, and what that says about his maintenance number (say whether it is the formula value or measured from his own data). Then whichever of these the digest supports: weekday against weekend, training days against rest days, the top calorie items, the share from drinks and alcohol, the share eaten after 8 pm, and how much intake swung day to day.
```

Insert a new section before "Questions for your trainer":

```
Food moves for this week. Two to four specific moves addressed straight to Jeremy, each anchored to a Nutrition fact. Examples of the form: "The large double double showed up seven times for 1600 kcal; a medium with one cream saves about 100 a day.", "Protein averaged 136 g against 220; breakfast is the lightest meal, so add eggs or Greek yogurt there.", "Weekends ran 1000 kcal over weekdays; decide on Saturday's dinner before Saturday.". Include the weight band here, not in the trainer questions: too_fast means eat a bit more, too_slow or gaining means tighten food or add desk treadmill minutes, in_band means keep going. No meal plans, no supplements, no medical advice.
```

In "Questions for your trainer", delete the clause `weight band (too_fast means eating a bit more, too_slow or gaining means tightening food or adding desk treadmill minutes, in_band means keep going), ` so that section stays about training.

In "The long game" section, append: `When the Nutrition section has a Month line, add one sentence on how maintenance moved over the month and whether the calorie target needs resetting.`

In the style rules, change `Under 600 words on a normal week, up to 800 on a monthly lens week.` to `Under 750 words on a normal week, up to 950 on a monthly lens week.`

Check: read the file back once and confirm the numbered sections run 1 to 9 without gaps and the dash rule sentence is unchanged.

- [ ] **Step 2: Update the README**

Add a section to `README.md` after "Install on the phone":

```markdown
## Food tracking

The Food tab logs meals three ways: Describe (type, dictate or photograph a meal and Claude estimates it), Saved (one tap for meals you repeat) and Quick add (calories and protein typed in).

Describe needs an Anthropic API key. Create one at console.anthropic.com, add a few dollars of credit, paste it into Settings under AI meal estimates and tap Test key. The key stays on the phone and is never synced. Each estimated meal costs a few cents; Saved and Quick add are free and work offline.

Enter height and sex in Settings (birth year and body weight are already there). The app starts from a formula estimate of maintenance calories and switches to a number measured from your own food and weight logs once 14 full days are logged inside 28. The daily targets update once a week, on Monday. Overrides in Settings replace them.
```

- [ ] **Step 3: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-09-21-nutrition-design.md`:
- Replace the repo function list sentence with: `Repo functions: \`listMeals\`, \`mealsForDate\`, \`saveMeal\` (insert or update), \`deleteMeal\`, \`listSavedMeals\`, \`saveSavedMeal\` (create or rename), \`deleteSavedMeal\`, \`logSavedMeal\`.`
- In the Confirm view paragraph, replace `with every number editable through the existing \`NumberField\`` with `with calories and protein editable per item through the existing \`NumberField\` (carbs, fat and fibre ride along and scale with the portion)`.
- In the Add sheet section, replace `a long press or edit icon opens the confirm view first` with `an Adjust button opens the confirm view first`.

- [ ] **Step 4: Full verification**

Run: `npm test`
Expected: every test passes. Record the count.

Run: `npx tsc -p tsconfig.json`
Expected: no output.

Run: `npm run build`
Expected: build succeeds.

Run: `grep -rn -P "\x{2014}|\x{2013}" src README.md --include=*.ts --include=*.tsx --include=*.md`
Expected: no new matches in files this plan touched (the two existing `'–'` placeholders in `Today.tsx` and `Trends.tsx` are data placeholders, not prose; leave them).

- [ ] **Step 5: Smoke test in the browser**

Start the dev server with the preview tool (`.claude/launch.json`, `npm run dev`, port 5173; create the launch file if it is missing) and check at 360 px width:
1. Five tabs fit on one row with no horizontal scroll.
2. Food tab: Quick add 650 kcal and 40 g, the meal appears and the totals update.
3. Star the meal, open Add meal, Saved mode, the saved meal is listed and logs in one tap.
4. Describe with no key shows the prompt to add a key, and "Enter numbers by hand" carries the text into Quick add.
5. Settings: enter height 70, sex Male, a body weight on Today, and a target appears on the Food tab.
6. Trends shows the Calories and Protein sections.
7. The console has no errors.

Do not paste a real API key during this check. The live Describe path is verified by Jeremy on his phone after deploy.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-21-nutrition-design.md
git commit -m "Document food tracking and align the spec with the build"
```

Then hand off with superpowers:finishing-a-development-branch. Merging to `main` triggers the Pages deploy. After deploy, Jeremy's steps are in the spec under "What Jeremy does himself".

