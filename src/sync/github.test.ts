import { GitHubContents, SyncAuthError, SyncConflictError, SyncError, decodeBase64, encodeBase64 } from './github'

function fakeFetch(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const r = responses.shift()!
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body } as Response
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('GitHubContents', () => {
  test('base64 round trips unicode', () => {
    expect(decodeBase64(encodeBase64('héllo ✓'))).toBe('héllo ✓')
    expect(decodeBase64('aGVs\nbG8=')).toBe('hello') // GitHub wraps lines
  })

  test('get returns decoded content and sha, null on 404', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { content: encodeBase64('{"a":1}'), sha: 'abc', encoding: 'base64' } },
      { status: 404 },
    ])
    const c = new GitHubContents('tok', 'jmannella/mannpower-data', 'data.json', fn)
    expect(await c.get()).toEqual({ content: '{"a":1}', sha: 'abc' })
    expect(await c.get()).toBeNull()
    expect(calls[0].url).toBe('https://api.github.com/repos/jmannella/mannpower-data/contents/data.json')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  test('put sends base64 content with sha and returns the new sha', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { content: { sha: 'new' } } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.put('{"a":2}', 'old')).toBe('new')
    const body = JSON.parse(calls[0].init?.body as string)
    expect(body.sha).toBe('old')
    expect(decodeBase64(body.content)).toBe('{"a":2}')
    expect(calls[0].init?.method).toBe('PUT')
  })

  test('maps status codes to error types', async () => {
    const { fn } = fakeFetch([{ status: 401 }, { status: 409 }, { status: 500 }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    await expect(c.get()).rejects.toBeInstanceOf(SyncAuthError)
    await expect(c.put('x')).rejects.toBeInstanceOf(SyncConflictError)
    await expect(c.put('x')).rejects.toBeInstanceOf(SyncError)
  })
})
