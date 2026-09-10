import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { Sheet } from '../components/Sheet'
import { Section } from '../components/Section'
import { BigNumber } from '../components/BigNumber'
import { PainSheet } from '../PainSheet'
import { useExercises, usePain, useSettings, useWorkoutByDate, useWorkouts } from '../hooks'
import { deleteWorkout, modifyWorkoutByDate, saveExercise } from '../../data/repo'
import { newId } from '../../domain/ids'
import { formatShort, nowISO, todayISO } from '../../domain/dates'
import { MUSCLE_GROUPS, MUSCLE_LABELS, type Exercise, type MuscleGroup, type SetRecord, type Workout as WorkoutRecord, type WorkoutEntry } from '../../domain/types'
import { exerciseMap, workoutVolume } from '../../stats/sets'
import { exerciseHistory, prsForWorkout } from '../../stats/prs'
import { workoutMuscleLoad } from '../../stats/muscle'
import { flareRate } from '../../stats/pain'
import { bodyAreaLabel } from '../../library/bodyAreas'
import { searchExercises } from '../../library/exercises'

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
  const [swapFor, setSwapFor] = useState<string | null>(null)

  useEffect(() => {
    if (!pulseEntry) return
    const t = setTimeout(() => setPulseEntry(null), 2000)
    return () => clearTimeout(t)
  }, [pulseEntry])

  // Every write happens inside one transaction so two quick taps can never clobber
  // each other, even when the live query lags a few milliseconds behind a save.
  const draftId = useRef(newId())
  const draft = (): WorkoutRecord =>
    ({ id: draftId.current, date, withTrainer: settings?.defaultWithTrainer ?? true, entries: [], createdAt: nowISO(), updatedAt: '' })
  const update = (fn: (w: WorkoutRecord) => WorkoutRecord) => modifyWorkoutByDate(date, draft, fn)

  const addExercise = (exerciseId: string) => {
    void update((w) => ({ ...w, entries: [...w.entries, { id: newId(), exerciseId, sets: [] }] }))
    setQuery('')
  }
  const removeEntry = (id: string) =>
    update((w) => {
      const i = w.entries.findIndex((e) => e.id === id)
      const entries = w.entries.filter((e) => e.id !== id)
      // The card above the removed one can no longer be linked to it.
      if (i > 0 && entries[i - 1]) entries[i - 1] = { ...entries[i - 1], supersetWithNext: false }
      return { ...w, entries }
    })
  const moveEntry = (id: string, dir: -1 | 1) =>
    update((w) => {
      const i = w.entries.findIndex((e) => e.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= w.entries.length) return w
      const entries = [...w.entries]
      ;[entries[i], entries[j]] = [entries[j], entries[i]]
      // Moving a card breaks any superset link touching the cards involved.
      for (const k of [Math.min(i, j) - 1, i, j]) if (entries[k]) entries[k] = { ...entries[k], supersetWithNext: false }
      return { ...w, entries }
    })
  const swapExercise = (id: string, exerciseId: string) => {
    void update((w) => ({ ...w, entries: w.entries.map((e) => (e.id === id ? { ...e, exerciseId } : e)) }))
    setSwapFor(null)
  }
  const setSuperset = (id: string, on: boolean) =>
    update((w) => ({ ...w, entries: w.entries.map((e) => (e.id === id ? { ...e, supersetWithNext: on } : e)) }))
  const updateSets = async (entryId: string, fn: (sets: SetRecord[]) => SetRecord[]) => {
    const next = await modifyWorkoutByDate(date, draft, (w) => ({
      ...w,
      entries: w.entries.map((e) => (e.id === entryId ? { ...e, sets: fn(e.sets) } : e)),
    }))
    const entry = next.entries.find((e) => e.id === entryId)
    if (entry && prsForWorkout(workouts, next).some((p) => p.exerciseId === entry.exerciseId)) setPulseEntry(entryId)
  }

  const lastTime = (exerciseId: string) => exerciseHistory(workouts, exerciseId).filter((s) => s.date < date).at(-1)
  const q = query.trim().toLowerCase()
  const results = searchExercises(exercises, query).slice(0, 30)
  const exact = results.some((e) => e.name.toLowerCase() === q)

  const w = workout ?? draft()
  const entries = workout?.entries ?? []
  const prs = workout ? prsForWorkout(workouts, workout) : []
  const starred = new Set(prs.map((p) => p.exerciseId))
  const swapEntry = entries.find((e) => e.id === swapFor)
  // Cards linked by "superset with next" render inside one dashed group.
  const groups: WorkoutEntry[][] = []
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].supersetWithNext && entries[i + 1]) {
      groups.push([entries[i], entries[i + 1]])
      i += 1
    } else groups.push([entries[i]])
  }
  const load = workout ? workoutMuscleLoad(workout, exMap) : null
  const workoutPain = workout ? pain.filter((p) => p.workoutId === workout.id || (p.date === date && !p.workoutId)) : []

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
            <ExerciseResults results={results} onPick={addExercise} />
            {!exact && (
              <button type="button" className="btn btn-ghost" onClick={() => setCustomOpen(true)}>Add "{query.trim()}" as a custom exercise</button>
            )}
          </div>
        )}
      </div>

      {groups.map((group) => {
        const cards = group.map((entry, k) => renderCard(entry, group.length === 2 ? (k === 0 ? 'A' : 'B') : undefined))
        return group.length === 2 ? (
          <div key={group[0].id} className="superset">
            <div className="superset-label">Superset</div>
            {cards}
          </div>
        ) : cards[0]
      })}

      {workout && (
        <button type="button" className="btn btn-danger" onClick={async () => { if (confirm('Delete this whole workout?')) { await deleteWorkout(workout.id); navigate('/history') } }}>
          Delete workout
        </button>
      )}

      {customOpen && (
        <CustomExerciseSheet name={query.trim()} onClose={() => setCustomOpen(false)} onCreate={async (ex) => { await saveExercise(ex); setCustomOpen(false); addExercise(ex.id) }} />
      )}

      {swapEntry && (
        <SwapSheet current={exMap.get(swapEntry.exerciseId)?.name ?? ''} exercises={exercises} onClose={() => setSwapFor(null)} onPick={(exerciseId) => swapExercise(swapEntry.id, exerciseId)} />
      )}

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
                <span><span className="pill pill-pr">★ PR</span> {exMap.get(p.exerciseId)?.name} {p.kind === 'e1rm' ? 'e1RM' : 'top weight'}</span>
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

  function renderCard(entry: WorkoutEntry, marker?: 'A' | 'B') {
    const idx = entries.findIndex((e) => e.id === entry.id)
        const ex = exMap.get(entry.exerciseId)
        const name = ex?.name ?? entry.exerciseId
        const last = lastTime(entry.exerciseId)
        const flare = flareRate(workouts, pain, entry.exerciseId)
        const isPairSecond = idx > 0 && entries[idx - 1].supersetWithNext === true
        const canLink = idx < entries.length - 1 && !isPairSecond
        return (
          <div key={entry.id} className={`card ${pulseEntry === entry.id ? 'pr-pulse' : ''}`}>
            <div className="row-between">
              <div className="row">
                {marker && <span className="superset-marker" aria-hidden="true">{marker}</span>}
                <Link to={`/exercise/${entry.exerciseId}`}><h2>{name}</h2></Link>
                {starred.has(entry.exerciseId) && <span className="star" role="img" aria-label="Personal record">★</span>}
              </div>
              <div className="row">
                <button type="button" className="icon-btn" aria-label={`Change ${name}`} onClick={() => setSwapFor(entry.id)}>⇄</button>
                <button type="button" className="icon-btn" aria-label="Move up" disabled={idx === 0} onClick={() => moveEntry(entry.id, -1)}>▲</button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={idx === entries.length - 1} onClick={() => moveEntry(entry.id, 1)}>▼</button>
                <button type="button" className="icon-btn" aria-label={`Remove ${name}`} onClick={() => removeEntry(entry.id)}>×</button>
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
                onChange={(nextSetValue) => updateSets(entry.id, (sets) => sets.map((x, k) => (k === i ? nextSetValue : x)))}
                onDelete={() => updateSets(entry.id, (sets) => sets.filter((_, k) => k !== i))} />
            ))}
            <div className="row">
              <button type="button" className="btn" onClick={() => updateSets(entry.id, (sets) => [...sets, nextSet({ ...entry, sets }, last?.sets)])}>Add set</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPainFor({ exerciseId: entry.exerciseId, name })}>Log pain</button>
              {entry.supersetWithNext ? (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Unlink ${name} superset`} onClick={() => setSuperset(entry.id, false)}>Unlink</button>
              ) : canLink ? (
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Superset ${name} with next`} onClick={() => setSuperset(entry.id, true)}>Superset ↓</button>
              ) : null}
            </div>
          </div>
        )
  }
}

function ExerciseResults({ results, onPick }: { results: Exercise[]; onPick: (exerciseId: string) => void }) {
  const grouped = MUSCLE_GROUPS.map((g) => ({ g, items: results.filter((e) => e.primary === g) })).filter((x) => x.items.length)
  return (
    <>
      {grouped.map(({ g, items }) => (
        <div key={g} className="stack">
          <div className="field-label">{MUSCLE_LABELS[g]}</div>
          {items.map((e) => (
            <button key={e.id} type="button" className="list-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(e.id)}>
              <span>{e.name}</span><span className="muted" aria-hidden="true">+</span>
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

/** Re-point a logged card at a different exercise, keeping its sets. */
function SwapSheet({ current, exercises, onClose, onPick }: { current: string; exercises: Exercise[]; onClose: () => void; onPick: (exerciseId: string) => void }) {
  const [query, setQuery] = useState('')
  const results = searchExercises(exercises, query).slice(0, 30)
  return (
    <Sheet open onClose={onClose} title="Change exercise">
      <div className="muted">Replacing {current}. Sets stay as they are.</div>
      <input className="input" aria-label="Search replacement" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className="list"><ExerciseResults results={results} onPick={onPick} /></div>
    </Sheet>
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

function CustomExerciseSheet({ name, onClose, onCreate }: { name: string; onClose: () => void; onCreate: (e: Exercise) => void }) {
  const [primary, setPrimary] = useState<MuscleGroup | undefined>()
  const [secondary, setSecondary] = useState<MuscleGroup[]>([])
  const [title, setTitle] = useState(name)
  const toggleSecondary = (g: MuscleGroup) => setSecondary((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))
  return (
    <Sheet open onClose={onClose} title="New exercise">
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
