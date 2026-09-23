# Mannpower Daily Check In Design

Date: 2026-09-23
Status: draft, awaiting review

## Purpose

This is Phase 2, the one the nutrition spec promised: a daily check in covering sleep, readiness, resting heart rate, water, alcohol, supplements and waist.

The app already knows what Jeremy lifted, ate, weighed and how much he hurt. What it cannot do yet is explain a bad week. A session where the weights went backwards reads today as a failure of effort, when the cause is more often four hours of sleep, a readiness score in the fifties, or three drinks on Friday. Every metric here was chosen because it explains or predicts something already tracked, and because it can be entered in under fifteen seconds. Anything slower gets logged for two weeks and then abandoned.

The payoff lands in the Sunday email, which gains five reads it cannot make today: sleep against session quality, sleep against calorie overshoot, supplement adherence, waist against body weight as the recomposition signal, and resting heart rate as an early overtraining flag.

## Decisions made

| Question | Decision |
|---|---|
| Where the daily numbers live | Optional fields on the existing `DayRecord`, not a new table |
| Sleep and readiness | Both are 0 to 100 scores typed from the Samsung watch and ring, plus sleep hours |
| Whether anything imports automatically | No. A PWA cannot read Android Health Connect, so every watch number is typed |
| Waist | One measurement, taken around the navel, prompted weekly |
| Water | Glasses of 250 ml, tap to add, default goal 8, editable in Settings |
| Alcohol | No new type. Preset buttons write a normal meal entry with `kind: 'alcohol'`, so calorie totals stay honest |
| Supplements | An editable list in Settings, preloaded with IM8 Daily Essentials, ticked off daily |
| What was deferred | Blood pressure, bloodwork, VO2 max, grip strength, mobility tests, mood and stress, progress photos |

## Data model

### Day record

`DayRecord` in `src/domain/types.ts` gains six optional fields:

```ts
export interface DayRecord {
  date: string
  bodyWeight?: number
  steps?: number
  cardio: CardioSession[]
  /** Samsung watch sleep score, 0 to 100. */
  sleepScore?: number
  /** Hours slept, one decimal place. */
  sleepHours?: number
  /** Samsung watch readiness score, 0 to 100. */
  readiness?: number
  /** Resting heart rate in beats per minute, from the ring. */
  restingHr?: number
  /** Glasses of 250 ml. */
  waterGlasses?: number
  /** Waist in inches, measured around the navel. Present only on measurement days. */
  waist?: number
  /** Ids of the supplements ticked for this day. */
  supplementsTaken?: string[]
  updatedAt: string
}
```

Putting waist on the day record rather than in its own table is deliberate. The measurement is weekly by prompt, not by storage, so it still belongs to a date, and Trends gets it aligned against body weight with no join.

No Dexie version bump is needed. None of these fields is indexed, and Dexie only versions the index schema. The database stays at version 2.

### Supplements

`SyncedSettings` gains the list and the water goal:

```ts
export interface Supplement {
  id: string
  name: string
  /** Inactive supplements stay in the list for history but are not shown on the card. */
  active: boolean
  /** YYYY-MM-DD it was added. Days before this are left out of its adherence denominator. */
  addedOn?: string
}

// added to SyncedSettings
supplements: Supplement[]
waterGoalGlasses?: number
```

The default settings ship one entry, IM8 Daily Essentials, so the feature works on first open with nothing to configure. `waterGoalGlasses` defaults to 8 when unset.

Supplements are referenced by id, never by name, so renaming one in Settings does not orphan the history. Deactivating rather than deleting is the normal path, and the Settings row makes that the obvious button; delete is available but warns that past ticks will no longer resolve to a name.

Calories are not attached to supplements. IM8 is roughly 25 calories a scoop, which is inside the noise of every other estimate in the app, and attaching calories here would create a second path into the daily total that Food does not know about. Anything with calories worth counting, protein powder in particular, belongs in Food as a saved meal.

### Alcohol

Nothing new. `FoodKind` already has `'alcohol'`, and the nutrition design already stores kind per item. The alcohol buttons construct a `MealEntry` with `source: 'quick'` and a single item whose kind is `'alcohol'`:

| Preset | Amount | Calories | Carbs |
|---|---|---|---|
| Beer | 12 oz | 150 | 13 |
| Wine | 5 oz | 125 | 4 |
| Spirit | 1.5 oz | 100 | 0 |
| Seltzer | 12 oz | 100 | 2 |

Protein is zero on all four. Drinks per week is then a derived count of alcohol items, never a stored tally, which follows the same rule the nutrition spec set for meal totals: anything derivable is derived, so edits cannot drift.

### Dataset and validation

`Dataset` does not change shape. `validateDataset` treats each new day field as optional and, when present, checks it is a finite number in range: sleep score and readiness 0 to 100, sleep hours 0 to 24, resting heart rate 30 to 200, water glasses 0 to 40, waist 20 to 80. `supplementsTaken` must be an array of strings. `supplements` in settings must be an array of well formed entries, defaulting to the IM8 entry when absent. `schemaVersion` stays 1, and an existing `data.json` written before this change loads unmodified.

`exportDataset` builds `SyncedSettings` field by field, so `supplements` and `waterGoalGlasses` must be added there explicitly or they will not sync. A test asserts every synced key round trips.

### Repo

No new repo functions are needed for the day fields. `modifyDay(date, fn)` already stamps meta and emits a data change, and every new control goes through it. Two helpers are added for clarity and to keep the supplement toggle atomic:

- `toggleSupplement(date, supplementId)`, which reads the current list inside the same transaction and adds or removes the id.
- `addWater(date, delta)`, which clamps the result at zero so a stray undo cannot go negative.

Alcohol reuses the existing `saveMeal`.

## Screens

### Morning check in card (`src/ui/CheckInCard.tsx`, on Today)

A single card, placed under the existing body weight and steps controls.

Unfilled, it shows four numeric fields in a two by two grid (sleep score, sleep hours, readiness, resting heart rate), then a row of supplement ticks. Every numeric field uses `inputMode="decimal"` and is blank rather than zero when unset, so a blank field means not recorded rather than recorded as nothing.

Filled, it collapses to one summary line, for example `Sleep 81 · 7.2 h · Readiness 74 · RHR 52 · IM8`, with a tap to reopen. The card is out of the way for the rest of the day.

The waist field is not part of the grid. It appears above it, as its own labelled row reading `Waist (around the navel)`, only when the most recent recorded waist is seven or more days old, or when there has never been one. Once entered it disappears until the next week. This is the whole of the weekly cadence: a prompt rule, not a schedule or a notification.

Nothing here is required and nothing blocks. A missed morning simply leaves the fields empty, and every statistic below treats a missing value as absent rather than as zero.

### Backfilling

Today already has a date picker at the top, so a missed morning is filled in by stepping back a day and typing the numbers. Nothing new is needed for this, but two rules follow from it and the implementation must respect both. Every control on the card, the water counter included, writes to the date currently being viewed rather than to today. The waist prompt compares against the viewed date too, so opening last Tuesday shows the prompt if no waist existed within seven days of last Tuesday, not within seven days of now.

The alcohol presets on the Food tab already inherit this, because that tab has its own date stepping and `MealSheet` already takes a date.

### Water

A counter row on Today, reading `Water 5 of 8` with a large plus button and a smaller minus for undo. Tapping plus calls `addWater(today, 1)`. The row fills as a progress bar so the state is readable without reading the number.

### Alcohol (Food tab)

A row of four preset buttons beside Quick add, labelled Beer, Wine, Spirit and Seltzer. One tap logs one drink at the table values above and shows a brief confirmation with an undo. Tapping the same button again logs a second drink as a separate entry, which keeps each drink individually deletable. Because these are ordinary meal entries they appear in the day's list, count in the daily calories and can be edited or deleted like anything else.

### Settings

A new Check in section:

- Water goal in glasses, default 8.
- Supplements: the list with a rename field per row, an active toggle, a delete with the orphan warning, and an Add supplement row.

## Statistics

Six new pure modules under `src/stats`, each testable without a database, following the pattern of `bodyweight.ts` and `nutrition.ts`. Drinks per week are not one of them: they are counted from alcohol items inside the existing `nutrition.ts`, which already computes an alcohol calorie share.

A note on pairing, because it is easy to get backwards. The watch reports a score on the morning it wakes you, covering the night that just ended. So the score stored against a date is the sleep that preceded that date's training and that date's eating, and every pairing below is same date, not offset by one.

### `sleep.ts`

Computes, for the digest week: average sleep score, average hours, nights recorded out of seven, and the best and worst nights with their dates.

The two correlations are deliberately modest, because seven points cannot support a correlation coefficient and presenting one would be false precision. Instead:

- **Sleep against training.** For each workout in the week, pair it with the sleep score stored on the same date. Report the average sleep score on training days against non training days, and name the session that followed the worst night when that night is at least fifteen points below the week's average.
- **Sleep against intake.** Pair each complete food day with the sleep score stored on the same date. Report average calories on the three worst nights against the three best, and only when at least six nights and six complete food days exist in the week.

Both return `undefined` when the data is too thin, and the email omits the line rather than hedging it.

### `readiness.ts`

Average readiness for the week, count recorded, and the count of days where readiness fell below 60 or dropped twenty or more points from the day before. A drop of that size the morning after a hard session is the single most useful thing this metric can tell him.

### `restingHr.ts`

The seven day average against the twenty eight day baseline. Flags when the week's average sits five or more beats above the baseline, which is the conventional early signal for accumulated fatigue or an illness coming on. Requires at least fourteen readings inside the twenty eight days before it reports anything, so a new install stays quiet for a fortnight rather than flagging noise.

### `supplements.ts`

Adherence per active supplement: days ticked out of days elapsed in the week, as a count and a percentage, plus the current streak. Days before a supplement was added are excluded from its denominator, so adding creatine on Thursday does not open with a 43 percent.

### `measurements.ts`

Waist trend over four and twelve weeks, and the recomposition read against body weight over the same window. The four cases, all of which need both a waist change and a weight change of meaningful size:

| Weight | Waist | Read |
|---|---|---|
| Down | Down | Fat loss, working |
| Flat | Down | Recomposition, the best outcome |
| Up | Flat | Gaining mass, not fat |
| Up | Up | Surplus too large |

Thresholds: half a pound a week for weight, a quarter inch over four weeks for waist. Anything inside those bands is reported as flat rather than as a trend. Needs at least three waist measurements in the window, otherwise it returns `undefined`.

## Weekly email

`weeklyDigest` gains the five results above, and `digestMarkdown` gains a section.

**This week in numbers** gains sleep average, readiness average and water average, each with the count of days recorded so a three night average is never read as a full week.

**A new section, Recovery**, placed after This week in numbers and before Food. It carries the sleep reads, the readiness drops, the resting heart rate flag and supplement adherence. Each line appears only when its module returned data.

**Waist** joins the existing body composition paragraph rather than starting a section of its own, because it only means anything next to the weight trend.

**Drinks** go in Food, as a count for the week with the calories they contributed, and held up against sleep score when both are present. This is a fact, not a judgement, and the prompt says so.

### Voice

The existing split from `weekly-email-tone` holds and extends cleanly. Sleep, water, drinks and supplements are Jeremy's own behaviour, so recommendations there speak directly to him, the same as food. Anything about training load, including a readiness drop after a session or a raised resting heart rate, is framed as a question for his trainer, because the trainer programs the work.

The scheduled task prompt at `~/.claude/scheduled-tasks/mannpower-weekly-report/SKILL.md` needs the Recovery section described, the voice split restated for it, and the word limit raised from 750 to 850 on a normal week and from 950 to 1050 on a monthly lens week.

The dash rule is unchanged and still applies to every line of the email.

## Error handling summary

| Situation | Behaviour |
|---|---|
| Old `data.json` without the new fields | Loads unchanged; every field reads as absent |
| A morning missed | Fields stay empty; every average uses the count it actually has and reports that count |
| Waist never entered | The prompt row shows every day until the first one; no statistic claims anything |
| Fewer than fourteen resting heart rate readings in 28 days | No baseline, no flag, no mention in the email |
| A supplement deleted rather than deactivated | Past ticks remain in the data but resolve to no name; the delete button warns first |
| Water tapped by mistake | Minus button; the value clamps at zero |
| An alcohol preset tapped by mistake | Undo in the confirmation, or delete the entry from the day's list |

## Testing

Tests first, Vitest, `fake-indexeddb`, the same as the rest of the app.

- `validate`: an old dataset loads; each new field is rejected when out of range, with a clear first error; a missing `supplements` list defaults to the IM8 entry.
- `snapshot`: every new day field and both new settings keys round trip through export and import; a test asserts no synced key is forgotten in the hand built `SyncedSettings`.
- `repo`: `toggleSupplement` adds and removes inside one transaction; `addWater` clamps at zero; both stamp meta and emit a change.
- `sleep`, `readiness`, `restingHr`, `supplements`, `measurements`: hand worked examples for each, the thin data case for each returning `undefined`, and specifically the mid week supplement denominator, the fourteen reading minimum, and all four recomposition cases including the flat bands.
- `digest`: the Recovery section appears with data and is absent without it; counts are printed beside every average.
- Screens: the check in card collapsing and reopening, blank against zero, the waist row appearing at seven days and disappearing after entry, the water counter and its floor, the four alcohol presets writing correct meal entries, and the Settings supplement editor including the delete warning.
- `scripts/fixtures/week.json` gains the new day fields so `report.test.ts` covers Recovery.

## What Jeremy does himself

1. Each morning, open Today and type four numbers off the watch and ring, then tick IM8.
2. Once a week, when the card asks, measure around the navel and type the number.
3. Add any other supplements to the list in Settings.

## Out of scope

Automatic import from Samsung Health or Health Connect, which a PWA cannot do. Blood pressure, bloodwork panels, VO2 max, grip strength and mobility tests, all of which are worth adding later and are low frequency entries that this design does not preclude. Mood and stress. Progress photos, which would need their own files in the data repo and are a separate project. Notifications or reminders of any kind.
