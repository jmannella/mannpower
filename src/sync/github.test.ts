import { GitHubContents, SyncAuthError, SyncConflictError, SyncError, decodeBase64, encodeBase64 } from './github'

function fakeFetch(responses: { status: number; body?: unknown; text?: string }[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const r = responses.shift()!
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body, text: async () => r.text ?? '' } as Response
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

  test('get falls back to a raw request when the file is over 1 MB', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const replies = [
      { status: 200, ok: true, json: async () => ({ content: '', encoding: 'none', sha: 'big1' }), text: async () => '' },
      { status: 200, ok: true, json: async () => ({}), text: async () => '{"big":true}' },
    ]
    const fn = (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return replies.shift() as unknown as Response }) as unknown as typeof fetch
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.get()).toEqual({ content: '{"big":true}', sha: 'big1' })
    expect(calls).toHaveLength(2)
    expect((calls[1].init?.headers as Record<string, string>).Accept).toBe('application/vnd.github.raw')
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  test('getIfChanged skips the raw download when the sha is already known', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { content: '', encoding: 'none', sha: 'big1' } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.getIfChanged('big1')).toEqual({ unchanged: true, sha: 'big1' })
    expect(calls).toHaveLength(1)
  })

  test('getIfChanged reports a small file with a known sha as unchanged too', async () => {
    const { fn } = fakeFetch([{ status: 200, body: { content: encodeBase64('{"a":1}'), encoding: 'base64', sha: 'abc' } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.getIfChanged('abc')).toEqual({ unchanged: true, sha: 'abc' })
  })

  test('getIfChanged downloads the file when the sha differs or none is known, null on 404', async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { content: '', encoding: 'none', sha: 'big2' } },
      { status: 200, text: '{"big":2}' },
      { status: 200, body: { content: encodeBase64('{"a":1}'), encoding: 'base64', sha: 'abc' } },
      { status: 404 },
    ])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    expect(await c.getIfChanged('big1')).toEqual({ content: '{"big":2}', sha: 'big2' })
    expect((calls[1].init?.headers as Record<string, string>).Accept).toBe('application/vnd.github.raw')
    expect(await c.getIfChanged(undefined)).toEqual({ content: '{"a":1}', sha: 'abc' })
    expect(await c.getIfChanged('abc')).toBeNull()
  })

  test('a 422 saying the file is too large is a plain SyncError, not a conflict', async () => {
    const { fn } = fakeFetch([{ status: 422, body: { message: 'Sorry, the file is too large to be processed. Consider creating/updating the file in a local clone and pushing' } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    const err = await c.put('x', 'old').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err).not.toBeInstanceOf(SyncConflictError)
    expect((err as SyncError).status).toBe(422)
    expect((err as SyncError).message).toMatch(/too large/)
  })

  test('any other 422 stays a conflict, even when the body cannot be read', async () => {
    const { fn } = fakeFetch([{ status: 422, body: { message: `Invalid request. "sha" wasn't supplied.` } }])
    const c = new GitHubContents('tok', 'r/d', 'data.json', fn)
    await expect(c.put('x')).rejects.toBeInstanceOf(SyncConflictError)
    const broken = (async () => ({ status: 422, ok: false, json: async () => { throw new Error('not json') } })) as unknown as typeof fetch
    await expect(new GitHubContents('tok', 'r/d', 'data.json', broken).put('x')).rejects.toBeInstanceOf(SyncConflictError)
  })
})

describe('GitHubContents default fetch', () => {
  test('calls the global fetch with the global as receiver, never the client instance', async () => {
    const original = globalThis.fetch
    let receiver: unknown = 'unset'
    globalThis.fetch = vi.fn(function (this: unknown) {
      receiver = this
      return Promise.resolve({ status: 404, ok: false, json: async () => ({}) } as Response)
    }) as unknown as typeof fetch
    try {
      const c = new GitHubContents('tok', 'r/d')
      expect(await c.get()).toBeNull()
      expect(receiver === globalThis || receiver === undefined).toBe(true)
      expect(receiver).not.toBe(c)
    } finally {
      globalThis.fetch = original
    }
  })
})
