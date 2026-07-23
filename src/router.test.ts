import { describe, expect, it } from 'vitest'
import {
  ROUTES,
  formatHash,
  parentOf,
  parseHash,
  type Route,
} from './router'

describe('parseHash', () => {
  it.each([
    ['#/home', { tab: 'home', sub: null }],
    ['#/add', { tab: 'add', sub: null }],
    ['#/history', { tab: 'history', sub: null }],
    ['#/insights', { tab: 'insights', sub: null }],
    ['#/settings', { tab: 'settings', sub: null }],
    ['#/settings/automatic', { tab: 'settings', sub: 'automatic' }],
    ['#/settings/budget', { tab: 'settings', sub: 'budget' }],
    ['#/settings/appearance', { tab: 'settings', sub: 'appearance' }],
    ['#/settings/data', { tab: 'settings', sub: 'data' }],
    ['#/settings/poker', { tab: 'settings', sub: 'poker' }],
    ['#/settings/shared', { tab: 'settings', sub: 'shared' }],
  ])('reads %s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected)
  })

  it.each([
    ['', 'no hash at all — a cold load on the bare origin'],
    ['#', 'a bare fragment'],
    ['#/', 'a trailing slash with no route'],
    ['#/nope', 'an unknown tab'],
    ['#/settings/nope', 'an unknown settings child'],
    ['#/home/extra', 'a depth the table does not define'],
    ['#/HOME', 'the wrong case — routes are lowercase'],
    ['#/settings/poker/deeper', 'a third level'],
  ])('falls back to home for %s (%s)', hash => {
    expect(parseHash(hash)).toEqual({ tab: 'home', sub: null })
  })

  it('tolerates a leading slash-free fragment', () => {
    // Some browsers hand back `#/home`; a hand-typed URL may omit the slash.
    expect(parseHash('#home')).toEqual({ tab: 'home', sub: null })
  })
})

describe('formatHash', () => {
  it('round-trips every route in the table', () => {
    for (const route of ROUTES) {
      expect(parseHash(formatHash(route))).toEqual(route)
    }
  })

  it('ignores a stray sub on a non-settings tab', () => {
    // Not constructible through the public API, but a bad cast must not emit
    // `#/history/appearance` and poison the address bar.
    const bogus = { tab: 'history', sub: 'appearance' } as unknown as Route
    expect(formatHash(bogus)).toBe('#/history')
  })
})

describe('ROUTES', () => {
  it('covers all eleven destinations exactly once', () => {
    const hashes = ROUTES.map(formatHash)
    expect(hashes).toHaveLength(11)
    expect(new Set(hashes).size).toBe(11)
  })

  it('is the single source of truth for the settings children', () => {
    const children = ROUTES.filter(route => route.sub !== null).map(route => route.sub)
    expect(children).toEqual([
      'automatic',
      'budget',
      'appearance',
      'data',
      'poker',
      'shared',
    ])
  })
})

describe('parentOf', () => {
  it('walks a settings child up to the hub', () => {
    expect(parentOf({ tab: 'settings', sub: 'appearance' })).toEqual({
      tab: 'settings',
      sub: null,
    })
  })

  it.each(['home', 'add', 'history', 'insights', 'settings'] as const)(
    'has no parent for the top-level %s tab',
    tab => {
      expect(parentOf({ tab, sub: null })).toBeNull()
    },
  )
})
