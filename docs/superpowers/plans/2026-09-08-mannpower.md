# Mannpower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Mannpower, an installable Android web app that logs workouts, body weight, steps, cardio, and pain, shows strength and weight trends, syncs to a private GitHub repo, and feeds a Sunday evening emailed report written by Claude.

**Architecture:** A Vite + React + TypeScript single page app. IndexedDB (Dexie) on the phone is the source of truth; a pure `stats/` module turns raw records into numbers; a `sync/` module mirrors the dataset to `data.json` in a private GitHub repo through the Contents API. A Node script reuses `stats/` to print a weekly digest that a desktop scheduled task hands to Claude for the email.

**Tech Stack:** Vite, React 18, TypeScript, react-router-dom (hash router), Dexie 4 + dexie-react-hooks, Recharts, vite-plugin-pwa, Vitest + Testing Library + fake-indexeddb, tsx, sharp (icon generation only), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-08-mannpower-design.md`

## Global Constraints

- Project root is the current folder (`C:\Users\Jeremy Mannella\Claude Code\Workout app`). It is already a git repo on `main` with local identity set.
- App name everywhere is **Mannpower**. Public repo `jmannella/mannpower`, Pages URL `https://jmannella.github.io/mannpower/`, private data repo `jmannella/mannpower-data`, data file `data.json`.
- Units are pounds only. No unit conversion code.
- Dates are local `YYYY-MM-DD` strings. Timestamps are ISO strings from `new Date().toISOString()`. Weeks run Monday through Sunday.
- Muscle groups: `chest back shoulders biceps triceps quads hamstrings glutes calves core`.
- Pain severity is an integer 1 to 5.
- Colours: background `#111114`, accent `#FF5A1F`, secondary `#22D3EE`. Display font Bebas Neue, body font Inter, both from Google Fonts with system fallbacks.
- Minimum tap target 48 px.
- No dashes or em dashes as sentence connectors in any user-facing text, commit messages, or the report prompt. Use commas, colons, or separate sentences.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The GitHub token is stored only in IndexedDB settings on the phone and in a local `.env` on the desktop. It never goes into `data.json` or git.
- Node is v24, npm 11. Use the Bash (Git Bash) tool for shell steps; paths with spaces must be quoted.
- Run `npm test` before every commit. All tests must pass.

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore, .env.example
.github/workflows/deploy.yml        Build, test, publish to Pages
public/icons/icon-192.png, icon-512.png, icon.svg
scripts/icons.mjs                    Renders icon.svg to PNGs with sharp
scripts/report.ts                    Weekly digest CLI (Node)
src/main.tsx                         Boot, router, auto sync start
src/App.tsx                          Routes and tab shell
src/test/setup.ts                    Vitest setup (jest-dom, fake-indexeddb)
src/domain/types.ts                  All record and dataset types
src/domain/ids.ts                    newId()
src/domain/dates.ts                  Local date helpers, week math
src/domain/validate.ts               validateDataset(), pure, safe to import from Node
src/library/exercises.ts             Built-in exercises, suggestedIncrement()
src/library/cardioTypes.ts           Built-in cardio types
src/library/bodyAreas.ts             Body areas with labels
src/data/db.ts                       Dexie schema
src/data/changes.ts                  Tiny change emitter for auto sync
src/data/repo.ts                     CRUD functions, meta touch
src/data/snapshot.ts                 Dataset export, validate, import
src/stats/sets.ts                    Working sets, volume, Epley
src/stats/prs.ts                     Exercise history, PR detection
src/stats/muscle.ts                  Muscle group load per workout and week, under-trained
src/stats/stalled.ts                 Stalled lift detection
src/stats/bodyweight.ts              7-day average, weekly change, loss band, relative strength
src/stats/activity.ts                Steps and cardio summaries
src/stats/trainer.ts                 Trainer versus solo comparison
src/stats/pain.ts                    Flare rate and area patterns
src/stats/digest.ts                  Weekly digest facts + markdown
src/sync/github.ts                   Contents API client and error types
src/sync/engine.ts                   decide(), syncOnce()
src/sync/autoSync.ts                 Debounced trigger, online listener
src/styles/theme.css                 Variables, base, components
src/ui/components/*.tsx              TabBar, Header, Sheet, NumberField, Chip, BigNumber, Section
src/ui/PainSheet.tsx                 Pain logging bottom sheet
src/ui/screens/Today.tsx
src/ui/screens/Workout.tsx
src/ui/screens/History.tsx
src/ui/screens/ExerciseHistory.tsx
src/ui/screens/Trends.tsx
src/ui/screens/Settings.tsx
src/ui/hooks.ts                      useSettings, useExercises, useWorkouts, useDays, usePain
tests live next to source as *.test.ts / *.test.tsx
```

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm test`, `npm run dev`, `npm run build` all working. `src/test/setup.ts` loads jest-dom matchers and fake-indexeddb for every test.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "mannpower",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "report": "node --env-file=.env --import tsx scripts/report.ts",
    "icons": "node scripts/icons.mjs"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from the project root:

```bash
npm install react react-dom react-router-dom dexie dexie-react-hooks recharts
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb vite-plugin-pwa tsx sharp @types/react @types/react-dom @types/node
```

Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["node", "vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

- [ ] **Step 4: Write vite.config.ts**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/mannpower/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
```

- [ ] **Step 5: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#111114" />
    <title>Mannpower</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write src/vite-env.d.ts, src/test/setup.ts, src/main.tsx, src/App.tsx**

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx`:
```tsx
export default function App() {
  return <h1>Mannpower</h1>
}
```

- [ ] **Step 7: Write the smoke test src/App.test.tsx**

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the app name', () => {
  render(<App />)
  expect(screen.getByText('Mannpower')).toBeInTheDocument()
})
```

- [ ] **Step 8: Update .gitignore and add .env.example**

`.gitignore` (replace contents):
```
node_modules/
dist/
dev-dist/
.env
.remember/
```

`.env.example`:
```
# Fine-grained GitHub token with Contents read/write on jmannella/mannpower-data
MANNPOWER_TOKEN=
MANNPOWER_DATA_REPO=jmannella/mannpower-data
```

- [ ] **Step 9: Run tests and build**

Run: `npm test`
Expected: 1 passed.

Run: `npm run build`
Expected: `dist/` created with `index.html` and assets, no type errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Scaffold Mannpower with Vite, React, TypeScript and Vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Domain types, ids, and date helpers

**Files:**
- Create: `src/domain/types.ts`, `src/domain/ids.ts`, `src/domain/dates.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces: every type below, `newId(): string`, and the date functions `parseISO, toISO, todayISO, nowISO, addDays, weekStart, weekEnd, daysBetween, eachDay, inRange, formatShort, formatWeekLabel`. All later tasks import from these files.

- [ ] **Step 1: Write src/domain/types.ts**

```ts
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
```

- [ ] **Step 2: Write src/domain/ids.ts**

```ts
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
```

- [ ] **Step 3: Write the failing tests src/domain/dates.test.ts**

```ts
import {
  addDays, daysBetween, eachDay, formatShort, formatWeekLabel, inRange,
  parseISO, toISO, todayISO, weekEnd, weekStart,
} from './dates'

describe('dates', () => {
  test('toISO and parseISO round trip in local time', () => {
    const d = parseISO('2026-09-08')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(8)
    expect(toISO(d)).toBe('2026-09-08')
  })

  test('todayISO uses the given clock', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  test('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01')
  })

  test('weekStart is Monday and weekEnd is Sunday', () => {
    expect(weekStart('2026-09-08')).toBe('2026-09-07') // Tuesday -> Monday
    expect(weekStart('2026-09-07')).toBe('2026-09-07') // Monday stays
    expect(weekStart('2026-09-13')).toBe('2026-09-07') // Sunday -> previous Monday
    expect(weekEnd('2026-09-08')).toBe('2026-09-13')
  })

  test('daysBetween and eachDay', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7)
    expect(eachDay('2026-09-06', '2026-09-08')).toEqual(['2026-09-06', '2026-09-07', '2026-09-08'])
    expect(eachDay('2026-09-08', '2026-09-06')).toEqual([])
  })

  test('inRange is inclusive', () => {
    expect(inRange('2026-09-07', '2026-09-07', '2026-09-13')).toBe(true)
    expect(inRange('2026-09-13', '2026-09-07', '2026-09-13')).toBe(true)
    expect(inRange('2026-09-14', '2026-09-07', '2026-09-13')).toBe(false)
  })

  test('formatting', () => {
    expect(formatShort('2026-09-08')).toBe('Tue Sep 8')
    expect(formatWeekLabel('2026-09-07')).toBe('Sep 7')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/domain/dates.test.ts`
Expected: FAIL, cannot find module './dates'.

- [ ] **Step 5: Write src/domain/dates.ts**

```ts
const MS_PER_DAY = 86_400_000
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseISO(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now)
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function addDays(date: string, n: number): string {
  const d = parseISO(date)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Monday of the week containing date. */
export function weekStart(date: string): string {
  const d = parseISO(date)
  const offset = (d.getDay() + 6) % 7
  return addDays(date, -offset)
}

/** Sunday of the week containing date. */
export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / MS_PER_DAY)
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  let d = from
  while (d <= to) {
    out.push(d)
    d = addDays(d, 1)
  }
  return out
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

export function formatShort(date: string): string {
  const d = parseISO(date)
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`
}

export function formatWeekLabel(weekStartDate: string): string {
  const d = parseISO(weekStartDate)
  return `${MON[d.getMonth()]} ${d.getDate()}`
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/domain/dates.test.ts`
Expected: 7 passed.

- [ ] **Step 7: Commit**

```bash
git add src/domain
git commit -m "Add domain types, id generator and local date helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Exercise library, cardio types, body areas

**Files:**
- Create: `src/library/exercises.ts`, `src/library/exercises.test.ts`, `src/library/cardioTypes.ts`, `src/library/bodyAreas.ts`

**Interfaces:**
- Produces: `BUILTIN_EXERCISES: Exercise[]`, `suggestedIncrement(ex: Exercise): 5 | 10`, `BUILTIN_CARDIO_TYPES: string[]` (first entry is `'Desk treadmill'`), `BODY_AREAS: { id: BodyArea; label: string }[]`, `bodyAreaLabel(area: BodyArea): string`.

- [ ] **Step 1: Write the failing test src/library/exercises.test.ts**

```ts
import { MUSCLE_GROUPS } from '../domain/types'
import { BUILTIN_EXERCISES, suggestedIncrement } from './exercises'

describe('built-in exercise library', () => {
  test('has about a hundred exercises', () => {
    expect(BUILTIN_EXERCISES.length).toBeGreaterThanOrEqual(90)
  })

  test('ids and names are unique', () => {
    const ids = new Set(BUILTIN_EXERCISES.map((e) => e.id))
    const names = new Set(BUILTIN_EXERCISES.map((e) => e.name.toLowerCase()))
    expect(ids.size).toBe(BUILTIN_EXERCISES.length)
    expect(names.size).toBe(BUILTIN_EXERCISES.length)
  })

  test('every exercise has valid groups and is not custom', () => {
    for (const e of BUILTIN_EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(e.primary)
      for (const s of e.secondary) expect(MUSCLE_GROUPS).toContain(s)
      expect(e.secondary).not.toContain(e.primary)
      expect(e.custom).toBe(false)
      expect(e.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  test('every muscle group has at least four exercises', () => {
    for (const g of MUSCLE_GROUPS) {
      expect(BUILTIN_EXERCISES.filter((e) => e.primary === g).length).toBeGreaterThanOrEqual(4)
    }
  })

  test('suggested increment is 10 for big lower body lifts, 5 otherwise', () => {
    const squat = BUILTIN_EXERCISES.find((e) => e.id === 'back-squat')!
    const legExt = BUILTIN_EXERCISES.find((e) => e.id === 'leg-extension')!
    const bench = BUILTIN_EXERCISES.find((e) => e.id === 'barbell-bench-press')!
    expect(suggestedIncrement(squat)).toBe(10)
    expect(suggestedIncrement(legExt)).toBe(5)
    expect(suggestedIncrement(bench)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/library/exercises.test.ts`
Expected: FAIL, cannot find module './exercises'.

- [ ] **Step 3: Write src/library/exercises.ts**

```ts
import type { Exercise, MuscleGroup } from '../domain/types'

function ex(id: string, name: string, primary: MuscleGroup, secondary: MuscleGroup[] = []): Exercise {
  return { id, name, primary, secondary, custom: false }
}

export const BUILTIN_EXERCISES: Exercise[] = [
  // Chest
  ex('barbell-bench-press', 'Barbell Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'chest', ['shoulders', 'triceps']),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('incline-dumbbell-bench-press', 'Incline Dumbbell Bench Press', 'chest', ['shoulders', 'triceps']),
  ex('decline-bench-press', 'Decline Bench Press', 'chest', ['triceps']),
  ex('machine-chest-press', 'Machine Chest Press', 'chest', ['triceps']),
  ex('smith-machine-bench-press', 'Smith Machine Bench Press', 'chest', ['triceps', 'shoulders']),
  ex('push-up', 'Push-Up', 'chest', ['triceps', 'core']),
  ex('cable-fly', 'Cable Fly', 'chest'),
  ex('dumbbell-fly', 'Dumbbell Fly', 'chest'),
  ex('pec-deck', 'Pec Deck', 'chest'),
  ex('dip', 'Dip', 'chest', ['triceps']),
  // Back
  ex('deadlift', 'Deadlift', 'back', ['hamstrings', 'glutes']),
  ex('barbell-row', 'Barbell Row', 'back', ['biceps']),
  ex('pendlay-row', 'Pendlay Row', 'back', ['biceps']),
  ex('dumbbell-row', 'Dumbbell Row', 'back', ['biceps']),
  ex('meadows-row', 'Meadows Row', 'back', ['biceps']),
  ex('pull-up', 'Pull-Up', 'back', ['biceps']),
  ex('chin-up', 'Chin-Up', 'back', ['biceps']),
  ex('lat-pulldown', 'Lat Pulldown', 'back', ['biceps']),
  ex('seated-cable-row', 'Seated Cable Row', 'back', ['biceps']),
  ex('t-bar-row', 'T-Bar Row', 'back', ['biceps']),
  ex('chest-supported-row', 'Chest-Supported Row', 'back', ['biceps']),
  ex('machine-row', 'Machine Row', 'back', ['biceps']),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'back'),
  ex('rack-pull', 'Rack Pull', 'back', ['glutes', 'hamstrings']),
  ex('inverted-row', 'Inverted Row', 'back', ['biceps']),
  ex('back-extension', 'Back Extension', 'back', ['glutes', 'hamstrings']),
  // Shoulders
  ex('overhead-press', 'Overhead Press', 'shoulders', ['triceps']),
  ex('push-press', 'Push Press', 'shoulders', ['triceps']),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', ['triceps']),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', ['triceps']),
  ex('arnold-press', 'Arnold Press', 'shoulders', ['triceps']),
  ex('landmine-press', 'Landmine Press', 'shoulders', ['chest', 'triceps']),
  ex('lateral-raise', 'Lateral Raise', 'shoulders'),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders'),
  ex('front-raise', 'Front Raise', 'shoulders'),
  ex('rear-delt-fly', 'Rear Delt Fly', 'shoulders', ['back']),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'shoulders', ['back']),
  ex('face-pull', 'Face Pull', 'shoulders', ['back']),
  ex('upright-row', 'Upright Row', 'shoulders', ['biceps']),
  // Biceps
  ex('barbell-curl', 'Barbell Curl', 'biceps'),
  ex('ez-bar-curl', 'EZ-Bar Curl', 'biceps'),
  ex('dumbbell-curl', 'Dumbbell Curl', 'biceps'),
  ex('hammer-curl', 'Hammer Curl', 'biceps'),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'biceps'),
  ex('preacher-curl', 'Preacher Curl', 'biceps'),
  ex('cable-curl', 'Cable Curl', 'biceps'),
  ex('concentration-curl', 'Concentration Curl', 'biceps'),
  ex('machine-curl', 'Machine Curl', 'biceps'),
  // Triceps
  ex('triceps-pushdown', 'Triceps Pushdown', 'triceps'),
  ex('rope-pushdown', 'Rope Pushdown', 'triceps'),
  ex('overhead-triceps-extension', 'Overhead Triceps Extension', 'triceps'),
  ex('skull-crusher', 'Skull Crusher', 'triceps'),
  ex('close-grip-bench-press', 'Close-Grip Bench Press', 'triceps', ['chest']),
  ex('dumbbell-kickback', 'Dumbbell Kickback', 'triceps'),
  ex('bench-dip', 'Bench Dip', 'triceps', ['chest']),
  ex('machine-triceps-extension', 'Machine Triceps Extension', 'triceps'),
  // Quads
  ex('back-squat', 'Back Squat', 'quads', ['glutes', 'core']),
  ex('front-squat', 'Front Squat', 'quads', ['core']),
  ex('box-squat', 'Box Squat', 'quads', ['glutes']),
  ex('smith-machine-squat', 'Smith Machine Squat', 'quads', ['glutes']),
  ex('goblet-squat', 'Goblet Squat', 'quads', ['glutes']),
  ex('belt-squat', 'Belt Squat', 'quads', ['glutes']),
  ex('leg-press', 'Leg Press', 'quads', ['glutes']),
  ex('hack-squat', 'Hack Squat', 'quads', ['glutes']),
  ex('leg-extension', 'Leg Extension', 'quads'),
  ex('sissy-squat', 'Sissy Squat', 'quads'),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes']),
  ex('walking-lunge', 'Walking Lunge', 'quads', ['glutes']),
  ex('reverse-lunge', 'Reverse Lunge', 'quads', ['glutes']),
  ex('step-up', 'Step-Up', 'quads', ['glutes']),
  // Hamstrings
  ex('romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back']),
  ex('stiff-leg-deadlift', 'Stiff-Leg Deadlift', 'hamstrings', ['glutes', 'back']),
  ex('single-leg-rdl', 'Single-Leg Romanian Deadlift', 'hamstrings', ['glutes']),
  ex('lying-leg-curl', 'Lying Leg Curl', 'hamstrings'),
  ex('seated-leg-curl', 'Seated Leg Curl', 'hamstrings'),
  ex('nordic-curl', 'Nordic Curl', 'hamstrings'),
  ex('good-morning', 'Good Morning', 'hamstrings', ['back', 'glutes']),
  ex('glute-ham-raise', 'Glute-Ham Raise', 'hamstrings', ['glutes']),
  // Glutes
  ex('hip-thrust', 'Hip Thrust', 'glutes', ['hamstrings']),
  ex('barbell-glute-bridge', 'Barbell Glute Bridge', 'glutes', ['hamstrings']),
  ex('sumo-deadlift', 'Sumo Deadlift', 'glutes', ['hamstrings', 'back']),
  ex('cable-kickback', 'Cable Kickback', 'glutes'),
  ex('cable-pull-through', 'Cable Pull-Through', 'glutes', ['hamstrings']),
  ex('hip-abduction-machine', 'Hip Abduction Machine', 'glutes'),
  ex('kettlebell-swing', 'Kettlebell Swing', 'glutes', ['hamstrings', 'core']),
  // Calves
  ex('standing-calf-raise', 'Standing Calf Raise', 'calves'),
  ex('seated-calf-raise', 'Seated Calf Raise', 'calves'),
  ex('leg-press-calf-raise', 'Leg Press Calf Raise', 'calves'),
  ex('donkey-calf-raise', 'Donkey Calf Raise', 'calves'),
  // Core
  ex('plank', 'Plank', 'core'),
  ex('side-plank', 'Side Plank', 'core'),
  ex('cable-crunch', 'Cable Crunch', 'core'),
  ex('machine-crunch', 'Machine Crunch', 'core'),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'core'),
  ex('ab-wheel-rollout', 'Ab Wheel Rollout', 'core'),
  ex('russian-twist', 'Russian Twist', 'core'),
  ex('dead-bug', 'Dead Bug', 'core'),
  ex('bird-dog', 'Bird Dog', 'core'),
  ex('pallof-press', 'Pallof Press', 'core'),
  ex('decline-sit-up', 'Decline Sit-Up', 'core'),
  ex('farmers-carry', "Farmer's Carry", 'core', ['back']),
]

const LOWER: MuscleGroup[] = ['quads', 'hamstrings', 'glutes']
const BIG_LOWER = /Squat|Deadlift|Hip Thrust|Leg Press|Hack|Good Morning|Rack Pull/

/** Weight to add when a lift has stalled: 10 lb for big lower body lifts, 5 lb otherwise. */
export function suggestedIncrement(exercise: Exercise): 5 | 10 {
  if (LOWER.includes(exercise.primary) && BIG_LOWER.test(exercise.name)) return 10
  if (exercise.id === 'deadlift') return 10
  return 5
}
```

- [ ] **Step 4: Write src/library/cardioTypes.ts and src/library/bodyAreas.ts**

`src/library/cardioTypes.ts`:
```ts
/** First entry is the quick-add chip on the Today screen. */
export const BUILTIN_CARDIO_TYPES: string[] = [
  'Desk treadmill', 'Treadmill', 'Walk', 'Bike', 'Elliptical', 'Rower', 'Stairs', 'Swim', 'Other',
]
```

`src/library/bodyAreas.ts`:
```ts
import type { BodyArea } from '../domain/types'

export const BODY_AREAS: { id: BodyArea; label: string }[] = [
  { id: 'neck', label: 'Neck' },
  { id: 'shoulder_left', label: 'Left shoulder' },
  { id: 'shoulder_right', label: 'Right shoulder' },
  { id: 'elbow_left', label: 'Left elbow' },
  { id: 'elbow_right', label: 'Right elbow' },
  { id: 'wrist_left', label: 'Left wrist' },
  { id: 'wrist_right', label: 'Right wrist' },
  { id: 'upper_back', label: 'Upper back' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'hip_left', label: 'Left hip' },
  { id: 'hip_right', label: 'Right hip' },
  { id: 'knee_left', label: 'Left knee' },
  { id: 'knee_right', label: 'Right knee' },
  { id: 'ankle_left', label: 'Left ankle' },
  { id: 'ankle_right', label: 'Right ankle' },
  { id: 'other', label: 'Other' },
]

export function bodyAreaLabel(area: BodyArea): string {
  return BODY_AREAS.find((a) => a.id === area)?.label ?? area
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/library`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/library
git commit -m "Add built-in exercise library, cardio types and body areas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Dexie database, repository, and dataset snapshot

**Files:**
- Create: `src/data/db.ts`, `src/data/changes.ts`, `src/data/repo.ts`, `src/data/repo.test.ts`, `src/domain/validate.ts`, `src/data/snapshot.ts`, `src/data/snapshot.test.ts`

**Interfaces:**
- Consumes: types from Task 2, `BUILTIN_EXERCISES` from Task 3.
- Produces:
  - `db: MannpowerDB` with tables `exercises, workouts, days, pain, settings, meta`.
  - `onDataChange(cb: () => void): () => void`, `emitDataChange(): void`.
  - repo: `listExercises(): Promise<Exercise[]>` (built-in plus custom, sorted by name), `saveExercise(e)`, `deleteExercise(id)`, `exerciseHasSets(id): Promise<boolean>`, `listWorkouts(): Promise<Workout[]>` (date asc), `getWorkout(id)`, `getWorkoutByDate(date)`, `saveWorkout(w)`, `deleteWorkout(id)`, `listDays()`, `getDay(date)`, `saveDay(d)`, `listPain()`, `savePain(p)`, `deletePain(id)`, `getSettings(): Promise<Settings>`, `saveSettings(patch: Partial<Settings>)`, `getMeta(): Promise<Meta>`, `touchMeta(): Promise<void>`.
  - validate (in `src/domain/validate.ts`, no Dexie import so the Node report script can use it): `validateDataset(x: unknown): { ok: true; dataset: Dataset } | { ok: false; errors: string[] }`. Re-exported from snapshot.
  - snapshot: `exportDataset(): Promise<Dataset>`, `importDataset(d: Dataset, opts?: { stampNow?: boolean }): Promise<void>` (replaces all synced tables, keeps token and repo; `stampNow` sets meta.updatedAt to now and emits a change so a manual restore wins over the remote copy; sync pulls leave it false).

- [ ] **Step 1: Write src/data/db.ts and src/data/changes.ts**

`src/data/db.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'
import type { DayRecord, Exercise, Meta, PainEntry, Settings, Workout } from '../domain/types'

export class MannpowerDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  days!: EntityTable<DayRecord, 'date'>
  pain!: EntityTable<PainEntry, 'id'>
  settings!: EntityTable<Settings, 'id'>
  meta!: EntityTable<Meta, 'id'>

  constructor(name = 'mannpower') {
    super(name)
    this.version(1).stores({
      exercises: 'id, name',
      workouts: 'id, date',
      days: 'date',
      pain: 'id, date, workoutId, exerciseId',
      settings: 'id',
      meta: 'id',
    })
  }
}

export const db = new MannpowerDB()
```

`src/data/changes.ts`:
```ts
type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to local data writes. Returns an unsubscribe function. */
export function onDataChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function emitDataChange(): void {
  for (const cb of listeners) cb()
}
```

- [ ] **Step 2: Write the failing tests src/data/repo.test.ts**

```ts
import { db } from './db'
import { onDataChange } from './changes'
import {
  deleteExercise, deleteWorkout, exerciseHasSets, getDay, getMeta, getSettings, getWorkoutByDate,
  listExercises, listWorkouts, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listPain,
} from './repo'
import type { Workout } from '../domain/types'

function workout(date: string, exerciseId = 'back-squat'): Workout {
  return {
    id: `w-${date}`, date, withTrainer: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    entries: [{ id: 'e1', exerciseId, sets: [{ weight: 135, reps: 5, warmup: false }] }],
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('repo', () => {
  test('listExercises returns built-ins plus custom sorted by name', async () => {
    await saveExercise({ id: 'custom-1', name: 'Aardvark Press', primary: 'chest', secondary: [], custom: true })
    const all = await listExercises()
    expect(all[0].name).toBe('Aardvark Press')
    expect(all.some((e) => e.id === 'back-squat')).toBe(true)
  })

  test('deleteExercise refuses when the exercise has logged sets', async () => {
    await saveExercise({ id: 'custom-1', name: 'Thing', primary: 'chest', secondary: [], custom: true })
    await saveWorkout(workout('2026-09-08', 'custom-1'))
    expect(await exerciseHasSets('custom-1')).toBe(true)
    await expect(deleteExercise('custom-1')).rejects.toThrow(/logged sets/)
  })

  test('saveWorkout stamps updatedAt, touches meta, and emits a change', async () => {
    const before = (await getMeta()).updatedAt
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    const w = workout('2026-09-08')
    await saveWorkout(w)
    off()
    const saved = await getWorkoutByDate('2026-09-08')
    expect(saved?.id).toBe(w.id)
    expect(saved?.updatedAt).not.toBe(w.updatedAt)
    expect((await getMeta()).updatedAt > before).toBe(true)
    expect(seen).toHaveLength(1)
  })

  test('listWorkouts is sorted by date ascending and deleteWorkout removes', async () => {
    await saveWorkout(workout('2026-09-10'))
    await saveWorkout(workout('2026-09-08'))
    expect((await listWorkouts()).map((w) => w.date)).toEqual(['2026-09-08', '2026-09-10'])
    await deleteWorkout('w-2026-09-08')
    expect((await listWorkouts()).map((w) => w.date)).toEqual(['2026-09-10'])
  })

  test('saveDay upserts by date', async () => {
    await saveDay({ date: '2026-09-08', bodyWeight: 240, cardio: [], updatedAt: '' })
    await saveDay({ date: '2026-09-08', bodyWeight: 239, steps: 8000, cardio: [], updatedAt: '' })
    const d = await getDay('2026-09-08')
    expect(d?.bodyWeight).toBe(239)
    expect(d?.steps).toBe(8000)
  })

  test('settings default and patch', async () => {
    const s = await getSettings()
    expect(s.dataRepo).toBe('jmannella/mannpower-data')
    expect(s.defaultWithTrainer).toBe(true)
    await saveSettings({ dailyStepGoal: 10000 })
    expect((await getSettings()).dailyStepGoal).toBe(10000)
    expect((await getSettings()).dataRepo).toBe('jmannella/mannpower-data')
  })

  test('pain entries save and list', async () => {
    await savePain({ id: 'p1', date: '2026-09-08', area: 'lower_back', severity: 3, limited: true, createdAt: '' })
    expect((await listPain()).map((p) => p.id)).toEqual(['p1'])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/data/repo.test.ts`
Expected: FAIL, cannot find module './repo'.

- [ ] **Step 4: Write src/data/repo.ts**

```ts
import { db } from './db'
import { emitDataChange } from './changes'
import { nowISO } from '../domain/dates'
import { BUILTIN_EXERCISES } from '../library/exercises'
import {
  DEFAULT_SETTINGS, type DayRecord, type Exercise, type Meta, type PainEntry, type Settings, type Workout,
} from '../domain/types'

async function afterWrite(): Promise<void> {
  await touchMeta()
  emitDataChange()
}

// Exercises: built-ins live in code, only custom ones are stored.
export async function listExercises(): Promise<Exercise[]> {
  const custom = await db.exercises.toArray()
  return [...BUILTIN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveExercise(e: Exercise): Promise<void> {
  await db.exercises.put({ ...e, custom: true })
  await afterWrite()
}

export async function exerciseHasSets(exerciseId: string): Promise<boolean> {
  const workouts = await db.workouts.toArray()
  return workouts.some((w) => w.entries.some((en) => en.exerciseId === exerciseId && en.sets.length > 0))
}

export async function deleteExercise(id: string): Promise<void> {
  if (await exerciseHasSets(id)) throw new Error('This exercise has logged sets and cannot be deleted.')
  await db.exercises.delete(id)
  await afterWrite()
}

// Workouts
export async function listWorkouts(): Promise<Workout[]> {
  return db.workouts.orderBy('date').toArray()
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  return db.workouts.get(id)
}

export async function getWorkoutByDate(date: string): Promise<Workout | undefined> {
  return db.workouts.where('date').equals(date).first()
}

export async function saveWorkout(w: Workout): Promise<void> {
  await db.workouts.put({ ...w, updatedAt: nowISO() })
  await afterWrite()
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id)
  await afterWrite()
}

// Days
export async function listDays(): Promise<DayRecord[]> {
  return db.days.orderBy('date').toArray()
}

export async function getDay(date: string): Promise<DayRecord | undefined> {
  return db.days.get(date)
}

export async function saveDay(d: DayRecord): Promise<void> {
  await db.days.put({ ...d, updatedAt: nowISO() })
  await afterWrite()
}

// Pain
export async function listPain(): Promise<PainEntry[]> {
  return db.pain.orderBy('date').toArray()
}

export async function savePain(p: PainEntry): Promise<void> {
  await db.pain.put({ ...p, createdAt: p.createdAt || nowISO() })
  await afterWrite()
}

export async function deletePain(id: string): Promise<void> {
  await db.pain.delete(id)
  await afterWrite()
}

// Settings and meta
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}

/** Sync bookkeeping fields do not touch meta, so a status update never triggers another sync. */
const SYNC_ONLY_KEYS: (keyof Settings)[] = ['lastSyncedAt', 'lastSyncSha', 'syncStatus', 'lastSyncError', 'githubToken', 'dataRepo']

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
  const touchesData = Object.keys(patch).some((k) => !SYNC_ONLY_KEYS.includes(k as keyof Settings))
  if (touchesData) await afterWrite()
}

export async function getMeta(): Promise<Meta> {
  const m = await db.meta.get('meta')
  return m ?? { id: 'meta', schemaVersion: 1, updatedAt: '1970-01-01T00:00:00.000Z' }
}

export async function touchMeta(): Promise<void> {
  await db.meta.put({ id: 'meta', schemaVersion: 1, updatedAt: nowISO() })
}
```

- [ ] **Step 5: Run repo tests to verify they pass**

Run: `npx vitest run src/data/repo.test.ts`
Expected: 7 passed. If `saved?.updatedAt` equals the original because both were stamped in the same millisecond, the test setup value `2026-09-01` guarantees a difference; if `getMeta().updatedAt > before` fails, the meta default epoch guarantees a difference.

- [ ] **Step 6: Write the failing tests src/data/snapshot.test.ts**

```ts
import { db } from './db'
import { onDataChange } from './changes'
import { getSettings, saveDay, saveExercise, savePain, saveSettings, saveWorkout, listWorkouts, listExercises } from './repo'
import { exportDataset, importDataset, validateDataset } from './snapshot'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('snapshot', () => {
  test('exportDataset includes only custom exercises and synced settings', async () => {
    await saveExercise({ id: 'c1', name: 'Custom', primary: 'core', secondary: [], custom: true })
    await saveSettings({ githubToken: 'secret', dailyStepGoal: 9000 })
    await saveWorkout({ id: 'w1', date: '2026-09-08', withTrainer: false, entries: [], createdAt: '', updatedAt: '' })
    await saveDay({ date: '2026-09-08', steps: 5000, cardio: [], updatedAt: '' })
    await savePain({ id: 'p1', date: '2026-09-08', area: 'neck', severity: 2, limited: false, createdAt: '' })
    const ds = await exportDataset()
    expect(ds.meta.schemaVersion).toBe(1)
    expect(ds.exercises.map((e) => e.id)).toEqual(['c1'])
    expect(ds.workouts).toHaveLength(1)
    expect(ds.days).toHaveLength(1)
    expect(ds.pain).toHaveLength(1)
    expect(ds.settings.dailyStepGoal).toBe(9000)
    expect(JSON.stringify(ds)).not.toContain('secret')
  })

  test('validateDataset rejects junk and accepts an export', async () => {
    expect(validateDataset(null).ok).toBe(false)
    expect(validateDataset({ meta: { schemaVersion: 2 } }).ok).toBe(false)
    const bad = validateDataset({ meta: { schemaVersion: 1, updatedAt: 'x' }, exercises: 'nope', workouts: [], days: [], pain: [], settings: {} })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/exercises/)
    const ds = await exportDataset()
    expect(validateDataset(JSON.parse(JSON.stringify(ds))).ok).toBe(true)
  })

  test('importDataset replaces synced tables and keeps the token', async () => {
    await saveSettings({ githubToken: 'keep-me' })
    await saveWorkout({ id: 'old', date: '2026-01-01', withTrainer: true, entries: [], createdAt: '', updatedAt: '' })
    await importDataset({
      meta: { schemaVersion: 1, updatedAt: '2026-09-08T00:00:00.000Z' },
      exercises: [{ id: 'c9', name: 'Imported', primary: 'back', secondary: [], custom: true }],
      workouts: [{ id: 'new', date: '2026-09-08', withTrainer: false, entries: [], createdAt: '', updatedAt: '' }],
      days: [], pain: [],
      settings: { defaultWithTrainer: false, customCardioTypes: ['Hike'] },
    })
    expect((await listWorkouts()).map((w) => w.id)).toEqual(['new'])
    expect((await listExercises()).some((e) => e.id === 'c9')).toBe(true)
    const s = await getSettings()
    expect(s.githubToken).toBe('keep-me')
    expect(s.defaultWithTrainer).toBe(false)
    expect(s.customCardioTypes).toEqual(['Hike'])
    expect((await db.meta.get('meta'))?.updatedAt).toBe('2026-09-08T00:00:00.000Z')
  })

  test('importDataset with stampNow uses the current time and emits a change', async () => {
    const seen: number[] = []
    const off = onDataChange(() => seen.push(1))
    await importDataset({
      meta: { schemaVersion: 1, updatedAt: '2020-01-01T00:00:00.000Z' },
      exercises: [], workouts: [], days: [], pain: [],
      settings: { defaultWithTrainer: true, customCardioTypes: [] },
    }, { stampNow: true })
    off()
    expect((await db.meta.get('meta'))!.updatedAt > '2026-01-01').toBe(true)
    expect(seen).toHaveLength(1)
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run src/data/snapshot.test.ts`
Expected: FAIL, cannot find module './snapshot'.

- [ ] **Step 8: Write src/domain/validate.ts and src/data/snapshot.ts**

`src/domain/validate.ts` (pure, no database import):
```ts
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
    dailyStepGoal: ds.settings.dailyStepGoal,
    defaultWithTrainer: ds.settings.defaultWithTrainer ?? true,
    customCardioTypes: Array.isArray(ds.settings.customCardioTypes) ? ds.settings.customCardioTypes : [],
  }
  return { ok: true, dataset: { ...ds, settings } }
}
```

`src/data/snapshot.ts`:
```ts
import { db } from './db'
import { emitDataChange } from './changes'
import { getMeta, getSettings } from './repo'
import type { Dataset, SyncedSettings } from '../domain/types'

export { validateDataset } from '../domain/validate'

export async function exportDataset(): Promise<Dataset> {
  const [meta, exercises, workouts, days, pain, settings] = await Promise.all([
    getMeta(), db.exercises.toArray(), db.workouts.orderBy('date').toArray(),
    db.days.orderBy('date').toArray(), db.pain.orderBy('date').toArray(), getSettings(),
  ])
  const synced: SyncedSettings = {
    targetBodyWeight: settings.targetBodyWeight,
    dailyStepGoal: settings.dailyStepGoal,
    defaultWithTrainer: settings.defaultWithTrainer,
    customCardioTypes: settings.customCardioTypes,
  }
  return { meta: { schemaVersion: 1, updatedAt: meta.updatedAt }, exercises, workouts, days, pain, settings: synced }
}

/**
 * Replace every synced table with the dataset. Token and repo name on the phone are kept.
 * `stampNow` is for a manual restore from a backup file: meta gets the current time and a
 * change is emitted so the restored data is pushed. Sync pulls leave it false so the remote
 * timestamp is preserved and no push loop starts.
 */
export async function importDataset(ds: Dataset, opts: { stampNow?: boolean } = {}): Promise<void> {
  const updatedAt = opts.stampNow ? new Date().toISOString() : ds.meta.updatedAt
  await db.transaction('rw', [db.exercises, db.workouts, db.days, db.pain, db.settings, db.meta], async () => {
    await Promise.all([db.exercises.clear(), db.workouts.clear(), db.days.clear(), db.pain.clear()])
    await db.exercises.bulkPut(ds.exercises.map((e) => ({ ...e, custom: true })))
    await db.workouts.bulkPut(ds.workouts)
    await db.days.bulkPut(ds.days)
    await db.pain.bulkPut(ds.pain)
    const current = await getSettings()
    await db.settings.put({ ...current, ...ds.settings, id: 'settings' })
    await db.meta.put({ id: 'meta', schemaVersion: 1, updatedAt })
  })
  if (opts.stampNow) emitDataChange()
}
```

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: all pass (App smoke, dates, library, repo, snapshot).

- [ ] **Step 10: Commit**

```bash
git add src/data src/domain/validate.ts
git commit -m "Add Dexie database, repository functions and dataset snapshot

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: Set maths, exercise history, and PR detection

**Files:**
- Create: `src/stats/testData.ts` (test helpers, imported only by tests), `src/stats/sets.ts`, `src/stats/sets.test.ts`, `src/stats/prs.ts`, `src/stats/prs.test.ts`

**Interfaces:**
- Consumes: types from Task 2.
- Produces:
  - testData: `mkSet(weight, reps, warmup=false)`, `mkEntry(exerciseId, sets: [number, number][], warmups: [number, number][] = [])`, `mkWorkout(date, entries, opts?: { withTrainer?: boolean; id?: string })`, `mkDay(date, patch?: Partial<DayRecord>)`, `mkPain(date, area, severity, patch?)`.
  - sets: `workingSets(entry): SetRecord[]`, `setVolume(set): number`, `entryVolume(entry): number`, `workoutVolume(w): number`, `workoutWorkingSetCount(w): number`, `epley(weight, reps): number`, `entryE1rm(entry): number`, `entryTopWeight(entry): number`, `exerciseMap(exercises: Exercise[]): Map<string, Exercise>`.
  - prs: `ExerciseSession { date, workoutId, withTrainer, sets, bestE1rm, topWeight, volume }`, `exerciseHistory(workouts, exerciseId): ExerciseSession[]` (date ascending), `bestBefore(workouts, exerciseId, date): { e1rm: number; weight: number }`, `PR { exerciseId, kind: 'e1rm' | 'weight', previous, current }`, `prsForWorkout(workouts, workout): PR[]`.

- [ ] **Step 1: Write src/stats/testData.ts**

```ts
import type { BodyArea, DayRecord, PainEntry, SetRecord, Severity, Workout, WorkoutEntry } from '../domain/types'

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
```

- [ ] **Step 2: Write the failing tests src/stats/sets.test.ts**

```ts
import { mkEntry, mkWorkout } from './testData'
import { entryE1rm, entryTopWeight, entryVolume, epley, exerciseMap, workingSets, workoutVolume, workoutWorkingSetCount } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'

describe('sets', () => {
  const entry = mkEntry('back-squat', [[135, 10], [155, 8], [155, 6]], [[95, 10]])

  test('workingSets drops warm-ups and empty rows', () => {
    expect(workingSets(entry)).toHaveLength(3)
    expect(workingSets(mkEntry('x', [[135, 5], [0, 0], [135, 0]]))).toHaveLength(1)
  })

  test('volume ignores warm-ups', () => {
    expect(entryVolume(entry)).toBe(135 * 10 + 155 * 8 + 155 * 6)
    expect(workoutVolume(mkWorkout('2026-09-08', [entry, entry]))).toBe(2 * entryVolume(entry))
    expect(workoutWorkingSetCount(mkWorkout('2026-09-08', [entry]))).toBe(3)
  })

  test('epley formula', () => {
    expect(epley(100, 1)).toBe(100)
    expect(epley(100, 10)).toBeCloseTo(133.33, 2)
    expect(epley(0, 10)).toBe(0)
    expect(epley(100, 0)).toBe(0)
  })

  test('entryE1rm is the best working set and topWeight is the heaviest', () => {
    expect(entryE1rm(entry)).toBeCloseTo(epley(155, 8), 5)
    expect(entryTopWeight(entry)).toBe(155)
    expect(entryE1rm(mkEntry('x', [], [[95, 10]]))).toBe(0)
    expect(entryTopWeight(mkEntry('x', []))).toBe(0)
  })

  test('exerciseMap keys by id', () => {
    expect(exerciseMap(BUILTIN_EXERCISES).get('back-squat')?.name).toBe('Back Squat')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/stats/sets.test.ts`
Expected: FAIL, cannot find module './sets'.

- [ ] **Step 4: Write src/stats/sets.ts**

```ts
import type { Exercise, SetRecord, Workout, WorkoutEntry } from '../domain/types'

/** Sets that count: not a warm-up and at least one rep. A freshly added 0 x 0 row is ignored until filled in. */
export function workingSets(entry: WorkoutEntry): SetRecord[] {
  return entry.sets.filter((s) => !s.warmup && s.reps > 0)
}

export function setVolume(s: SetRecord): number {
  return s.weight * s.reps
}

export function entryVolume(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((sum, s) => sum + setVolume(s), 0)
}

export function workoutVolume(w: Workout): number {
  return w.entries.reduce((sum, e) => sum + entryVolume(e), 0)
}

export function workoutWorkingSetCount(w: Workout): number {
  return w.entries.reduce((n, e) => n + workingSets(e).length, 0)
}

/** Epley estimated one-rep max. */
export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function entryE1rm(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((best, s) => Math.max(best, epley(s.weight, s.reps)), 0)
}

export function entryTopWeight(entry: WorkoutEntry): number {
  return workingSets(entry).reduce((best, s) => Math.max(best, s.weight), 0)
}

export function exerciseMap(exercises: Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((e) => [e.id, e]))
}
```

- [ ] **Step 5: Run sets tests**

Run: `npx vitest run src/stats/sets.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Write the failing tests src/stats/prs.test.ts**

```ts
import { mkEntry, mkWorkout } from './testData'
import { bestBefore, exerciseHistory, prsForWorkout } from './prs'
import { epley } from './sets'

const w1 = mkWorkout('2026-09-01', [mkEntry('back-squat', [[135, 10], [135, 10]])])
const w2 = mkWorkout('2026-09-04', [mkEntry('back-squat', [[145, 8]]), mkEntry('leg-press', [[300, 12]])])
const w3 = mkWorkout('2026-09-08', [mkEntry('back-squat', [[145, 10]])])
const all = [w3, w1, w2]

describe('prs', () => {
  test('exerciseHistory is ascending and summarised', () => {
    const h = exerciseHistory(all, 'back-squat')
    expect(h.map((s) => s.date)).toEqual(['2026-09-01', '2026-09-04', '2026-09-08'])
    expect(h[0].topWeight).toBe(135)
    expect(h[0].volume).toBe(2700)
    expect(h[1].bestE1rm).toBeCloseTo(epley(145, 8), 5)
    expect(exerciseHistory(all, 'nothing')).toEqual([])
  })

  test('bestBefore looks strictly before the date', () => {
    expect(bestBefore(all, 'back-squat', '2026-09-04')).toEqual({ e1rm: epley(135, 10), weight: 135 })
    expect(bestBefore(all, 'back-squat', '2026-09-01')).toEqual({ e1rm: 0, weight: 0 })
  })

  test('prsForWorkout reports e1rm and weight PRs against prior history only', () => {
    expect(prsForWorkout(all, w1)).toEqual([]) // first ever session is not a PR
    const p2 = prsForWorkout(all, w2)
    expect(p2).toEqual([
      { exerciseId: 'back-squat', kind: 'e1rm', previous: epley(135, 10), current: epley(145, 8) },
      { exerciseId: 'back-squat', kind: 'weight', previous: 135, current: 145 },
    ])
    const p3 = prsForWorkout(all, w3)
    expect(p3).toEqual([{ exerciseId: 'back-squat', kind: 'e1rm', previous: epley(145, 8), current: epley(145, 10) }])
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run src/stats/prs.test.ts`
Expected: FAIL, cannot find module './prs'.

- [ ] **Step 8: Write src/stats/prs.ts**

```ts
import type { SetRecord, Workout } from '../domain/types'
import { entryE1rm, entryTopWeight, entryVolume, workingSets } from './sets'

export interface ExerciseSession {
  date: string
  workoutId: string
  withTrainer: boolean
  sets: SetRecord[]
  bestE1rm: number
  topWeight: number
  volume: number
}

export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue
      const sets = workingSets(e)
      if (sets.length === 0) continue
      out.push({
        date: w.date, workoutId: w.id, withTrainer: w.withTrainer, sets,
        bestE1rm: entryE1rm(e), topWeight: entryTopWeight(e), volume: entryVolume(e),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function bestBefore(workouts: Workout[], exerciseId: string, date: string): { e1rm: number; weight: number } {
  let e1rm = 0
  let weight = 0
  for (const s of exerciseHistory(workouts, exerciseId)) {
    if (s.date >= date) break
    e1rm = Math.max(e1rm, s.bestE1rm)
    weight = Math.max(weight, s.topWeight)
  }
  return { e1rm, weight }
}

export interface PR {
  exerciseId: string
  kind: 'e1rm' | 'weight'
  previous: number
  current: number
}

/** PRs set in this workout compared with every earlier workout. A first session is never a PR. */
export function prsForWorkout(workouts: Workout[], workout: Workout): PR[] {
  const out: PR[] = []
  for (const e of workout.entries) {
    const prior = bestBefore(workouts, e.exerciseId, workout.date)
    if (prior.e1rm === 0) continue
    const e1rm = entryE1rm(e)
    const top = entryTopWeight(e)
    if (e1rm > prior.e1rm) out.push({ exerciseId: e.exerciseId, kind: 'e1rm', previous: prior.e1rm, current: e1rm })
    if (top > prior.weight) out.push({ exerciseId: e.exerciseId, kind: 'weight', previous: prior.weight, current: top })
  }
  return out
}
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run src/stats`
Expected: 8 passed.

- [ ] **Step 10: Commit**

```bash
git add src/stats
git commit -m "Add set maths, exercise history and PR detection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Muscle group load and stalled lifts

**Files:**
- Create: `src/stats/muscle.ts`, `src/stats/muscle.test.ts`, `src/stats/stalled.ts`, `src/stats/stalled.test.ts`

**Interfaces:**
- Consumes: Task 5 sets functions, Task 2 dates, Task 3 `suggestedIncrement`.
- Produces:
  - muscle: `GroupLoad = Record<MuscleGroup, { sets: number; volume: number }>`, `emptyLoad(): GroupLoad`, `workoutMuscleLoad(w, exMap): GroupLoad`, `muscleLoadForRange(workouts, exMap, from, to): GroupLoad`, `weeklyMuscleLoad(workouts, exMap, weekStartDate): GroupLoad`, `underTrainedGroups(workouts, exMap, weekStartDate): MuscleGroup[]`, `weeklyMuscleSeries(workouts, exMap, fromWeekStart, toWeekStart): { week: string; load: GroupLoad }[]`.
  - stalled: `StalledLift { exerciseId, topWeight, increment: 5 | 10, lastDate }`, `stalledLifts(workouts, exMap, since): StalledLift[]`.

- [ ] **Step 1: Write the failing tests src/stats/muscle.test.ts**

```ts
import { mkEntry, mkWorkout } from './testData'
import { exerciseMap } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { muscleLoadForRange, underTrainedGroups, weeklyMuscleLoad, weeklyMuscleSeries, workoutMuscleLoad } from './muscle'

const exMap = exerciseMap(BUILTIN_EXERCISES)

describe('muscle load', () => {
  test('primary gets full credit, secondary gets half', () => {
    // Barbell bench: chest primary, triceps + shoulders secondary
    const w = mkWorkout('2026-09-08', [mkEntry('barbell-bench-press', [[135, 10], [135, 10]], [[95, 10]])])
    const load = workoutMuscleLoad(w, exMap)
    expect(load.chest).toEqual({ sets: 2, volume: 2700 })
    expect(load.triceps).toEqual({ sets: 1, volume: 1350 })
    expect(load.shoulders).toEqual({ sets: 1, volume: 1350 })
    expect(load.quads).toEqual({ sets: 0, volume: 0 })
  })

  test('unknown exercise ids are skipped', () => {
    const w = mkWorkout('2026-09-08', [mkEntry('deleted-custom', [[100, 10]])])
    expect(workoutMuscleLoad(w, exMap).chest.sets).toBe(0)
  })

  test('weekly load only counts the Monday to Sunday window', () => {
    const ws = [
      mkWorkout('2026-09-06', [mkEntry('leg-extension', [[100, 10]])]), // Sunday, previous week
      mkWorkout('2026-09-07', [mkEntry('leg-extension', [[100, 10]])]), // Monday
      mkWorkout('2026-09-13', [mkEntry('leg-extension', [[100, 10]])]), // Sunday
      mkWorkout('2026-09-14', [mkEntry('leg-extension', [[100, 10]])]), // next Monday
    ]
    expect(weeklyMuscleLoad(ws, exMap, '2026-09-07').quads.sets).toBe(2)
    expect(muscleLoadForRange(ws, exMap, '2026-09-06', '2026-09-14').quads.sets).toBe(4)
  })

  test('underTrainedGroups flags groups under 10 sets that were trained in the last four weeks', () => {
    const ws = [
      mkWorkout('2026-08-20', [mkEntry('lat-pulldown', [[100, 10]])]), // back, three weeks earlier
      mkWorkout('2026-09-08', [mkEntry('leg-extension', Array(10).fill([100, 10]) as [number, number][])]),
      mkWorkout('2026-09-09', [mkEntry('lateral-raise', [[20, 12], [20, 12]])]),
    ]
    const flagged = underTrainedGroups(ws, exMap, '2026-09-07')
    expect(flagged).toContain('back')       // trained recently, zero this week
    expect(flagged).toContain('shoulders')  // 2 sets this week
    expect(flagged).not.toContain('quads')  // 10 sets
    expect(flagged).not.toContain('chest')  // never trained
  })

  test('weeklyMuscleSeries returns one row per week', () => {
    const ws = [mkWorkout('2026-09-08', [mkEntry('leg-extension', [[100, 10]])])]
    const series = weeklyMuscleSeries(ws, exMap, '2026-08-31', '2026-09-14')
    expect(series.map((s) => s.week)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
    expect(series[1].load.quads.sets).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stats/muscle.test.ts`
Expected: FAIL, cannot find module './muscle'.

- [ ] **Step 3: Write src/stats/muscle.ts**

```ts
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup, type Workout } from '../domain/types'
import { addDays, inRange, weekEnd } from '../domain/dates'
import { setVolume, workingSets } from './sets'

export type GroupLoad = Record<MuscleGroup, { sets: number; volume: number }>

export function emptyLoad(): GroupLoad {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { sets: 0, volume: 0 }])) as GroupLoad
}

function addTo(load: GroupLoad, w: Workout, exMap: Map<string, Exercise>): void {
  for (const entry of w.entries) {
    const ex = exMap.get(entry.exerciseId)
    if (!ex) continue
    for (const s of workingSets(entry)) {
      const v = setVolume(s)
      load[ex.primary].sets += 1
      load[ex.primary].volume += v
      for (const g of ex.secondary) {
        load[g].sets += 0.5
        load[g].volume += v / 2
      }
    }
  }
}

export function workoutMuscleLoad(w: Workout, exMap: Map<string, Exercise>): GroupLoad {
  const load = emptyLoad()
  addTo(load, w, exMap)
  return load
}

export function muscleLoadForRange(workouts: Workout[], exMap: Map<string, Exercise>, from: string, to: string): GroupLoad {
  const load = emptyLoad()
  for (const w of workouts) if (inRange(w.date, from, to)) addTo(load, w, exMap)
  return load
}

export function weeklyMuscleLoad(workouts: Workout[], exMap: Map<string, Exercise>, weekStartDate: string): GroupLoad {
  return muscleLoadForRange(workouts, exMap, weekStartDate, weekEnd(weekStartDate))
}

export const MIN_WEEKLY_SETS = 10

/** Groups with fewer than 10 weighted sets this week that were trained at all in the trailing four weeks. */
export function underTrainedGroups(workouts: Workout[], exMap: Map<string, Exercise>, weekStartDate: string): MuscleGroup[] {
  const thisWeek = weeklyMuscleLoad(workouts, exMap, weekStartDate)
  const trailing = muscleLoadForRange(workouts, exMap, addDays(weekStartDate, -21), weekEnd(weekStartDate))
  return MUSCLE_GROUPS.filter((g) => trailing[g].sets > 0 && thisWeek[g].sets < MIN_WEEKLY_SETS)
}

export function weeklyMuscleSeries(
  workouts: Workout[], exMap: Map<string, Exercise>, fromWeekStart: string, toWeekStart: string,
): { week: string; load: GroupLoad }[] {
  const out: { week: string; load: GroupLoad }[] = []
  let week = fromWeekStart
  while (week <= toWeekStart) {
    out.push({ week, load: weeklyMuscleLoad(workouts, exMap, week) })
    week = addDays(week, 7)
  }
  return out
}
```

- [ ] **Step 4: Run muscle tests**

Run: `npx vitest run src/stats/muscle.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing tests src/stats/stalled.test.ts**

```ts
import { mkEntry, mkWorkout } from './testData'
import { exerciseMap } from './sets'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { stalledLifts } from './stalled'

const exMap = exerciseMap(BUILTIN_EXERCISES)

describe('stalledLifts', () => {
  test('flags a lift whose last two sessions used the same top weight and reps held or rose', () => {
    const ws = [
      mkWorkout('2026-09-01', [mkEntry('back-squat', [[185, 8], [185, 8], [185, 7]])]),
      mkWorkout('2026-09-05', [mkEntry('back-squat', [[185, 8], [185, 8], [185, 8]])]),
    ]
    expect(stalledLifts(ws, exMap, '2026-09-01')).toEqual([
      { exerciseId: 'back-squat', topWeight: 185, increment: 10, lastDate: '2026-09-05' },
    ])
  })

  test('does not flag when reps dropped, weight changed, or only one session exists', () => {
    const dropped = [
      mkWorkout('2026-09-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[30, 10]])]),
    ]
    const changed = [
      mkWorkout('2026-09-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[35, 12]])]),
    ]
    const single = [mkWorkout('2026-09-05', [mkEntry('dumbbell-curl', [[30, 12]])])]
    expect(stalledLifts(dropped, exMap, '2026-09-01')).toEqual([])
    expect(stalledLifts(changed, exMap, '2026-09-01')).toEqual([])
    expect(stalledLifts(single, exMap, '2026-09-01')).toEqual([])
  })

  test('ignores lifts whose last session is before since', () => {
    const ws = [
      mkWorkout('2026-08-01', [mkEntry('dumbbell-curl', [[30, 12]])]),
      mkWorkout('2026-08-05', [mkEntry('dumbbell-curl', [[30, 12]])]),
    ]
    expect(stalledLifts(ws, exMap, '2026-09-01')).toEqual([])
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/stats/stalled.test.ts`
Expected: FAIL, cannot find module './stalled'.

- [ ] **Step 7: Write src/stats/stalled.ts**

```ts
import type { Exercise, Workout } from '../domain/types'
import { suggestedIncrement } from '../library/exercises'
import { exerciseHistory } from './prs'

export interface StalledLift {
  exerciseId: string
  topWeight: number
  increment: 5 | 10
  lastDate: string
}

/**
 * An exercise is stalled when its last two sessions used the same top working weight
 * and every working set in the latest session matched or beat the previous session's reps.
 * Only exercises whose latest session is on or after `since` are considered.
 */
export function stalledLifts(workouts: Workout[], exMap: Map<string, Exercise>, since: string): StalledLift[] {
  const ids = new Set<string>()
  for (const w of workouts) for (const e of w.entries) ids.add(e.exerciseId)
  const out: StalledLift[] = []
  for (const id of ids) {
    const ex = exMap.get(id)
    if (!ex) continue
    const history = exerciseHistory(workouts, id)
    if (history.length < 2) continue
    const last = history[history.length - 1]
    const prev = history[history.length - 2]
    if (last.date < since) continue
    if (last.topWeight !== prev.topWeight || last.topWeight <= 0) continue
    if (last.sets.length < prev.sets.length) continue
    const held = prev.sets.every((p, i) => last.sets[i].reps >= p.reps)
    if (!held) continue
    out.push({ exerciseId: id, topWeight: last.topWeight, increment: suggestedIncrement(ex), lastDate: last.date })
  }
  return out.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
}
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/stats`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/stats
git commit -m "Add muscle group load, under-trained groups and stalled lift detection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Body weight, activity, and trainer comparison

**Files:**
- Create: `src/stats/bodyweight.ts`, `src/stats/bodyweight.test.ts`, `src/stats/activity.ts`, `src/stats/activity.test.ts`, `src/stats/trainer.ts`, `src/stats/trainer.test.ts`

**Interfaces:**
- Produces:
  - bodyweight: `bodyWeightAvg7(days, date): number | undefined`, `WeeklyWeightChange { thisWeek?, lastWeek?, changeLbs?, changePct? }`, `weeklyBodyWeightChange(days, weekStartDate): WeeklyWeightChange`, `LossBand = 'in_band' | 'too_fast' | 'too_slow' | 'gaining' | 'unknown'`, `lossBandStatus(changePct?): LossBand`, `relativeStrength(e1rm, bodyWeight?): number | undefined`, `bodyWeightSeries(days, from, to): { date; weight?; avg7? }[]`, `latestBodyWeight(days): { date; weight } | undefined`.
  - activity: `StepsSummary { total, mean?, daysLogged, daysAtGoal, bestDay? }`, `stepsSummary(days, from, to, goal?)`, `CardioSummary { minutes, sessions, byType }`, `cardioSummary(days, from, to)`, `dayCardioMinutes(day)`, `weeklyActivitySeries(days, fromWeekStart, toWeekStart, goal?)`.
  - trainer: `TrainerSplit { trainerCount, soloCount, trainerMeanVolume?, soloMeanVolume?, trainerMeanSets?, soloMeanSets?, soloKeepingPaceShare?, soloConsidered }`, `trainerSplit(workouts, from, to): TrainerSplit`.

- [ ] **Step 1: Write the failing tests src/stats/bodyweight.test.ts**

```ts
import { mkDay } from './testData'
import { bodyWeightAvg7, bodyWeightSeries, latestBodyWeight, lossBandStatus, relativeStrength, weeklyBodyWeightChange } from './bodyweight'

const days = [
  mkDay('2026-08-31', { bodyWeight: 250 }),
  mkDay('2026-09-01', { bodyWeight: 249 }),
  mkDay('2026-09-03', { bodyWeight: 248 }),
  mkDay('2026-09-07', { bodyWeight: 246 }),
  mkDay('2026-09-08', { bodyWeight: 245 }),
  mkDay('2026-09-10'), // logged steps only, no weight
]

describe('bodyweight', () => {
  test('bodyWeightAvg7 averages available entries in the trailing 7 days', () => {
    expect(bodyWeightAvg7(days, '2026-09-08')).toBeCloseTo((248 + 246 + 245) / 3, 5) // Sep 2 to Sep 8
    expect(bodyWeightAvg7(days, '2026-08-20')).toBeUndefined()
  })

  test('weeklyBodyWeightChange compares this week to last', () => {
    const c = weeklyBodyWeightChange(days, '2026-09-07')
    expect(c.lastWeek).toBeCloseTo((250 + 249 + 248) / 3, 5)
    expect(c.thisWeek).toBeCloseTo(245.5, 5)
    expect(c.changeLbs).toBeCloseTo(245.5 - 249, 5)
    expect(c.changePct).toBeCloseTo(((245.5 - 249) / 249) * 100, 5)
    expect(weeklyBodyWeightChange([], '2026-09-07')).toEqual({})
  })

  test('lossBandStatus', () => {
    expect(lossBandStatus(undefined)).toBe('unknown')
    expect(lossBandStatus(-0.7)).toBe('in_band')
    expect(lossBandStatus(-0.5)).toBe('in_band')
    expect(lossBandStatus(-1.0)).toBe('in_band')
    expect(lossBandStatus(-1.4)).toBe('too_fast')
    expect(lossBandStatus(-0.2)).toBe('too_slow')
    expect(lossBandStatus(0)).toBe('too_slow')
    expect(lossBandStatus(0.3)).toBe('gaining')
  })

  test('relativeStrength and latestBodyWeight', () => {
    expect(relativeStrength(300, 250)).toBeCloseTo(1.2, 5)
    expect(relativeStrength(300, undefined)).toBeUndefined()
    expect(latestBodyWeight(days)).toEqual({ date: '2026-09-08', weight: 245 })
    expect(latestBodyWeight([])).toBeUndefined()
  })

  test('bodyWeightSeries has one row per day with rolling average', () => {
    const s = bodyWeightSeries(days, '2026-09-07', '2026-09-09')
    expect(s.map((r) => r.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09'])
    expect(s[0].weight).toBe(246)
    expect(s[2].weight).toBeUndefined()
    expect(s[2].avg7).toBeCloseTo((248 + 246 + 245) / 3, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stats/bodyweight.test.ts`
Expected: FAIL, cannot find module './bodyweight'.

- [ ] **Step 3: Write src/stats/bodyweight.ts**

```ts
import type { DayRecord } from '../domain/types'
import { addDays, eachDay, inRange, weekEnd } from '../domain/dates'

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((a, b) => a + b, 0) / values.length
}

function weightsIn(days: DayRecord[], from: string, to: string): number[] {
  return days.filter((d) => d.bodyWeight !== undefined && inRange(d.date, from, to)).map((d) => d.bodyWeight as number)
}

export function bodyWeightAvg7(days: DayRecord[], date: string): number | undefined {
  return mean(weightsIn(days, addDays(date, -6), date))
}

export interface WeeklyWeightChange {
  thisWeek?: number
  lastWeek?: number
  changeLbs?: number
  changePct?: number
}

export function weeklyBodyWeightChange(days: DayRecord[], weekStartDate: string): WeeklyWeightChange {
  const thisWeek = mean(weightsIn(days, weekStartDate, weekEnd(weekStartDate)))
  const lastWeek = mean(weightsIn(days, addDays(weekStartDate, -7), addDays(weekStartDate, -1)))
  const out: WeeklyWeightChange = {}
  if (thisWeek !== undefined) out.thisWeek = thisWeek
  if (lastWeek !== undefined) out.lastWeek = lastWeek
  if (thisWeek !== undefined && lastWeek !== undefined) {
    out.changeLbs = thisWeek - lastWeek
    out.changePct = ((thisWeek - lastWeek) / lastWeek) * 100
  }
  return out
}

export type LossBand = 'in_band' | 'too_fast' | 'too_slow' | 'gaining' | 'unknown'

/** Healthy loss is 0.5 to 1.0 percent of body weight per week. Negative changePct means loss. */
export function lossBandStatus(changePct?: number): LossBand {
  if (changePct === undefined || Number.isNaN(changePct)) return 'unknown'
  if (changePct > 0) return 'gaining'
  if (changePct < -1.0) return 'too_fast'
  if (changePct <= -0.5) return 'in_band'
  return 'too_slow'
}

export function relativeStrength(e1rm: number, bodyWeight?: number): number | undefined {
  if (!bodyWeight || bodyWeight <= 0) return undefined
  return e1rm / bodyWeight
}

export function bodyWeightSeries(days: DayRecord[], from: string, to: string): { date: string; weight?: number; avg7?: number }[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  return eachDay(from, to).map((date) => ({
    date,
    weight: byDate.get(date)?.bodyWeight,
    avg7: bodyWeightAvg7(days, date),
  }))
}

export function latestBodyWeight(days: DayRecord[]): { date: string; weight: number } | undefined {
  const withWeight = days.filter((d) => d.bodyWeight !== undefined).sort((a, b) => a.date.localeCompare(b.date))
  const last = withWeight[withWeight.length - 1]
  return last ? { date: last.date, weight: last.bodyWeight as number } : undefined
}
```

- [ ] **Step 4: Run bodyweight tests**

Run: `npx vitest run src/stats/bodyweight.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Write the failing tests src/stats/activity.test.ts**

```ts
import { mkDay } from './testData'
import { cardioSummary, dayCardioMinutes, stepsSummary, weeklyActivitySeries } from './activity'

const desk = (id: string, minutes: number) => ({ id, type: 'Desk treadmill', minutes })
const days = [
  mkDay('2026-09-07', { steps: 12000, cardio: [desk('a', 20), desk('b', 25), desk('c', 15), desk('d', 30)] }),
  mkDay('2026-09-08', { steps: 6000, cardio: [{ id: 'e', type: 'Bike', minutes: 30, distance: 8 }] }),
  mkDay('2026-09-09', { bodyWeight: 240 }),
  mkDay('2026-09-15', { steps: 9000 }), // next week
]

describe('activity', () => {
  test('stepsSummary totals, mean, goal days, best day', () => {
    const s = stepsSummary(days, '2026-09-07', '2026-09-13', 10000)
    expect(s.total).toBe(18000)
    expect(s.mean).toBe(9000)
    expect(s.daysLogged).toBe(2)
    expect(s.daysAtGoal).toBe(1)
    expect(s.bestDay).toEqual({ date: '2026-09-07', steps: 12000 })
    expect(stepsSummary([], '2026-09-07', '2026-09-13')).toEqual({ total: 0, daysLogged: 0, daysAtGoal: 0 })
  })

  test('cardioSummary counts four desk treadmill sessions in one day', () => {
    const c = cardioSummary(days, '2026-09-07', '2026-09-13')
    expect(c.minutes).toBe(120)
    expect(c.sessions).toBe(5)
    expect(c.byType['Desk treadmill']).toEqual({ minutes: 90, sessions: 4 })
    expect(c.byType['Bike']).toEqual({ minutes: 30, sessions: 1 })
    expect(dayCardioMinutes(days[0])).toBe(90)
  })

  test('weeklyActivitySeries returns a row per week', () => {
    const s = weeklyActivitySeries(days, '2026-09-07', '2026-09-14', 10000)
    expect(s).toHaveLength(2)
    expect(s[0].steps.total).toBe(18000)
    expect(s[1].steps.total).toBe(9000)
    expect(s[1].cardio.minutes).toBe(0)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/stats/activity.test.ts`
Expected: FAIL, cannot find module './activity'.

- [ ] **Step 7: Write src/stats/activity.ts**

```ts
import type { DayRecord } from '../domain/types'
import { addDays, inRange, weekEnd } from '../domain/dates'

export interface StepsSummary {
  total: number
  mean?: number
  daysLogged: number
  daysAtGoal: number
  bestDay?: { date: string; steps: number }
}

export function stepsSummary(days: DayRecord[], from: string, to: string, goal?: number): StepsSummary {
  const logged = days.filter((d) => d.steps !== undefined && inRange(d.date, from, to))
  const out: StepsSummary = { total: 0, daysLogged: logged.length, daysAtGoal: 0 }
  for (const d of logged) {
    const steps = d.steps as number
    out.total += steps
    if (goal !== undefined && steps >= goal) out.daysAtGoal += 1
    if (!out.bestDay || steps > out.bestDay.steps) out.bestDay = { date: d.date, steps }
  }
  if (logged.length) out.mean = out.total / logged.length
  return out
}

export interface CardioSummary {
  minutes: number
  sessions: number
  byType: Record<string, { minutes: number; sessions: number }>
}

export function dayCardioMinutes(day: DayRecord): number {
  return day.cardio.reduce((sum, c) => sum + c.minutes, 0)
}

export function cardioSummary(days: DayRecord[], from: string, to: string): CardioSummary {
  const out: CardioSummary = { minutes: 0, sessions: 0, byType: {} }
  for (const d of days) {
    if (!inRange(d.date, from, to)) continue
    for (const c of d.cardio) {
      out.minutes += c.minutes
      out.sessions += 1
      const t = out.byType[c.type] ?? { minutes: 0, sessions: 0 }
      t.minutes += c.minutes
      t.sessions += 1
      out.byType[c.type] = t
    }
  }
  return out
}

export function weeklyActivitySeries(
  days: DayRecord[], fromWeekStart: string, toWeekStart: string, goal?: number,
): { week: string; steps: StepsSummary; cardio: CardioSummary }[] {
  const out: { week: string; steps: StepsSummary; cardio: CardioSummary }[] = []
  let week = fromWeekStart
  while (week <= toWeekStart) {
    out.push({ week, steps: stepsSummary(days, week, weekEnd(week), goal), cardio: cardioSummary(days, week, weekEnd(week)) })
    week = addDays(week, 7)
  }
  return out
}
```

- [ ] **Step 8: Run activity tests**

Run: `npx vitest run src/stats/activity.test.ts`
Expected: 3 passed.

- [ ] **Step 9: Write the failing tests src/stats/trainer.test.ts**

```ts
import { mkEntry, mkWorkout } from './testData'
import { trainerSplit } from './trainer'

describe('trainerSplit', () => {
  test('counts and means per mode', () => {
    const ws = [
      mkWorkout('2026-09-07', [mkEntry('back-squat', [[185, 8], [185, 8]])], { withTrainer: true }),      // 2960, 2 sets
      mkWorkout('2026-09-09', [mkEntry('back-squat', [[185, 8]]), mkEntry('leg-press', [[300, 10]])], { withTrainer: false }), // 4480, 2 sets
      mkWorkout('2026-09-11', [mkEntry('back-squat', [[135, 8]])], { withTrainer: false }),                // 1080, 1 set
    ]
    const s = trainerSplit(ws, '2026-09-07', '2026-09-13')
    expect(s.trainerCount).toBe(1)
    expect(s.soloCount).toBe(2)
    expect(s.trainerMeanVolume).toBe(2960)
    expect(s.soloMeanVolume).toBe((4480 + 1080) / 2)
    expect(s.trainerMeanSets).toBe(2)
    expect(s.soloMeanSets).toBe(1.5)
    // Solo 1: shared back-squat 1480 vs trainer 2960 -> 0.5, not keeping pace.
    // Solo 2: shared back-squat 1080 vs 2960 -> not keeping pace.
    expect(s.soloConsidered).toBe(2)
    expect(s.soloKeepingPaceShare).toBe(0)
  })

  test('solo session with no shared exercises or no prior trainer session is not considered', () => {
    const ws = [
      mkWorkout('2026-09-07', [mkEntry('lat-pulldown', [[100, 10]])], { withTrainer: false }),
      mkWorkout('2026-09-08', [mkEntry('back-squat', [[185, 8]])], { withTrainer: true }),
      mkWorkout('2026-09-10', [mkEntry('leg-press', [[300, 10]])], { withTrainer: false }),
      mkWorkout('2026-09-12', [mkEntry('back-squat', [[185, 8]])], { withTrainer: false }),
    ]
    const s = trainerSplit(ws, '2026-09-07', '2026-09-13')
    expect(s.soloConsidered).toBe(1)
    expect(s.soloKeepingPaceShare).toBe(1)
  })

  test('empty range', () => {
    const s = trainerSplit([], '2026-09-07', '2026-09-13')
    expect(s).toEqual({ trainerCount: 0, soloCount: 0, soloConsidered: 0 })
  })
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run src/stats/trainer.test.ts`
Expected: FAIL, cannot find module './trainer'.

- [ ] **Step 11: Write src/stats/trainer.ts**

```ts
import type { Workout } from '../domain/types'
import { inRange } from '../domain/dates'
import { entryVolume, workoutVolume, workoutWorkingSetCount } from './sets'

export interface TrainerSplit {
  trainerCount: number
  soloCount: number
  trainerMeanVolume?: number
  soloMeanVolume?: number
  trainerMeanSets?: number
  soloMeanSets?: number
  /** Share of considered solo sessions whose shared-exercise volume was at least 90% of the last trainer session. */
  soloKeepingPaceShare?: number
  soloConsidered: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

export function trainerSplit(workouts: Workout[], from: string, to: string): TrainerSplit {
  const sorted = [...workouts].sort((a, b) => a.date.localeCompare(b.date))
  const inWindow = sorted.filter((w) => inRange(w.date, from, to))
  const trainer = inWindow.filter((w) => w.withTrainer)
  const solo = inWindow.filter((w) => !w.withTrainer)

  const out: TrainerSplit = { trainerCount: trainer.length, soloCount: solo.length, soloConsidered: 0 }
  const tv = mean(trainer.map(workoutVolume))
  const sv = mean(solo.map(workoutVolume))
  const ts = mean(trainer.map(workoutWorkingSetCount))
  const ss = mean(solo.map(workoutWorkingSetCount))
  if (tv !== undefined) out.trainerMeanVolume = tv
  if (sv !== undefined) out.soloMeanVolume = sv
  if (ts !== undefined) out.trainerMeanSets = ts
  if (ss !== undefined) out.soloMeanSets = ss

  let kept = 0
  for (const s of solo) {
    const lastTrainer = [...sorted].reverse().find((w) => w.withTrainer && w.date < s.date)
    if (!lastTrainer) continue
    const shared = new Set(lastTrainer.entries.map((e) => e.exerciseId))
    const soloShared = s.entries.filter((e) => shared.has(e.exerciseId))
    if (soloShared.length === 0) continue
    const soloIds = new Set(soloShared.map((e) => e.exerciseId))
    const trainerVol = lastTrainer.entries.filter((e) => soloIds.has(e.exerciseId)).reduce((sum, e) => sum + entryVolume(e), 0)
    if (trainerVol <= 0) continue
    const soloVol = soloShared.reduce((sum, e) => sum + entryVolume(e), 0)
    out.soloConsidered += 1
    if (soloVol / trainerVol >= 0.9) kept += 1
  }
  if (out.soloConsidered > 0) out.soloKeepingPaceShare = kept / out.soloConsidered
  return out
}
```

- [ ] **Step 12: Run all stats tests**

Run: `npx vitest run src/stats`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/stats
git commit -m "Add body weight, steps, cardio and trainer versus solo stats

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Pain flare rate and patterns

**Files:**
- Create: `src/stats/pain.ts`, `src/stats/pain.test.ts`

**Interfaces:**
- Consumes: Task 5 sets, Task 2 dates.
- Produces: `flareRate(workouts, pain, exerciseId): { rate: number; flares: number; sessions: number }`, `ExerciseCoOccurrence { exerciseId, count, coRate, baseRate }`, `AreaPattern { area, count, limitedCount, lastDate, daysSinceLast, severityTrend: 'up' | 'down' | 'flat' | 'n/a', afterVolumeSpike, exercises: ExerciseCoOccurrence[] }`, `painPatterns(workouts, pain, asOf): AreaPattern[]`.

- [ ] **Step 1: Write the failing tests src/stats/pain.test.ts**

```ts
import { mkEntry, mkPain, mkWorkout } from './testData'
import { flareRate, painPatterns } from './pain'

const squat = () => mkEntry('back-squat', [[185, 8], [185, 8], [185, 8]])
const bench = () => mkEntry('barbell-bench-press', [[135, 8]])

describe('pain', () => {
  test('flareRate counts workouts with the exercise that have a linked pain entry', () => {
    const w1 = mkWorkout('2026-09-01', [squat()], { id: 'w1' })
    const w2 = mkWorkout('2026-09-03', [squat(), bench()], { id: 'w2' })
    const w3 = mkWorkout('2026-09-05', [bench()], { id: 'w3' })
    const pain = [
      mkPain('2026-09-01', 'lower_back', 3, { workoutId: 'w1', exerciseId: 'back-squat' }),
      mkPain('2026-09-03', 'lower_back', 2, { workoutId: 'w2' }), // not linked to an exercise
    ]
    expect(flareRate([w1, w2, w3], pain, 'back-squat')).toEqual({ rate: 0.5, flares: 1, sessions: 2 })
    expect(flareRate([w1, w2, w3], pain, 'barbell-bench-press')).toEqual({ rate: 0, flares: 0, sessions: 2 })
    expect(flareRate([], pain, 'back-squat')).toEqual({ rate: 0, flares: 0, sessions: 0 })
  })

  test('painPatterns ranks co-occurring exercises and tracks severity and spikes', () => {
    const workouts = [
      mkWorkout('2026-08-24', [bench()], { id: 'a' }),
      mkWorkout('2026-08-31', [squat(), bench()], { id: 'b' }),
      mkWorkout('2026-09-02', [squat()], { id: 'c' }),
      mkWorkout('2026-09-07', [squat(), squat(), squat()], { id: 'd' }), // big volume jump week of Sep 7
      mkWorkout('2026-09-09', [bench()], { id: 'e' }),
    ]
    const pain = [
      mkPain('2026-08-31', 'lower_back', 2, { workoutId: 'b' }),
      mkPain('2026-09-02', 'lower_back', 3, { workoutId: 'c', limited: true }),
      mkPain('2026-09-07', 'lower_back', 4, { workoutId: 'd' }),
      mkPain('2026-09-09', 'neck', 1), // only one entry, not reported
    ]
    const patterns = painPatterns(workouts, pain, '2026-09-13')
    expect(patterns).toHaveLength(1)
    const p = patterns[0]
    expect(p.area).toBe('lower_back')
    expect(p.count).toBe(3)
    expect(p.limitedCount).toBe(1)
    expect(p.lastDate).toBe('2026-09-07')
    expect(p.daysSinceLast).toBe(6)
    expect(p.severityTrend).toBe('up')
    expect(p.exercises[0].exerciseId).toBe('back-squat')
    expect(p.exercises[0].coRate).toBe(1)
    expect(p.exercises[0].baseRate).toBeCloseTo(3 / 5, 5)
    // All three entries fell in weeks whose volume was more than 20% above the week before.
    expect(p.afterVolumeSpike).toBe(3)
  })

  test('entry on a day with no workout still counts for the area', () => {
    const pain = [mkPain('2026-09-01', 'knee_left', 2), mkPain('2026-09-05', 'knee_left', 2)]
    const p = painPatterns([], pain, '2026-09-08')[0]
    expect(p.count).toBe(2)
    expect(p.exercises).toEqual([])
    expect(p.severityTrend).toBe('n/a')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stats/pain.test.ts`
Expected: FAIL, cannot find module './pain'.

- [ ] **Step 3: Write src/stats/pain.ts**

```ts
import type { BodyArea, PainEntry, Workout } from '../domain/types'
import { addDays, daysBetween, weekEnd, weekStart, inRange } from '../domain/dates'
import { workoutVolume } from './sets'

export function flareRate(workouts: Workout[], pain: PainEntry[], exerciseId: string): { rate: number; flares: number; sessions: number } {
  const sessions = workouts.filter((w) => w.entries.some((e) => e.exerciseId === exerciseId))
  const flares = sessions.filter((w) =>
    pain.some((p) => p.exerciseId === exerciseId && (p.workoutId === w.id || p.date === w.date)),
  ).length
  return { rate: sessions.length ? flares / sessions.length : 0, flares, sessions: sessions.length }
}

export interface ExerciseCoOccurrence {
  exerciseId: string
  count: number
  /** Share of this area's workout-day pain entries whose workout included the exercise. */
  coRate: number
  /** Share of all workouts that include the exercise. */
  baseRate: number
}

export interface AreaPattern {
  area: BodyArea
  count: number
  limitedCount: number
  lastDate: string
  daysSinceLast: number
  severityTrend: 'up' | 'down' | 'flat' | 'n/a'
  /** Entries that fell in a week whose volume was more than 20% above the previous week. */
  afterVolumeSpike: number
  exercises: ExerciseCoOccurrence[]
}

function workoutFor(entry: PainEntry, workouts: Workout[]): Workout | undefined {
  if (entry.workoutId) {
    const byId = workouts.find((w) => w.id === entry.workoutId)
    if (byId) return byId
  }
  return workouts.find((w) => w.date === entry.date)
}

function weekVolume(workouts: Workout[], weekStartDate: string): number {
  return workouts.filter((w) => inRange(w.date, weekStartDate, weekEnd(weekStartDate))).reduce((s, w) => s + workoutVolume(w), 0)
}

function severityTrend(entries: PainEntry[]): AreaPattern['severityTrend'] {
  const recent = entries.slice(-4)
  if (recent.length < 3) return 'n/a'
  const diff = recent[recent.length - 1].severity - recent[0].severity
  return diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
}

export function painPatterns(workouts: Workout[], pain: PainEntry[], asOf: string): AreaPattern[] {
  const byArea = new Map<BodyArea, PainEntry[]>()
  for (const p of [...pain].sort((a, b) => a.date.localeCompare(b.date))) {
    byArea.set(p.area, [...(byArea.get(p.area) ?? []), p])
  }
  const totalWorkouts = workouts.length
  const out: AreaPattern[] = []
  for (const [area, entries] of byArea) {
    if (entries.length < 2) continue
    const counts = new Map<string, number>()
    let withWorkout = 0
    let afterVolumeSpike = 0
    for (const p of entries) {
      const w = workoutFor(p, workouts)
      if (w) {
        withWorkout += 1
        for (const id of new Set(w.entries.map((e) => e.exerciseId))) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      const ws = weekStart(p.date)
      const prev = weekVolume(workouts, addDays(ws, -7))
      if (prev > 0 && weekVolume(workouts, ws) > prev * 1.2) afterVolumeSpike += 1
    }
    const exercises: ExerciseCoOccurrence[] = [...counts.entries()]
      .map(([exerciseId, count]) => ({
        exerciseId, count,
        coRate: withWorkout ? count / withWorkout : 0,
        baseRate: totalWorkouts ? workouts.filter((w) => w.entries.some((e) => e.exerciseId === exerciseId)).length / totalWorkouts : 0,
      }))
      .sort((a, b) => (b.coRate - b.baseRate) - (a.coRate - a.baseRate))
      .slice(0, 3)
    const last = entries[entries.length - 1]
    out.push({
      area, count: entries.length,
      limitedCount: entries.filter((p) => p.limited).length,
      lastDate: last.date,
      daysSinceLast: daysBetween(last.date, asOf),
      severityTrend: severityTrend(entries),
      afterVolumeSpike,
      exercises,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/stats/pain.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/stats
git commit -m "Add pain flare rate and body area pattern analysis

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Weekly digest

**Files:**
- Create: `src/stats/digest.ts`, `src/stats/digest.test.ts`

**Interfaces:**
- Consumes: everything in `src/stats/`, `BUILTIN_EXERCISES`, `bodyAreaLabel`.
- Produces: `Digest` (shape below), `weeklyDigest(ds: Dataset, weekEndDate: string): Digest`, `digestMarkdown(d: Digest): string`. The report script (Task 17) prints `digestMarkdown` and the JSON of the digest.

- [ ] **Step 1: Write the failing test src/stats/digest.test.ts**

```ts
import type { Dataset } from '../domain/types'
import { mkDay, mkEntry, mkPain, mkWorkout } from './testData'
import { digestMarkdown, weeklyDigest } from './digest'

function dataset(): Dataset {
  return {
    meta: { schemaVersion: 1, updatedAt: '2026-09-13T20:00:00.000Z' },
    exercises: [],
    workouts: [
      mkWorkout('2026-08-31', [mkEntry('back-squat', [[185, 8], [185, 8]])], { id: 'p1' }),
      mkWorkout('2026-09-02', [mkEntry('barbell-bench-press', [[135, 8]])], { id: 'p2' }),
      mkWorkout('2026-09-07', [mkEntry('back-squat', [[185, 8], [185, 8]]), mkEntry('lat-pulldown', [[120, 10]])], { id: 'a' }),
      mkWorkout('2026-09-09', [mkEntry('barbell-bench-press', [[145, 8]])], { id: 'b', withTrainer: false }),
      mkWorkout('2026-09-11', [mkEntry('lateral-raise', [[20, 12]])], { id: 'c' }),
    ],
    days: [
      mkDay('2026-09-01', { bodyWeight: 250, steps: 7000 }),
      mkDay('2026-09-03', { bodyWeight: 249 }),
      mkDay('2026-09-08', { bodyWeight: 247, steps: 11000, cardio: [{ id: 'x', type: 'Desk treadmill', minutes: 40 }] }),
      mkDay('2026-09-10', { bodyWeight: 246.5, steps: 8000, cardio: [{ id: 'y', type: 'Bike', minutes: 25 }] }),
    ],
    pain: [
      mkPain('2026-09-07', 'lower_back', 3, { workoutId: 'a', exerciseId: 'back-squat' }),
      mkPain('2026-08-31', 'lower_back', 2, { workoutId: 'p1' }),
    ],
    settings: { defaultWithTrainer: true, customCardioTypes: [], dailyStepGoal: 10000, targetBodyWeight: 220 },
  }
}

describe('weeklyDigest', () => {
  const d = weeklyDigest(dataset(), '2026-09-13')

  test('week window and workout counts', () => {
    expect(d.weekStart).toBe('2026-09-07')
    expect(d.weekEnd).toBe('2026-09-13')
    expect(d.workouts.count).toBe(3)
    expect(d.workouts.trainer).toBe(2)
    expect(d.workouts.solo).toBe(1)
    expect(d.workouts.volume).toBe(185 * 16 + 1200 + 145 * 8 + 240)
    expect(d.workouts.prevVolume).toBe(185 * 16 + 135 * 8)
    expect(d.workouts.volumeChangePct).toBeGreaterThan(0)
  })

  test('PRs carry exercise names', () => {
    expect(d.prs.map((p) => `${p.exerciseName}:${p.kind}`)).toEqual(['Barbell Bench Press:e1rm', 'Barbell Bench Press:weight'])
    expect(d.bestE1rmGain?.exerciseName).toBe('Barbell Bench Press')
  })

  test('body weight, steps, cardio', () => {
    expect(d.bodyWeight.thisWeek).toBeCloseTo(246.75, 5)
    expect(d.bodyWeight.lastWeek).toBeCloseTo(249.5, 5)
    expect(d.bodyWeight.band).toBe('too_fast')
    expect(d.bodyWeight.target).toBe(220)
    expect(d.steps.total).toBe(19000)
    expect(d.steps.goal).toBe(10000)
    expect(d.steps.daysAtGoal).toBe(1)
    expect(d.cardio.minutes).toBe(65)
    expect(d.cardio.deskTreadmillMinutes).toBe(40)
  })

  test('muscle, stalled, trainer, pain, streak', () => {
    expect(d.muscle.underTrained).toContain('chest')
    expect(d.stalled.map((s) => s.exerciseName)).toEqual(['Back Squat'])
    expect(d.stalled[0].increment).toBe(10)
    expect(d.trainer.soloCount).toBe(1)
    expect(d.pain.entriesThisWeek).toBe(1)
    expect(d.pain.patterns[0].areaLabel).toBe('Lower back')
    expect(d.pain.patterns[0].exercises[0].exerciseName).toBe('Back Squat')
    expect(d.streakWeeks).toBe(2)
  })

  test('digestMarkdown has the sections and a JSON block', () => {
    const md = digestMarkdown(d)
    expect(md).toContain('## Summary')
    expect(md).toContain('## Highlights')
    expect(md).toContain('## Muscle groups')
    expect(md).toContain('## Recommendation facts')
    expect(md).toContain('## Pain')
    expect(md).toContain('```json')
    expect(md).toContain('Back Squat')
  })

  test('empty dataset produces a digest with zeros', () => {
    const empty = weeklyDigest({ ...dataset(), workouts: [], days: [], pain: [] }, '2026-09-13')
    expect(empty.workouts.count).toBe(0)
    expect(empty.prs).toEqual([])
    expect(empty.bodyWeight.band).toBe('unknown')
    expect(empty.streakWeeks).toBe(0)
    expect(digestMarkdown(empty)).toContain('## Summary')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stats/digest.test.ts`
Expected: FAIL, cannot find module './digest'.

- [ ] **Step 3: Write src/stats/digest.ts**

```ts
import { MUSCLE_GROUPS, MUSCLE_LABELS, type Dataset, type MuscleGroup } from '../domain/types'
import { addDays, inRange, weekEnd, weekStart } from '../domain/dates'
import { BUILTIN_EXERCISES } from '../library/exercises'
import { bodyAreaLabel } from '../library/bodyAreas'
import { exerciseMap, workoutVolume, workoutWorkingSetCount } from './sets'
import { prsForWorkout, type PR } from './prs'
import { underTrainedGroups, weeklyMuscleLoad, type GroupLoad } from './muscle'
import { stalledLifts, type StalledLift } from './stalled'
import { lossBandStatus, weeklyBodyWeightChange, type LossBand, type WeeklyWeightChange } from './bodyweight'
import { cardioSummary, stepsSummary, type CardioSummary, type StepsSummary } from './activity'
import { trainerSplit, type TrainerSplit } from './trainer'
import { painPatterns, type AreaPattern } from './pain'

export interface Digest {
  weekStart: string
  weekEnd: string
  workouts: { count: number; trainer: number; solo: number; volume: number; prevVolume: number; volumeChangePct?: number; workingSets: number }
  prs: (PR & { exerciseName: string; date: string })[]
  bestE1rmGain?: { exerciseName: string; from: number; to: number; date: string }
  bodyWeight: WeeklyWeightChange & { band: LossBand; target?: number }
  steps: StepsSummary & { goal?: number }
  cardio: CardioSummary & { deskTreadmillMinutes: number }
  muscle: { load: GroupLoad; underTrained: MuscleGroup[] }
  stalled: (StalledLift & { exerciseName: string })[]
  trainer: TrainerSplit
  pain: {
    entriesThisWeek: number
    patterns: (Omit<AreaPattern, 'exercises'> & { areaLabel: string; exercises: (AreaPattern['exercises'][number] & { exerciseName: string })[] })[]
  }
  streakWeeks: number
}

export function weeklyDigest(ds: Dataset, weekEndDate: string): Digest {
  const end = weekEnd(weekEndDate)
  const start = weekStart(weekEndDate)
  const exMap = exerciseMap([...BUILTIN_EXERCISES, ...ds.exercises])
  const name = (id: string) => exMap.get(id)?.name ?? id
  const workouts = [...ds.workouts].sort((a, b) => a.date.localeCompare(b.date))
  const inWeek = workouts.filter((w) => inRange(w.date, start, end))
  const prevWeek = workouts.filter((w) => inRange(w.date, addDays(start, -7), addDays(start, -1)))

  const volume = inWeek.reduce((s, w) => s + workoutVolume(w), 0)
  const prevVolume = prevWeek.reduce((s, w) => s + workoutVolume(w), 0)

  const prs = inWeek.flatMap((w) => prsForWorkout(workouts, w).map((p) => ({ ...p, exerciseName: name(p.exerciseId), date: w.date })))
  const e1rmPrs = prs.filter((p) => p.kind === 'e1rm')
  const best = e1rmPrs.sort((a, b) => (b.current - b.previous) - (a.current - a.previous))[0]

  const bw = weeklyBodyWeightChange(ds.days, start)
  const cardio = cardioSummary(ds.days, start, end)

  const patterns = painPatterns(workouts, ds.pain, end).map((p) => ({
    ...p,
    areaLabel: bodyAreaLabel(p.area),
    exercises: p.exercises.map((e) => ({ ...e, exerciseName: name(e.exerciseId) })),
  }))

  let streakWeeks = 0
  for (let ws = start; ; ws = addDays(ws, -7)) {
    if (!workouts.some((w) => inRange(w.date, ws, weekEnd(ws)))) break
    streakWeeks += 1
    if (streakWeeks > 520) break
  }

  return {
    weekStart: start,
    weekEnd: end,
    workouts: {
      count: inWeek.length,
      trainer: inWeek.filter((w) => w.withTrainer).length,
      solo: inWeek.filter((w) => !w.withTrainer).length,
      volume, prevVolume,
      volumeChangePct: prevVolume > 0 ? ((volume - prevVolume) / prevVolume) * 100 : undefined,
      workingSets: inWeek.reduce((s, w) => s + workoutWorkingSetCount(w), 0),
    },
    prs,
    bestE1rmGain: best ? { exerciseName: best.exerciseName, from: best.previous, to: best.current, date: best.date } : undefined,
    bodyWeight: { ...bw, band: lossBandStatus(bw.changePct), target: ds.settings.targetBodyWeight },
    steps: { ...stepsSummary(ds.days, start, end, ds.settings.dailyStepGoal), goal: ds.settings.dailyStepGoal },
    cardio: { ...cardio, deskTreadmillMinutes: cardio.byType['Desk treadmill']?.minutes ?? 0 },
    muscle: { load: weeklyMuscleLoad(workouts, exMap, start), underTrained: underTrainedGroups(workouts, exMap, start) },
    stalled: stalledLifts(workouts, exMap, start).map((s) => ({ ...s, exerciseName: name(s.exerciseId) })),
    trainer: trainerSplit(workouts, start, end),
    pain: { entriesThisWeek: ds.pain.filter((p) => inRange(p.date, start, end)).length, patterns },
    streakWeeks,
  }
}

const n = (x: number | undefined, digits = 0) => (x === undefined ? 'n/a' : x.toFixed(digits))
const pct = (x: number | undefined) => (x === undefined ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`)

export function digestMarkdown(d: Digest): string {
  const lines: string[] = []
  lines.push(`# Mannpower weekly digest, ${d.weekStart} to ${d.weekEnd}`, '')
  lines.push('## Summary')
  lines.push(`- Workouts: ${d.workouts.count} (${d.workouts.trainer} with trainer, ${d.workouts.solo} solo), ${d.workouts.workingSets} working sets`)
  lines.push(`- Volume: ${n(d.workouts.volume)} lb, previous week ${n(d.workouts.prevVolume)} lb (${pct(d.workouts.volumeChangePct)})`)
  lines.push(`- Body weight: this week avg ${n(d.bodyWeight.thisWeek, 1)}, last week ${n(d.bodyWeight.lastWeek, 1)}, change ${n(d.bodyWeight.changeLbs, 1)} lb (${pct(d.bodyWeight.changePct)}), band: ${d.bodyWeight.band}, target ${n(d.bodyWeight.target)}`)
  lines.push(`- Steps: total ${n(d.steps.total)}, avg ${n(d.steps.mean)}, ${d.steps.daysLogged} days logged, ${d.steps.daysAtGoal} at goal (${n(d.steps.goal)})`)
  lines.push(`- Cardio: ${n(d.cardio.minutes)} min over ${d.cardio.sessions} sessions, desk treadmill ${n(d.cardio.deskTreadmillMinutes)} min`)
  lines.push(`- Streak: ${d.streakWeeks} consecutive weeks with a workout`, '')

  lines.push('## Highlights')
  if (d.prs.length === 0) lines.push('- No PRs this week')
  for (const p of d.prs) lines.push(`- PR ${p.exerciseName} ${p.kind === 'e1rm' ? 'estimated 1RM' : 'top weight'}: ${n(p.previous, 1)} to ${n(p.current, 1)} on ${p.date}`)
  if (d.bestE1rmGain) lines.push(`- Biggest strength gain: ${d.bestE1rmGain.exerciseName} ${n(d.bestE1rmGain.from, 1)} to ${n(d.bestE1rmGain.to, 1)}`)
  if (d.steps.bestDay) lines.push(`- Best step day: ${d.steps.bestDay.date} with ${d.steps.bestDay.steps}`)
  lines.push('')

  lines.push('## Muscle groups (weighted sets / volume this week)')
  for (const g of MUSCLE_GROUPS) {
    const l = d.muscle.load[g]
    if (l.sets > 0) lines.push(`- ${MUSCLE_LABELS[g]}: ${n(l.sets, 1)} sets, ${n(l.volume)} lb`)
  }
  lines.push(`- Under 10 sets but trained recently: ${d.muscle.underTrained.map((g) => MUSCLE_LABELS[g]).join(', ') || 'none'}`, '')

  lines.push('## Recommendation facts')
  for (const s of d.stalled) lines.push(`- Stalled: ${s.exerciseName} at ${s.topWeight} lb for two sessions, suggest +${s.increment} lb`)
  lines.push(`- Trainer sessions ${d.trainer.trainerCount}, solo ${d.trainer.soloCount}; mean volume trainer ${n(d.trainer.trainerMeanVolume)} vs solo ${n(d.trainer.soloMeanVolume)}; mean sets trainer ${n(d.trainer.trainerMeanSets, 1)} vs solo ${n(d.trainer.soloMeanSets, 1)}; solo keeping pace share ${d.trainer.soloKeepingPaceShare === undefined ? 'n/a' : pct(d.trainer.soloKeepingPaceShare * 100)}`)
  lines.push(`- Weight band: ${d.bodyWeight.band} (healthy loss is 0.5% to 1.0% per week)`)
  lines.push(`- Step goal days: ${d.steps.daysAtGoal} of ${d.steps.daysLogged} logged`)
  lines.push(`- Cardio sessions: ${d.cardio.sessions}`, '')

  lines.push('## Pain')
  if (d.pain.patterns.length === 0 && d.pain.entriesThisWeek === 0) lines.push('- No pain logged')
  else {
    lines.push(`- Entries this week: ${d.pain.entriesThisWeek}`)
    for (const p of d.pain.patterns) {
      const ex = p.exercises.map((e) => `${e.exerciseName} (${pct(e.coRate * 100)} of flares vs ${pct(e.baseRate * 100)} of all workouts)`).join('; ')
      lines.push(`- ${p.areaLabel}: ${p.count} entries, ${p.limitedCount} limiting, last ${p.lastDate} (${p.daysSinceLast} days ago), severity trend ${p.severityTrend}, ${p.afterVolumeSpike} after a volume spike. Co-occurring: ${ex || 'none'}`)
    }
  }
  lines.push('')
  lines.push('```json', JSON.stringify(d, null, 2), '```')
  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/stats/digest.test.ts`
Expected: 6 passed. If the streak test fails, check that `p1` (Aug 31) and `p2` (Sep 2) both fall in the week of Aug 31, giving a streak of two weeks (Aug 31 and Sep 7).

- [ ] **Step 5: Run all tests and commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/stats
git commit -m "Add weekly digest facts and markdown

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 10: GitHub sync client, engine, and auto sync

**Files:**
- Create: `src/sync/github.ts`, `src/sync/github.test.ts`, `src/sync/engine.ts`, `src/sync/engine.test.ts`, `src/sync/autoSync.ts`, `src/sync/autoSync.test.ts`, `src/sync/runSync.ts`

**Interfaces:**
- Consumes: `Dataset`, `SyncStatus`, `exportDataset`, `importDataset`, `validateDataset`, `getSettings`, `saveSettings`, `onDataChange`.
- Produces:
  - github: `SyncError`, `SyncAuthError`, `SyncConflictError` (all extend Error with optional `status`), `RemoteFile { content: string; sha: string }`, `class GitHubContents(token, repo, path = 'data.json', fetchFn = fetch)` with `get(): Promise<RemoteFile | null>` and `put(content: string, sha?: string): Promise<string>` returning the new SHA, plus `encodeBase64(s)` and `decodeBase64(b64)` helpers.
  - engine: `SyncDecision = 'push' | 'pull' | 'none'`, `decide(localUpdatedAt, remoteUpdatedAt | null): SyncDecision`, `SyncDeps { client, loadLocal, replaceLocal, getSha, setSha, setStatus }`, `syncOnce(deps): Promise<SyncDecision>`.
  - autoSync: `createAutoSync({ run, delayMs?, subscribe?, target? })` returning `{ schedule(), kick(): Promise<void>, stop() }`.
  - runSync: `runSync(): Promise<SyncDecision | 'skipped'>` wiring repo + settings into `syncOnce`. Settings screen calls this for "Sync now"; `main.tsx` feeds it to `createAutoSync`.

- [ ] **Step 1: Write the failing tests src/sync/github.test.ts**

```ts
import { GitHubContents, SyncAuthError, SyncConflictError, SyncError, decodeBase64, encodeBase64 } from './github'

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const r = responses.shift()!
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body } as Response
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('GitHubContents', () => {
  test('base64 round trips unicode', () => {
    expect(decodeBase64(encodeBase64('héllo ✓'))).toBe('héllo ✓')
    expect(decodeBase64('aGVs\nbG8=')).toBe('hello') // GitHub wraps lines
  })

  test('get returns decoded content and sha, null on 404', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { content: encodeBase64('{"a":1}'), sha: 'abc', encoding: 'base64' } },
      { status: 404 },
    ])
    const c = new GitHubContents('tok', 'jmannella/mannpower-data', 'data.json', fn)
    expect(await c.get()).toEqual({ content: '{"a":1}', sha: 'abc' })
    expect(await c.get()).toBeNull()
    expect(calls[0].url).toBe('https://api.github.com/repos/jmannella/mannpower-data/contents/data.json')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  test('put sends base64 content with sha and returns the new sha', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { content: { sha: 'new' } } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.put('{"a":2}', 'old')).toBe('new')
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.sha).toBe('old')
    expect(decodeBase64(body.content)).toBe('{"a":2}')
    expect(calls[0].init?.method).toBe('PUT')
  })

  test('maps status codes to error types', async () => {
    const { fn } = fakeFetch([{ status: 401 }, { status: 409 }, { status: 500 }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    await expect(c.get()).rejects.toBeInstanceOf(SyncAuthError)
    await expect(c.put('x')).rejects.toBeInstanceOf(SyncConflictError)
    await expect(c.put('x')).rejects.toBeInstanceOf(SyncError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sync/github.test.ts`
Expected: FAIL, cannot find module './github'.

- [ ] **Step 3: Write src/sync/github.ts**

```ts
export class SyncError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.status = status
  }
}
export class SyncAuthError extends SyncError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'SyncAuthError'
  }
}
export class SyncConflictError extends SyncError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'SyncConflictError'
  }
}

export function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export interface RemoteFile {
  content: string
  sha: string
}

export class GitHubContents {
  constructor(
    private token: string,
    private repo: string,
    private path: string = 'data.json',
    private fetchFn: typeof fetch = fetch,
  ) {}

  private url(): string {
    return `https://api.github.com/repos/${this.repo}/contents/${this.path}`
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private check(res: Response, verb: string): void {
    if (res.status === 401 || res.status === 403) throw new SyncAuthError(`GitHub rejected the token during ${verb} (${res.status}). Check the token in Settings.`, res.status)
    if (res.status === 409 || res.status === 422) throw new SyncConflictError(`GitHub reported a conflict during ${verb} (${res.status}).`, res.status)
    if (!res.ok) throw new SyncError(`GitHub ${verb} failed (${res.status}).`, res.status)
  }

  async get(): Promise<RemoteFile | null> {
    const res = await this.fetchFn(this.url(), { headers: this.headers() })
    if (res.status === 404) return null
    this.check(res, 'read')
    const body = (await res.json()) as { content: string; sha: string }
    return { content: decodeBase64(body.content), sha: body.sha }
  }

  async put(content: string, sha?: string): Promise<string> {
    const res = await this.fetchFn(this.url(), {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Mannpower sync', content: encodeBase64(content), ...(sha ? { sha } : {}) }),
    })
    this.check(res, 'write')
    const body = (await res.json()) as { content: { sha: string } }
    return body.content.sha
  }
}
```

- [ ] **Step 4: Run github tests**

Run: `npx vitest run src/sync/github.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the failing tests src/sync/engine.test.ts**

```ts
import type { Dataset, SyncStatus } from '../domain/types'
import { SyncConflictError, type GitHubContents, type RemoteFile } from './github'
import { decide, syncOnce, type SyncDeps } from './engine'

function ds(updatedAt: string, tag = ''): Dataset {
  return { meta: { schemaVersion: 1, updatedAt }, exercises: [], workouts: [], days: [], pain: [], settings: { defaultWithTrainer: true, customCardioTypes: [tag] } }
}

function fakeClient(remote: RemoteFile | null, putImpl?: (content: string, sha?: string) => Promise<string>) {
  const puts: { content: string; sha?: string }[] = []
  const client = {
    get: vi.fn(async () => remote),
    put: vi.fn(async (content: string, sha?: string) => {
      puts.push({ content, sha })
      return putImpl ? putImpl(content, sha) : 'sha-new'
    }),
  }
  return { client: client as unknown as GitHubContents, puts }
}

function deps(local: Dataset, client: GitHubContents) {
  const state = { sha: undefined as string | undefined, status: [] as [SyncStatus, string | undefined][], replaced: undefined as Dataset | undefined }
  const d: SyncDeps = {
    client,
    loadLocal: async () => local,
    replaceLocal: async (x) => { state.replaced = x },
    getSha: async () => state.sha,
    setSha: async (sha) => { state.sha = sha },
    setStatus: async (status, error) => { state.status.push([status, error]) },
  }
  return { d, state }
}

describe('decide', () => {
  test('push when remote missing or older, pull when newer, none when equal', () => {
    expect(decide('2026-09-08T10:00:00.000Z', null)).toBe('push')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T09:00:00.000Z')).toBe('push')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T11:00:00.000Z')).toBe('pull')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z')).toBe('none')
  })
})

describe('syncOnce', () => {
  test('pushes when remote is missing', async () => {
    const { client, puts } = fakeClient(null)
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('push')
    expect(puts).toHaveLength(1)
    expect(puts[0].sha).toBeUndefined()
    expect(state.sha).toBe('sha-new')
    expect(state.status.at(-1)).toEqual(['synced', undefined])
  })

  test('pulls when remote is newer and keeps the remote sha', async () => {
    const remote = ds('2026-09-08T12:00:00.000Z', 'remote')
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('pull')
    expect(puts).toHaveLength(0)
    expect(state.replaced?.settings.customCardioTypes).toEqual(['remote'])
    expect(state.sha).toBe('r1')
  })

  test('does nothing when equal', async () => {
    const remote = ds('2026-09-08T10:00:00.000Z')
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('none')
    expect(puts).toHaveLength(0)
    expect(state.replaced).toBeUndefined()
    expect(state.status.at(-1)?.[0]).toBe('synced')
  })

  test('retries a push once with a fresh sha after a conflict', async () => {
    let first = true
    const { client, puts } = fakeClient({ content: JSON.stringify(ds('2026-09-08T09:00:00.000Z')), sha: 'r1' }, async () => {
      if (first) { first = false; throw new SyncConflictError('conflict', 409) }
      return 'sha-after-retry'
    })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('push')
    expect(puts).toHaveLength(2)
    expect(state.sha).toBe('sha-after-retry')
  })

  test('records an error status and rethrows on failure', async () => {
    const { client } = fakeClient({ content: 'not json', sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    await expect(syncOnce(d)).rejects.toThrow()
    expect(state.status.at(-1)?.[0]).toBe('error')
    expect(state.status.at(-1)?.[1]).toBeTruthy()
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: FAIL, cannot find module './engine'.

- [ ] **Step 7: Write src/sync/engine.ts**

```ts
import type { Dataset, SyncStatus } from '../domain/types'
import { validateDataset } from '../domain/validate'
import { GitHubContents, SyncConflictError, SyncError } from './github'

export type SyncDecision = 'push' | 'pull' | 'none'

/** ISO timestamps compare correctly as strings. Missing remote means first push. */
export function decide(localUpdatedAt: string, remoteUpdatedAt: string | null): SyncDecision {
  if (remoteUpdatedAt === null) return 'push'
  if (remoteUpdatedAt > localUpdatedAt) return 'pull'
  if (localUpdatedAt > remoteUpdatedAt) return 'push'
  return 'none'
}

export interface SyncDeps {
  client: GitHubContents
  loadLocal(): Promise<Dataset>
  replaceLocal(ds: Dataset): Promise<void>
  getSha(): Promise<string | undefined>
  setSha(sha: string): Promise<void>
  setStatus(status: SyncStatus, error?: string): Promise<void>
}

async function pushWithRetry(deps: SyncDeps, local: Dataset, sha: string | undefined): Promise<string> {
  const json = JSON.stringify(local, null, 2)
  try {
    return await deps.client.put(json, sha)
  } catch (err) {
    if (!(err instanceof SyncConflictError)) throw err
    const fresh = await deps.client.get()
    return deps.client.put(json, fresh?.sha)
  }
}

export async function syncOnce(deps: SyncDeps): Promise<SyncDecision> {
  try {
    const local = await deps.loadLocal()
    const remote = await deps.client.get()
    let remoteDs: Dataset | null = null
    if (remote) {
      let parsed: unknown
      try {
        parsed = JSON.parse(remote.content)
      } catch {
        throw new SyncError('Remote data.json is not valid JSON.')
      }
      const v = validateDataset(parsed)
      if (!v.ok) throw new SyncError(`Remote data.json failed validation: ${v.errors[0]}`)
      remoteDs = v.dataset
    }
    const decision = decide(local.meta.updatedAt, remoteDs?.meta.updatedAt ?? null)
    if (decision === 'pull' && remoteDs && remote) {
      await deps.replaceLocal(remoteDs)
      await deps.setSha(remote.sha)
    } else if (decision === 'push') {
      const sha = await pushWithRetry(deps, local, remote?.sha ?? (await deps.getSha()))
      await deps.setSha(sha)
    } else if (remote) {
      await deps.setSha(remote.sha)
    }
    await deps.setStatus('synced')
    return decision
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.setStatus('error', message)
    throw err
  }
}
```

- [ ] **Step 8: Run engine tests**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: 6 passed.

- [ ] **Step 9: Write the failing tests src/sync/autoSync.test.ts**

```ts
import { createAutoSync } from './autoSync'

describe('createAutoSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('debounces several changes into one run', async () => {
    const run = vi.fn(async () => {})
    let trigger: () => void = () => {}
    const auto = createAutoSync({ run, delayMs: 5000, subscribe: (cb) => { trigger = cb; return () => {} }, target: new EventTarget() })
    trigger(); trigger(); trigger()
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4999)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    auto.stop()
  })

  test('a change during a run queues one more run', async () => {
    let resolveFirst: () => void = () => {}
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r }))
      .mockImplementation(async () => {})
    let trigger: () => void = () => {}
    const auto = createAutoSync({ run, delayMs: 10, subscribe: (cb) => { trigger = cb; return () => {} }, target: new EventTarget() })
    trigger()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1)
    trigger()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1) // still running
    resolveFirst()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(2)
    auto.stop()
  })

  test('online event kicks a run and run errors are swallowed', async () => {
    const run = vi.fn(async () => { throw new Error('boom') })
    const target = new EventTarget()
    const auto = createAutoSync({ run, delayMs: 10, subscribe: () => () => {}, target })
    target.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)
    auto.stop()
  })
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run src/sync/autoSync.test.ts`
Expected: FAIL, cannot find module './autoSync'.

- [ ] **Step 11: Write src/sync/autoSync.ts and src/sync/runSync.ts**

`src/sync/autoSync.ts`:
```ts
import { onDataChange } from '../data/changes'

export interface AutoSyncOptions {
  run: () => Promise<unknown>
  delayMs?: number
  subscribe?: (cb: () => void) => () => void
  target?: EventTarget
}

export interface AutoSync {
  schedule(): void
  kick(): Promise<void>
  stop(): void
}

/** Debounce data changes into a sync run, run again if changes arrived mid-run, and run on reconnect. */
export function createAutoSync({ run, delayMs = 5000, subscribe = onDataChange, target }: AutoSyncOptions): AutoSync {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let queued = false

  const kick = async (): Promise<void> => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      await run()
    } catch {
      // Status is recorded by the engine. Never surface here.
    } finally {
      running = false
      if (queued) {
        queued = false
        schedule()
      }
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; void kick() }, delayMs)
  }

  const unsubscribe = subscribe(schedule)
  const onOnline = (): void => { void kick() }
  eventTarget?.addEventListener('online', onOnline)

  return {
    schedule,
    kick,
    stop() {
      if (timer) clearTimeout(timer)
      unsubscribe()
      eventTarget?.removeEventListener('online', onOnline)
    },
  }
}
```

`src/sync/runSync.ts`:
```ts
import { getSettings, saveSettings } from '../data/repo'
import { exportDataset, importDataset } from '../data/snapshot'
import { GitHubContents } from './github'
import { syncOnce, type SyncDecision } from './engine'

/** One full sync using the phone's settings. Returns 'skipped' when no token is configured. */
export async function runSync(): Promise<SyncDecision | 'skipped'> {
  const settings = await getSettings()
  if (!settings.githubToken || !settings.dataRepo) {
    if (settings.syncStatus !== 'not_set_up') await saveSettings({ syncStatus: 'not_set_up' })
    return 'skipped'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await saveSettings({ syncStatus: 'pending', lastSyncError: 'Offline. Will retry when back online.' })
    return 'skipped'
  }
  const client = new GitHubContents(settings.githubToken, settings.dataRepo)
  return syncOnce({
    client,
    loadLocal: exportDataset,
    replaceLocal: (ds) => importDataset(ds),
    getSha: async () => (await getSettings()).lastSyncSha,
    setSha: (sha) => saveSettings({ lastSyncSha: sha }),
    setStatus: (status, error) =>
      saveSettings({ syncStatus: status, lastSyncError: error, ...(status === 'synced' ? { lastSyncedAt: new Date().toISOString() } : {}) }),
  })
}
```

- [ ] **Step 12: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/sync
git commit -m "Add GitHub Contents sync client, timestamp merge engine and auto sync

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: App shell, theme, shared components, PWA

**Files:**
- Create: `src/styles/theme.css`, `src/ui/components/TabBar.tsx`, `src/ui/components/Header.tsx`, `src/ui/components/Sheet.tsx`, `src/ui/components/NumberField.tsx`, `src/ui/components/NumberField.test.tsx`, `src/ui/components/Chip.tsx`, `src/ui/components/BigNumber.tsx`, `src/ui/components/Section.tsx`, `src/ui/hooks.ts`, `src/ui/screens/Today.tsx` (stub), `src/ui/screens/Workout.tsx` (stub), `src/ui/screens/History.tsx` (stub), `src/ui/screens/ExerciseHistory.tsx` (stub), `src/ui/screens/Trends.tsx` (stub), `src/ui/screens/Settings.tsx` (stub), `public/icons/icon.svg`, `scripts/icons.mjs`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, `src/vite-env.d.ts`, `vite.config.ts`

**Interfaces:**
- Produces:
  - Components: `TabBar()`, `Header({ title, right? })`, `Sheet({ open, onClose, title?, children })`, `NumberField({ label?, value?, onCommit(v?: number), placeholder?, suffix?, step?, allowDecimal?, autoFocus?, big? })`, `Chip({ on?, onClick, children })`, `BigNumber({ value, unit?, label })`, `Section({ title, right?, children })`.
  - Hooks: `useSettings()`, `useExercises()`, `useWorkouts()`, `useDays()`, `usePain()`, `useDay(date)`, `useWorkoutByDate(date)`.
  - Routes: `/` Today, `/workout/:date` Workout, `/history` History, `/exercise/:id` ExerciseHistory, `/trends` Trends, `/settings` Settings. `/workout` redirects to today's date.
  - CSS class names used by every screen: `.screen .card .btn .btn-primary .btn-ghost .btn-danger .row .row-between .muted .input .field .field-label .chip .chip-on .chips .big-number .big-number-value .big-number-label .section .section-title .list .list-item .pill .pill-pr .pill-pain .pill-trainer .pill-solo .status-dot .status-synced .status-pending .status-error .status-not_set_up .sheet-backdrop .sheet .sheet-title .tabbar .tab .tab-on .header .wordmark .grid-2 .grid-3 .stack .divider .banner .banner-error .set-row .set-input .pr-pulse`.

- [ ] **Step 1: Write src/styles/theme.css**

```css
:root {
  --bg: #111114;
  --surface: #1b1b21;
  --surface-2: #26262e;
  --border: #2e2e38;
  --text: #f4f4f6;
  --muted: #9a9aa6;
  --accent: #ff5a1f;
  --accent-dim: #b23f14;
  --accent-soft: rgba(255, 90, 31, 0.16);
  --cyan: #22d3ee;
  --cyan-soft: rgba(34, 211, 238, 0.16);
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
  --radius: 14px;
  --tap: 48px;
  --font-display: 'Bebas Neue', 'Arial Narrow', Impact, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 16px; -webkit-tap-highlight-color: transparent; }
body { overscroll-behavior-y: contain; }
h1, h2, h3 { font-family: var(--font-display); font-weight: 400; letter-spacing: 0.04em; margin: 0; }
h1 { font-size: 34px; }
h2 { font-size: 26px; }
h3 { font-size: 20px; color: var(--muted); }
button, input, textarea, select { font: inherit; color: inherit; }
a { color: inherit; text-decoration: none; }

.app { min-height: 100dvh; display: flex; flex-direction: column; }
.screen { flex: 1; padding: 12px 16px calc(84px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; max-width: 640px; width: 100%; margin: 0 auto; }
.header { display: flex; align-items: center; justify-content: space-between; padding-top: env(safe-area-inset-top); }
.wordmark { font-family: var(--font-display); font-size: 30px; color: var(--accent); letter-spacing: 0.08em; text-transform: uppercase; }
.header .title { font-family: var(--font-display); font-size: 30px; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.stack { display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; align-items: center; gap: 10px; }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.muted { color: var(--muted); font-size: 14px; }
.divider { height: 1px; background: var(--border); margin: 4px 0; }

.btn { min-height: var(--tap); padding: 0 18px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-weight: 600; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.btn:active { transform: scale(0.98); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #111; font-family: var(--font-display); font-size: 22px; letter-spacing: 0.06em; }
.btn-ghost { background: transparent; }
.btn-danger { background: transparent; border-color: var(--red); color: var(--red); }
.btn-block { width: 100%; }
.btn-sm { min-height: 40px; padding: 0 12px; font-size: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.input { min-height: var(--tap); background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; color: var(--text); width: 100%; font-size: 18px; }
.input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.input-big { font-family: var(--font-display); font-size: 34px; text-align: center; min-height: 64px; }
textarea.input { padding: 12px 14px; min-height: 80px; resize: vertical; }
.input-suffix { position: relative; }
.input-suffix span { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 14px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: 14px; font-weight: 600; cursor: pointer; }
.chip-on { background: var(--accent); border-color: var(--accent); color: #111; }
.chip-cyan.chip-on { background: var(--cyan); border-color: var(--cyan); }

.big-number { display: flex; flex-direction: column; align-items: flex-start; }
.big-number-value { font-family: var(--font-display); font-size: 44px; line-height: 1; color: var(--text); }
.big-number-value small { font-size: 20px; color: var(--muted); margin-left: 4px; }
.big-number-label { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.big-number-accent .big-number-value { color: var(--accent); }
.big-number-cyan .big-number-value { color: var(--cyan); }

.section { display: flex; flex-direction: column; gap: 8px; }
.section-title { display: flex; align-items: baseline; justify-content: space-between; }
.list { display: flex; flex-direction: column; gap: 8px; }
.list-item { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: var(--tap); }

.pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.pill-pr { background: var(--accent); color: #111; }
.pill-pain { background: var(--red); color: #111; }
.pill-trainer { background: var(--cyan-soft); color: var(--cyan); }
.pill-solo { background: var(--surface-2); color: var(--muted); }

.status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.status-synced { background: var(--green); }
.status-pending { background: var(--yellow); }
.status-error { background: var(--red); }
.status-not_set_up { background: var(--muted); }

.banner { padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); color: var(--text); font-size: 14px; }
.banner-error { background: rgba(248, 113, 113, 0.16); }

.sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: flex-end; z-index: 50; }
.sheet { background: var(--surface); border-radius: 20px 20px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); width: 100%; max-width: 640px; margin: 0 auto; max-height: 88dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.sheet-title { font-family: var(--font-display); font-size: 26px; }

.tabbar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; background: var(--surface); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom); z-index: 40; }
.tab { flex: 1; min-height: 64px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.tab svg { width: 24px; height: 24px; }
.tab-on { color: var(--accent); }

.set-row { display: grid; grid-template-columns: 32px 1fr 1fr 56px 44px; gap: 8px; align-items: center; }
.set-row .set-index { color: var(--muted); font-family: var(--font-display); font-size: 20px; text-align: center; }
.set-input { min-height: var(--tap); text-align: center; font-family: var(--font-display); font-size: 26px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; color: var(--text); width: 100%; }
.set-input:focus { outline: 2px solid var(--accent); }
.warmup-toggle { min-height: var(--tap); border-radius: 12px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 12px; font-weight: 700; }
.warmup-toggle.on { color: var(--cyan); border-color: var(--cyan); }
.icon-btn { min-width: 44px; min-height: 44px; border-radius: 12px; border: none; background: transparent; color: var(--muted); font-size: 20px; cursor: pointer; }

@keyframes pr-pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 90, 31, 0.7); } 100% { box-shadow: 0 0 0 16px rgba(255, 90, 31, 0); } }
.pr-pulse { animation: pr-pulse 0.9s ease-out 2; }

.recharts-text { fill: var(--muted); font-size: 12px; }
.recharts-cartesian-grid line { stroke: var(--border); }
```

- [ ] **Step 2: Write the shared components**

`src/ui/components/TabBar.tsx`:
```tsx
import { NavLink } from 'react-router-dom'

const icons = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>,
  workout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10v4M21 10v4M6 8v8M18 8v8M6 12h12" /></svg>,
  history: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  trends: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
}

const tabs = [
  { to: '/', label: 'Today', icon: icons.today },
  { to: '/workout', label: 'Workout', icon: icons.workout },
  { to: '/history', label: 'History', icon: icons.history },
  { to: '/trends', label: 'Trends', icon: icons.trends },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => 'tab' + (isActive ? ' tab-on' : '')}>
          {t.icon}
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

`src/ui/components/Header.tsx`:
```tsx
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export function Header({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <header className="header">
      {title ? <div className="title">{title}</div> : <div className="wordmark">Mannpower</div>}
      <div className="row">
        {right}
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </Link>
      </div>
    </header>
  )
}
```

`src/ui/components/Sheet.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
```

`src/ui/components/NumberField.tsx`:
```tsx
import { useEffect, useState } from 'react'

interface Props {
  label?: string
  value?: number
  onCommit: (value?: number) => void
  placeholder?: string
  suffix?: string
  step?: number
  allowDecimal?: boolean
  autoFocus?: boolean
  big?: boolean
  className?: string
}

/** Numeric input that commits on blur or Enter. Blank clears. Invalid or negative input restores the previous value. */
export function NumberField({ label, value, onCommit, placeholder, suffix, step, allowDecimal = true, autoFocus, big, className }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => { setText(value === undefined ? '' : String(value)) }, [value])

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      if (value !== undefined) onCommit(undefined)
      return
    }
    const n = Number(trimmed)
    const valid = Number.isFinite(n) && n >= 0 && (allowDecimal || Number.isInteger(n))
    if (!valid) {
      setText(value === undefined ? '' : String(value))
      return
    }
    if (n !== value) onCommit(n)
  }

  const input = (
    <input
      className={`input ${big ? 'input-big' : ''} ${className ?? ''}`}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      type="text"
      value={text}
      placeholder={placeholder}
      step={step}
      autoFocus={autoFocus}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {suffix ? <div className="input-suffix">{input}<span>{suffix}</span></div> : input}
    </label>
  )
}
```

`src/ui/components/Chip.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Chip({ on, onClick, children, className }: { on?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`chip ${on ? 'chip-on' : ''} ${className ?? ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  )
}
```

`src/ui/components/BigNumber.tsx`:
```tsx
export function BigNumber({ value, unit, label, tone }: { value: string | number; unit?: string; label: string; tone?: 'accent' | 'cyan' }) {
  return (
    <div className={`big-number ${tone ? `big-number-${tone}` : ''}`}>
      <div className="big-number-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="big-number-label">{label}</div>
    </div>
  )
}
```

`src/ui/components/Section.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-title"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  )
}
```

- [ ] **Step 3: Write the failing test src/ui/components/NumberField.test.tsx**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberField } from './NumberField'

describe('NumberField', () => {
  test('commits a valid number on blur and restores on invalid', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Weight" value={240} onCommit={onCommit} />)
    const input = screen.getByLabelText('Weight') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '238.5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith(238.5)

    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('240')
  })

  test('blank commits undefined and integers only when allowDecimal is false', async () => {
    const onCommit = vi.fn()
    render(<NumberField label="Steps" value={5000} onCommit={onCommit} allowDecimal={false} />)
    const input = screen.getByLabelText('Steps') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith(undefined)
    await userEvent.type(input, '12.5')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/ui/components/NumberField.test.tsx`
Expected: 2 passed (the component was written in Step 2; this test confirms the commit rules).

- [ ] **Step 5: Write src/ui/hooks.ts**

```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { getDay, getSettings, getWorkoutByDate, listDays, listExercises, listPain, listWorkouts } from '../data/repo'

export function useSettings() {
  return useLiveQuery(() => getSettings(), [])
}
export function useExercises() {
  return useLiveQuery(() => listExercises(), []) ?? []
}
export function useWorkouts() {
  return useLiveQuery(() => listWorkouts(), []) ?? []
}
export function useDays() {
  return useLiveQuery(() => listDays(), []) ?? []
}
export function usePain() {
  return useLiveQuery(() => listPain(), []) ?? []
}
export function useDay(date: string) {
  return useLiveQuery(() => getDay(date), [date])
}
export function useWorkoutByDate(date: string) {
  return useLiveQuery(() => getWorkoutByDate(date), [date])
}
```

- [ ] **Step 6: Write the screen stubs**

Each of these files is replaced entirely in a later task. `src/ui/screens/Today.tsx`:
```tsx
import { Header } from '../components/Header'
export default function Today() {
  return <div className="screen"><Header /><p className="muted">Today screen coming in Task 12.</p></div>
}
```

`src/ui/screens/Workout.tsx`:
```tsx
import { Header } from '../components/Header'
export default function Workout() {
  return <div className="screen"><Header title="Workout" /><p className="muted">Workout screen coming in Task 13.</p></div>
}
```

`src/ui/screens/History.tsx`:
```tsx
import { Header } from '../components/Header'
export default function History() {
  return <div className="screen"><Header title="History" /><p className="muted">History screen coming in Task 14.</p></div>
}
```

`src/ui/screens/ExerciseHistory.tsx`:
```tsx
import { Header } from '../components/Header'
export default function ExerciseHistory() {
  return <div className="screen"><Header title="Exercise" /><p className="muted">Exercise history coming in Task 14.</p></div>
}
```

`src/ui/screens/Trends.tsx`:
```tsx
import { Header } from '../components/Header'
export default function Trends() {
  return <div className="screen"><Header title="Trends" /><p className="muted">Trends coming in Task 15.</p></div>
}
```

`src/ui/screens/Settings.tsx`:
```tsx
import { Header } from '../components/Header'
export default function Settings() {
  return <div className="screen"><Header title="Settings" /><p className="muted">Settings coming in Task 16.</p></div>
}
```

- [ ] **Step 7: Rewrite src/App.tsx, src/App.test.tsx, src/main.tsx, src/vite-env.d.ts**

`src/App.tsx`:
```tsx
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/theme.css'
import { TabBar } from './ui/components/TabBar'
import { todayISO } from './domain/dates'
import Today from './ui/screens/Today'
import Workout from './ui/screens/Workout'
import History from './ui/screens/History'
import ExerciseHistory from './ui/screens/ExerciseHistory'
import Trends from './ui/screens/Trends'
import Settings from './ui/screens/Settings'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout" element={<Navigate to={`/workout/${todayISO()}`} replace />} />
          <Route path="/workout/:date" element={<Workout />} />
          <Route path="/history" element={<History />} />
          <Route path="/exercise/:id" element={<ExerciseHistory />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
  )
}
```

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the wordmark and the four tabs', () => {
  render(<App />)
  expect(screen.getByText('Mannpower')).toBeInTheDocument()
  for (const label of ['Today', 'Workout', 'History', 'Trends']) {
    expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
  }
})
```

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { createAutoSync } from './sync/autoSync'
import { runSync } from './sync/runSync'

registerSW({ immediate: true })

const auto = createAutoSync({ run: runSync })
void auto.kick()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```

- [ ] **Step 8: Add the PWA plugin to vite.config.ts**

Replace the file:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/mannpower/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Mannpower',
        short_name: 'Mannpower',
        description: 'Workout, weight, steps and pain tracker.',
        theme_color: '#111114',
        background_color: '#111114',
        display: 'standalone',
        start_url: '/mannpower/',
        scope: '/mannpower/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts-stylesheets' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'google-fonts-webfonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
})
```

- [ ] **Step 9: Write public/icons/icon.svg and scripts/icons.mjs, then generate PNGs**

`public/icons/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#111114"/>
  <path d="M96 400V112h64l96 150 96-150h64v288h-60V216l-100 152-100-152v184z" fill="#FF5A1F"/>
  <rect x="120" y="428" width="272" height="20" rx="10" fill="#22D3EE"/>
</svg>
```

`scripts/icons.mjs`:
```js
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url))
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  console.log(`wrote icon-${size}.png`)
}
```

Run: `npm run icons`
Expected: `public/icons/icon-192.png` and `public/icons/icon-512.png` exist. If the Windows path mangling in `toFile` fails, replace the argument with `\`public/icons/icon-${size}.png\`` (relative to the project root, which is the working directory when running npm scripts).

- [ ] **Step 10: Run tests and build**

Run: `npm test`
Expected: all pass.

Run: `npm run build`
Expected: `dist/` contains `sw.js`, `manifest.webmanifest`, `icons/`, and `index.html` referencing `/mannpower/assets/...`.

- [ ] **Step 11: Look at it**

Run: `npm run dev` (use the preview tool if available, otherwise open the printed URL in a browser at phone width, about 400 px). Expected: charcoal background, orange MANNPOWER wordmark, four tabs at the bottom, tab highlight in orange when tapped. Stop the dev server after checking.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "Add app shell, theme, shared components, router and PWA manifest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Pain sheet and Today screen

**Files:**
- Create: `src/ui/PainSheet.tsx`, `src/ui/screens/Today.test.tsx`
- Modify: `src/ui/screens/Today.tsx` (replace stub)

**Interfaces:**
- Consumes: hooks, repo, `Sheet`, `NumberField`, `Chip`, `BigNumber`, `Section`, `BODY_AREAS`, `BUILTIN_CARDIO_TYPES`, stats `bodyWeightAvg7`, `stepsSummary`, `dayCardioMinutes`, dates.
- Produces: `PainSheet({ open, onClose, date, workoutId?, exerciseId?, exerciseName? })` which saves a `PainEntry` and closes. Task 13 reuses it inside the Workout screen.

- [ ] **Step 1: Write src/ui/PainSheet.tsx**

```tsx
import { useState } from 'react'
import { Sheet } from './components/Sheet'
import { Chip } from './components/Chip'
import { BODY_AREAS } from '../library/bodyAreas'
import { savePain } from '../data/repo'
import { newId } from '../domain/ids'
import type { BodyArea, Severity } from '../domain/types'

interface Props {
  open: boolean
  onClose: () => void
  date: string
  workoutId?: string
  exerciseId?: string
  exerciseName?: string
}

export function PainSheet({ open, onClose, date, workoutId, exerciseId, exerciseName }: Props) {
  const [area, setArea] = useState<BodyArea | undefined>()
  const [severity, setSeverity] = useState<Severity | undefined>()
  const [limited, setLimited] = useState(false)
  const [note, setNote] = useState('')

  const reset = () => { setArea(undefined); setSeverity(undefined); setLimited(false); setNote('') }
  const close = () => { reset(); onClose() }

  const save = async () => {
    if (!area || !severity) return
    await savePain({ id: newId(), date, area, severity, limited, note: note.trim() || undefined, workoutId, exerciseId, createdAt: '' })
    close()
  }

  return (
    <Sheet open={open} onClose={close} title="Log pain">
      {exerciseName && <div className="muted">During {exerciseName}</div>}
      <div className="field">
        <span className="field-label">Where</span>
        <div className="chips">
          {BODY_AREAS.map((a) => (
            <Chip key={a.id} on={area === a.id} onClick={() => setArea(a.id)}>{a.label}</Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">How bad, 1 to 5</span>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {([1, 2, 3, 4, 5] as Severity[]).map((s) => (
            <button key={s} type="button" className={`btn ${severity === s ? 'btn-primary' : ''}`} onClick={() => setSeverity(s)} aria-pressed={severity === s}>{s}</button>
          ))}
        </div>
      </div>
      <div className="chips">
        <Chip on={limited} onClick={() => setLimited(!limited)} className="chip-cyan">It limited what I could do</Chip>
      </div>
      <label className="field">
        <span className="field-label">Note</span>
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What were you doing, what did it feel like" />
      </label>
      <button type="button" className="btn btn-primary btn-block" disabled={!area || !severity} onClick={save}>Save</button>
    </Sheet>
  )
}
```

- [ ] **Step 2: Write the failing test src/ui/screens/Today.test.tsx**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getDay, listPain } from '../../data/repo'
import { todayISO } from '../../domain/dates'
import Today from './Today'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderToday() {
  return render(<HashRouter><Today /></HashRouter>)
}

describe('Today', () => {
  test('saves body weight and steps for today', async () => {
    renderToday()
    const weight = await screen.findByLabelText('Body weight')
    await userEvent.type(weight, '241.5')
    await userEvent.tab()
    const steps = screen.getByLabelText('Steps')
    await userEvent.type(steps, '8200')
    await userEvent.tab()
    await waitFor(async () => {
      const d = await getDay(todayISO())
      expect(d?.bodyWeight).toBe(241.5)
      expect(d?.steps).toBe(8200)
    })
  })

  test('desk treadmill quick add creates a second session on a second add', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    await userEvent.type(screen.getByLabelText('Minutes'), '20')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(await screen.findByRole('button', { name: '+ Desk treadmill' }))
    await userEvent.type(screen.getByLabelText('Minutes'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(async () => {
      const d = await getDay(todayISO())
      expect(d?.cardio.map((c) => c.minutes)).toEqual([20, 15])
    })
    expect(await screen.findByText(/35 min/)).toBeInTheDocument()
  })

  test('log pain saves an entry for the day', async () => {
    renderToday()
    await userEvent.click(await screen.findByRole('button', { name: /log pain/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Lower back' }))
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const pain = await listPain()
      expect(pain).toHaveLength(1)
      expect(pain[0].area).toBe('lower_back')
      expect(pain[0].date).toBe(todayISO())
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/ui/screens/Today.test.tsx`
Expected: FAIL, no element with label "Body weight".

- [ ] **Step 4: Replace src/ui/screens/Today.tsx**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { NumberField } from '../components/NumberField'
import { BigNumber } from '../components/BigNumber'
import { Section } from '../components/Section'
import { Sheet } from '../components/Sheet'
import { Chip } from '../components/Chip'
import { PainSheet } from '../PainSheet'
import { useDay, useDays, usePain, useSettings, useWorkoutByDate, useWorkouts } from '../hooks'
import { getDay, saveDay, saveSettings } from '../../data/repo'
import { newId } from '../../domain/ids'
import { addDays, formatShort, todayISO, weekEnd, weekStart } from '../../domain/dates'
import { BUILTIN_CARDIO_TYPES } from '../../library/cardioTypes'
import { bodyAreaLabel } from '../../library/bodyAreas'
import { bodyWeightAvg7 } from '../../stats/bodyweight'
import { dayCardioMinutes, stepsSummary } from '../../stats/activity'
import type { CardioSession, DayRecord } from '../../domain/types'

export default function Today() {
  const [date, setDate] = useState(todayISO())
  const day = useDay(date)
  const days = useDays()
  const workouts = useWorkouts()
  const pain = usePain()
  const settings = useSettings()
  const workout = useWorkoutByDate(date)
  const navigate = useNavigate()
  const [cardioOpen, setCardioOpen] = useState<{ type: string } | null>(null)
  const [painOpen, setPainOpen] = useState(false)

  const base: DayRecord = day ?? { date, cardio: [], updatedAt: '' }
  // Re-read the stored day before each write so two quick edits never clobber each other.
  const modify = async (fn: (cur: DayRecord) => Partial<DayRecord>) => {
    const cur = (await getDay(date)) ?? { date, cardio: [], updatedAt: '' }
    await saveDay({ ...cur, ...fn(cur) })
  }
  const patch = (p: Partial<DayRecord>) => modify(() => p)

  const addCardio = async (c: Omit<CardioSession, 'id'>) => {
    await modify((cur) => ({ cardio: [...cur.cardio, { id: newId(), ...c }] }))
    const known = [...BUILTIN_CARDIO_TYPES, ...(settings?.customCardioTypes ?? [])]
    if (!known.includes(c.type)) await saveSettings({ customCardioTypes: [...(settings?.customCardioTypes ?? []), c.type] })
  }
  const removeCardio = (id: string) => modify((cur) => ({ cardio: cur.cardio.filter((c) => c.id !== id) }))

  const ws = weekStart(date)
  const weekWorkouts = workouts.filter((w) => w.date >= ws && w.date <= weekEnd(date)).length
  const steps = stepsSummary(days, ws, weekEnd(date), settings?.dailyStepGoal)
  const avg7 = bodyWeightAvg7(days, date)
  const avg7Prev = bodyWeightAvg7(days, addDays(date, -7))
  const arrow = avg7 !== undefined && avg7Prev !== undefined ? (avg7 < avg7Prev ? '▼' : avg7 > avg7Prev ? '▲' : '') : ''
  const dayPain = pain.filter((p) => p.date === date)
  const cardioTypes = [...BUILTIN_CARDIO_TYPES, ...(settings?.customCardioTypes ?? [])]

  return (
    <div className="screen">
      <Header />
      <div className="row-between">
        <h2>{date === todayISO() ? 'Today' : formatShort(date)}</h2>
        <input className="input" style={{ width: 'auto', minHeight: 40 }} type="date" value={date} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      <div className="card">
        <div className="grid-2">
          <NumberField label="Body weight" value={base.bodyWeight} onCommit={(v) => patch({ bodyWeight: v })} suffix="lb" big />
          <NumberField label="Steps" value={base.steps} onCommit={(v) => patch({ steps: v })} allowDecimal={false} big />
        </div>
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(`/workout/${date}`)}>
        {workout ? 'Continue workout' : 'Start workout'}
      </button>

      <Section title="Cardio" right={<span className="muted">{dayCardioMinutes(base)} min</span>}>
        <div className="chips">
          <Chip onClick={() => setCardioOpen({ type: 'Desk treadmill' })} className="chip-on">+ Desk treadmill</Chip>
          <Chip onClick={() => setCardioOpen({ type: 'Treadmill' })}>+ Other cardio</Chip>
        </div>
        <div className="list">
          {base.cardio.map((c) => (
            <div key={c.id} className="list-item">
              <div><strong>{c.type}</strong> <span className="muted">{c.minutes} min{c.distance ? `, ${c.distance} km` : ''}</span></div>
              <button type="button" className="icon-btn" aria-label={`Remove ${c.type}`} onClick={() => removeCardio(c.id)}>×</button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Pain" right={<button type="button" className="btn btn-sm" onClick={() => setPainOpen(true)}>Log pain</button>}>
        {dayPain.length === 0 && <div className="muted">Nothing logged.</div>}
        <div className="list">
          {dayPain.map((p) => (
            <div key={p.id} className="list-item">
              <div><strong>{bodyAreaLabel(p.area)}</strong> <span className="muted">severity {p.severity}{p.limited ? ', limited' : ''}</span></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="This week">
        <div className="card">
          <div className="grid-3">
            <BigNumber value={weekWorkouts} label="Workouts" tone="accent" />
            <BigNumber value={steps.mean === undefined ? '–' : Math.round(steps.mean / 100) / 10 + 'k'} label={settings?.dailyStepGoal ? `Steps / ${Math.round(settings.dailyStepGoal / 1000)}k goal` : 'Steps avg'} tone="cyan" />
            <BigNumber value={avg7 === undefined ? '–' : `${avg7.toFixed(1)}${arrow}`} label="7-day weight" />
          </div>
        </div>
      </Section>

      <CardioSheet open={cardioOpen !== null} initialType={cardioOpen?.type ?? 'Treadmill'} types={cardioTypes} onClose={() => setCardioOpen(null)} onAdd={addCardio} />
      <PainSheet open={painOpen} onClose={() => setPainOpen(false)} date={date} />
    </div>
  )
}

function CardioSheet({ open, initialType, types, onClose, onAdd }: {
  open: boolean; initialType: string; types: string[]; onClose: () => void; onAdd: (c: Omit<CardioSession, 'id'>) => void
}) {
  const [type, setType] = useState(initialType)
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState<number | undefined>()
  const [distance, setDistance] = useState<number | undefined>()
  const [lastInitial, setLastInitial] = useState(initialType)
  if (initialType !== lastInitial) { setLastInitial(initialType); setType(initialType) }

  const finalType = type === 'Other' ? custom.trim() || 'Other' : type
  const reset = () => { setMinutes(undefined); setDistance(undefined); setCustom('') }
  const add = () => {
    if (!minutes || minutes <= 0) return
    onAdd({ type: finalType, minutes, distance })
    reset()
    onClose()
  }
  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="Add cardio">
      <div className="chips">
        {types.map((t) => <Chip key={t} on={type === t} onClick={() => setType(t)}>{t}</Chip>)}
      </div>
      {type === 'Other' && (
        <label className="field"><span className="field-label">Type</span><input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Hike, class, sport" /></label>
      )}
      <div className="grid-2">
        <NumberField label="Minutes" value={minutes} onCommit={setMinutes} allowDecimal={false} autoFocus big />
        <NumberField label="Distance" value={distance} onCommit={setDistance} suffix="km" />
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={add}>Add</button>
    </Sheet>
  )
}
```

Note on the Add button: `NumberField` commits on blur, and clicking Add blurs the field first, so `minutes` is set before `add` runs. In the test, `userEvent.click` triggers blur before click.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/screens/Today.test.tsx`
Expected: 3 passed. If the first test times out, wrap the initial `findByLabelText` in a longer timeout: `findByLabelText('Body weight', {}, { timeout: 3000 })`. If "Add" clicks before the minutes commit, add `await userEvent.tab()` after typing the minutes in the test.

- [ ] **Step 6: Look at it**

Run `npm run dev`, open at phone width. Expected: big weight and step inputs, orange Start workout button, Desk treadmill chip that opens a sheet, Log pain that opens the area grid, week strip with three big numbers.

- [ ] **Step 7: Run all tests and commit**

Run: `npm test`
Expected: all pass.

```bash
git add -A
git commit -m "Add Today screen with weight, steps, cardio sessions and pain logging

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 13: Workout screen

**Files:**
- Create: `src/ui/screens/Workout.test.tsx`
- Modify: `src/ui/screens/Workout.tsx` (replace stub)

**Interfaces:**
- Consumes: hooks, `saveWorkout`, `deleteWorkout`, `saveExercise`, `PainSheet`, `Sheet`, `Chip`, `Section`, stats `exerciseHistory`, `prsForWorkout`, `workoutVolume`, `workoutMuscleLoad`, `exerciseMap`, `flareRate`, `MUSCLE_GROUPS`, `MUSCLE_LABELS`.
- Produces: the `/workout/:date` screen. Exercise names link to `/exercise/:id` (Task 14). Finish navigates to `/history`.

- [ ] **Step 1: Write the failing test src/ui/screens/Workout.test.tsx**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../../data/db'
import { getWorkoutByDate, saveWorkout } from '../../data/repo'
import Workout from './Workout'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderWorkout(date = '2026-09-08') {
  return render(
    <MemoryRouter initialEntries={[`/workout/${date}`]}>
      <Routes>
        <Route path="/workout/:date" element={<Workout />} />
        <Route path="/history" element={<div>History page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Workout', () => {
  test('search, add an exercise, log a set, see it saved', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'back squ')
    await userEvent.click(await screen.findByRole('button', { name: 'Back Squat' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add set' }))
    await userEvent.clear(screen.getByLabelText('Set 1 weight'))
    await userEvent.type(screen.getByLabelText('Set 1 weight'), '185')
    await userEvent.clear(screen.getByLabelText('Set 1 reps'))
    await userEvent.type(screen.getByLabelText('Set 1 reps'), '5')
    await userEvent.tab()
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries[0].exerciseId).toBe('back-squat')
      expect(w?.entries[0].sets).toEqual([{ weight: 185, reps: 5, warmup: false }])
    })
  })

  test('shows last time and flags a PR, then finish shows the summary', async () => {
    await saveWorkout({
      id: 'prev', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e', exerciseId: 'back-squat', sets: [{ weight: 175, reps: 5, warmup: false }] }],
    })
    await saveWorkout({
      id: 'cur', date: '2026-09-08', withTrainer: true, createdAt: '', updatedAt: '',
      entries: [{ id: 'e2', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }],
    })
    renderWorkout()
    expect(await screen.findByText(/Last time: 175 x 5/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('925')).toBeInTheDocument() // total volume
    expect(screen.getByText(/Back Squat.*e1RM/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('History page')).toBeInTheDocument()
  })

  test('trainer toggle updates the workout', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'plank')
    await userEvent.click(await screen.findByRole('button', { name: 'Plank' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Solo' }))
    await waitFor(async () => {
      expect((await getWorkoutByDate('2026-09-08'))?.withTrainer).toBe(false)
    })
  })

  test('custom exercise is created from the search box', async () => {
    renderWorkout()
    await userEvent.type(await screen.findByLabelText('Search exercises'), 'Sled Push')
    await userEvent.click(await screen.findByRole('button', { name: /Add "Sled Push"/ }))
    // "Quads" appears in both the main and the also-works rows until a main muscle is picked; the first is the main row.
    await userEvent.click((await screen.findAllByRole('button', { name: 'Quads' }))[0])
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(async () => {
      const w = await getWorkoutByDate('2026-09-08')
      expect(w?.entries).toHaveLength(1)
      expect((await db.exercises.toArray())[0].name).toBe('Sled Push')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/screens/Workout.test.tsx`
Expected: FAIL, no element with label "Search exercises".

- [ ] **Step 3: Replace src/ui/screens/Workout.tsx**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { Sheet } from '../components/Sheet'
import { Section } from '../components/Section'
import { BigNumber } from '../components/BigNumber'
import { PainSheet } from '../PainSheet'
import { useExercises, usePain, useSettings, useWorkoutByDate, useWorkouts } from '../hooks'
import { deleteWorkout, getWorkoutByDate, saveExercise, saveWorkout } from '../../data/repo'
import { newId } from '../../domain/ids'
import { formatShort, nowISO, todayISO } from '../../domain/dates'
import { MUSCLE_GROUPS, MUSCLE_LABELS, type Exercise, type MuscleGroup, type SetRecord, type Workout as WorkoutRecord, type WorkoutEntry } from '../../domain/types'
import { exerciseMap, workoutVolume } from '../../stats/sets'
import { exerciseHistory, prsForWorkout } from '../../stats/prs'
import { workoutMuscleLoad } from '../../stats/muscle'
import { flareRate } from '../../stats/pain'
import { bodyAreaLabel } from '../../library/bodyAreas'

export default function Workout() {
  const { date = todayISO() } = useParams()
  const workout = useWorkoutByDate(date)
  const workouts = useWorkouts()
  const exercises = useExercises()
  const pain = usePain()
  const settings = useSettings()
  const navigate = useNavigate()
  const exMap = useMemo(() => exerciseMap(exercises), [exercises])

  const [query, setQuery] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [painFor, setPainFor] = useState<{ exerciseId: string; name: string } | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [pulseEntry, setPulseEntry] = useState<string | null>(null)

  useEffect(() => {
    if (!pulseEntry) return
    const t = setTimeout(() => setPulseEntry(null), 2000)
    return () => clearTimeout(t)
  }, [pulseEntry])

  // Every write re-reads the stored workout first. The live query can lag a few
  // milliseconds behind a save, and two quick taps must not create two workouts.
  const draftId = useRef(newId())
  const draft = (): WorkoutRecord =>
    ({ id: draftId.current, date, withTrainer: settings?.defaultWithTrainer ?? true, entries: [], createdAt: nowISO(), updatedAt: '' })
  const current = async (): Promise<WorkoutRecord> => (await getWorkoutByDate(date)) ?? draft()
  const update = async (fn: (w: WorkoutRecord) => WorkoutRecord) => saveWorkout(fn(await current()))

  const addExercise = (exerciseId: string) => {
    void update((w) => ({ ...w, entries: [...w.entries, { id: newId(), exerciseId, sets: [] }] }))
    setQuery('')
  }
  const removeEntry = (id: string) => update((w) => ({ ...w, entries: w.entries.filter((e) => e.id !== id) }))
  const moveEntry = (id: string, dir: -1 | 1) =>
    update((w) => {
      const i = w.entries.findIndex((e) => e.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= w.entries.length) return w
      const entries = [...w.entries]
      ;[entries[i], entries[j]] = [entries[j], entries[i]]
      return { ...w, entries }
    })
  const setSets = async (entryId: string, sets: SetRecord[]) => {
    const w = await current()
    const next = { ...w, entries: w.entries.map((e) => (e.id === entryId ? { ...e, sets } : e)) }
    await saveWorkout(next)
    const entry = next.entries.find((e) => e.id === entryId)
    if (entry && prsForWorkout(workouts, next).some((p) => p.exerciseId === entry.exerciseId)) setPulseEntry(entryId)
  }

  const lastTime = (exerciseId: string) => exerciseHistory(workouts, exerciseId).filter((s) => s.date < date).at(-1)
  const q = query.trim().toLowerCase()
  const results = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 30) : []
  const exact = results.some((e) => e.name.toLowerCase() === q)
  const grouped = MUSCLE_GROUPS.map((g) => ({ g, items: results.filter((e) => e.primary === g) })).filter((x) => x.items.length)

  const w = workout ?? draft()
  const entries = workout?.entries ?? []
  const prs = workout ? prsForWorkout(workouts, workout) : []
  const load = workout ? workoutMuscleLoad(workout, exMap) : null
  const workoutPain = pain.filter((p) => p.workoutId === workout?.id || (p.date === date && !p.workoutId))

  return (
    <div className="screen">
      <Header title={date === todayISO() ? 'Today' : formatShort(date)} />
      <div className="row-between">
        <div className="chips">
          <Chip on={w.withTrainer} onClick={() => update((x) => ({ ...x, withTrainer: true }))} className="chip-cyan">Trainer</Chip>
          <Chip on={!w.withTrainer} onClick={() => update((x) => ({ ...x, withTrainer: false }))}>Solo</Chip>
        </div>
        {entries.length > 0 && <button type="button" className="btn btn-primary" onClick={() => setSummaryOpen(true)}>Finish</button>}
      </div>

      <div className="card">
        <input className="input" aria-label="Search exercises" placeholder="Add an exercise" value={query} onChange={(e) => setQuery(e.target.value)} />
        {q && (
          <div className="list">
            {grouped.map(({ g, items }) => (
              <div key={g} className="stack">
                <div className="field-label">{MUSCLE_LABELS[g]}</div>
                {items.map((e) => (
                  <button key={e.id} type="button" className="list-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => addExercise(e.id)}>
                    <span>{e.name}</span><span className="muted">+</span>
                  </button>
                ))}
              </div>
            ))}
            {!exact && (
              <button type="button" className="btn btn-ghost" onClick={() => setCustomOpen(true)}>Add "{query.trim()}" as a custom exercise</button>
            )}
          </div>
        )}
      </div>

      {entries.map((entry, idx) => {
        const ex = exMap.get(entry.exerciseId)
        const last = lastTime(entry.exerciseId)
        const flare = flareRate(workouts, pain, entry.exerciseId)
        return (
          <div key={entry.id} className={`card ${pulseEntry === entry.id ? 'pr-pulse' : ''}`}>
            <div className="row-between">
              <Link to={`/exercise/${entry.exerciseId}`}><h2>{ex?.name ?? entry.exerciseId}</h2></Link>
              <div className="row">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={idx === 0} onClick={() => moveEntry(entry.id, -1)}>▲</button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={idx === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}>▼</button>
                <button type="button" className="icon-btn" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={() => removeEntry(entry.id)}>×</button>
              </div>
            </div>
            <div className="muted">
              {last ? `Last time: ${last.sets.map((s) => `${s.weight} x ${s.reps}`).join(', ')}` : 'First time logging this'}
              {flare.flares > 0 && <span style={{ color: 'var(--red)' }}> · pain on {flare.flares} of {flare.sessions}</span>}
            </div>
            {entry.sets.length > 0 && (
              <div className="set-row muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <span>Set</span><span style={{ textAlign: 'center' }}>lb</span><span style={{ textAlign: 'center' }}>reps</span><span style={{ textAlign: 'center' }}>warm</span><span />
              </div>
            )}
            {entry.sets.map((s, i) => (
              <SetRow key={i} index={i} set={s}
                onChange={(next) => setSets(entry.id, entry.sets.map((x, k) => (k === i ? next : x)))}
                onDelete={() => setSets(entry.id, entry.sets.filter((_, k) => k !== i))} />
            ))}
            <div className="row">
              <button type="button" className="btn" onClick={() => setSets(entry.id, [...entry.sets, nextSet(entry, last?.sets)])}>Add set</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPainFor({ exerciseId: entry.exerciseId, name: ex?.name ?? '' })}>Log pain</button>
            </div>
          </div>
        )
      })}

      {workout && (
        <button type="button" className="btn btn-danger" onClick={async () => { if (confirm('Delete this whole workout?')) { await deleteWorkout(workout.id); navigate('/history') } }}>
          Delete workout
        </button>
      )}

      <CustomExerciseSheet open={customOpen} name={query.trim()} onClose={() => setCustomOpen(false)} onCreate={async (ex) => { await saveExercise(ex); setCustomOpen(false); addExercise(ex.id) }} />

      <PainSheet open={painFor !== null} onClose={() => setPainFor(null)} date={date} workoutId={workout?.id} exerciseId={painFor?.exerciseId} exerciseName={painFor?.name} />

      <Sheet open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Workout summary">
        <div className="grid-2">
          <BigNumber value={workout ? Math.round(workoutVolume(workout)) : 0} unit="lb" label="Total volume" tone="accent" />
          <BigNumber value={entries.length} label="Exercises" />
        </div>
        {load && (
          <Section title="By muscle group">
            <div className="list">
              {MUSCLE_GROUPS.filter((g) => load[g].sets > 0).map((g) => (
                <div key={g} className="list-item"><span>{MUSCLE_LABELS[g]}</span><span className="muted">{load[g].sets} sets · {Math.round(load[g].volume)} lb</span></div>
              ))}
            </div>
          </Section>
        )}
        <Section title="Personal records">
          {prs.length === 0 && <div className="muted">None today. Next time.</div>}
          <div className="list">
            {prs.map((p, i) => (
              <div key={i} className="list-item">
                <span><span className="pill pill-pr">PR</span> {exMap.get(p.exerciseId)?.name} {p.kind === 'e1rm' ? 'e1RM' : 'top weight'}</span>
                <span className="muted">{Math.round(p.previous)} to {Math.round(p.current)}</span>
              </div>
            ))}
          </div>
        </Section>
        {workoutPain.length > 0 && (
          <Section title="Pain logged">
            <div className="list">
              {workoutPain.map((p) => (
                <div key={p.id} className="list-item"><span>{bodyAreaLabel(p.area)}</span><span className="muted">severity {p.severity}{p.exerciseId ? ` during ${exMap.get(p.exerciseId)?.name ?? ''}` : ''}</span></div>
              ))}
            </div>
          </Section>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={() => { setSummaryOpen(false); navigate('/history') }}>Done</button>
      </Sheet>
    </div>
  )
}

function nextSet(entry: WorkoutEntry, lastSets?: SetRecord[]): SetRecord {
  const prev = entry.sets.at(-1)
  if (prev) return { ...prev, warmup: false }
  const l = lastSets?.[0]
  return l ? { weight: l.weight, reps: l.reps, warmup: false } : { weight: 0, reps: 0, warmup: false }
}

function SetRow({ index, set, onChange, onDelete }: { index: number; set: SetRecord; onChange: (s: SetRecord) => void; onDelete: () => void }) {
  return (
    <div className="set-row">
      <div className="set-index">{index + 1}</div>
      <SetInput label={`Set ${index + 1} weight`} value={set.weight} onCommit={(v) => onChange({ ...set, weight: v })} />
      <SetInput label={`Set ${index + 1} reps`} value={set.reps} integer onCommit={(v) => onChange({ ...set, reps: v })} />
      <button type="button" className={`warmup-toggle ${set.warmup ? 'on' : ''}`} aria-pressed={set.warmup} aria-label={`Set ${index + 1} warm-up`} onClick={() => onChange({ ...set, warmup: !set.warmup })}>W</button>
      <button type="button" className="icon-btn" aria-label={`Delete set ${index + 1}`} onClick={onDelete}>×</button>
    </div>
  )
}

function SetInput({ label, value, integer, onCommit }: { label: string; value: number; integer?: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const n = Number(text.trim())
    const valid = text.trim() !== '' && Number.isFinite(n) && n >= 0 && (!integer || Number.isInteger(n))
    if (!valid) { setText(String(value)); return }
    if (n !== value) onCommit(n)
  }
  return (
    <input className="set-input" aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

function CustomExerciseSheet({ open, name, onClose, onCreate }: { open: boolean; name: string; onClose: () => void; onCreate: (e: Exercise) => void }) {
  const [primary, setPrimary] = useState<MuscleGroup | undefined>()
  const [secondary, setSecondary] = useState<MuscleGroup[]>([])
  const [title, setTitle] = useState(name)
  const [lastName, setLastName] = useState(name)
  if (name !== lastName) { setLastName(name); setTitle(name) }
  const toggleSecondary = (g: MuscleGroup) => setSecondary((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))
  return (
    <Sheet open={open} onClose={onClose} title="New exercise">
      <label className="field"><span className="field-label">Name</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="field"><span className="field-label">Main muscle</span>
        <div className="chips">{MUSCLE_GROUPS.map((g) => <Chip key={g} on={primary === g} onClick={() => { setPrimary(g); setSecondary((s) => s.filter((x) => x !== g)) }}>{MUSCLE_LABELS[g]}</Chip>)}</div>
      </div>
      <div className="field"><span className="field-label">Also works (optional)</span>
        <div className="chips">{MUSCLE_GROUPS.filter((g) => g !== primary).map((g) => <Chip key={g} on={secondary.includes(g)} onClick={() => toggleSecondary(g)} className="chip-cyan">{MUSCLE_LABELS[g]}</Chip>)}</div>
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={!primary || !title.trim()}
        onClick={() => primary && onCreate({ id: `custom-${newId()}`, name: title.trim(), primary, secondary, custom: true })}>Create</button>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/screens/Workout.test.tsx`
Expected: 4 passed. Notes if something fails:
- "Back Squat" button not found: the search results render buttons with the exercise name as text, so `getByRole('button', { name: 'Back Squat' })` must match exactly one. The custom add button contains the query text, not the name, so it won't collide.
- Summary `925` not found: 185 x 5 = 925, rendered by `BigNumber` as `925` followed by a `<small>lb</small>`; use `findByText('925')` which matches the text node, or switch to `findByText(/925/)`.
- The "Quads" chip in the custom sheet: `MUSCLE_LABELS.quads` is "Quads" and it appears in both the primary and secondary chip rows only when primary is unset for the secondary row filter; on first render primary is undefined so both rows contain "Quads". Use `getAllByRole('button', { name: 'Quads' })[0]` in the test if the exact query throws on multiple matches.

- [ ] **Step 5: Look at it**

Run `npm run dev`. Log a workout end to end: search, add, add sets, toggle warm-up, log pain from the card, finish, see the summary. Expected: set inputs in the big display font, orange Finish button, PR pulse when a set beats a previous session.

- [ ] **Step 6: Run all tests and commit**

Run: `npm test`
Expected: all pass.

```bash
git add -A
git commit -m "Add Workout screen with exercise search, set logging, PR pulse and summary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: History and exercise history screens

**Files:**
- Create: `src/ui/screens/History.test.tsx`
- Modify: `src/ui/screens/History.tsx`, `src/ui/screens/ExerciseHistory.tsx` (replace stubs)

**Interfaces:**
- Consumes: hooks, stats `workoutVolume`, `prsForWorkout`, `exerciseHistory`, `bestBefore`, `relativeStrength`, `bodyWeightAvg7`, `flareRate`, Recharts.
- Produces: `/history` list with filters and `/exercise/:id` detail with an e1RM chart.

- [ ] **Step 1: Write the failing test src/ui/screens/History.test.tsx**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../../data/db'
import { savePain, saveWorkout } from '../../data/repo'
import History from './History'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await saveWorkout({ id: 'a', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '', entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }] })
  await saveWorkout({ id: 'b', date: '2026-09-03', withTrainer: false, createdAt: '', updatedAt: '', entries: [{ id: 'e2', exerciseId: 'back-squat', sets: [{ weight: 195, reps: 5, warmup: false }] }] })
  await savePain({ id: 'p', date: '2026-09-03', area: 'knee_left', severity: 2, limited: false, createdAt: '' })
})

function renderHistory() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/workout/:date" element={<div>Workout page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('History', () => {
  test('lists newest first with pills and filters by mode', async () => {
    renderHistory()
    const items = await screen.findAllByRole('button', { name: /Sep/ })
    expect(items[0]).toHaveTextContent('Thu Sep 3')
    expect(items[0]).toHaveTextContent('Solo')
    expect(items[0]).toHaveTextContent('PR')
    expect(items[0]).toHaveTextContent('Pain')
    expect(items[1]).toHaveTextContent('Trainer')
    await userEvent.click(screen.getByRole('button', { name: 'Trainer only' }))
    expect(screen.getAllByRole('button', { name: /Sep/ })).toHaveLength(1)
  })

  test('tapping a workout opens it', async () => {
    renderHistory()
    await userEvent.click((await screen.findAllByRole('button', { name: /Sep/ }))[0])
    expect(await screen.findByText('Workout page')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/screens/History.test.tsx`
Expected: FAIL, no buttons matching /Sep/.

- [ ] **Step 3: Replace src/ui/screens/History.tsx**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { usePain, useWorkouts } from '../hooks'
import { formatShort } from '../../domain/dates'
import { workoutVolume } from '../../stats/sets'
import { prsForWorkout } from '../../stats/prs'

type Filter = 'all' | 'trainer' | 'solo'

export default function History() {
  const workouts = useWorkouts()
  const pain = usePain()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const shown = [...workouts]
    .filter((w) => filter === 'all' || (filter === 'trainer' ? w.withTrainer : !w.withTrainer))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="screen">
      <Header title="History" />
      <div className="chips">
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        <Chip on={filter === 'trainer'} onClick={() => setFilter('trainer')} className="chip-cyan">Trainer only</Chip>
        <Chip on={filter === 'solo'} onClick={() => setFilter('solo')}>Solo only</Chip>
      </div>
      {shown.length === 0 && <div className="muted">No workouts yet. Start one from Today.</div>}
      <div className="list">
        {shown.map((w) => {
          const prCount = prsForWorkout(workouts, w).length
          const hasPain = pain.some((p) => p.workoutId === w.id || p.date === w.date)
          return (
            <button key={w.id} type="button" className="list-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate(`/workout/${w.date}`)}>
              <div className="stack" style={{ gap: 4 }}>
                <strong>{formatShort(w.date)}</strong>
                <span className="muted">{w.entries.length} exercises · {Math.round(workoutVolume(w))} lb</span>
              </div>
              <div className="row">
                <span className={`pill ${w.withTrainer ? 'pill-trainer' : 'pill-solo'}`}>{w.withTrainer ? 'Trainer' : 'Solo'}</span>
                {prCount > 0 && <span className="pill pill-pr">{prCount} PR</span>}
                {hasPain && <span className="pill pill-pain">Pain</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace src/ui/screens/ExerciseHistory.tsx**

```tsx
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Header } from '../components/Header'
import { BigNumber } from '../components/BigNumber'
import { Section } from '../components/Section'
import { useDays, useExercises, usePain, useWorkouts } from '../hooks'
import { MUSCLE_LABELS } from '../../domain/types'
import { formatShort } from '../../domain/dates'
import { exerciseHistory } from '../../stats/prs'
import { bodyWeightAvg7, latestBodyWeight, relativeStrength } from '../../stats/bodyweight'
import { flareRate } from '../../stats/pain'

export default function ExerciseHistory() {
  const { id = '' } = useParams()
  const exercises = useExercises()
  const workouts = useWorkouts()
  const days = useDays()
  const pain = usePain()
  const ex = exercises.find((e) => e.id === id)
  const history = useMemo(() => exerciseHistory(workouts, id), [workouts, id])
  const best = history.reduce((b, s) => (s.bestE1rm > (b?.bestE1rm ?? 0) ? s : b), history[0])
  const heaviest = history.reduce((m, s) => Math.max(m, s.topWeight), 0)
  const bw = latestBodyWeight(days)
  const rel = best ? relativeStrength(best.bestE1rm, bw?.weight) : undefined
  const flare = flareRate(workouts, pain, id)
  const chart = history.map((s) => ({ date: s.date, label: formatShort(s.date), e1rm: Math.round(s.bestE1rm), rel: relativeStrength(s.bestE1rm, bodyWeightAvg7(days, s.date)) }))

  return (
    <div className="screen">
      <Header title={ex?.name ?? 'Exercise'} />
      {ex && <div className="muted">{MUSCLE_LABELS[ex.primary]}{ex.secondary.length ? ` · also ${ex.secondary.map((g) => MUSCLE_LABELS[g]).join(', ')}` : ''}</div>}
      <div className="card">
        <div className="grid-3">
          <BigNumber value={best ? Math.round(best.bestE1rm) : '–'} unit="lb" label="Best e1RM" tone="accent" />
          <BigNumber value={heaviest || '–'} unit="lb" label="Heaviest" />
          <BigNumber value={rel === undefined ? '–' : rel.toFixed(2)} unit="x" label="Per lb body weight" tone="cyan" />
        </div>
        {flare.sessions > 0 && (
          <div className="muted">Pain logged on {flare.flares} of {flare.sessions} sessions{flare.rate >= 0.5 ? '. Worth raising with your trainer.' : ''}</div>
        )}
      </div>
      {chart.length > 1 && (
        <Section title="Estimated 1RM">
          <div className="card" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ left: -10, right: 10, top: 10 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#1b1b21', border: '1px solid #2e2e38' }} />
                <Line type="monotone" dataKey="e1rm" stroke="#ff5a1f" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
      <Section title="Sessions">
        {history.length === 0 && <div className="muted">Never logged.</div>}
        <div className="list">
          {[...history].reverse().map((s) => (
            <div key={s.workoutId} className="list-item">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{formatShort(s.date)}</strong>
                <span className="muted">{s.sets.map((x) => `${x.weight} x ${x.reps}`).join(', ')}</span>
              </div>
              <div className="row">
                <span className={`pill ${s.withTrainer ? 'pill-trainer' : 'pill-solo'}`}>{s.withTrainer ? 'Trainer' : 'Solo'}</span>
                <span className="muted">{Math.round(s.bestE1rm)} e1RM</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
```

- [ ] **Step 5: Run tests, look, commit**

Run: `npx vitest run src/ui/screens/History.test.tsx`
Expected: 2 passed.

Run `npm run dev` and open History, tap a workout, tap an exercise name inside it. Expected: list with pills, exercise page with three big numbers and an orange line chart once two sessions exist.

Run: `npm test`
Expected: all pass.

```bash
git add -A
git commit -m "Add History list and exercise history with e1RM chart

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Trends screen

**Files:**
- Create: `src/ui/screens/Trends.test.tsx`
- Modify: `src/ui/screens/Trends.tsx` (replace stub)

**Interfaces:**
- Consumes: hooks, stats `bodyWeightSeries`, `weeklyMuscleSeries`, `weeklyActivitySeries`, `exerciseHistory`, `relativeStrength`, `bodyWeightAvg7`, `trainerSplit`, dates, Recharts.
- Produces: `/trends` with range chips (4 weeks, 12 weeks, All) and seven chart cards.

- [ ] **Step 1: Write the failing test src/ui/screens/Trends.test.tsx**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { saveDay, savePain, saveWorkout } from '../../data/repo'
import Trends from './Trends'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await saveWorkout({ id: 'a', date: '2026-09-01', withTrainer: true, createdAt: '', updatedAt: '', entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ weight: 185, reps: 5, warmup: false }] }] })
  await saveDay({ date: '2026-09-01', bodyWeight: 250, steps: 9000, cardio: [{ id: 'c', type: 'Desk treadmill', minutes: 30 }], updatedAt: '' })
  await savePain({ id: 'p', date: '2026-09-01', area: 'lower_back', severity: 3, limited: true, createdAt: '' })
})

describe('Trends', () => {
  test('renders every chart section and the range chips', async () => {
    render(<MemoryRouter><Trends /></MemoryRouter>)
    for (const title of ['Body weight', 'Weekly volume by muscle', 'Weekly sets by muscle', 'Strength', 'Steps and cardio', 'Trainer vs solo', 'Pain timeline']) {
      expect(await screen.findByText(title)).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('combobox', { name: 'Exercise' })).toHaveDisplayValue('Back Squat')
    expect(screen.getByText('Lower back')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/screens/Trends.test.tsx`
Expected: FAIL, "Body weight" not found.

- [ ] **Step 3: Replace src/ui/screens/Trends.tsx**

```tsx
import { useMemo, useState } from 'react'
import { Bar, BarChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { useDays, useExercises, usePain, useSettings, useWorkouts } from '../hooks'
import { MUSCLE_GROUPS, MUSCLE_LABELS, type BodyArea } from '../../domain/types'
import { addDays, daysBetween, formatWeekLabel, todayISO, weekStart } from '../../domain/dates'
import { bodyWeightAvg7, bodyWeightSeries, relativeStrength } from '../../stats/bodyweight'
import { exerciseMap } from '../../stats/sets'
import { weeklyMuscleSeries, MIN_WEEKLY_SETS } from '../../stats/muscle'
import { weeklyActivitySeries } from '../../stats/activity'
import { exerciseHistory } from '../../stats/prs'
import { trainerSplit } from '../../stats/trainer'
import { bodyAreaLabel } from '../../library/bodyAreas'

type Range = '4w' | '12w' | 'all'
const GROUP_COLORS: Record<string, string> = {
  chest: '#ff5a1f', back: '#22d3ee', shoulders: '#fbbf24', biceps: '#a78bfa', triceps: '#f472b6',
  quads: '#4ade80', hamstrings: '#34d399', glutes: '#fb923c', calves: '#60a5fa', core: '#9a9aa6',
}
const tooltipStyle = { background: '#1b1b21', border: '1px solid #2e2e38' }

export default function Trends() {
  const workouts = useWorkouts()
  const days = useDays()
  const pain = usePain()
  const exercises = useExercises()
  const settings = useSettings()
  const [range, setRange] = useState<Range>('12w')
  const exMap = useMemo(() => exerciseMap(exercises), [exercises])

  const today = todayISO()
  const earliest = [...workouts.map((w) => w.date), ...days.map((d) => d.date), ...pain.map((p) => p.date)].sort()[0] ?? today
  const from = range === '4w' ? addDays(today, -27) : range === '12w' ? addDays(today, -83) : earliest
  const fromWeek = weekStart(from)
  const toWeek = weekStart(today)

  const weight = bodyWeightSeries(days, from, today).map((r) => ({ ...r, label: r.date.slice(5) }))
  const muscle = weeklyMuscleSeries(workouts, exMap, fromWeek, toWeek).map(({ week, load }) => ({
    week: formatWeekLabel(week),
    ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [`${g}_sets`, Math.round(load[g].sets * 10) / 10])),
    ...Object.fromEntries(MUSCLE_GROUPS.map((g) => [`${g}_vol`, Math.round(load[g].volume)])),
  }))
  const activity = weeklyActivitySeries(days, fromWeek, toWeek, settings?.dailyStepGoal)
  const cardioTypes = Array.from(new Set(activity.flatMap((a) => Object.keys(a.cardio.byType))))
  const activityRows = activity.map((a) => ({
    week: formatWeekLabel(a.week), steps: a.steps.total,
    ...Object.fromEntries(cardioTypes.map((t) => [t, a.cardio.byType[t]?.minutes ?? 0])),
  }))
  const trainerRows = useMemo(() => {
    const rows: { week: string; trainer: number; solo: number }[] = []
    for (let w = fromWeek; w <= toWeek; w = addDays(w, 7)) {
      const s = trainerSplit(workouts, w, addDays(w, 6))
      rows.push({ week: formatWeekLabel(w), trainer: s.trainerCount, solo: s.soloCount })
    }
    return rows
  }, [workouts, fromWeek, toWeek])
  const split = trainerSplit(workouts, from, today)

  const logged = exercises.filter((e) => workouts.some((w) => w.entries.some((en) => en.exerciseId === e.id)))
  const [exerciseId, setExerciseId] = useState<string>('')
  const chosen = exerciseId || logged[0]?.id || ''
  const strength = exerciseHistory(workouts, chosen).filter((s) => s.date >= from).map((s) => ({
    label: s.date.slice(5), e1rm: Math.round(s.bestE1rm),
    rel: relativeStrength(s.bestE1rm, bodyWeightAvg7(days, s.date)),
  }))

  const painAreas = Array.from(new Set(pain.filter((p) => p.date >= from).map((p) => p.area))) as BodyArea[]
  const span = Math.max(1, daysBetween(from, today))

  return (
    <div className="screen">
      <Header title="Trends" />
      <div className="chips">
        <Chip on={range === '4w'} onClick={() => setRange('4w')}>4 weeks</Chip>
        <Chip on={range === '12w'} onClick={() => setRange('12w')}>12 weeks</Chip>
        <Chip on={range === 'all'} onClick={() => setRange('all')}>All</Chip>
      </div>

      <Section title="Body weight">
        <div className="card" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weight} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} />
              {settings?.targetBodyWeight && <ReferenceLine y={settings.targetBodyWeight} stroke="#4ade80" strokeDasharray="4 4" label={{ value: 'target', fill: '#4ade80', fontSize: 11 }} />}
              <Line dataKey="weight" stroke="#22d3ee" strokeWidth={0} dot={{ r: 3, fill: '#22d3ee' }} connectNulls={false} isAnimationActive={false} />
              <Line dataKey="avg7" stroke="#ff5a1f" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Weekly volume by muscle">
        <div className="card" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={muscle} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {MUSCLE_GROUPS.map((g) => <Bar key={g} dataKey={`${g}_vol`} name={MUSCLE_LABELS[g]} stackId="v" fill={GROUP_COLORS[g]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Weekly sets by muscle">
        <div className="card" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={muscle} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={MIN_WEEKLY_SETS} stroke="#fbbf24" strokeDasharray="4 4" />
              {MUSCLE_GROUPS.map((g) => <Bar key={g} dataKey={`${g}_sets`} name={MUSCLE_LABELS[g]} stackId="s" fill={GROUP_COLORS[g]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">Dashed line: 10 sets per group per week, the floor for muscle growth.</div>
      </Section>

      <Section title="Strength" right={
        <select className="input" style={{ width: 'auto', minHeight: 40 }} aria-label="Exercise" value={chosen} onChange={(e) => setExerciseId(e.target.value)}>
          {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      }>
        <div className="card" style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={strength} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" domain={['auto', 'auto']} />
              <YAxis yAxisId="r" orientation="right" domain={['auto', 'auto']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line yAxisId="l" dataKey="e1rm" name="e1RM (lb)" stroke="#ff5a1f" strokeWidth={3} isAnimationActive={false} />
              <Line yAxisId="r" dataKey="rel" name="per lb body weight" stroke="#22d3ee" strokeWidth={2} strokeDasharray="4 4" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">Orange is estimated 1RM. Cyan is that number divided by your body weight, the one that should keep rising as you lose weight.</div>
      </Section>

      <Section title="Steps and cardio">
        <div className="card" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              {settings?.dailyStepGoal && <ReferenceLine y={settings.dailyStepGoal * 7} stroke="#4ade80" strokeDasharray="4 4" />}
              <Bar dataKey="steps" name="Steps" fill="#22d3ee" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {cardioTypes.map((t, i) => <Bar key={t} dataKey={t} stackId="c" fill={i === 0 ? '#ff5a1f' : Object.values(GROUP_COLORS)[i % 10]} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Trainer vs solo">
        <div className="card" style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trainerRows} margin={{ left: -10, right: 10, top: 10 }}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="trainer" name="Trainer" fill="#22d3ee" isAnimationActive={false} />
              <Bar dataKey="solo" name="Solo" fill="#9a9aa6" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="muted">
          Average per session: trainer {split.trainerMeanVolume ? Math.round(split.trainerMeanVolume) : '–'} lb over {split.trainerMeanSets?.toFixed(1) ?? '–'} sets, solo {split.soloMeanVolume ? Math.round(split.soloMeanVolume) : '–'} lb over {split.soloMeanSets?.toFixed(1) ?? '–'} sets.
        </div>
      </Section>

      <Section title="Pain timeline">
        {painAreas.length === 0 && <div className="muted">No pain logged in this range.</div>}
        <div className="stack">
          {painAreas.map((area) => (
            <div key={area} className="card" style={{ padding: '8px 14px' }}>
              <div className="row-between"><strong>{bodyAreaLabel(area)}</strong><span className="muted">{pain.filter((p) => p.area === area && p.date >= from).length} entries</span></div>
              <div style={{ position: 'relative', height: 24 }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 11, height: 2, background: 'var(--border)' }} />
                {pain.filter((p) => p.area === area && p.date >= from).map((p) => (
                  <span key={p.id} title={`${p.date} severity ${p.severity}`} style={{
                    position: 'absolute', top: 12 - p.severity * 2 - 2, left: `${(daysBetween(from, p.date) / span) * 100}%`,
                    width: p.severity * 4 + 4, height: p.severity * 4 + 4, marginLeft: -(p.severity * 2 + 2), borderRadius: '50%',
                    background: p.limited ? 'var(--red)' : 'var(--accent)',
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="muted">Bigger dots are worse. Red dots limited the workout.</div>
      </Section>
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/ui/screens/Trends.test.tsx`
Expected: 1 passed. Recharts logs a warning about zero width in jsdom; that is fine. If it throws, add `vi.mock('recharts', ...)` is not needed; instead set an explicit `width={360}` `height={200}` fallback: wrap each `ResponsiveContainer` in `initialDimension={{ width: 360, height: 200 }}` (a Recharts prop) so jsdom has a size.

- [ ] **Step 5: Look at it**

Run `npm run dev`, log a few days of data through the app, open Trends. Expected: orange rolling-average line over cyan dots, stacked colour bars, dashed floor line on sets, exercise dropdown, pain rows with sized dots.

- [ ] **Step 6: Run all tests and commit**

Run: `npm test`
Expected: all pass.

```bash
git add -A
git commit -m "Add Trends screen with weight, muscle, strength, activity, mode and pain charts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Settings screen

**Files:**
- Create: `src/ui/screens/Settings.test.tsx`
- Modify: `src/ui/screens/Settings.tsx` (replace stub)

**Interfaces:**
- Consumes: `useSettings`, `useExercises`, `saveSettings`, `saveExercise`, `deleteExercise`, `exportDataset`, `importDataset`, `validateDataset`, `runSync`, `NumberField`, `Chip`, `Section`.
- Produces: `/settings` with sync, goals, default mode, backup, custom exercises.

- [ ] **Step 1: Write the failing test src/ui/screens/Settings.test.tsx**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../../data/db'
import { getSettings, saveExercise } from '../../data/repo'
import Settings from './Settings'

vi.mock('../../sync/runSync', () => ({ runSync: vi.fn(async () => 'none') }))

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('Settings', () => {
  test('saves token, repo, goals and default mode', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText('GitHub token'), 'ghp_test')
    await userEvent.click(screen.getByRole('button', { name: 'Save sync settings' }))
    await userEvent.type(screen.getByLabelText('Target body weight'), '220')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText('Daily step goal'), '10000')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Solo' }))
    await waitFor(async () => {
      const s = await getSettings()
      expect(s.githubToken).toBe('ghp_test')
      expect(s.dataRepo).toBe('jmannella/mannpower-data')
      expect(s.targetBodyWeight).toBe(220)
      expect(s.dailyStepGoal).toBe(10000)
      expect(s.defaultWithTrainer).toBe(false)
    })
  })

  test('lists custom exercises and shows status', async () => {
    await saveExercise({ id: 'custom-1', name: 'Sled Push', primary: 'quads', secondary: [], custom: true })
    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(await screen.findByText('Sled Push')).toBeInTheDocument()
    expect(screen.getByText(/Not set up/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/screens/Settings.test.tsx`
Expected: FAIL, no element with label "GitHub token".

- [ ] **Step 3: Replace src/ui/screens/Settings.tsx**

```tsx
import { useRef, useState } from 'react'
import { Header } from '../components/Header'
import { NumberField } from '../components/NumberField'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { useExercises, useSettings } from '../hooks'
import { deleteExercise, saveExercise, saveSettings } from '../../data/repo'
import { exportDataset, importDataset, validateDataset } from '../../data/snapshot'
import { runSync } from '../../sync/runSync'
import { todayISO } from '../../domain/dates'
import { MUSCLE_LABELS, type SyncStatus } from '../../domain/types'

const STATUS_TEXT: Record<SyncStatus, string> = {
  not_set_up: 'Not set up. Add a token to back up to GitHub.',
  synced: 'Synced',
  pending: 'Waiting to sync',
  error: 'Sync error',
}

export default function Settings() {
  const settings = useSettings()
  const exercises = useExercises().filter((e) => e.custom)
  const [token, setToken] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return <div className="screen"><Header title="Settings" /></div>
  const tokenValue = token ?? settings.githubToken ?? ''
  const repoValue = repo ?? settings.dataRepo

  const saveSync = async () => {
    await saveSettings({ githubToken: tokenValue.trim() || undefined, dataRepo: repoValue.trim() || 'jmannella/mannpower-data', syncStatus: tokenValue.trim() ? 'pending' : 'not_set_up', lastSyncError: undefined })
    setToken(null); setRepo(null)
    setMessage('Saved.')
  }
  const syncNow = async () => {
    setBusy(true); setMessage(null)
    try {
      const r = await runSync()
      setMessage(r === 'skipped' ? 'Nothing to do.' : r === 'pull' ? 'Pulled newer data from GitHub.' : r === 'push' ? 'Pushed to GitHub.' : 'Already up to date.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const exportBackup = async () => {
    const ds = await exportDataset()
    const blob = new Blob([JSON.stringify(ds, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mannpower-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importBackup = async (file: File) => {
    let parsed: unknown
    try { parsed = JSON.parse(await file.text()) } catch { setMessage('That file is not valid JSON.'); return }
    const v = validateDataset(parsed)
    if (!v.ok) { setMessage(`Backup rejected: ${v.errors[0]}`); return }
    const ok = confirm(`Replace everything on this phone with ${v.dataset.workouts.length} workouts, ${v.dataset.days.length} days and ${v.dataset.pain.length} pain entries from the backup?`)
    if (!ok) return
    await importDataset(v.dataset, { stampNow: true })
    setMessage('Backup restored.')
  }
  const rename = async (id: string, name: string) => {
    const next = prompt('New name', name)?.trim()
    const ex = exercises.find((e) => e.id === id)
    if (next && ex) await saveExercise({ ...ex, name: next })
  }
  const remove = async (id: string) => {
    try { await deleteExercise(id) } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="screen">
      <Header title="Settings" />
      {message && <div className="banner" onClick={() => setMessage(null)}>{message}</div>}
      {settings.syncStatus === 'error' && settings.lastSyncError?.includes('token') && <div className="banner banner-error">GitHub rejected the token. Check it below.</div>}

      <Section title="GitHub sync">
        <div className="card">
          <div className="row">
            <span className={`status-dot status-${settings.syncStatus}`} />
            <span>{STATUS_TEXT[settings.syncStatus]}</span>
          </div>
          {settings.lastSyncedAt && <div className="muted">Last synced {new Date(settings.lastSyncedAt).toLocaleString()}</div>}
          {settings.lastSyncError && settings.syncStatus !== 'synced' && <div className="muted" style={{ color: 'var(--red)' }}>{settings.lastSyncError}</div>}
          <label className="field"><span className="field-label">GitHub token</span>
            <input className="input" type="password" aria-label="GitHub token" value={tokenValue} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." autoComplete="off" />
          </label>
          <label className="field"><span className="field-label">Data repo</span>
            <input className="input" aria-label="Data repo" value={repoValue} onChange={(e) => setRepo(e.target.value)} />
          </label>
          <div className="grid-2">
            <button type="button" className="btn" onClick={saveSync}>Save sync settings</button>
            <button type="button" className="btn btn-primary" disabled={busy || !settings.githubToken} onClick={syncNow}>{busy ? 'Syncing' : 'Sync now'}</button>
          </div>
          <div className="muted">Fine-grained token with Contents read and write on the data repo only. It stays on this phone.</div>
        </div>
      </Section>

      <Section title="Goals">
        <div className="card">
          <div className="grid-2">
            <NumberField label="Target body weight" value={settings.targetBodyWeight} onCommit={(v) => saveSettings({ targetBodyWeight: v })} suffix="lb" />
            <NumberField label="Daily step goal" value={settings.dailyStepGoal} onCommit={(v) => saveSettings({ dailyStepGoal: v })} allowDecimal={false} />
          </div>
        </div>
      </Section>

      <Section title="Default workout mode">
        <div className="chips">
          <Chip on={settings.defaultWithTrainer} onClick={() => saveSettings({ defaultWithTrainer: true })} className="chip-cyan">Trainer</Chip>
          <Chip on={!settings.defaultWithTrainer} onClick={() => saveSettings({ defaultWithTrainer: false })}>Solo</Chip>
        </div>
        <div className="muted">Flip this for a travel week. Each workout can still be changed on its own.</div>
      </Section>

      <Section title="Backup">
        <div className="grid-2">
          <button type="button" className="btn" onClick={exportBackup}>Export backup</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" hidden aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = '' }} />
      </Section>

      <Section title="Custom exercises">
        {exercises.length === 0 && <div className="muted">None yet. Add one from the Workout search box.</div>}
        <div className="list">
          {exercises.map((e) => (
            <div key={e.id} className="list-item">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{e.name}</strong>
                <span className="muted">{MUSCLE_LABELS[e.primary]}{e.secondary.length ? `, ${e.secondary.map((g) => MUSCLE_LABELS[g]).join(', ')}` : ''}</span>
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => rename(e.id, e.name)}>Rename</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(e.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <div className="muted" style={{ textAlign: 'center' }}>Mannpower</div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/ui/screens/Settings.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Run all tests, build, look, commit**

Run: `npm test` then `npm run build`.
Expected: all pass, build succeeds.

Run `npm run dev`, open Settings. Expected: status dot grey with "Not set up", token field, goals, mode chips, backup buttons. Export downloads a JSON file; importing it back shows the confirm dialog.

```bash
git add -A
git commit -m "Add Settings screen with GitHub sync, goals, default mode, backup and custom exercises

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 17: Weekly report script

**Files:**
- Create: `scripts/report.ts`, `scripts/fixtures/week.json`, `scripts/report.test.ts`

**Interfaces:**
- Consumes: `GitHubContents` (Task 10), `validateDataset` (Task 4, `src/domain/validate.ts`), `weeklyDigest`, `digestMarkdown` (Task 9), dates.
- Produces: `npm run report` prints the digest for the most recent completed week (Sunday if today is Sunday, otherwise last Sunday). Flags: `--week YYYY-MM-DD` to pick a week end, `--file path.json` to read a local dataset instead of GitHub. Exit code 1 with a one-line message on any failure.

- [ ] **Step 1: Write scripts/fixtures/week.json**

```json
{
  "meta": { "schemaVersion": 1, "updatedAt": "2026-09-13T22:00:00.000Z" },
  "exercises": [],
  "workouts": [
    { "id": "p1", "date": "2026-08-31", "withTrainer": true, "createdAt": "", "updatedAt": "", "entries": [
      { "id": "a", "exerciseId": "back-squat", "sets": [{ "weight": 185, "reps": 8, "warmup": false }, { "weight": 185, "reps": 8, "warmup": false }] } ] },
    { "id": "p2", "date": "2026-09-02", "withTrainer": true, "createdAt": "", "updatedAt": "", "entries": [
      { "id": "b", "exerciseId": "barbell-bench-press", "sets": [{ "weight": 135, "reps": 8, "warmup": false }] } ] },
    { "id": "w1", "date": "2026-09-07", "withTrainer": true, "createdAt": "", "updatedAt": "", "entries": [
      { "id": "c", "exerciseId": "back-squat", "sets": [{ "weight": 185, "reps": 8, "warmup": false }, { "weight": 185, "reps": 8, "warmup": false }] },
      { "id": "d", "exerciseId": "lat-pulldown", "sets": [{ "weight": 120, "reps": 10, "warmup": false }] } ] },
    { "id": "w2", "date": "2026-09-09", "withTrainer": false, "createdAt": "", "updatedAt": "", "entries": [
      { "id": "e", "exerciseId": "barbell-bench-press", "sets": [{ "weight": 145, "reps": 8, "warmup": false }] } ] }
  ],
  "days": [
    { "date": "2026-09-01", "bodyWeight": 250, "steps": 7000, "cardio": [], "updatedAt": "" },
    { "date": "2026-09-08", "bodyWeight": 247, "steps": 11000, "cardio": [{ "id": "x", "type": "Desk treadmill", "minutes": 40 }], "updatedAt": "" },
    { "date": "2026-09-10", "bodyWeight": 246.5, "steps": 8000, "cardio": [{ "id": "y", "type": "Bike", "minutes": 25 }], "updatedAt": "" }
  ],
  "pain": [
    { "id": "q1", "date": "2026-08-31", "area": "lower_back", "severity": 2, "limited": false, "workoutId": "p1", "createdAt": "" },
    { "id": "q2", "date": "2026-09-07", "area": "lower_back", "severity": 3, "limited": true, "workoutId": "w1", "exerciseId": "back-squat", "createdAt": "" }
  ],
  "settings": { "defaultWithTrainer": true, "customCardioTypes": [], "dailyStepGoal": 10000, "targetBodyWeight": 220 }
}
```

- [ ] **Step 2: Write the failing test scripts/report.test.ts**

```ts
import { execFileSync } from 'node:child_process'

function run(args: string[], env: Record<string, string> = {}) {
  try {
    const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/report.ts', ...args], {
      encoding: 'utf8', env: { ...process.env, MANNPOWER_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out, err: '' }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: err.stdout, err: err.stderr }
  }
}

describe('report script', () => {
  test('prints the digest for a fixture week', () => {
    const r = run(['--file', 'scripts/fixtures/week.json', '--week', '2026-09-13'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('# Mannpower weekly digest, 2026-09-07 to 2026-09-13')
    expect(r.out).toContain('## Summary')
    expect(r.out).toContain('Stalled: Back Squat at 185 lb')
    expect(r.out).toContain('PR Barbell Bench Press')
    expect(r.out).toContain('Lower back')
    expect(r.out).toContain('```json')
  })

  test('fails clearly without a token', () => {
    const r = run(['--week', '2026-09-13'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('MANNPOWER_TOKEN')
  })
}, 30000)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/report.test.ts`
Expected: FAIL, the script does not exist so the process exits non-zero on the first test.

- [ ] **Step 4: Write scripts/report.ts**

```ts
import { readFileSync } from 'node:fs'
import { GitHubContents } from '../src/sync/github'
import { validateDataset } from '../src/domain/validate'
import { digestMarkdown, weeklyDigest } from '../src/stats/digest'
import { addDays, parseISO, todayISO, weekStart } from '../src/domain/dates'

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Sunday of the most recent completed week: today if today is Sunday, otherwise last Sunday. */
function defaultWeekEnd(): string {
  const today = todayISO()
  return parseISO(today).getDay() === 0 ? today : addDays(weekStart(today), -1)
}

async function loadRaw(): Promise<string> {
  const file = arg('--file')
  if (file) return readFileSync(file, 'utf8')
  const token = process.env.MANNPOWER_TOKEN
  const repo = process.env.MANNPOWER_DATA_REPO || 'jmannella/mannpower-data'
  if (!token) fail('MANNPOWER_TOKEN is not set. Copy .env.example to .env and add the fine-grained token for the data repo.')
  const remote = await new GitHubContents(token, repo).get()
  if (!remote) fail(`data.json was not found in ${repo}. Has the phone synced yet?`)
  return remote.content
}

async function main(): Promise<void> {
  const weekEndDate = arg('--week') ?? defaultWeekEnd()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEndDate)) fail(`Bad --week value: ${weekEndDate}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(await loadRaw())
  } catch (e) {
    fail(`Could not read the dataset: ${e instanceof Error ? e.message : String(e)}`)
  }
  const v = validateDataset(parsed)
  if (!v.ok) fail(`Dataset failed validation: ${v.errors.join('; ')}`)
  process.stdout.write(digestMarkdown(weeklyDigest(v.dataset, weekEndDate)) + '\n')
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run scripts/report.test.ts`
Expected: 2 passed. If tsx cannot resolve `../src/...` imports, confirm `tsx` is installed (`npx tsx --version`) and that the test runs from the project root.

Run: `npm run report -- --file scripts/fixtures/week.json --week 2026-09-13`
Expected: the digest prints. (Without `.env` present, `node --env-file=.env` errors; create an empty `.env` from `.env.example` first: `cp .env.example .env`.)

- [ ] **Step 6: Run all tests and commit**

Run: `npm test`
Expected: all pass.

```bash
git add scripts
git commit -m "Add weekly report script with fixture test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Deploy to GitHub Pages and install on the phone

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Produces: the app live at `https://jmannella.github.io/mannpower/`, the private data repo ready, and the token in the phone and in `.env`.

- [ ] **Step 1: Write .github/workflows/deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write README.md**

```markdown
# Mannpower

Workout, body weight, steps, cardio and pain tracker for Android, installed from the browser.

- App: https://jmannella.github.io/mannpower/
- Data: private repo `jmannella/mannpower-data`, file `data.json`, written by the app.
- Weekly digest: `npm run report` (needs `.env` with `MANNPOWER_TOKEN`).

## Develop

```bash
npm install
npm test
npm run dev
```

## Install on the phone

Open the app URL in Chrome, tap the three dots, tap "Add to Home screen". Then open Settings inside the app and paste the GitHub token.

Design spec: `docs/superpowers/specs/2026-09-08-mannpower-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add .github README.md
git commit -m "Add GitHub Pages deploy workflow and README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Ask Jeremy to create the two repos (checkpoint, needs the user)**

The `gh` CLI is not installed and there is no stored GitHub credential on this PC, so repo creation is a browser step. Send this message and wait:

> Two quick things on github.com while signed in as jmannella:
> 1. Create a **public** repo named `mannpower` (no README, no .gitignore). Then in that repo go to Settings, Pages, and set Source to **GitHub Actions**.
> 2. Create a **private** repo named `mannpower-data` **with** "Add a README" checked.
> 3. Create a token: Settings, Developer settings, Personal access tokens, Fine-grained tokens, Generate new token. Name it Mannpower, repository access "Only select repositories" and pick `mannpower-data`, permissions Contents: Read and write. Copy the token; you will paste it into the app and I will need it for the desktop `.env` (paste it in chat only if you are comfortable, otherwise put it in `.env` yourself as `MANNPOWER_TOKEN=...`).
> Tell me when the repos exist and I will push.

- [ ] **Step 5: Push**

```bash
git remote add origin https://github.com/jmannella/mannpower.git
git push -u origin main
```

Expected: Git Credential Manager opens a browser sign-in on first push; after Jeremy signs in, the push completes. If the push is rejected because the repo has a commit (README added by mistake), run `git pull --rebase origin main` then push again.

- [ ] **Step 6: Verify the deploy**

Wait about two minutes, then:

```bash
curl -s -o /dev/null -w "%{http_code}" https://jmannella.github.io/mannpower/
```

Expected: `200`. If `404`, open the Actions tab of the repo in the browser and read the failed step; the usual cause is Pages source not set to GitHub Actions.

- [ ] **Step 7: Create .env on the desktop**

```bash
cp .env.example .env
```

Then put the token into `.env` as `MANNPOWER_TOKEN=github_pat_...`. `.env` is in `.gitignore`; confirm with `git status` that it is not listed.

- [ ] **Step 8: Install on the phone and connect sync (Jeremy does this)**

> On your phone: open https://jmannella.github.io/mannpower/ in Chrome, three dots, "Add to Home screen". Open it from the home screen, tap the gear, paste the token, tap "Save sync settings" then "Sync now". The dot should turn green. Log today's weight and check that `data.json` appears in the mannpower-data repo on github.com.

- [ ] **Step 9: Verify the report end to end**

After the phone has synced at least once:

```bash
npm run report
```

Expected: the digest prints with the real data (the current week will be thin; that is fine).

---

### Task 19: Sunday evening scheduled report

**Files:** none in the repo. This task configures the desktop scheduled task.

**Interfaces:**
- Consumes: `npm run report` (Task 17), the connected Gmail account.
- Produces: a scheduled task in the Claude desktop app that runs every Sunday at 7 pm Eastern in the project folder.

- [ ] **Step 1: Load the scheduler tool**

Use ToolSearch with `select:mcp__scheduled-tasks__create_scheduled_task` to load its schema, then read the schema to map the fields below onto it.

- [ ] **Step 2: Create the task**

Schedule: every Sunday at 19:00, time zone America/Toronto (cron `0 19 * * 0`). Working directory: `C:\Users\Jeremy Mannella\Claude Code\Workout app`. Name: `Mannpower weekly report`. Prompt (copy exactly):

```
Run the Mannpower weekly report.

1. In this folder run `npm run report` with the Bash tool and capture the output.
2. If the command exits non-zero, send an email from the connected Gmail account to jeremymannella@gmail.com with the subject "Mannpower weekly report could not run" and the error text in the body, then stop.
3. Otherwise read the digest. It has Summary, Highlights, Muscle groups, Recommendation facts and Pain sections plus a JSON block of the same facts. Write an email with the subject "Mannpower, week of <weekStart in words, e.g. September 7>" and these sections in plain prose with short paragraphs:
   - Summary: workouts done (trainer and solo counts), volume and its change from the previous week, body weight average and change, average steps and days at goal, cardio minutes with desk treadmill called out, and the week streak.
   - Highlights: every PR with old and new numbers, the biggest strength gain, the best step day. If there were none, say so in one sentence.
   - Recommendations: three to five specific items drawn only from the Recommendation facts. For a stalled lift name the exercise, the current weight, and the suggested new weight. For an under-trained muscle group say how many sets it got and suggest one exercise from the built-in library for it. If the weight band is too_fast say to eat a little more; if too_slow or gaining say to tighten food or add desk treadmill minutes; if in_band say to keep going. Mention the step goal shortfall or cardio absence if either applies. If solo sessions are falling short of trainer sessions in volume or sets, say by how much and suggest one concrete addition for the next solo day.
   - Pain: include only if the Pain section has entries or patterns. Describe the pattern in one or two sentences per body area (which exercises it coincides with, whether it followed a volume jump, whether severity is trending up) and phrase every suggestion as something to raise with the trainer. Do not diagnose or give treatment advice.
4. Style: write like a knowledgeable friend, not a report generator. Use numbered lists where a list is natural. Never use em dashes or hyphens as sentence connectors, and never end a sentence with a dash and a tag. Use commas, colons, or separate sentences. Keep it under 400 words.
5. Send the email from the connected Gmail account to jeremymannella@gmail.com. Reply with the subject line and nothing else.
```

- [ ] **Step 3: Confirm and dry run**

Run the task once manually if the scheduler offers a "run now", or ask Jeremy to trigger it. Expected: an email arrives in his inbox with four sections and no dashes. If the Gmail tools are not available in the scheduled session, report that to Jeremy: the fallback is for the task to write the email to `docs/reports/YYYY-MM-DD.md` and for Jeremy to send it, but that is a downgrade he should decide on.

- [ ] **Step 4: Save memory**

Write a project memory note recording the task name, schedule, and where `.env` lives, so a future session can find and edit it.

---

## Self-review notes

Spec coverage, checked section by section:

- Decisions table: platform, units, routine, trainer toggle, cardio, name, steps, data location, hosting, report timing, stack: Tasks 1, 2, 11, 12, 13, 18, 19.
- Look and feel: Task 11 theme, fonts in Task 1 index.html, icon in Task 11.
- Repositories and sync: Tasks 10, 18.
- Weekly report: Tasks 9, 17, 19.
- Data model: Task 2 (types), Task 4 (storage, token excluded from export).
- Today screen: Task 12 (date, weight, steps, cardio with desk treadmill quick add and multiple sessions, log pain, start or continue, week strip).
- Workout screen: Task 13 (trainer toggle, search grouped by muscle, custom add, last time line, flare rate, set rows with warm-up, add set copies previous, reorder via arrows instead of a drag handle, log pain per exercise, finish summary with volume, per group, PRs, pain; continuous save).
- History: Task 14 (list, pills, filter chips, tap to edit, exercise history with e1RM chart, relative strength, flare rate).
- Trends: Task 15 (all seven charts and range chips).
- Settings: Task 16 (sync status and token, goals, default mode, backup export and import with validation and confirm, custom exercises with delete guard).
- Stats definitions: Tasks 5 to 9, each definition has a named function and a test.
- Weekly email content: Task 9 markdown plus Task 19 prompt.
- Error handling: sync errors in Task 10 engine and Task 16 banner; numeric validation in NumberField and SetInput; import validation in Task 4 and 16; report script exit codes in Task 17; failure email in Task 19.
- Testing: unit tests in every stats file, sync tests with mocked fetch, library validation test, report fixture test, screen tests, manual checks at phone width, phone install in Task 18.

Deviations from the spec, deliberate:
- Exercise reorder uses up and down arrow buttons rather than a drag handle. Drag on mobile web is unreliable and hard to test; arrows do the same job.
- One workout per date. The Today "Continue" button and History rows key on the date, which matches how Jeremy trains.
- Sets with zero reps are ignored by all stats so a freshly added row does not count until filled in.
