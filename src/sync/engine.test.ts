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
    put: vi.fn(async (content: string, sha?: string) => {
      puts.push({ content, sha })
      return putImpl ? putImpl(content, sha) : 'sha-new'
    }),
  }
  return { client: client as unknown as GitHubContents, puts }
}

function deps(local: Dataset, client: GitHubContents) {
  const state = { sha: undefined as string | undefined, status: [] as [SyncStatus, string | undefined][], replaced: undefined as Dataset | undefined }
  const d: SyncDeps = {
    client,
    loadLocal: async () => local,
    replaceLocal: async (x) => { state.replaced = x },
    getSha: async () => state.sha,
    setSha: async (sha) => { state.sha = sha },
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

  test('records an error status and rethrows on failure', async () => {
    const { client } = fakeClient({ content: 'not json', sha: 'r1' })
    const { d, state } = deps(ds('2026-09-08T10:00:00.000Z'), client)
    await expect(syncOnce(d)).rejects.toThrow()
    expect(state.status.at(-1)?.[0]).toBe('error')
    expect(state.status.at(-1)?.[1]).toBeTruthy()
  })
})
