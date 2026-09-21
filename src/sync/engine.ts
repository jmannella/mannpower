import type { Dataset, SyncStatus } from '../domain/types'
import { validateDataset } from '../domain/validate'
import { GitHubContents, SyncConflictError, SyncError } from './github'

export type SyncDecision = 'push' | 'pull' | 'none'

/** ISO timestamps compare correctly as strings. Missing remote means first push. */
export function decide(localUpdatedAt: string, remoteUpdatedAt: string | null): SyncDecision {
  if (remoteUpdatedAt === null) return 'push'
  if (remoteUpdatedAt > localUpdatedAt) return 'pull'
  if (localUpdatedAt > remoteUpdatedAt) return 'push'
  return 'none'
}

export interface SyncDeps {
  client: GitHubContents
  loadLocal(): Promise<Dataset>
  replaceLocal(ds: Dataset): Promise<void>
  getSha(): Promise<string | undefined>
  /** The dataset meta.updatedAt that the remote file held at the stored sha. */
  getSyncedUpdatedAt(): Promise<string | undefined>
  setSha(sha: string, updatedAt: string): Promise<void>
  setStatus(status: SyncStatus, error?: string): Promise<void>
}

async function pushWithRetry(deps: SyncDeps, local: Dataset, sha: string | undefined): Promise<string> {
  const json = JSON.stringify(local)
  try {
    return await deps.client.put(json, sha)
  } catch (err) {
    if (!(err instanceof SyncConflictError)) throw err
    const fresh = await deps.client.get()
    return deps.client.put(json, fresh?.sha)
  }
}

export async function syncOnce(deps: SyncDeps): Promise<SyncDecision> {
  try {
    const local = await deps.loadLocal()
    const knownSha = await deps.getSha()
    const syncedUpdatedAt = await deps.getSyncedUpdatedAt()
    // The stored sha only lets us skip the download when we also know which updatedAt it held.
    let remote = await deps.client.getIfChanged(syncedUpdatedAt === undefined ? undefined : knownSha)
    if (remote && 'unchanged' in remote) {
      const quick = decide(local.meta.updatedAt, syncedUpdatedAt ?? null)
      if (quick === 'push') {
        const sha = await pushWithRetry(deps, local, remote.sha)
        await deps.setSha(sha, local.meta.updatedAt)
      }
      if (quick !== 'pull') {
        await deps.setStatus('synced')
        return quick
      }
      // Local data looks older than what was last synced, so the remote content is needed after all.
      remote = await deps.client.get()
    }
    let remoteDs: Dataset | null = null
    if (remote) {
      let parsed: unknown
      try {
        parsed = JSON.parse(remote.content)
      } catch {
        throw new SyncError('Remote data.json is not valid JSON.')
      }
      const v = validateDataset(parsed)
      if (!v.ok) throw new SyncError(`Remote data.json failed validation: ${v.errors[0]}`)
      remoteDs = v.dataset
    }
    let decision = decide(local.meta.updatedAt, remoteDs?.meta.updatedAt ?? null)
    // A device that has never synced (no stored sha) must not push and overwrite an existing
    // remote backup just because its clock-stamped meta.updatedAt happens to look newer.
    if (decision === 'push' && remoteDs && knownSha === undefined
      && remoteDs.workouts.length + remoteDs.days.length + remoteDs.pain.length + remoteDs.meals.length + remoteDs.savedMeals.length > 0) {
      decision = 'pull'
    }
    if (decision === 'pull' && remoteDs && remote) {
      await deps.replaceLocal(remoteDs)
      await deps.setSha(remote.sha, remoteDs.meta.updatedAt)
    } else if (decision === 'push') {
      const sha = await pushWithRetry(deps, local, remote?.sha ?? knownSha)
      await deps.setSha(sha, local.meta.updatedAt)
    } else if (remote && remoteDs) {
      await deps.setSha(remote.sha, remoteDs.meta.updatedAt)
    }
    await deps.setStatus('synced')
    return decision
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.setStatus('error', message)
    throw err
  }
}
