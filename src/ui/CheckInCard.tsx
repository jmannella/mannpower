import { useState } from 'react'
import { NumberField } from './components/NumberField'
import { Chip } from './components/Chip'
import { needsMonthlyMeasurement, needsWaist } from '../stats/measurements'
import type { DayRecord, Supplement } from '../domain/types'

interface Props {
  date: string
  day: DayRecord
  /** Every day record, used only to work out whether the waist row is due. */
  days: DayRecord[]
  supplements: Supplement[]
  onPatch: (patch: Partial<DayRecord>) => void
  onToggleSupplement: (supplementId: string) => void
}

/**
 * The morning check in. Four typed numbers off the watch and ring, the supplement ticks,
 * and a waist row that only appears when one is due. Collapses to a summary once filled
 * so it is out of the way for the rest of the day.
 */
export function CheckInCard({ date, day, days, supplements, onPatch, onToggleSupplement }: Props) {
  const complete = day.sleepScore !== undefined && day.sleepHours !== undefined
    && day.readiness !== undefined && day.restingHr !== undefined
  const [open, setOpen] = useState(false)
  const taken = day.supplementsTaken ?? []
  const active = supplements.filter((s) => s.active)
  const waistDue = needsWaist(days, date)
  const neckDue = needsMonthlyMeasurement(days, date, 'neck')
  const hipDue = needsMonthlyMeasurement(days, date, 'hip')

  if (complete && !open) {
    const parts = [
      `Sleep ${day.sleepScore}`,
      `${day.sleepHours} h`,
      `Readiness ${day.readiness}`,
      `RHR ${day.restingHr}`,
      ...active.filter((s) => taken.includes(s.id)).map((s) => s.name.split(' ')[0]),
    ]
    return (
      <button type="button" className="card card-button" aria-label="Check in" onClick={() => setOpen(true)}>
        <span className="muted">{parts.join(' · ')}</span>
      </button>
    )
  }

  return (
    <div className="card">
      <div className="row-between">
        <h3>Check in</h3>
        {complete && <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Done</button>}
      </div>
      {waistDue && (
        <NumberField label="Waist (around the navel)" value={day.waist} onCommit={(v) => onPatch({ waist: v })} suffix="in" />
      )}
      {(neckDue || hipDue) && (
        <div className="grid-2">
          {neckDue && <NumberField label="Neck (below the larynx)" value={day.neck} onCommit={(v) => onPatch({ neck: v })} suffix="in" />}
          {hipDue && <NumberField label="Hip (widest point)" value={day.hip} onCommit={(v) => onPatch({ hip: v })} suffix="in" />}
        </div>
      )}
      <div className="grid-2">
        <NumberField label="Sleep score" value={day.sleepScore} onCommit={(v) => onPatch({ sleepScore: v })} allowDecimal={false} />
        <NumberField label="Sleep hours" value={day.sleepHours} onCommit={(v) => onPatch({ sleepHours: v })} suffix="h" />
        <NumberField label="Readiness" value={day.readiness} onCommit={(v) => onPatch({ readiness: v })} allowDecimal={false} />
        <NumberField label="Resting heart rate" value={day.restingHr} onCommit={(v) => onPatch({ restingHr: v })} allowDecimal={false} suffix="bpm" />
      </div>
      {active.length > 0 && (
        <div className="chips">
          {active.map((s) => (
            <Chip key={s.id} on={taken.includes(s.id)} onClick={() => onToggleSupplement(s.id)}>{s.name}</Chip>
          ))}
        </div>
      )}
    </div>
  )
}
