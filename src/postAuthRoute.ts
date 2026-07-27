// src/postAuthRoute.ts
// Google sign-in leaves the app entirely, and on the way back Supabase's default implicit flow
// hands the session over in the URL fragment — the same slot the hash router reads (`router.ts`).
// A `redirectTo` carrying `#/settings/automatic` would simply be overwritten by
// `#access_token=…`, so the route the user started from cannot ride in the URL. It rides in
// sessionStorage instead: per-tab, same-origin, cleared when the tab closes, and preserved
// across the round trip.
//
// Restoring happens in `useRestoreRouteAfterAuth`, which waits for the auth event so that
// Supabase has already stripped the token fragment — writing our hash any earlier just gets
// cleaned away with it.
import { formatHash, parseHash, type Route } from './router'

export const POST_AUTH_ROUTE_KEY = 'post_auth_route'

// An OAuth round trip takes seconds. The window is generous, but bounded: a user who abandons
// the Google screen and keeps browsing must not be yanked back here by an unrelated sign-in
// later in the same tab.
export const POST_AUTH_ROUTE_TTL_MS = 10 * 60 * 1000

interface StoredRoute {
  hash: string
  savedAt: number
}

function isStoredRoute(value: unknown): value is StoredRoute {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<StoredRoute>
  return typeof candidate.hash === 'string' && typeof candidate.savedAt === 'number'
}

/** Call immediately before a redirect that leaves the app. */
export function rememberRouteForAuth(route: Route, now: number = Date.now()): void {
  const stored: StoredRoute = { hash: formatHash(route), savedAt: now }
  try {
    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, JSON.stringify(stored))
  } catch {
    // Private-mode quota failures cost the user a redirect back to Home, not the sign-in.
  }
}

// Read and remove in one step: whatever happens to the value afterwards, a pending route must
// never survive to fire a second time.
function readAndClear(): string | null {
  try {
    const raw = sessionStorage.getItem(POST_AUTH_ROUTE_KEY)
    sessionStorage.removeItem(POST_AUTH_ROUTE_KEY)
    return raw
  } catch {
    return null
  }
}

/**
 * Read and clear the pending route. Returns null when there is nothing to restore, when the
 * entry has expired, or when it resolves to Home — landing on Home is already the default, so
 * there is no navigation worth performing.
 */
export function takeRememberedRoute(now: number = Date.now()): Route | null {
  const raw = readAndClear()
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isStoredRoute(parsed)) return null
  if (now - parsed.savedAt > POST_AUTH_ROUTE_TTL_MS) return null

  const route = parseHash(parsed.hash)
  // parseHash resolves anything unrecognised to Home, which is indistinguishable from a genuine
  // Home route — either way there is nothing to restore.
  return formatHash(route) === parsed.hash && route.tab !== 'home' ? route : null
}
