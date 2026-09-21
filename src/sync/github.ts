export class SyncError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SyncError'
    this.status = status
  }
}
export class SyncAuthError extends SyncError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'SyncAuthError'
  }
}
export class SyncConflictError extends SyncError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'SyncConflictError'
  }
}

export function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export interface RemoteFile {
  content: string
  sha: string
}

/** The remote file still has the sha the caller already knows, so its content was skipped. */
export interface RemoteUnchanged {
  unchanged: true
  sha: string
}

interface ContentsEntry {
  content?: string
  encoding?: string
  sha: string
}

export class GitHubContents {
  constructor(
    private token: string,
    private repo: string,
    private path: string = 'data.json',
    // Wrapped so fetch is called on the global, not on this object; browsers throw "Illegal invocation" otherwise.
    private fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  private url(): string {
    return `https://api.github.com/repos/${this.repo}/contents/${this.path}`
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  private async check(res: Response, verb: string): Promise<void> {
    if (res.status === 401 || res.status === 403) throw new SyncAuthError(`GitHub rejected the token during ${verb} (${res.status}). Check the token in Settings.`, res.status)
    // GitHub answers 422 both for a missing sha and for a file too big to process. Only the first is a conflict worth retrying.
    if (res.status === 422 && (await this.tooLarge(res))) throw new SyncError('GitHub says data.json is too large to save (422).', res.status)
    if (res.status === 409 || res.status === 422) throw new SyncConflictError(`GitHub reported a conflict during ${verb} (${res.status}).`, res.status)
    if (!res.ok) throw new SyncError(`GitHub ${verb} failed (${res.status}).`, res.status)
  }

  private async tooLarge(res: Response): Promise<boolean> {
    try {
      const body = (await res.json()) as { message?: unknown } | null
      return typeof body?.message === 'string' && /too large/i.test(body.message)
    } catch {
      return false
    }
  }

  private async readEntry(): Promise<ContentsEntry | null> {
    const res = await this.fetchFn(this.url(), { headers: this.headers() })
    if (res.status === 404) return null
    await this.check(res, 'read')
    return (await res.json()) as ContentsEntry
  }

  private async contentOf(entry: ContentsEntry): Promise<string> {
    if (entry.content && entry.encoding !== 'none') return decodeBase64(entry.content)
    // Over 1 MB GitHub leaves content empty. The raw media type serves files up to 100 MB.
    const raw = await this.fetchFn(this.url(), { headers: { ...this.headers(), Accept: 'application/vnd.github.raw' } })
    await this.check(raw, 'read')
    return raw.text()
  }

  async get(): Promise<RemoteFile | null> {
    const entry = await this.readEntry()
    return entry && { content: await this.contentOf(entry), sha: entry.sha }
  }

  /** Like get(), but when the remote sha equals knownSha the content is not decoded or downloaded. */
  async getIfChanged(knownSha: string | undefined): Promise<RemoteFile | RemoteUnchanged | null> {
    const entry = await this.readEntry()
    if (!entry) return null
    if (knownSha !== undefined && entry.sha === knownSha) return { unchanged: true, sha: entry.sha }
    return { content: await this.contentOf(entry), sha: entry.sha }
  }

  async put(content: string, sha?: string): Promise<string> {
    const res = await this.fetchFn(this.url(), {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Mannpower sync', content: encodeBase64(content), ...(sha ? { sha } : {}) }),
    })
    await this.check(res, 'write')
    const body = (await res.json()) as { content: { sha: string } }
    return body.content.sha
  }
}
