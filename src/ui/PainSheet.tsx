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
