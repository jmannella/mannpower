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
  setSha(sha: string): Promise<void>
  setStatus(status: SyncStatus, error?: string): Promise<void>
}

async function pushWithRetry(deps: SyncDeps, local: Dataset, sha: string | undefined): Promise<string> {
  const json = JSON.stringify(local, null, 2)
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
    const remote = await deps.client.get()
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
    const decision = decide(local.meta.updatedAt, remoteDs?.meta.updatedAt ?? null)
    if (decision === 'pull' && remoteDs && remote) {
      await deps.replaceLocal(remoteDs)
      await deps.setSha(remote.sha)
    } else if (decision === 'push') {
      const sha = await pushWithRetry(deps, local, remote?.sha ?? (await deps.getSha()))
      await deps.setSha(sha)
    } else if (remote) {
      await deps.setSha(remote.sha)
    }
    await deps.setStatus('synced')
    return decision
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await deps.setStatus('error', message)
    throw err
  }
}
