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
