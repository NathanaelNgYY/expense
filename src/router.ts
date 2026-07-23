// src/router.ts
// Pure hash-route parsing/formatting for U1. No DOM access — callers pass the raw
// hash string — so this unit-tests without a browser, the same discipline
// `deepLink.ts` follows. The DOM edge (subscription, push/replace) lives in
// `useRoute.ts`.
//
// Hash rather than History-API paths: `#/history` needs no Vercel rewrite rule and
// cannot 404 on a cold load. Hand-rolled rather than a router dependency: the initial
// chunk has ~0.4 KiB of headroom against its 146 KiB budget.
import type { Tab } from './components/TabBar'

export type SettingsSub =
  | 'automatic'
  | 'budget'
  | 'appearance'
  | 'data'
  | 'poker'
  | 'shared'

export interface Route {
  tab: Tab
  /** Non-null only when `tab === 'settings'`. */
  sub: SettingsSub | null
}

export const HOME: Route = { tab: 'home', sub: null }

const TABS: readonly Tab[] = ['home', 'add', 'history', 'insights', 'settings']

// Order is meaningful: it is the order the Settings hub lists them in, and the
// single source of truth both the hub and the shell read.
const SETTINGS_SUBS: readonly SettingsSub[] = [
  'automatic',
  'budget',
  'appearance',
  'data',
  'poker',
  'shared',
]

/** Every reachable destination, in navigation order. */
export const ROUTES: readonly Route[] = [
  ...TABS.map(tab => ({ tab, sub: null })),
  ...SETTINGS_SUBS.map(sub => ({ tab: 'settings' as const, sub })),
]

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value)
}

function isSettingsSub(value: string): value is SettingsSub {
  return (SETTINGS_SUBS as readonly string[]).includes(value)
}

/**
 * Read a `location.hash` into a Route. Anything unrecognised — an unknown tab, a
 * depth the table does not define, a hash from a future version — resolves to Home
 * rather than throwing, the same defensive shape `isThemeId` uses.
 */
export function parseHash(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (segments.length === 0 || segments.length > 2) return HOME

  const [tab, sub] = segments
  if (!isTab(tab)) return HOME

  if (segments.length === 1) return { tab, sub: null }

  // Only Settings has children.
  if (tab !== 'settings' || !isSettingsSub(sub)) return HOME
  return { tab, sub }
}

export function formatHash(route: Route): string {
  // Guard the cast case: a stray `sub` on a non-settings tab must not emit
  // `#/history/appearance` and poison the address bar.
  return route.tab === 'settings' && route.sub
    ? `#/settings/${route.sub}`
    : `#/${route.tab}`
}

export function isSameRoute(a: Route, b: Route): boolean {
  return a.tab === b.tab && a.sub === b.sub
}

/**
 * One level up, or null at the top. Used when a deep-linked cold load presses the
 * back chevron with nothing on the history stack to pop.
 */
export function parentOf(route: Route): Route | null {
  return route.tab === 'settings' && route.sub !== null
    ? { tab: 'settings', sub: null }
    : null
}
