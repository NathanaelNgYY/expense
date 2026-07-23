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

/** Push a history entry, so back returns to where the user just was. */
export function navigate(route: Route): void {
  if (isSameRoute(route, currentRoute())) return
  window.history.pushState(null, '', urlFor(route))
  emit()
}

/** Swap the current entry — for normalisation and post-save redirects, which
 *  must not become somewhere back can return to. */
export function replaceRoute(route: Route): void {
  window.history.replaceState(null, '', urlFor(route))
  emit()
}

/**
 * The same operation as the OS back gesture — that equivalence is the point of U1.
 *
 * On a cold-loaded deep link there is nothing on the stack to pop, and calling
 * `history.back()` would leave the app. Climb the route tree instead, and if there
 * is no parent either, stay put rather than exiting.
 */
export function goBack(): void {
  if (window.history.length > 1) {
    window.history.back()
    return
  }
  const parent = parentOf(currentRoute())
  if (parent) replaceRoute(parent)
}
