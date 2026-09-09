import { createAutoSync } from './autoSync'

describe('createAutoSync', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('debounces several changes into one run', async () => {
    const run = vi.fn(async () => {})
    let trigger: () => void = () => {}
    const auto = createAutoSync({ run, delayMs: 5000, subscribe: (cb) => { trigger = cb; return () => {} }, target: new EventTarget() })
    trigger(); trigger(); trigger()
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4999)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    auto.stop()
  })

  test('a change during a run queues one more run', async () => {
    let resolveFirst: () => void = () => {}
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r }))
      .mockImplementation(async () => {})
    let trigger: () => void = () => {}
    const auto = createAutoSync({ run, delayMs: 10, subscribe: (cb) => { trigger = cb; return () => {} }, target: new EventTarget() })
    trigger()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1)
    trigger()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1) // still running
    resolveFirst()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(2)
    auto.stop()
  })

  test('online event kicks a run and run errors are swallowed', async () => {
    const run = vi.fn(async () => { throw new Error('boom') })
    const target = new EventTarget()
    const auto = createAutoSync({ run, delayMs: 10, subscribe: () => () => {}, target })
    target.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)
    auto.stop()
  })

  test('stop cancels a run queued during an in-flight run', async () => {
    let resolveFirst: () => void = () => {}
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r }))
      .mockImplementation(async () => {})
    let trigger: () => void = () => {}
    const auto = createAutoSync({ run, delayMs: 10, subscribe: (cb) => { trigger = cb; return () => {} }, target: new EventTarget() })
    trigger()
    await vi.advanceTimersByTimeAsync(10)
    expect(run).toHaveBeenCalledTimes(1)
    trigger() // queued behind the in-flight run
    auto.stop()
    resolveFirst()
    await vi.advanceTimersByTimeAsync(50)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
