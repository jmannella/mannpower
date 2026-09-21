import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { Section } from '../components/Section'
import { MealSheet } from '../MealSheet'
import { useDays, useMeals, useSettings, useWorkouts } from '../hooks'
import { deleteMeal, saveMeal, saveSavedMeal } from '../../data/repo'
import { newId } from '../../domain/ids'
import { formatShort, nowISO, todayISO } from '../../domain/dates'
import { dayTotals, mealTotals } from '../../nutrition/totals'
import { targetsFor } from '../../nutrition/targets'
import type { MealEntry } from '../../domain/types'

function Meter({ label, value, target, unit, cyan }: { label: string; value: number; target?: number; unit: string; cyan?: boolean }) {
  const left = target === undefined ? undefined : Math.round(target - value)
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row-between">
        <span className="field-label">{label}</span>
        <span className="muted">{Math.round(value)}{target === undefined ? '' : ` of ${target}`} {unit}</span>
      </div>
      <div className="meter-value">
        {left === undefined ? Math.round(value) : Math.abs(left)}
        <small>{left === undefined ? unit : left >= 0 ? `${unit} left` : `${unit} over`}</small>
      </div>
      {target !== undefined && (
        <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)}>
          <div className={`meter-fill ${cyan ? 'meter-cyan' : ''} ${left !== undefined && left < 0 ? 'meter-over' : ''}`} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
        </div>
      )}
    </div>
  )
}

export default function Food() {
  const [date, setDate] = useState(todayISO())
  const meals = useMeals()
  const days = useDays()
  const workouts = useWorkouts()
  const settings = useSettings()
  const [sheet, setSheet] = useState<{ editing?: MealEntry } | null>(null)

  const dayMeals = meals.filter((m) => m.date === date).sort((a, b) => a.time.localeCompare(b.time))
  const totals = dayTotals(meals, date)
  const targets = settings ? targetsFor({ meals, days, workouts, settings }, date) : undefined

  const star = async (m: MealEntry) => {
    const id = newId()
    await saveSavedMeal({ id, name: m.description, items: m.items.map((i) => ({ ...i })), useCount: 1, lastUsedAt: nowISO() })
    await saveMeal({ ...m, savedMealId: id })
  }

  return (
    <div className="screen">
      <Header title="Food" />
      <div className="row-between">
        <h2>{date === todayISO() ? 'Today' : formatShort(date)}</h2>
        <input className="input" style={{ width: 'auto' }} type="date" value={date} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>

      <div className="card stack">
        <Meter label="Calories" value={totals.calories} target={targets?.calories} unit="kcal" />
        <Meter label="Protein" value={totals.protein} target={targets?.protein} unit="g" cyan />
        {targets && targets.calories === undefined && (
          <div className="muted">
            No calorie target yet. Add your {targets.missing.join(', ') || 'details'} in <Link to="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>.
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet({})}>Add meal</button>

      <Section title="Meals" right={<span className="muted">{dayMeals.length}</span>}>
        {dayMeals.length === 0 && <div className="muted">Nothing logged.</div>}
        <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {dayMeals.map((m) => {
            const t = mealTotals(m)
            return (
              <li key={m.id} className="list-item meal-row">
                <button type="button" className="meal-main" aria-label={`Edit ${m.description}`} onClick={() => setSheet({ editing: m })}>
                  <div className="meal-time">{m.time}</div>
                  <strong>{m.description}</strong>
                  <div className="muted">
                    {m.needsEstimate ? 'Needs estimate' : `${Math.round(t.calories)} kcal, ${Math.round(t.protein)} g protein`}
                    {m.confidence === 'low' ? ', rough' : ''}
                  </div>
                </button>
                {m.needsEstimate && <button type="button" className="btn btn-sm" aria-label={`Estimate ${m.description}`} onClick={() => setSheet({ editing: m })}>Estimate</button>}
                {!m.needsEstimate && !m.savedMealId && (
                  <button type="button" className="icon-btn" aria-label={`Save ${m.description} as a saved meal`} onClick={() => star(m)}>☆</button>
                )}
                <button type="button" className="icon-btn" aria-label={`Delete ${m.description}`} onClick={() => deleteMeal(m.id)}>×</button>
              </li>
            )
          })}
        </ul>
      </Section>

      {sheet && <MealSheet date={date} editing={sheet.editing} onClose={() => setSheet(null)} />}
    </div>
  )
}
