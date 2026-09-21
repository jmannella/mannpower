import { getSettings, saveSettings } from '../data/repo'
import { exportDataset, importDataset } from '../data/snapshot'
import { GitHubContents } from './github'
import { syncOnce, type SyncDecision } from './engine'

/** One full sync using the phone's settings. Returns 'skipped' when no token is configured. */
export async function runSync(): Promise<SyncDecision | 'skipped'> {
  const settings = await getSettings()
  if (!settings.githubToken || !settings.dataRepo) {
    if (settings.syncStatus !== 'not_set_up') await saveSettings({ syncStatus: 'not_set_up' })
    return 'skipped'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await saveSettings({ syncStatus: 'pending', lastSyncError: 'Offline. Will retry when back online.' })
    return 'skipped'
  }
  const client = new GitHubContents(settings.githubToken, settings.dataRepo)
  return syncOnce({
    client,
    loadLocal: exportDataset,
    replaceLocal: (ds) => importDataset(ds),
    getSha: async () => (await getSettings()).lastSyncSha,
    getSyncedUpdatedAt: async () => (await getSettings()).lastSyncUpdatedAt,
    setSha: (sha, updatedAt) => saveSettings({ lastSyncSha: sha, lastSyncUpdatedAt: updatedAt }),
    setStatus: (status, error) =>
      saveSettings({ syncStatus: status, lastSyncError: error, ...(status === 'synced' ? { lastSyncedAt: new Date().toISOString() } : {}) }),
  })
}
