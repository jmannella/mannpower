# Mannpower Design

Date: 2026-09-08
Status: approved

## Purpose

Mannpower is a phone app for Jeremy to log strength workouts (three per week with a trainer, plus solo sessions at Goodlife when travelling), daily body weight, daily steps, cardio sessions including desk treadmill walking at the office, and pain or discomfort, and to show trends that answer one question: am I getting stronger and building muscle while losing weight? A weekly email, written by Claude from the logged data, summarizes the week, calls out highlights, and makes specific recommendations.

## Look and feel

Strong and vibrant. Dark charcoal background (near black) with one hot accent colour (electric orange, `#FF5A1F`) used for primary actions, PR flashes, and chart highlights, and a cool secondary (electric cyan) for body weight and cardio series. Headings in a heavy condensed display face (Bebas Neue or similar via Google Fonts, system fallback), body text in a clean sans. Big numbers: the current lift, today's weight, and this week's volume are the largest things on their screens. Tap targets at least 48 px so sets can be entered with a sweaty thumb. Subtle motion only: a PR pulse and a check on save. App name and icon: "MANNPOWER" wordmark, orange on charcoal.

## Decisions made

| Question | Decision |
|---|---|
| Phone and install | Android, installed from the web as a PWA via Chrome "Add to home screen" |
| Units | Pounds for lifts and body weight |
| Routine | Exercises vary every session, so the app is search-and-add, not template based |
| Trainer or solo | Each workout is flagged with or without trainer. Solo sessions happen at Goodlife when out of town |
| Cardio | Several sessions per day are normal, including on-and-off desk treadmill walking at the office |
| Name | Mannpower |
| Steps | Entered manually once a day. A web app cannot read Google Fit or Health Connect |
| Data location | Phone storage is the source of truth. A private GitHub repo holds a synced copy that doubles as backup and feeds the weekly report |
| Hosting | GitHub Pages under the jmannella account |
| Weekly report | Automatic, Sunday 7 pm Eastern, emailed to jeremymannella@gmail.com |
| Stack | Vite, React, TypeScript, Dexie (IndexedDB), Recharts, vite-plugin-pwa, Vitest |

## Architecture

### Repositories

- `jmannella/mannpower` (public). App source. A GitHub Actions workflow builds on every push to `main` and publishes to `https://jmannella.github.io/mannpower/`. Public because GitHub Pages on a free account only serves public repos. No personal data lives here.
- `jmannella/mannpower-data` (private). One file, `data.json`, the full dataset. Written by the app, read by the app and by the weekly report script.

### App

Single page app, four bottom tabs plus a settings screen. Local data lives in IndexedDB through Dexie. A service worker (vite-plugin-pwa) caches the app shell so it opens and works with no signal.

Modules, each independently testable:

- `data/` : Dexie schema, typed repositories for exercises, workouts, day records, pain entries, settings.
- `library/` : the built-in exercise list (about 100 exercises with muscle group tags).
- `stats/` : pure functions from raw records to numbers and series. No storage or UI imports.
- `sync/` : serialize the dataset to JSON, push to and pull from the GitHub Contents API, merge by timestamp.
- `report/` : the same stats functions packaged as a Node script that prints a weekly digest. Run on the desktop by the scheduled task.
- `ui/` : screens and components.

### Sync

- After any write, a debounced (5 second) push serializes the whole dataset and PUTs `data.json` to the private repo using a fine-grained personal access token with Contents read and write on that one repo. The token is stored in the app settings (IndexedDB) on the phone only.
- On app open and when the browser regains connectivity, the app GETs `data.json`. If the remote `meta.updatedAt` is newer than local, remote replaces local. If local is newer, local is pushed. Equal means nothing to do. One phone, so last-write-wins by timestamp is sufficient.
- The Contents API needs the current file SHA for an update. The app keeps the last known SHA and refetches on a 409 or 422 conflict, then retries once.
- Sync never blocks logging. Failures set a status of `pending` or `error` shown as a dot in Settings with the last error message. An authentication failure (401 or 403) shows a one-time banner asking to check the token.
- If no token is configured the app works fully offline and Settings shows sync as "not set up."

### Weekly report

- A scheduled task on Jeremy's desktop Claude app runs Sunday 7 pm Eastern. If the desktop was off, it runs at next launch.
- The task prompt tells Claude to run `npm run report` in the local clone of `mannpower`. The script fetches `data.json` from the private repo using a token stored in a local `.env` (never committed), computes the digest for the week ending that Sunday, and prints Markdown plus a JSON block of facts.
- Claude reads the digest, writes the email (summary, highlights, recommendations, pain section if applicable), and sends it to jeremymannella@gmail.com through the connected Gmail account. Plain prose, no dashes used as sentence connectors.

## Data model

All records live in IndexedDB and serialize to a single JSON document for sync. IDs are random strings. Dates are ISO `YYYY-MM-DD` in local time. Timestamps are ISO strings with time zone.

```
Exercise      { id, name, primary: MuscleGroup, secondary: MuscleGroup[], custom: boolean }
MuscleGroup   = chest | back | shoulders | biceps | triceps | quads | hamstrings | glutes | calves | core
Workout       { id, date, withTrainer: boolean, notes?, entries: WorkoutEntry[], createdAt, updatedAt }
WorkoutEntry  { id, exerciseId, sets: SetRecord[] }
SetRecord     { weight: number (lbs), reps: number, warmup: boolean }
DayRecord     { date, bodyWeight?: number, steps?: number, cardio: CardioSession[], updatedAt }
CardioSession { id, type: string, minutes: number, distance?: number, notes? }
              Built-in types: Desk treadmill, Treadmill, Walk, Bike, Elliptical, Rower, Stairs, Swim, Other.
              Custom types are free text and remembered for the picker.
PainEntry     { id, date, area: BodyArea, severity: 1..5, limited: boolean, note?,
                workoutId?, exerciseId?, createdAt }
BodyArea      = neck | shoulder_left | shoulder_right | elbow_left | elbow_right | wrist_left
              | wrist_right | upper_back | lower_back | hip_left | hip_right | knee_left
              | knee_right | ankle_left | ankle_right | other
Settings      { githubToken?, dataRepo (default "jmannella/mannpower-data"), targetBodyWeight?,
                dailyStepGoal?, defaultWithTrainer (default true), lastSyncedAt?, lastSyncSha?, syncStatus }
Meta          { schemaVersion: 1, updatedAt }
```

The synced document is `{ meta, exercises (custom only), workouts, days, pain, settings minus githubToken }`. The token never leaves the phone. Built-in exercises are not synced; they ship with the app and are referenced by stable ids.

## Screens

Bottom tab bar: Today, Workout, History, Trends. Gear icon in the header opens Settings.

### Today

- Date at top, defaults to today, tap to change.
- Body weight field, steps field, both save on blur.
- Cardio list for the day with an add button (type picker with recent types first, minutes, optional distance). Any number of sessions per day. A "Desk treadmill" quick-add chip sits above the list because it is used most: tap, enter minutes, done. A second tap on the same day adds another session rather than editing the first, since office walking happens in bursts. The day's cardio total in minutes shows at the top of the list.
- "Log pain" button opens the pain sheet tied to this date with no exercise.
- "Start workout" button, or "Continue workout" if a workout exists for the selected date.
- Week-so-far strip: workouts done this week, average steps versus goal, body weight 7-day average with an up or down arrow.

### Workout

- A "With trainer" / "Solo" toggle at the top of the workout, defaulting to the setting `defaultWithTrainer`. Changing it on a workout does not change the default; the default is changed in Settings, so a travel week is one flip.
- Search box over all exercises (built-in plus custom). Results grouped by muscle group. An "add custom exercise" row appears when the search has no exact match.
- Each added exercise card shows a "Last time" line with the working sets from the most recent workout containing that exercise, and a small flare icon with the exercise's pain flare rate if it is above zero.
- Set rows: weight, reps, warm-up toggle. "Add set" copies the previous row. Swipe or long press to delete a set. Reorder exercises by drag handle.
- "Log pain" inside an exercise card pre-fills the exercise and workout.
- "Finish" saves and shows the summary: total volume, volume and sets per muscle group, PRs hit (with the previous best), pain logged during the session.
- Workouts save continuously; Finish only marks the summary as viewed. Leaving mid-workout loses nothing.

### History

- Workouts listed newest first with date, a trainer or solo tag, exercise count, total volume, PR count, and a pain badge if any pain was logged that day. A filter chip row switches between all, trainer, and solo.
- Tap a workout to view or edit it in the same Workout screen.
- Tap an exercise name anywhere to open its history: every set ever logged, best set, estimated 1RM chart over time, relative strength, and pain flare rate.

### Trends

Charts, each with 4 week, 12 week, and all time ranges:

- Body weight daily points with a 7-day average line and the target weight as a reference line.
- Weekly volume per muscle group, stacked bars.
- Weekly sets per muscle group, with the 10 set floor marked.
- Estimated 1RM over time for an exercise picked from a dropdown of everything logged.
- Relative strength over time for the same exercise.
- Weekly steps total against the goal, and weekly cardio minutes stacked by type so desk treadmill time is visible separately from gym cardio.
- Trainer versus solo: workouts per week split by type, and average volume per session for each, so solo sessions can be compared against trainer sessions.
- Pain timeline: one row per body area, dots sized by severity.

### Settings

- GitHub sync: token field, repo name, status dot (synced, pending, error, not set up) with last sync time and last error, "Sync now" button.
- Goals: target body weight, daily step goal.
- Default workout mode: with trainer or solo.
- Backup: export downloads the JSON document; import reads a file and replaces local data after a confirmation.
- Custom exercises: list, rename, change muscle groups, delete (blocked if the exercise has logged sets).

## Stats definitions

All functions in `stats/` are pure and take arrays of records plus a date or range.

- **Working set:** a set with `warmup` false.
- **Volume:** sum of weight times reps over working sets.
- **Estimated 1RM (e1RM):** Epley, `weight * (1 + reps / 30)`. Reps of 1 return the weight. The exercise's e1RM for a workout is the max over its working sets.
- **PR:** on saving a set, it is a PR if its e1RM exceeds the exercise's prior best e1RM, or its weight exceeds the exercise's prior heaviest working set weight. Both kinds are reported.
- **Week:** Monday through Sunday, local time.
- **Weekly muscle group load:** for each working set, its primary group gets 1 set and its full volume; each secondary group gets 0.5 set and half the volume. Summed per week.
- **Under-trained group:** fewer than 10 weighted sets in the week for a group that has been trained at all in the last 4 weeks. Groups never trained are not flagged.
- **Body weight 7-day average:** mean of the available entries in the trailing 7 days including the day. Weekly change is this week's average minus last week's average, reported in pounds and as a percent of body weight.
- **Healthy loss band:** 0.5 to 1.0 percent of body weight per week. Outside the band in either direction is flagged in the report.
- **Relative strength:** exercise e1RM divided by the 7-day average body weight on that workout's date.
- **Stalled lift:** an exercise where the last two sessions used the same top working weight and every working set hit the same or more reps as the previous session. Report suggests adding weight.
- **Steps:** daily value, weekly total and mean over days with an entry, days at or above goal.
- **Cardio:** weekly minutes and session count, overall and per type. Desk treadmill minutes are reported on their own line because they accumulate across the work day and are the easiest lever to pull on weight loss.
- **Trainer versus solo:** per week, count of each; over the range, mean volume and mean working sets per session for each, and the share of solo sessions where volume on shared exercises was within 90 percent of the last trainer session. This tells the report whether solo sessions are keeping pace.
- **Pain flare rate (exercise):** number of workouts containing the exercise that have a pain entry linked to it, divided by the number of workouts containing the exercise.
- **Pain patterns (area):** for each body area with 2 or more entries: exercises co-occurring in the same workout ranked by co-occurrence rate versus base rate; whether entries followed a week where volume rose more than 20 percent over the prior week; severity trend over the last 4 entries; days since last entry.

## Weekly email content

Produced for the week ending the Sunday the task runs.

1. **Summary:** workouts completed (trainer and solo counts), total volume and change versus prior week, body weight 7-day average and change, average steps and days at goal, cardio minutes with desk treadmill called out.
2. **Highlights:** PRs with old and new numbers, largest e1RM gain, best step day, consistency streak.
3. **Recommendations:** three to five items grounded in the facts block: stalled lifts with a suggested increment (5 lb for dumbbell and upper body barbell lifts, 10 lb for lower body barbell lifts), under-trained groups, weight change outside the healthy band, step goal shortfall, cardio absent for the week, and solo sessions falling well short of trainer sessions in volume or set count (with a concrete suggestion for what to add on the next solo day).
4. **Pain:** only when entries exist. Patterns from the stats module, phrased as things to raise with the trainer. No diagnosis or treatment advice.

The report script prints Markdown sections plus a fenced JSON block of the facts. Claude writes the email in plain prose without dash constructions, sends it, and replies in the task log with the subject line.

## Error handling

- Sync errors are recorded in settings and surfaced in the Settings status only. Logging is never blocked or slowed by sync.
- Invalid numeric input (blank, negative, non-numeric) is rejected at the field with the previous value restored.
- Import validates the schema version and record shapes before replacing anything and shows what would be replaced.
- The report script exits non-zero with a clear message when the token is missing, the repo is unreachable, or the data fails validation. The scheduled task prompt tells Claude to email a short failure notice instead of a report in that case.

## Testing

- Vitest unit tests for every function in `stats/`, including edge cases: no data, warm-ups only, one workout, week boundaries, missing body weight days, pain with no linked exercise.
- Unit tests for `sync/` merge logic and SHA conflict retry with a mocked fetch.
- Unit tests for trainer versus solo comparison and per-type cardio totals, including a day with four desk treadmill sessions.
- A test that validates the built-in exercise library: unique ids, unique names, valid muscle groups, no exercise listing the same group as primary and secondary.
- A test running the report script on a fixture dataset and checking the digest sections and facts JSON.
- Manual verification: build, serve locally, exercise every screen in the desktop browser at phone width, then install on the phone from the Pages URL and log a real session.

## Out of scope for the first version

- Automatic step import, rest timers, workout templates, multi-device conflict resolution, notifications, kilograms, sharing with the trainer, sleep or nutrition tracking, and native app packaging. Any of these can be added later without changing the data model beyond additive fields.
