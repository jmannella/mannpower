import { useMemo, useRef, useState } from 'react'
import { Sheet } from './components/Sheet'
import { Chip } from './components/Chip'
import { NumberField } from './components/NumberField'
import { MealConfirm, type ConfirmedMeal, type MealDraft } from './MealConfirm'
import { useMeals, useSavedMeals } from './hooks'
import { deleteSavedMeal, logSavedMeal, saveMeal, saveSavedMeal } from '../data/repo'
import { estimateMeal } from '../nutrition/estimate'
import { sumItems } from '../nutrition/totals'
import { newId } from '../domain/ids'
import { addDays, nowISO, nowTime } from '../domain/dates'
import type { FoodItem, MealEntry } from '../domain/types'

type Mode = 'describe' | 'saved' | 'quick'
const MODE_KEY = 'mannpower.mealMode'

function loadMode(): Mode {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return m === 'saved' || m === 'quick' ? m : 'describe'
  } catch { return 'describe' }
}
function storeMode(m: Mode): void {
  try { localStorage.setItem(MODE_KEY, m) } catch { /* storage can be blocked; the default mode is fine */ }
}

const summary = (items: FoodItem[]) => { const t = sumItems(items); return `${Math.round(t.calories)} kcal, ${Math.round(t.protein)} g protein` }

/** Rendered only while open. Parents mount it conditionally so every open starts from clean state. */
export function MealSheet({ date, editing, onClose }: { date: string; editing?: MealEntry; onClose: () => void }) {
  const meals = useMeals()
  const saved = useSavedMeals()
  // A meal saved for later reopens in Describe and keeps its id and time; any other meal opens straight in the confirm view.
  const pendingMeal = editing?.needsEstimate ? editing : undefined
  const [mode, setModeState] = useState<Mode>(pendingMeal ? 'describe' : loadMode())
  const [draft, setDraft] = useState<MealDraft | null>(editing && !pendingMeal
    ? { id: editing.id, createdAt: editing.createdAt, description: editing.description, items: editing.items, source: editing.source, confidence: editing.confidence, savedMealId: editing.savedMealId, time: editing.time }
    : null)
  const [text, setText] = useState(pendingMeal?.description ?? '')
  const [photo, setPhoto] = useState<File | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickCalories, setQuickCalories] = useState<number | undefined>()
  const [quickProtein, setQuickProtein] = useState<number | undefined>()
  const photoRef = useRef<HTMLInputElement>(null)

  const setMode = (m: Mode) => { setModeState(m); storeMode(m) }
  const mealDate = editing?.date ?? date
  const keepId = pendingMeal ? { id: pendingMeal.id, createdAt: pendingMeal.createdAt } : {}
  const newTime = () => pendingMeal?.time ?? nowTime()

  const recents = useMemo(() => {
    const cutoff = addDays(date, -14)
    const savedNames = new Set(saved.map((s) => s.name.trim().toLowerCase()))
    const seen = new Map<string, MealEntry>()
    for (const m of [...meals].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))) {
      if (m.needsEstimate || m.items.length === 0 || m.date < cutoff) continue
      const key = m.description.trim().toLowerCase()
      if (savedNames.has(key) || seen.has(key)) continue
      seen.set(key, m)
    }
    return [...seen.values()].slice(0, 10)
  }, [meals, saved, date])
  const q = search.trim().toLowerCase()
  const match = (name: string) => q === '' || name.toLowerCase().includes(q)

  const runEstimate = async () => {
    setBusy(true); setError(null)
    const r = await estimateMeal({ text, photo })
    setBusy(false)
    if (!r.ok) { setError(r.message); return }
    setDraft({ ...keepId, description: text.trim() || 'Photo meal', items: r.items, source: 'ai', confidence: r.confidence, note: r.note, time: pendingMeal?.time })
  }

  const saveForLater = async () => {
    await saveMeal({ id: newId(), createdAt: '', ...keepId, date: mealDate, time: newTime(), description: text.trim(), items: [], source: 'ai', needsEstimate: true, updatedAt: '' })
    onClose()
  }

  const byHand = () => { setQuickName(text.trim()); setError(null); setMode('quick') }

  const saveConfirmed = async (c: ConfirmedMeal) => {
    if (!draft) return
    let savedMealId = draft.savedMealId
    if (c.saveAsSaved) {
      savedMealId = newId()
      await saveSavedMeal({ id: savedMealId, name: c.description, items: c.items, useCount: 1, lastUsedAt: nowISO() })
    }
    await saveMeal({
      id: draft.id ?? newId(), date: mealDate, time: c.time, description: c.description, items: c.items,
      source: draft.source, confidence: draft.confidence, savedMealId, createdAt: draft.createdAt ?? '', updatedAt: '',
    })
    onClose()
  }

  const logSaved = async (id: string) => { await logSavedMeal(id, date, nowTime()); onClose() }
  const logRecent = async (m: MealEntry) => {
    await saveMeal({ ...m, id: newId(), date, time: nowTime(), items: m.items.map((i) => ({ ...i })), createdAt: '', updatedAt: '' })
    onClose()
  }

  const saveQuick = async () => {
    if (!quickCalories || quickCalories <= 0) return
    const name = quickName.trim() || 'Quick add'
    await saveMeal({
      id: newId(), createdAt: '', ...keepId, date: mealDate, time: newTime(), description: name,
      items: [{ name, kind: 'food', calories: quickCalories, protein: quickProtein ?? 0 }], source: 'quick', updatedAt: '',
    })
    onClose()
  }

  if (draft) {
    return (
      <Sheet open onClose={onClose} title={editing && !pendingMeal ? 'Edit meal' : 'Add meal'}>
        <MealConfirm draft={draft} onSave={saveConfirmed} onBack={() => (editing && !pendingMeal ? onClose() : setDraft(null))} />
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title="Add meal">
      <div className="chips">
        <Chip on={mode === 'describe'} onClick={() => setMode('describe')}>Describe</Chip>
        <Chip on={mode === 'saved'} onClick={() => setMode('saved')}>Saved</Chip>
        <Chip on={mode === 'quick'} onClick={() => setMode('quick')}>Quick add</Chip>
      </div>

      {mode === 'describe' && (
        <div className="stack">
          <textarea className="input" aria-label="Describe the meal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Two eggs, toast with butter, large double double" />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden aria-label="Meal photo" onChange={(e) => { setPhoto(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" className="btn" onClick={() => (photo ? setPhoto(undefined) : photoRef.current?.click())}>{photo ? 'Photo added, tap to remove' : 'Add a photo'}</button>
          {error && (
            <div className="stack">
              <div className="banner banner-error">{error}</div>
              <div className="grid-2">
                <button type="button" className="btn" onClick={byHand}>Enter numbers by hand</button>
                <button type="button" className="btn" disabled={!text.trim()} onClick={saveForLater}>Save for later</button>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={busy || (!text.trim() && !photo)} onClick={runEstimate}>{busy ? 'Estimating' : 'Estimate'}</button>
        </div>
      )}

      {mode === 'saved' && (
        <div className="stack">
          <input className="input" aria-label="Search saved meals" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
          {saved.length === 0 && recents.length === 0 && <div className="muted">Nothing yet. Star a meal on the Food tab and it will show up here.</div>}
          <div className="list">
            {saved.filter((s) => match(s.name)).map((s) => (
              <div key={s.id} className="meal-row">
                <button type="button" className="meal-main" aria-label={`Log ${s.name}`} onClick={() => logSaved(s.id)}>
                  <strong>{s.name}</strong><div className="muted">{summary(s.items)}</div>
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Adjust ${s.name}`} onClick={() => setDraft({ description: s.name, items: s.items, source: 'saved', savedMealId: s.id })}>Adjust</button>
                <button type="button" className="icon-btn" aria-label={`Remove saved meal ${s.name}`} onClick={() => { if (confirm(`Remove ${s.name} from saved meals? Meals already logged stay.`)) void deleteSavedMeal(s.id) }}>×</button>
              </div>
            ))}
          </div>
          {recents.some((m) => match(m.description)) && <span className="field-label">Recent</span>}
          <div className="list">
            {recents.filter((m) => match(m.description)).map((m) => (
              <div key={m.id} className="meal-row">
                <button type="button" className="meal-main" aria-label={`Log ${m.description}`} onClick={() => logRecent(m)}>
                  <strong>{m.description}</strong><div className="muted">{summary(m.items)}</div>
                </button>
                <button type="button" className="btn btn-sm" aria-label={`Adjust ${m.description}`} onClick={() => setDraft({ description: m.description, items: m.items, source: m.source, confidence: m.confidence })}>Adjust</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'quick' && (
        <div className="stack">
          <div className="grid-2">
            <NumberField label="Calories" value={quickCalories} onCommit={setQuickCalories} allowDecimal={false} big />
            <NumberField label="Protein" value={quickProtein} onCommit={setQuickProtein} suffix="g" big />
          </div>
          <label className="field"><span className="field-label">Name</span>
            <input className="input" aria-label="Name" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Optional" />
          </label>
          <button type="button" className="btn btn-primary btn-block" disabled={!quickCalories || quickCalories <= 0} onClick={saveQuick}>Save quick add</button>
        </div>
      )}
    </Sheet>
  )
}
