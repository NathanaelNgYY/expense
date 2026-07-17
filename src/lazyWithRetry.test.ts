import { describe, expect, it, vi } from 'vitest'
import { retryDynamicImport } from './lazyWithRetry'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

const chunkError = () => new TypeError('Importing a module script failed.')

describe('retryDynamicImport', () => {
  it('returns the module without retrying or reloading when the import succeeds', async () => {
    const factory = vi.fn().mockResolvedValue({ default: 'Screen' })
    const reload = vi.fn()

    const result = await retryDynamicImport(factory, 'settings', { delayMs: 0, storage: fakeStorage(), reload })

    expect(result).toEqual({ default: 'Screen' })
    expect(factory).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('retries a failed import and resolves when a later attempt succeeds', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(chunkError())
      .mockResolvedValue({ default: 'Screen' })
    const reload = vi.fn()

    const result = await retryDynamicImport(factory, 'settings', { delayMs: 0, storage: fakeStorage(), reload })

    expect(result).toEqual({ default: 'Screen' })
    expect(factory).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
  })

  it('forces exactly one reload after exhausting retries and leaves Suspense pending', async () => {
    const factory = vi.fn().mockRejectedValue(chunkError())
    const storage = fakeStorage()
    const reload = vi.fn()

    let settled = false
    void retryDynamicImport(factory, 'settings', { retries: 1, delayMs: 0, storage, reload }).then(
      () => (settled = true),
      () => (settled = true),
    )
    // Let the initial attempt + one retry + the reload branch run.
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(factory).toHaveBeenCalledTimes(2) // initial + 1 retry
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem('chunk-reload:settings')).toBe('1')
    expect(settled).toBe(false) // promise never settles; the reload takes over
  })

  it('rejects instead of reloading again when it already reloaded this session', async () => {
    const factory = vi.fn().mockRejectedValue(chunkError())
    const storage = fakeStorage({ 'chunk-reload:settings': '1' })
    const reload = vi.fn()

    await expect(
      retryDynamicImport(factory, 'settings', { retries: 1, delayMs: 0, storage, reload }),
    ).rejects.toThrow('Importing a module script failed.')
    expect(reload).not.toHaveBeenCalled()
  })

  it('rejects without reloading when storage is unavailable (avoids a reload loop)', async () => {
    const factory = vi.fn().mockRejectedValue(chunkError())
    const reload = vi.fn()

    await expect(
      retryDynamicImport(factory, 'settings', { retries: 1, delayMs: 0, storage: null, reload }),
    ).rejects.toThrow('Importing a module script failed.')
    expect(reload).not.toHaveBeenCalled()
  })

  it('clears the reload guard after a successful load so a future deploy can recover', async () => {
    const storage = fakeStorage({ 'chunk-reload:settings': '1' })
    const factory = vi.fn().mockResolvedValue({ default: 'Screen' })

    await retryDynamicImport(factory, 'settings', { delayMs: 0, storage, reload: vi.fn() })

    expect(storage.getItem('chunk-reload:settings')).toBeNull()
  })
})
