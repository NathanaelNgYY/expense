// src/useRoute.ts
// The DOM edge of routing (U1): subscription, push/replace, and back. All parsing
// lives in the pure `router.ts`.
import { useSyncExternalStore } from 'react'
import { formatHash, isSameRoute, parentOf, parseHash, type Route } from './router'

// `replaceState` fires no `hashchange`, so the store keeps its own listener set and
// notifies on every programmatic navigation. `useSyncExternalStore` (rather than a
// useEffect + useState pair) is what keeps the read tear-free under concurrent
// rendering — the hash is genuinely external state.
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener('hashchange', onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('hashchange', onStoreChange)
  }
}

// Snapshot is the raw hash string, not a Route: useSyncExternalStore compares
// snapshots by identity, and a fresh object every call would re-render forever.
function getSnapshot(): string {
  return window.location.hash
}

function getServerSnapshot(): string {
  return ''
}

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot))
}

export function currentRoute(): Route {
  return parseHash(window.location.hash)
}

/** The URL with a new hash, preserving path and query (the quick-add params). */
function urlFor(route: Route): string {
  const { pathname, search } = window.location
  return `${pathname}${search}${formatHash(route)}`
}

/**
 * How many entries *this app* has pushed. `history.length` cannot answer that: a
 * cold-loaded deep link sits on a tab that already has unrelated history, so
 * `length > 1` is true while there is still nothing of ours to pop — and calling
 * back() then walks out of the app. Depth rides along in `history.state`, which the
 * browser preserves per entry and restores on back/forward for free.
 */
interface RouteState {
  appDepth: number
}

function currentDepth(): number {
  const state = window.history.state as RouteState | null
  return typeof state?.appDepth === 'number' ? state.appDepth : 0
}

/** Push a history entry, so back returns to where the user just was. */
export function navigate(route: Route): void {
  if (isSameRoute(route, currentRoute())) return
  window.history.pushState({ appDepth: currentDepth() + 1 }, '', urlFor(route))
  emit()
}

/** Swap the current entry — for normalisation and post-save redirects, which
 *  must not become somewhere back can return to. Depth is carried over, not reset:
 *  replacing does not undo the entries already pushed beneath us. */
export function replaceRoute(route: Route): void {
  window.history.replaceState({ appDepth: currentDepth() }, '', urlFor(route))
  emit()
}

/**
 * The same operation as the OS back gesture — that equivalence is the point of U1.
 *
 * With nothing of ours on the stack (a cold-loaded deep link), back() would leave
 * the app, so climb the route tree instead; with no parent either, stay put.
 */
export function goBack(): void {
  if (currentDepth() > 0) {
    window.history.back()
    return
  }
  const parent = parentOf(currentRoute())
  if (parent) replaceRoute(parent)
}
