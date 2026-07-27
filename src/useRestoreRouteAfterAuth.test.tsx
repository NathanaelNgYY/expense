import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useRestoreRouteAfterAuth } from './useRestoreRouteAfterAuth'
import { rememberRouteForAuth } from './postAuthRoute'

const supabase = vi.hoisted(() => ({ isSupabaseConfigured: vi.fn(() => true) }))
const shared = vi.hoisted(() => ({
  onAuthChange: vi.fn(),
  listener: null as null | ((session: unknown) => void),
  unsubscribe: vi.fn(),
}))

vi.mock('./lib/supabaseClient', () => ({ isSupabaseConfigured: supabase.isSupabaseConfigured }))
vi.mock('./sharedBudgets/sharedApi', () => ({
  onAuthChange: (cb: (session: unknown) => void) => {
    shared.onAuthChange(cb)
    shared.listener = cb
    return shared.unsubscribe
  },
}))

function Probe() {
  useRestoreRouteAfterAuth()
  return null
}

function render(): Root {
  const root = createRoot(document.createElement('div'))
  act(() => root.render(<Probe />))
  return root
}

describe('useRestoreRouteAfterAuth', () => {
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    shared.listener = null
    supabase.isSupabaseConfigured.mockReturnValue(true)
    window.history.replaceState({}, '', '/#/home')
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
  })

  it('returns the user to the screen they signed in from', () => {
    rememberRouteForAuth({ tab: 'settings', sub: 'automatic' })
    root = render()

    act(() => shared.listener?.({ user: { id: 'user-1' } }))

    expect(window.location.hash).toBe('#/settings/automatic')
  })

  it('does not move a user whose session change had no pending route', () => {
    root = render()

    act(() => shared.listener?.({ user: { id: 'user-1' } }))

    expect(window.location.hash).toBe('#/home')
  })

  it('stays put on sign-out rather than replaying the pending route', () => {
    rememberRouteForAuth({ tab: 'settings', sub: 'automatic' })
    root = render()

    act(() => shared.listener?.(null))

    expect(window.location.hash).toBe('#/home')
  })

  it('does not subscribe when Supabase is not configured', () => {
    supabase.isSupabaseConfigured.mockReturnValue(false)
    root = render()

    expect(shared.onAuthChange).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    root = render()
    act(() => root?.unmount())
    root = null

    expect(shared.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
