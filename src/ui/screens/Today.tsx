import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { NumberField } from '../components/NumberField'
import { BigNumber } from '../components/BigNumber'
import { Section } from '../components/Section'
import { Sheet } from '../components/Sheet'
import { Chip } from '../components/Chip'
import { MealSheet } from '../MealSheet'
import { PainSheet } from '../PainSheet'
import { useDay, useDays, useMeals, usePain, useSettings, useWorkoutByDate, useWorkouts } from '../hooks'
import { getSettings, modifyDay, saveSettings } from '../../data/repo'
import { newId } from '../../domain/ids'
import { addDays, formatShort, todayISO, weekEnd, weekStart } from '../../domain/dates'
import { BUILTIN_CARDIO_TYPES } from '../../library/cardioTypes'
import { bodyAreaLabel } from '../../library/bodyAreas'
import { bodyWeightAvg7 } from '../../stats/bodyweight'
import { dayCardioMinutes, stepsSummary } from '../../stats/activity'
import { dayTotals } from '../../nutrition/totals'
import { targetsFor } from '../../nutrition/targets'
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
  const [mealOpen, setMealOpen] = useState(false)

  const meals = useMeals()
  const food = dayTotals(meals, date)
  const targets = settings ? targetsFor({ meals, days, workouts, settings }, date) : undefined
  const left = (target: number | undefined, eaten: number) => (target === undefined ? Math.round(eaten) : Math.abs(Math.round(target - eaten)))
  const leftLabel = (target: number | undefined, eaten: number, unit: string) => (target === undefined ? `${unit} eaten` : target - eaten >= 0 ? `${unit} left` : `${unit} over`)

  const base: DayRecord = day ?? { date, cardio: [], updatedAt: '' }
  // Each write happens inside one transaction so two quick edits never clobber each other.
  const modify = (fn: (cur: DayRecord) => Partial<DayRecord>) => modifyDay(date, fn)
  const patch = (p: Partial<DayRecord>) => modify(() => p)

  const addCardio = async (c: Omit<CardioSession, 'id'>) => {
    await modify((cur) => ({ cardio: [...cur.cardio, { id: newId(), ...c }] }))
    const current = await getSettings()
    const known = [...BUILTIN_CARDIO_TYPES, ...current.customCardioTypes]
    if (!known.includes(c.type)) await saveSettings({ customCardioTypes: [...current.customCardioTypes, c.type] })
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
        <input className="input" style={{ width: 'auto' }} type="date" value={date} aria-label="Date" onChange={(e) => e.target.value && setDate(e.target.value)} />
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

      <Section title="Food" right={<button type="button" className="btn btn-sm" onClick={() => setMealOpen(true)}>Add meal</button>}>
        <div className="card">
          <div className="grid-3">
            <BigNumber value={left(targets?.calories, food.calories)} label={leftLabel(targets?.calories, food.calories, 'kcal')} tone="accent" />
            <BigNumber value={left(targets?.protein, food.protein)} label={leftLabel(targets?.protein, food.protein, 'g protein')} tone="cyan" />
            <BigNumber value={food.meals} label="Meals" />
          </div>
        </div>
      </Section>

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

      {cardioOpen && (
        <CardioSheet initialType={cardioOpen.type} types={cardioTypes} onClose={() => setCardioOpen(null)} onAdd={addCardio} />
      )}
      <PainSheet open={painOpen} onClose={() => setPainOpen(false)} date={date} />
      {mealOpen && <MealSheet date={date} onClose={() => setMealOpen(false)} />}
    </div>
  )
}

function CardioSheet({ initialType, types, onClose, onAdd }: {
  initialType: string; types: string[]; onClose: () => void; onAdd: (c: Omit<CardioSession, 'id'>) => void
}) {
  const [type, setType] = useState(initialType)
  const [custom, setCustom] = useState('')
  const [minutes, setMinutes] = useState<number | undefined>()
  const [distance, setDistance] = useState<number | undefined>()

  const finalType = type === 'Other' ? custom.trim() || 'Other' : type
  const reset = () => { setMinutes(undefined); setDistance(undefined); setCustom('') }
  const add = () => {
    if (!minutes || minutes <= 0) return
    onAdd({ type: finalType, minutes, distance })
    reset()
    onClose()
  }
  return (
    <Sheet open onClose={() => { reset(); onClose() }} title="Add cardio">
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
