type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to local data writes. Returns an unsubscribe function. */
export function onDataChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function emitDataChange(): void {
  for (const cb of listeners) cb()
}
