import { useRef, useState } from 'react'
import { Header } from '../components/Header'
import { NumberField } from '../components/NumberField'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { useDays, useExercises, useMeals, useSettings, useWorkouts } from '../hooks'
import { deleteExercise, saveExercise, saveSettings } from '../../data/repo'
import { exportDataset, importDataset, validateDataset } from '../../data/snapshot'
import { runSync } from '../../sync/runSync'
import { todayISO } from '../../domain/dates'
import { targetsFor } from '../../nutrition/targets'
import { estimateMeal } from '../../nutrition/estimate'
import { AI_MODELS, MUSCLE_LABELS, type AiModel, type SyncStatus } from '../../domain/types'

const STATUS_TEXT: Record<SyncStatus, string> = {
  not_set_up: 'Not set up. Add a token to back up to GitHub.',
  synced: 'Synced',
  pending: 'Waiting to sync',
  error: 'Sync error',
}

export default function Settings() {
  const settings = useSettings()
  const exercises = useExercises().filter((e) => e.custom)
  const meals = useMeals()
  const days = useDays()
  const workouts = useWorkouts()
  const [token, setToken] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [aiKey, setAiKey] = useState<string | null>(null)
  const [aiModel, setAiModel] = useState<AiModel | null>(null)
  const [testing, setTesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return <div className="screen"><Header title="Settings" /></div>
  const tokenValue = token ?? settings.githubToken ?? ''
  const repoValue = repo ?? settings.dataRepo
  const aiKeyValue = aiKey ?? settings.anthropicKey ?? ''
  const aiModelValue = aiModel ?? settings.aiModel
  const targets = targetsFor({ meals, days, workouts, settings }, todayISO())

  const saveSync = async () => {
    const trimmedToken = tokenValue.trim()
    await saveSettings({ githubToken: trimmedToken || undefined, dataRepo: repoValue.trim() || 'jmannella/mannpower-data', syncStatus: trimmedToken ? 'pending' : 'not_set_up', lastSyncError: undefined })
    setToken(null); setRepo(null)
    setMessage('Saved.')
    // A freshly-entered token must sync immediately: a fresh install must not sit on a
    // near-empty local dataset that could otherwise overwrite an existing remote backup later.
    if (trimmedToken) await syncNow()
  }
  const syncNow = async () => {
    setBusy(true); setMessage(null)
    try {
      const r = await runSync()
      setMessage(r === 'skipped' ? 'Nothing to do.' : r === 'pull' ? 'Pulled newer data from GitHub.' : r === 'push' ? 'Pushed to GitHub.' : 'Already up to date.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const exportBackup = async () => {
    const ds = await exportDataset()
    if (typeof URL.createObjectURL !== 'function') { setMessage('Export is not supported in this browser.'); return }
    const blob = new Blob([JSON.stringify(ds, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mannpower-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importBackup = async (file: File) => {
    let parsed: unknown
    try { parsed = JSON.parse(await file.text()) } catch { setMessage('That file is not valid JSON.'); return }
    const v = validateDataset(parsed)
    if (!v.ok) { setMessage(`Backup rejected: ${v.errors[0]}`); return }
    const ok = confirm(`Replace everything on this phone with ${v.dataset.workouts.length} workouts, ${v.dataset.days.length} days, ${v.dataset.meals.length} meals and ${v.dataset.pain.length} pain entries from the backup?`)
    if (!ok) return
    await importDataset(v.dataset, { stampNow: true })
    setMessage('Backup restored.')
  }
  const saveAi = async () => {
    await saveSettings({ anthropicKey: aiKeyValue.trim() || undefined, aiModel: aiModelValue })
    setAiKey(null); setAiModel(null)
    setMessage('Saved.')
  }
  const testKey = async () => {
    setTesting(true); setMessage(null)
    const r = await estimateMeal({ text: 'one medium banana' })
    setTesting(false)
    setMessage(r.ok ? 'The key works.' : r.message)
  }
  const rename = async (id: string, name: string) => {
    const next = prompt('New name', name)?.trim()
    const ex = exercises.find((e) => e.id === id)
    if (next && ex) await saveExercise({ ...ex, name: next })
  }
  const remove = async (id: string) => {
    try { await deleteExercise(id) } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="screen">
      <Header title="Settings" />
      {message && <div className="banner toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
      {settings.syncStatus === 'error' && settings.lastSyncError?.includes('token') && <div className="banner banner-error">GitHub rejected the token. Check it below.</div>}

      <Section title="GitHub sync">
        <div className="card">
          <div className="row">
            <span className={`status-dot status-${settings.syncStatus}`} />
            <span>{STATUS_TEXT[settings.syncStatus]}</span>
          </div>
          {settings.lastSyncedAt && <div className="muted">Last synced {new Date(settings.lastSyncedAt).toLocaleString()}</div>}
          {settings.lastSyncError && settings.syncStatus !== 'synced' && <div className="muted" style={{ color: 'var(--red)' }}>{settings.lastSyncError}</div>}
          <label className="field"><span className="field-label">GitHub token</span>
            <input className="input" type="password" aria-label="GitHub token" value={tokenValue} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." autoComplete="off" />
          </label>
          <label className="field"><span className="field-label">Data repo</span>
            <input className="input" aria-label="Data repo" value={repoValue} onChange={(e) => setRepo(e.target.value)} />
          </label>
          <div className="grid-2">
            <button type="button" className="btn" onClick={saveSync}>Save sync settings</button>
            <button type="button" className="btn btn-primary" disabled={busy || !settings.githubToken} onClick={syncNow}>{busy ? 'Syncing' : 'Sync now'}</button>
          </div>
          <div className="muted">Fine-grained token with Contents read and write on the data repo only. It stays on this phone.</div>
        </div>
      </Section>

      <Section title="Goals">
        <div className="card">
          <div className="grid-2">
            <NumberField label="Target body weight" value={settings.targetBodyWeight} onCommit={(v) => saveSettings({ targetBodyWeight: v })} suffix="lb" />
            <NumberField label="Birth year" value={settings.birthYear} onCommit={(v) => {
              const ok = v === undefined || (v >= 1900 && v <= new Date().getFullYear())
              if (ok) void saveSettings({ birthYear: v })
              else setMessage('Birth year should be a four digit year, for example 1979.')
            }} allowDecimal={false} />
            <NumberField label="Daily step goal" value={settings.dailyStepGoal} onCommit={(v) => saveSettings({ dailyStepGoal: v })} allowDecimal={false} />
            <NumberField label="Height" value={settings.heightInches} suffix="in" onCommit={(v) => {
              const ok = v === undefined || (v >= 36 && v <= 96)
              if (ok) void saveSettings({ heightInches: v })
              else setMessage('Height should be in inches, for example 70 for 5 foot 10.')
            }} />
          </div>
          <span className="field-label">Sex (for the calorie formula)</span>
          <div className="chips">
            <Chip on={settings.sex === 'male'} onClick={() => saveSettings({ sex: 'male' })}>Male</Chip>
            <Chip on={settings.sex === 'female'} onClick={() => saveSettings({ sex: 'female' })}>Female</Chip>
          </div>
        </div>
      </Section>

      <Section title="Food targets">
        <div className="card">
          <div>
            {targets.maintenance === undefined
              ? `No maintenance estimate yet. Still needed: ${targets.missing.join(', ') || 'more logged days'}.`
              : `Maintenance about ${Math.round(targets.maintenance / 10) * 10} kcal (${targets.source === 'measured' ? 'measured from your logged food and weight' : 'formula, until 14 full days are logged'}).`}
          </div>
          {targets.calories !== undefined && targets.protein !== undefined && (
            <div><strong>Target {targets.calories} kcal and {targets.protein} g protein a day.</strong></div>
          )}
          <div className="grid-2">
            <NumberField label="Calorie target override" value={settings.calorieTargetOverride} onCommit={(v) => saveSettings({ calorieTargetOverride: v || undefined })} allowDecimal={false} suffix="kcal" />
            <NumberField label="Protein target override" value={settings.proteinTargetOverride} onCommit={(v) => saveSettings({ proteinTargetOverride: v || undefined })} allowDecimal={false} suffix="g" />
          </div>
          <div className="muted">Leave the overrides blank to let the app work the targets out. The number updates once a week, on Monday.</div>
        </div>
      </Section>

      <Section title="AI meal estimates">
        <div className="card">
          <label className="field"><span className="field-label">Anthropic API key</span>
            <input className="input" type="password" aria-label="Anthropic API key" value={aiKeyValue} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
          </label>
          <label className="field"><span className="field-label">Model</span>
            <select className="input" aria-label="Model" value={aiModelValue} onChange={(e) => setAiModel(e.target.value as AiModel)}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <div className="grid-2">
            <button type="button" className="btn" onClick={saveAi}>Save AI settings</button>
            <button type="button" className="btn btn-primary" disabled={testing || !settings.anthropicKey} onClick={testKey}>{testing ? 'Testing' : 'Test key'}</button>
          </div>
          <div className="muted">Create a key at console.anthropic.com. It stays on this phone and is never synced. Each estimated meal costs a few cents; saved meals and quick add are free.</div>
        </div>
      </Section>

      <Section title="Default workout mode">
        <div className="chips">
          <Chip on={settings.defaultWithTrainer} onClick={() => saveSettings({ defaultWithTrainer: true })} className="chip-cyan">Trainer</Chip>
          <Chip on={!settings.defaultWithTrainer} onClick={() => saveSettings({ defaultWithTrainer: false })}>Solo</Chip>
        </div>
        <div className="muted">Flip this for a travel week. Each workout can still be changed on its own.</div>
      </Section>

      <Section title="Backup">
        <div className="grid-2">
          <button type="button" className="btn" onClick={exportBackup}>Export backup</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = '' }} />
      </Section>

      <Section title="Custom exercises">
        {exercises.length === 0 && <div className="muted">None yet. Add one from the Workout search box.</div>}
        <div className="list">
          {exercises.map((e) => (
            <div key={e.id} className="list-item">
              <div className="stack" style={{ gap: 2 }}>
                <strong>{e.name}</strong>
                <span className="muted">{MUSCLE_LABELS[e.primary]}{e.secondary.length ? `, ${e.secondary.map((g) => MUSCLE_LABELS[g]).join(', ')}` : ''}</span>
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => rename(e.id, e.name)}>Rename</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(e.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <div className="muted" style={{ textAlign: 'center' }}>Mannpower</div>
    </div>
  )
}
