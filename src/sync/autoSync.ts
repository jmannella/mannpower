import { onDataChange } from '../data/changes'

export interface AutoSyncOptions {
  run: () => Promise<unknown>
  delayMs?: number
  maxWaitMs?: number
  subscribe?: (cb: () => void) => () => void
  target?: EventTarget
}

export interface AutoSync {
  schedule(): void
  kick(): Promise<void>
  stop(): void
}

/**
 * Debounce data changes into a sync run, run again if changes arrived mid-run, and run on reconnect.
 * Every push uploads the whole file, so the delay is longer than a rest between sets and a workout
 * becomes a few pushes. The maximum wait stops steady logging from postponing a run forever.
 */
export function createAutoSync({ run, delayMs = 120_000, maxWaitMs = 600_000, subscribe = onDataChange, target }: AutoSyncOptions): AutoSync {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  let waitingSince: number | undefined
  let running = false
  let queued = false
  let stopped = false

  const kick = async (): Promise<void> => {
    if (stopped) return
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      await run()
    } catch {
      // Status is recorded by the engine. Never surface here.
    } finally {
      running = false
      if (queued && !stopped) {
        queued = false
        schedule()
      } else {
        queued = false
      }
    }
  }

  const schedule = (): void => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    const now = Date.now()
    waitingSince ??= now
    const wait = Math.max(0, Math.min(delayMs, waitingSince + maxWaitMs - now))
    timer = setTimeout(() => { timer = undefined; waitingSince = undefined; void kick() }, wait)
  }

  const unsubscribe = subscribe(schedule)
  const onOnline = (): void => { void kick() }
  eventTarget?.addEventListener('online', onOnline)

  return {
    schedule,
    kick,
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      unsubscribe()
      eventTarget?.removeEventListener('online', onOnline)
    },
  }
}
