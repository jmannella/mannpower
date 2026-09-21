# Mannpower Nutrition Design

Date: 2026-09-21
Status: approved

## Purpose

Add calorie and meal tracking to Mannpower so the app covers food as well as training, and so the Sunday email can answer the real question with evidence: is Jeremy eating in a way that loses fat while keeping strength. The app already logs body weight, steps, cardio and lifts, so it can compare intake against what the scale did and work out Jeremy's true maintenance calories. That measured number is the centre of this feature.

This is Phase 1 of two. Phase 2 (separate spec, later) is a daily check in: waist and body measurements, sleep hours and quality, a drinks tally and water.

## Decisions made

| Question | Decision |
|---|---|
| How food gets logged | Hybrid. Saved meals, recents and quick add as the free offline base; an AI Describe mode (text, dictation or photo) on top |
| Where targets come from | The app works them out from Jeremy's own data; Settings overrides win |
| Detail per meal | Calories and protein shown up front. Carbs, fat and fibre stored quietly for the email and Trends |
| How AI estimates run | The phone calls the Claude API directly with a key Jeremy pastes into Settings. Model `claude-opus-5`, changeable in Settings |
| Where it lives | A fifth bottom tab, Food, between Workout and History, plus a summary card on Today |
| Email voice | Earned praise is welcome, especially for food. Food recommendations speak directly to Jeremy. Training recommendations stay framed as questions for his trainer |
| Roadmap after this | Phase 2: measurements, sleep, drinks and water |

## Data model

New types in `src/domain/types.ts`:

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
  date: string          // YYYY-MM-DD, same convention as Workout.date
  time: string          // HH:MM local, defaults to now, editable
  description: string   // what Jeremy typed, or the saved meal name
  items: FoodItem[]     // quick add stores one item
  source: MealSource
  confidence?: Confidence
  /** Set when Describe could not reach Claude; numbers may be zero until estimated. */
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
```

Meal totals are always derived by summing items (`src/nutrition/totals.ts`), never stored, so edits cannot drift.

`Dataset` gains `meals: MealEntry[]` and `savedMeals: SavedMeal[]`. `schemaVersion` stays 1. `validateDataset` treats both arrays as optional and defaults them to empty, so the existing `data.json` loads unchanged; when present, every meal and item is validated (numbers finite and not negative, date and time well formed, enums known).

`SyncedSettings` gains `heightInches?`, `sex?: 'male' | 'female'`, `calorieTargetOverride?`, `proteinTargetOverride?`.

`Settings` (phone only, never exported) gains `anthropicKey?` and `aiModel` (default `claude-opus-5`). `exportDataset` builds the synced settings field by field today, so the key cannot leak by accident; a test asserts it.

Dexie moves to version 2 adding `meals: 'id, date'` and `savedMeals: 'id, lastUsedAt'`. `exportDataset`, `importDataset` and the repo layer are extended to match. Repo functions: `addMeal`, `updateMeal`, `deleteMeal`, `mealsForDate`, `saveMealAsFavourite`, `logSavedMeal`, `renameSavedMeal`, `deleteSavedMeal`. Each stamps meta and emits a data change so auto sync runs, as the workout functions do.

Photos are never stored. A photo is downscaled on the phone to a 1024 px long edge JPEG, sent with the request, and dropped.

### Sync file size

Meals grow `data.json` by roughly 2 MB a year, and the GitHub Contents API stops returning inline content above 1 MB. Two changes in `src/sync`:

1. `GitHubContents.get()` keeps its current JSON request (it needs the sha). When the response has no usable `content` (GitHub sends an empty string with encoding `none` for files from 1 to 100 MB), it makes a second request with `Accept: application/vnd.github.raw` and uses that body.
2. The sync engine writes compact JSON instead of pretty printed JSON.

The report script shares `GitHubContents`, so it gets the fix for free.

## Logging flow

### Food tab (`/food`, `src/ui/screens/Food.tsx`)

- Date stepper at the top, defaulting to today.
- Two progress bars: calories eaten against target and protein against target, each with the remaining number as the big figure. With no target available yet, the bars show totals only.
- The day's meals in time order. Each row: time, description, calories, protein, a small AI confidence mark when low. Tap to edit, swipe or button to delete, star to save as a saved meal.
- A primary Add meal button that opens the add sheet.

### Add sheet (`src/ui/MealSheet.tsx`)

Three modes as chips across the top. The sheet remembers the last mode used.

1. **Describe.** A text box (the phone keyboard's mic handles dictation), an optional photo button (`<input type="file" accept="image/*" capture="environment">`), and Estimate. The result opens the confirm view.
2. **Saved.** Search box, then saved meals ordered by most recently used, then recent distinct meals from the last 14 days. One tap logs the meal at the current time; a long press or edit icon opens the confirm view first.
3. **Quick add.** Calories, protein, optional name. Saves one item of kind `food`.

### Confirm view

Shows the item list from the estimate with every number editable through the existing `NumberField`, a portion multiplier (0.5, 1, 1.5, 2) that scales all items, the time, totals at the bottom, a low confidence warning when Claude reports one along with its one line reason, and Save. A "Save as saved meal" toggle sits beside Save.

### Today card

A compact card on Today: calories left, protein left, meals logged today, and an Add meal button that opens the same sheet.

## AI estimator (`src/nutrition/estimate.ts`)

Uses the official `@anthropic-ai/sdk` package in browser mode (`dangerouslyAllowBrowser: true`), constructed per call from the key in Settings. Per the lesson from the sync fetch bug, any browser API handed to the SDK or stored as a default is wrapped in an arrow function, never stored bare.

Request shape:

- `model`: from Settings, default `claude-opus-5`.
- `max_tokens`: 4000. `output_config.effort`: `low` (a short extraction task). Haiku 4.5 rejects the `effort` field, so it is left out when that model is selected.
- When the model is `claude-opus-5`, the request goes through `client.beta.messages.create` with beta `server-side-fallback-2026-07-01` and `fallbacks: "default"`, so a mistaken safety decline is retried on another model inside the same call. Other models use the plain `client.messages.create`.
- `system`: a fixed prompt. Key points: the user is in Ontario, Canada, so prefer Canadian chains and products; assume typical restaurant or packaged portions unless the text says otherwise; split the meal into separate items; classify each item as food, drink or alcohol; give realistic middle estimates, not ranges; set confidence to low and explain in one line when the description is too vague to estimate well; never refuse a vague meal, estimate it and flag it.
- `messages`: one user message holding the optional image block (base64 JPEG) followed by the text.
- `output_config.format`: a JSON schema for `{ items: FoodItem[], confidence, note }` with `additionalProperties: false`, so the reply always parses.

Interface:

```ts
export type EstimateResult =
  | { ok: true; items: FoodItem[]; confidence: Confidence; note?: string }
  | { ok: false; reason: 'no_key' | 'offline' | 'auth' | 'rate_limit' | 'refused' | 'failed'; message: string }

export function estimateMeal(input: { text: string; photo?: Blob }, deps?: EstimateDeps): Promise<EstimateResult>
```

Errors map from the SDK's typed classes (`AuthenticationError`, `RateLimitError`, `APIConnectionError`, then `APIError`), and `stop_reason` is checked before the content is read (`refusal` and `max_tokens` both become a failed result). The parsed reply is validated again on the phone before use.

On any failure the sheet keeps what Jeremy typed and offers two paths: enter numbers by hand now, or Save for later, which stores the meal with `needsEstimate: true`. Meals in that state show an Estimate button on the Food tab and are left out of every average until resolved.

Settings gains an AI section: API key field (masked, with the same paste and clear behaviour as the GitHub token), model picker (Opus 5, Sonnet 5, Haiku 4.5), and a Test button that sends a tiny request and reports success or the mapped error.

Expected cost: about 2 to 3 cents per AI estimated meal on Opus 5. Saved meals and quick add cost nothing.

## Targets (`src/nutrition/targets.ts`, pure functions)

**Complete day.** A date is complete when its logged calories are at least half of the formula maintenance (below) and none of its meals has `needsEstimate`. Only complete days count in averages and in the maintenance maths. This rule uses the formula value, not the measured one, so it is never circular. When no formula value exists (a Settings field is missing), the threshold is a flat 1000 calories.

**Formula maintenance.** Mifflin St Jeor from sex, age (from `birthYear`), `heightInches` and the 7 day average body weight, times an activity factor from the last 14 days of data: average steps under 5000 gives 1.3, 5000 to 7499 gives 1.4, 7500 to 9999 gives 1.5, 10000 and over gives 1.6, plus 0.05 when there were at least 5 strength sessions in those 14 days. With no steps logged the factor is 1.4. If sex, height, birth year or weight is missing, there is no formula value and the app asks for the missing Settings field.

**Measured maintenance.** For a window of 28 days ending on date E: `W_end` is the 7 day average weight at E, `W_start` is the 7 day average weight at E minus 21. With at least 14 complete days in the window and both averages present:

`maintenance = mean(complete day calories) - (W_end - W_start) * 3500 / 21`

A result outside 1200 to 5000 is discarded as bad data. When a measured value exists it replaces the formula value.

**Calorie target.** Maintenance minus the deficit for the middle of the existing healthy loss band (0.75 percent of body weight per week): `deficit = 0.0075 * weight * 3500 / 7`. The deficit is capped at 25 percent of maintenance, and the target never goes below 1500 for a man or 1200 for a woman. When `targetBodyWeight` is set and the 7 day average is at or below it, the deficit is zero and the target is maintenance.

**Protein target.** 1 g per pound of `targetBodyWeight` when set, otherwise 0.8 g per pound of current 7 day average weight, rounded to the nearest 5.

**Stability.** Targets are computed as of the most recent Sunday, so the number Jeremy sees holds steady through the week and steps once on Monday. Overrides in Settings replace the computed values outright. Settings shows the current maintenance, which source it came from (formula or measured), and the resulting targets.

## Trends

Two charts added to `Trends.tsx` under a Nutrition heading, using the existing `ChartTip` and legend above chart pattern:

1. Daily calories as bars with the target as a line and a 7 day average line. Incomplete days drawn muted.
2. Daily protein as bars with the target as a line.

A stat row above them: measured maintenance, current target, average deficit over the last 14 complete days.

## Weekly email

### Digest (`src/stats/nutrition.ts` feeding `weeklyDigest`)

`Digest` gains a `nutrition` block, and `digestMarkdown` gains a `## Nutrition` section plus the same facts in the JSON block:

- Complete days out of 7, and meals still waiting for an estimate.
- Average calories on complete days against the target; average protein, the protein target, and days at or above it; average fibre.
- Maintenance value and its source, the week's average deficit, the weight change that deficit predicts (`deficit * 7 / 3500`), and the actual change in 7 day average weight. This is the reconciliation.
- Weekday average against weekend average (Saturday and Sunday).
- Training day average against rest day average, for calories and protein.
- Top five items by total calories for the week, with counts.
- Share of calories from drinks, share from alcohol, and share eaten at or after 20:00.
- Day to day spread (standard deviation of complete day calories).
- Protein adherence joins the existing body composition signal as an extra fact beside weight change and strength change. The signal's enum is unchanged.
- On monthly lens weeks: maintenance at the start and end of the month and complete days for the month.

With fewer than 3 complete days the block reports only the logging count, and the email says food logging was too thin to read.

### Scheduled task prompt

`~/.claude/scheduled-tasks/mannpower-weekly-report/SKILL.md` is updated:

- The audience paragraph changes from "does not want a pat on the back unless it is earned" to the new rule: give credit plainly when the numbers earn it, especially for food (a full week logged, protein hit most days, a deficit held with strength steady), and never as routine cheerleading.
- A new section, Food, placed after This week in numbers: the reconciliation in plain words, protein, weekday against weekend, training against rest days, where the calories came from, and late eating, each only when the digest has the data.
- A new section, Food moves for this week, placed before Questions for your trainer: two to four specific recommendations addressed straight to Jeremy, each anchored to a digest fact (for example a swap for the top calorie item, a protein fix for the meal that usually runs low, a plan for the weekend gap). Not medical advice, no meal plans, no supplements.
- Questions for your trainer stays as is and stays about training. The weight band item moves out of it into Food moves, since food is Jeremy's call.
- Word limit rises to 750 on a normal week and 950 on a monthly lens week.
- The dash rule is unchanged.

## Error handling summary

| Situation | Behaviour |
|---|---|
| No API key | Describe mode shows a one line prompt to add the key in Settings; Saved and Quick add work normally |
| Offline or API failure | Typed text is kept; enter numbers by hand or save for later with `needsEstimate` |
| Claude reports low confidence | Confirm view shows the warning and the reason; the row carries a mark afterwards |
| Old `data.json` without meals | Loads with empty meal arrays |
| Missing height, sex or birth year | No computed target; Settings prompt; overrides still work |
| `data.json` over 1 MB | Raw read fallback in `GitHubContents.get()` |

## Testing

Same approach as the rest of the app: tests first, Vitest, `fake-indexeddb`.

- `totals`, `targets` and `stats/nutrition`: complete day rule, formula values against hand worked examples, measured maintenance on synthetic gain, loss and flat data, the 14 day minimum, the plausibility clamp, deficit cap and floors, Sunday stability, overrides, every digest split, the thin data case.
- `validate`: old dataset loads; bad meals are rejected with a clear first error.
- `snapshot`: meals round trip through export and import; the API key never appears in an export.
- `estimate`: request shape per model (effort dropped for Haiku, fallbacks only for Opus 5), and a mocked client covering a good reply, low confidence, refusal, `max_tokens`, auth error, rate limit, connection error, no key, and a photo request carrying an image block.
- `github`: large file path falls back to the raw request and keeps the sha.
- Screens: Food tab rendering and date stepping, all three add modes, confirm view edits and multiplier, save for later and later estimate, Today card, Settings AI section.
- `scripts/fixtures/week.json` gains meals so `report.test.ts` covers the Nutrition section.

## What Jeremy does himself

1. Create an API key at console.anthropic.com and add a few dollars of credit. This is separate from the Claude subscription.
2. Paste the key into Settings on the phone and tap Test. Claude never sees or handles the key.
3. Enter height and sex in Settings.

## Out of scope

Barcode scanning and food database search, meal planning and recipes, micronutrients beyond fibre, water, sleep, measurements and the drinks tally (Phase 2), storing photos, sharing or export beyond the existing backup.
