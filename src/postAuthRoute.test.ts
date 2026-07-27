import { beforeEach, describe, expect, it } from 'vitest'
import {
  POST_AUTH_ROUTE_KEY,
  POST_AUTH_ROUTE_TTL_MS,
  rememberRouteForAuth,
  takeRememberedRoute,
} from './postAuthRoute'

const NOW = 1_760_000_000_000

describe('postAuthRoute', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('restores the settings subscreen the user signed in from', () => {
    rememberRouteForAuth({ tab: 'settings', sub: 'automatic' }, NOW)

    expect(takeRememberedRoute(NOW + 5_000)).toEqual({ tab: 'settings', sub: 'automatic' })
  })

  it('clears the pending route once taken, so a later sign-in does not repeat it', () => {
    rememberRouteForAuth({ tab: 'settings', sub: 'shared' }, NOW)

    expect(takeRememberedRoute(NOW)).toEqual({ tab: 'settings', sub: 'shared' })
    expect(takeRememberedRoute(NOW)).toBeNull()
    expect(sessionStorage.getItem(POST_AUTH_ROUTE_KEY)).toBeNull()
  })

  it('returns null when nothing is pending', () => {
    expect(takeRememberedRoute(NOW)).toBeNull()
  })

  it('expires a route left behind by an abandoned sign-in', () => {
    rememberRouteForAuth({ tab: 'settings', sub: 'automatic' }, NOW)

    expect(takeRememberedRoute(NOW + POST_AUTH_ROUTE_TTL_MS + 1)).toBeNull()
  })

  it('does not navigate for a Home route, which is already where sign-in lands', () => {
    rememberRouteForAuth({ tab: 'home', sub: null }, NOW)

    expect(takeRememberedRoute(NOW)).toBeNull()
  })

  it('ignores a corrupt or foreign stored value instead of throwing', () => {
    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, 'not-json')
    expect(takeRememberedRoute(NOW)).toBeNull()

    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, JSON.stringify({ hash: '#/nope', savedAt: NOW }))
    expect(takeRememberedRoute(NOW)).toBeNull()

    sessionStorage.setItem(POST_AUTH_ROUTE_KEY, JSON.stringify({ hash: '#/history' }))
    expect(takeRememberedRoute(NOW)).toBeNull()
  })

  it('restores a plain tab route as well as a settings subscreen', () => {
    rememberRouteForAuth({ tab: 'insights', sub: null }, NOW)

    expect(takeRememberedRoute(NOW)).toEqual({ tab: 'insights', sub: null })
  })
})
