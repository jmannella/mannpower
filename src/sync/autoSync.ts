import { onDataChange } from '../data/changes'

export interface AutoSyncOptions {
  run: () => Promise<unknown>
  delayMs?: number
  subscribe?: (cb: () => void) => () => void
  target?: EventTarget
}

export interface AutoSync {
  schedule(): void
  kick(): Promise<void>
  stop(): void
}

/** Debounce data changes into a sync run, run again if changes arrived mid-run, and run on reconnect. */
export function createAutoSync({ run, delayMs = 5000, subscribe = onDataChange, target }: AutoSyncOptions): AutoSync {
  const eventTarget = target ?? (typeof window !== 'undefined' ? window : undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let queued = false

  const kick = async (): Promise<void> => {
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
      if (queued) {
        queued = false
        schedule()
      }
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; void kick() }, delayMs)
  }

  const unsubscribe = subscribe(schedule)
  const onOnline = (): void => { void kick() }
  eventTarget?.addEventListener('online', onOnline)

  return {
    schedule,
    kick,
    stop() {
      if (timer) clearTimeout(timer)
      unsubscribe()
      eventTarget?.removeEventListener('online', onOnline)
    },
  }
}
