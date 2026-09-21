import type { Dataset, SyncStatus } from '../domain/types'
import { SyncConflictError, type GitHubContents, type RemoteFile } from './github'
import { decide, syncOnce, type SyncDeps } from './engine'

function ds(updatedAt: string, tag = ''): Dataset {
  return { meta: { schemaVersion: 1, updatedAt }, exercises: [], workouts: [], days: [], pain: [], meals: [], savedMeals: [], settings: { defaultWithTrainer: true, customCardioTypes: [tag] } }
}

function fakeClient(remote: RemoteFile | null, putImpl?: (content: string, sha?: string) => Promise<string>) {
  const puts: { content: string; sha?: string }[] = []
  const client = {
    get: vi.fn(async () => remote),
    getIfChanged: vi.fn(async (knownSha?: string) => (remote && knownSha !== undefined && knownSha === remote.sha ? { unchanged: true as const, sha: remote.sha } : remote)),
    put: vi.fn(async (content: string, sha?: string) => {
      puts.push({ content, sha })
      return putImpl ? putImpl(content, sha) : 'sha-new'
    }),
  }
  return { client: client as unknown as GitHubContents, puts, spies: client }
}

function deps(local: Dataset, client: GitHubContents) {
  const state = { sha: undefined as string | undefined, syncedUpdatedAt: undefined as string | undefined, status: [] as [SyncStatus, string | undefined][], replaced: undefined as Dataset | undefined }
  const d: SyncDeps = {
    client,
    loadLocal: async () => local,
    replaceLocal: async (x) => { state.replaced = x },
    getSha: async () => state.sha,
    getSyncedUpdatedAt: async () => state.syncedUpdatedAt,
    setSha: async (sha, updatedAt) => { state.sha = sha; state.syncedUpdatedAt = updatedAt },
    setStatus: async (status, error) => { state.status.push([status, error]) },
  }
  return { d, state }
}

describe('decide', () => {
  test('push when remote missing or older, pull when newer, none when equal', () => {
    expect(decide('2026-09-08T10:00:00.000Z', null)).toBe('push')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T09:00:00.000Z')).toBe('push')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T11:00:00.000Z')).toBe('pull')
    expect(decide('2026-09-08T10:00:00.000Z', '2026-09-08T10:00:00.000Z')).toBe('none')
  })
})

describe('syncOnce', () => {
  test('pushes when remote is missing', async () => {
    const { client, puts } = fakeClient(null)
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('push')
    expect(puts).toHaveLength(1)
    expect(puts[0].sha).toBeUndefined()
    expect(state.sha).toBe('sha-new')
    expect(state.status.at(-1)).toEqual(['synced', undefined])
    expect(puts[0].content).not.toContain('\n')
  })

  test('pulls when remote is newer and keeps the remote sha', async () => {
    const remote = ds('2026-09-08T12:00:00.000Z', 'remote')
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('pull')
    expect(puts).toHaveLength(0)
    expect(state.replaced?.settings.customCardioTypes).toEqual(['remote'])
    expect(state.sha).toBe('r1')
  })

  test('does nothing when equal', async () => {
    const remote = ds('2026-09-08T10:00:00.000Z')
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('none')
    expect(puts).toHaveLength(0)
    expect(state.replaced).toBeUndefined()
    expect(state.status.at(-1)?.[0]).toBe('synced')
  })

  test('retries a push once with a fresh sha after a conflict', async () => {
    let first = true
    const { client, puts } = fakeClient({ content: JSON.stringify(ds('2026-09-08T09:00:00.000Z')), sha: 'r1' }, async () => {
      if (first) { first = false; throw new SyncConflictError('conflict', 409) }
      return 'sha-after-retry'
    })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    expect(await syncOnce(d)).toBe('push')
    expect(puts).toHaveLength(2)
    expect(state.sha).toBe('sha-after-retry')
  })

  test('never-synced device pulls instead of overwriting an existing remote backup', async () => {
    const remote = ds('2026-09-08T09:00:00.000Z', 'remote')
    remote.workouts = [{ id: 'w1', date: '2026-09-01', withTrainer: true, entries: [], createdAt: '', updatedAt: '' }]
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    // getSha defaults to undefined in `deps`, simulating an install that has never synced.
    expect(await syncOnce(d)).toBe('pull')
    expect(puts).toHaveLength(0)
    expect(state.replaced?.workouts).toHaveLength(1)
    expect(state.sha).toBe('r1')
  })

  test('never-synced device pulls instead of overwriting a remote backup that holds only saved meals', async () => {
    const remote = ds('2026-09-08T09:00:00.000Z', 'remote')
    remote.savedMeals = [{ id: 'sm1', name: 'Eggs and toast', items: [], useCount: 1, lastUsedAt: '2026-09-01T00:00:00.000Z' }]
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    // getSha defaults to undefined in `deps`, simulating an install that has never synced.
    expect(await syncOnce(d)).toBe('pull')
    expect(puts).toHaveLength(0)
    expect(state.replaced?.savedMeals).toHaveLength(1)
    expect(state.sha).toBe('r1')
  })

  test('a device with a known sha still pushes newer local data over an older remote', async () => {
    const remote = ds('2026-09-08T09:00:00.000Z', 'remote')
    remote.workouts = [{ id: 'w1', date: '2026-09-01', withTrainer: true, entries: [], createdAt: '', updatedAt: '' }]
    const { client, puts } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    state.sha = 'known-sha'
    expect(await syncOnce(d)).toBe('push')
    expect(puts).toHaveLength(1)
    expect(state.sha).toBe('sha-new')
  })

  test('records which updatedAt the stored sha holds after a push and after a pull', async () => {
    const pushed = fakeClient(null)
    const a = deps(ds('2026-09-08T10:00:00.000Z'), pushed.client)
    await syncOnce(a.d)
    expect(a.state.syncedUpdatedAt).toBe('2026-09-08T10:00:00.000Z')

    const pulled = fakeClient({ content: JSON.stringify(ds('2026-09-08T12:00:00.000Z')), sha: 'r1' })
    const b = deps(ds('2026-09-08T10:00:00.000Z'), pulled.client)
    await syncOnce(b.d)
    expect(b.state.syncedUpdatedAt).toBe('2026-09-08T12:00:00.000Z')
  })

  test('does nothing, without parsing the remote, when the sha and the local timestamp both match the last sync', async () => {
    // Unparseable content proves the engine never looks at it on this path.
    const { client, puts, spies } = fakeClient({ content: 'never read', sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    state.sha = 'r1'
    state.syncedUpdatedAt = '2026-09-08T10:00:00.000Z'
    expect(await syncOnce(d)).toBe('none')
    expect(spies.getIfChanged).toHaveBeenCalledWith('r1')
    expect(spies.get).not.toHaveBeenCalled()
    expect(puts).toHaveLength(0)
    expect(state.status.at(-1)).toEqual(['synced', undefined])
  })

  test('pushes against the known sha without downloading when only local data changed', async () => {
    const { client, puts, spies } = fakeClient({ content: 'never read', sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T11:00:00.000Z'), client)
    state.sha = 'r1'
    state.syncedUpdatedAt = '2026-09-08T10:00:00.000Z'
    expect(await syncOnce(d)).toBe('push')
    expect(spies.get).not.toHaveBeenCalled()
    expect(puts).toEqual([{ content: JSON.stringify(ds('2026-09-08T11:00:00.000Z')), sha: 'r1' }])
    expect(state.sha).toBe('sha-new')
    expect(state.syncedUpdatedAt).toBe('2026-09-08T11:00:00.000Z')
  })

  test('downloads in full when the stored sha has no recorded timestamp, as after an upgrade', async () => {
    const remote = ds('2026-09-08T10:00:00.000Z')
    const { client, spies } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    state.sha = 'r1'
    expect(await syncOnce(d)).toBe('none')
    expect(spies.getIfChanged).toHaveBeenCalledWith(undefined)
    expect(state.syncedUpdatedAt).toBe('2026-09-08T10:00:00.000Z')
  })

  test('downloads in full and pulls when local data looks older than the last sync', async () => {
    const remote = ds('2026-09-08T10:00:00.000Z', 'remote')
    const { client, puts, spies } = fakeClient({ content: JSON.stringify(remote), sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T09:00:00.000Z'), client)
    state.sha = 'r1'
    state.syncedUpdatedAt = '2026-09-08T10:00:00.000Z'
    expect(await syncOnce(d)).toBe('pull')
    expect(spies.get).toHaveBeenCalledTimes(1)
    expect(puts).toHaveLength(0)
    expect(state.replaced?.settings.customCardioTypes).toEqual(['remote'])
  })

  test('records an error status and rethrows on failure', async () => {
    const { client } = fakeClient({ content: 'not json', sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    await expect(syncOnce(d)).rejects.toThrow()
    expect(state.status.at(-1)?.[0]).toBe('error')
    expect(state.status.at(-1)?.[1]).toBeTruthy()
  })
})
