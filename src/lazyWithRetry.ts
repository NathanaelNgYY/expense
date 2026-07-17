// A drop-in replacement for React.lazy that survives a failed dynamic import.
//
// Two things make a route chunk's import() reject in production:
//   1. A transient mobile-network blip while fetching the chunk.
//   2. A stale chunk after a deploy — the open document references the old
//      hashed filenames, but a new deploy (and the auto-updating service
//      worker purging the old precache) has replaced them, so the request 404s.
//      Safari reports this as "Importing a module script failed."; Chromium as
//      "Failed to fetch dynamically imported module."
//
// Bare React.lazy turns either into a crash to the error boundary. This wrapper
// retries a couple of times (covers case 1), then forces exactly one hard
// reload (covers case 2 — the fresh index.html points at the new chunk names).
// A sessionStorage guard keyed per chunk stops that reload from looping when the
// failure is genuinely persistent (offline, or a real bug), letting the error
// boundary take over instead.

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const RELOAD_FLAG_PREFIX = 'chunk-reload:'
const MAX_RETRIES = 2
const BASE_DELAY_MS = 400

export interface RetryImportOptions {
  retries?: number
  delayMs?: number
  reload?: () => void
  // Pick, not Storage: keeps the test double tiny and makes the null (storage
  // unavailable, e.g. Safari private mode) case explicit.
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
}

function safeSessionStorage(): RetryImportOptions['storage'] {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    // Accessing sessionStorage can throw in locked-down/private contexts.
    return null
  }
}

function defaultReload() {
  if (typeof window !== 'undefined') window.location.reload()
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function retryDynamicImport<T>(
  factory: () => Promise<T>,
  key: string,
  options: RetryImportOptions = {},
): Promise<T> {
  const {
    retries = MAX_RETRIES,
    delayMs = BASE_DELAY_MS,
    reload = defaultReload,
    storage = safeSessionStorage(),
  } = options
  const flag = RELOAD_FLAG_PREFIX + key

  for (let attempt = 0; ; attempt += 1) {
    try {
      const module = await factory()
      // Clear the guard on success so a *future* deploy's stale chunk is allowed
      // to trigger its own one-shot reload. A no-op when the flag was never set.
      storage?.removeItem(flag)
      return module
    } catch (error) {
      if (attempt < retries) {
        await delay(delayMs * (attempt + 1))
        continue
      }
      // Retries exhausted. Reload once — but only if we can prove (via storage)
      // that we have not already reloaded for this chunk this session, or we'd
      // risk an infinite reload loop when the chunk is genuinely unreachable.
      if (storage && storage.getItem(flag) !== '1') {
        storage.setItem(flag, '1')
        reload()
        // Never resolve: keep Suspense showing its fallback until the reload
        // navigates the page away.
        return new Promise<T>(() => {})
      }
      throw error
    }
  }
}

// Mirrors React.lazy's own signature (its constraint is ComponentType<any>) so
// route components with or without props are accepted; narrowing the props type
// here rejects any component that takes props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key: string,
): LazyExoticComponent<T> {
  return lazy(() => retryDynamicImport(factory, key))
}
