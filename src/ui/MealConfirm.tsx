import { useState } from 'react'
import { Chip } from './components/Chip'
import { NumberField } from './components/NumberField'
import { nowTime } from '../domain/dates'
import { scaleItems, sumItems } from '../nutrition/totals'
import type { Confidence, FoodItem, MealSource } from '../domain/types'

export interface MealDraft {
  id?: string
  createdAt?: string
  description: string
  items: FoodItem[]
  source: MealSource
  confidence?: Confidence
  note?: string
  savedMealId?: string
  time?: string
}

export interface ConfirmedMeal {
  description: string
  items: FoodItem[]
  time: string
  saveAsSaved: boolean
}

const FACTORS = [0.5, 1, 1.5, 2]

/** Review an estimate or an existing meal. Calories and protein are editable per item; carbs, fat and fibre ride along. */
export function MealConfirm({ draft, onSave, onBack }: { draft: MealDraft; onSave: (m: ConfirmedMeal) => void; onBack: () => void }) {
  const [description, setDescription] = useState(draft.description)
  const [items, setItems] = useState<FoodItem[]>(draft.items)
  const [factor, setFactor] = useState(1)
  const [time, setTime] = useState(draft.time ?? nowTime())
  const [saveAsSaved, setSaveAsSaved] = useState(false)

  const scaled = scaleItems(items, factor)
  const totals = sumItems(scaled)
  const patch = (i: number, p: Partial<FoodItem>) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...p } : it)))
  const remove = (i: number) => setItems((cur) => cur.filter((_, j) => j !== i))
  const canSave = items.length > 0 && description.trim() !== ''

  return (
    <div className="stack">
      {draft.confidence === 'low' && (
        <div className="banner banner-error">Rough estimate. {draft.note ?? 'Check the numbers before saving.'}</div>
      )}
      <label className="field"><span className="field-label">Meal</span>
        <input className="input" aria-label="Meal name" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {items.map((it, i) => (
        <div key={i} className="item-row">
          <label className="field">{i === 0 && <span className="field-label">Item</span>}
            <input className="input" aria-label={`Item ${i + 1} name`} value={it.name} onChange={(e) => patch(i, { name: e.target.value })} />
          </label>
          <NumberField label={i === 0 ? 'kcal' : undefined} ariaLabel={`Item ${i + 1} calories`} value={it.calories} onCommit={(v) => patch(i, { calories: v ?? 0 })} allowDecimal={false} />
          <NumberField label={i === 0 ? 'Protein' : undefined} ariaLabel={`Item ${i + 1} protein`} value={it.protein} onCommit={(v) => patch(i, { protein: v ?? 0 })} />
          <button type="button" className="icon-btn" aria-label={`Remove ${it.name || `item ${i + 1}`}`} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <div>
        <span className="field-label">Portion</span>
        <div className="chips">
          {FACTORS.map((f) => <Chip key={f} on={factor === f} onClick={() => setFactor(f)}>{`${f}x`}</Chip>)}
        </div>
      </div>
      <label className="field"><span className="field-label">Time</span>
        <input className="input" type="time" aria-label="Time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
      </label>
      <div className="card">
        <strong>{Math.round(totals.calories)} kcal</strong> <span className="muted">{Math.round(totals.protein)} g protein</span>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={saveAsSaved} onChange={(e) => setSaveAsSaved(e.target.checked)} />
        <span>Also keep as a saved meal</span>
      </label>
      <div className="grid-2">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => onSave({ description: description.trim(), items: scaled, time, saveAsSaved })}>Save meal</button>
      </div>
    </div>
  )
}
