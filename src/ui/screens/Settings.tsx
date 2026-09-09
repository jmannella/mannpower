import { useRef, useState } from 'react'
import { Header } from '../components/Header'
import { NumberField } from '../components/NumberField'
import { Chip } from '../components/Chip'
import { Section } from '../components/Section'
import { useExercises, useSettings } from '../hooks'
import { deleteExercise, saveExercise, saveSettings } from '../../data/repo'
import { exportDataset, importDataset, validateDataset } from '../../data/snapshot'
import { runSync } from '../../sync/runSync'
import { todayISO } from '../../domain/dates'
import { MUSCLE_LABELS, type SyncStatus } from '../../domain/types'

const STATUS_TEXT: Record<SyncStatus, string> = {
  not_set_up: 'Not set up. Add a token to back up to GitHub.',
  synced: 'Synced',
  pending: 'Waiting to sync',
  error: 'Sync error',
}

export default function Settings() {
  const settings = useSettings()
  const exercises = useExercises().filter((e) => e.custom)
  const [token, setToken] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return <div className="screen"><Header title="Settings" /></div>
  const tokenValue = token ?? settings.githubToken ?? ''
  const repoValue = repo ?? settings.dataRepo

  const saveSync = async () => {
    await saveSettings({ githubToken: tokenValue.trim() || undefined, dataRepo: repoValue.trim() || 'jmannella/mannpower-data', syncStatus: tokenValue.trim() ? 'pending' : 'not_set_up', lastSyncError: undefined })
    setToken(null); setRepo(null)
    setMessage('Saved.')
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
    const ok = confirm(`Replace everything on this phone with ${v.dataset.workouts.length} workouts, ${v.dataset.days.length} days and ${v.dataset.pain.length} pain entries from the backup?`)
    if (!ok) return
    await importDataset(v.dataset, { stampNow: true })
    setMessage('Backup restored.')
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
      {message && <div className="banner" onClick={() => setMessage(null)}>{message}</div>}
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
            <NumberField label="Daily step goal" value={settings.dailyStepGoal} onCommit={(v) => saveSettings({ dailyStepGoal: v })} allowDecimal={false} />
          </div>
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
        <input ref={fileRef} type="file" accept="application/json" hidden aria-label="Backup file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = '' }} />
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
