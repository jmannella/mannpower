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
import { latestBodyWeight, relativeStrength } from '../../stats/bodyweight'
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
  const chart = history.map((s) => ({ date: s.date, label: formatShort(s.date), e1rm: Math.round(s.bestE1rm) }))

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
