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

  // Entries also live in local state so edits render right away: the DB write
  // above is real IndexedDB and settles a tick or two after the click, and the
  // live query that would otherwise drive this list lags behind that. This
  // mirror is reconciled from the live query whenever it catches up.
  const [localEntries, setLocalEntries] = useState<WorkoutEntry[]>(workout?.entries ?? [])
  useEffect(() => { setLocalEntries(workout?.entries ?? []) }, [workout])

  const applyEntries = (transform: (entries: WorkoutEntry[]) => WorkoutEntry[]) => {
    setLocalEntries(transform)
    void (async () => {
      const w = await current()
      await saveWorkout({ ...w, entries: transform(w.entries) })
    })()
  }

  const addExercise = (exerciseId: string) => {
    const id = newId()
    applyEntries((es) => [...es, { id, exerciseId, sets: [] }])
    setQuery('')
  }
  const removeEntry = (id: string) => applyEntries((es) => es.filter((e) => e.id !== id))
  const moveEntry = (id: string, dir: -1 | 1) =>
    applyEntries((es) => {
      const i = es.findIndex((e) => e.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= es.length) return es
      const next = [...es]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const setSets = async (entryId: string, sets: SetRecord[]) => {
    const transform = (es: WorkoutEntry[]) => es.map((e) => (e.id === entryId ? { ...e, sets } : e))
    setLocalEntries(transform)
    const w = await current()
    const next = { ...w, entries: transform(w.entries) }
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
  const entries = localEntries
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
                    <span>{e.name}</span><span className="muted" aria-hidden="true">+</span>
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

      {customOpen && (
        <CustomExerciseSheet name={query.trim()} onClose={() => setCustomOpen(false)} onCreate={async (ex) => { await saveExercise(ex); setCustomOpen(false); addExercise(ex.id) }} />
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
