import { render, screen } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import SharedScreen from './SharedScreen'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'

function renderWith(partial: Partial<SharedBudgetsContextValue>) {
  const value = {
    configured: true,
    authReady: true,
    session: null,
    profile: null,
    budgets: [],
    active: null,
    error: null,
  } as unknown as SharedBudgetsContextValue
  return render(
    <SharedBudgetsContext.Provider value={{ ...value, ...partial }}>
      <SharedScreen />
    </SharedBudgetsContext.Provider>,
  )
}

describe('SharedScreen', () => {
  it('explains setup when Supabase is not configured', () => {
    renderWith({ configured: false })
    expect(screen.getByText(/not configured/i)).toBeInTheDocument()
  })

  it('shows nothing while auth is loading', () => {
    const { container } = renderWith({ authReady: false })
    expect(container.querySelector('.shared-auth')).toBeNull()
  })

  it('shows the auth gate when signed out', () => {
    renderWith({ session: null })
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('prompts for a display name right after first sign-in', () => {
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: '' },
    })
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument()
  })

  it('shows the budget list when signed in with a named profile', () => {
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: 'Nat' },
    })
    expect(screen.getByText('SHARED BUDGETS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New budget' })).toBeInTheDocument()
  })

  it('shows an offline banner when the browser is offline', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderWith({
      session: { user: { id: 'u1' } } as Session,
      profile: { id: 'u1', displayName: 'Nat' },
    })
    expect(screen.getByText('Shared budgets need a connection')).toBeInTheDocument()
    spy.mockRestore()
  })
})
