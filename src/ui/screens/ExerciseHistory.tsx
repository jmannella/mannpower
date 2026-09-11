import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Header } from '../components/Header'
import { Chip } from '../components/Chip'
import { BigNumber } from '../components/BigNumber'
import { Section } from '../components/Section'
import { ChartTip } from '../components/ChartTip'
import { useDays, useExercises, usePain, useWorkouts } from '../hooks'
import { MUSCLE_LABELS } from '../../domain/types'
import { formatShort } from '../../domain/dates'
import { exerciseHistory } from '../../stats/prs'
import { normalizeVariation } from '../../library/variations'
import { latestBodyWeight, relativeStrength } from '../../stats/bodyweight'
import { flareRate } from '../../stats/pain'

export default function ExerciseHistory() {
  const { id = '' } = useParams()
  const exercises = useExercises()
  const workouts = useWorkouts()
  const days = useDays()
  const pain = usePain()
  const ex = exercises.find((e) => e.id === id)
  const allSessions = useMemo(() => exerciseHistory(workouts, id), [workouts, id])
  // Each variation is its own lift; the chip row picks which one the numbers and chart describe.
  const variants = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of allSessions) {
      const key = normalizeVariation(s.variation)
      if (!seen.has(key)) seen.set(key, s.variation ?? 'Plain')
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => (a.key === '' ? -1 : b.key === '' ? 1 : a.label.localeCompare(b.label)))
  }, [allSessions])
  const [variant, setVariant] = useState('')
  const chosen = variants.some((v) => v.key === variant) ? variant : (variants[0]?.key ?? '')
  const history = useMemo(() => allSessions.filter((s) => normalizeVariation(s.variation) === chosen), [allSessions, chosen])
  const best = history.reduce((b, s) => (s.bestE1rm > (b?.bestE1rm ?? 0) ? s : b), history[0])
  const heaviest = history.reduce((m, s) => Math.max(m, s.topWeight), 0)
  const bw = latestBodyWeight(days)
  const rel = best ? relativeStrength(best.bestE1rm, bw?.weight) : undefined
  const flare = flareRate(workouts, pain, id)
  const chart = history.map((s) => ({ date: s.date, label: formatShort(s.date), e1rm: Math.round(s.bestE1rm) }))

  return (
    <div className="screen">
      <Header title={ex?.name ?? 'Exercise'} />
      {ex && <div className="muted">{MUSCLE_LABELS[ex.primary]}{ex.secondary.length ? ` · also ${ex.secondary.map((g) => MUSCLE_LABELS[g]).join(', ')}` : ''}</div>}
      {variants.length > 1 && (
        <div className="chips">
          {variants.map((v) => <Chip key={v.key} on={v.key === chosen} onClick={() => setVariant(v.key)} className="chip-cyan">{v.label}</Chip>)}
        </div>
      )}
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
                <Tooltip content={<ChartTip />} wrapperStyle={{ outline: 'none' }} />
                <Line type="monotone" dataKey="e1rm" stroke="#ff5a1f" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
      <Section title="Sessions">
        {allSessions.length === 0 && <div className="muted">Never logged.</div>}
        <div className="list">
          {[...allSessions].reverse().map((s) => (
            <div key={s.workoutId} className="list-item">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{formatShort(s.date)}</strong>
                <span className="muted">{s.variation ? `${s.variation} · ` : ''}{s.sets.map((x) => `${x.weight} x ${x.reps}`).join(', ')}</span>
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
