import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedBudgetsContextValue } from './SharedBudgetsContext'
import { SharedBudgetsContext } from './SharedBudgetsContext'

const api = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  saveDisplayName: vi.fn(),
}))
vi.mock('./sharedApi', () => api)

import AuthGate, { DisplayNamePrompt } from './AuthGate'

const baseCtx = {
  refreshProfile: vi.fn(),
} as unknown as SharedBudgetsContextValue

function renderWithCtx(ui: ReactElement) {
  return render(<SharedBudgetsContext.Provider value={baseCtx}>{ui}</SharedBudgetsContext.Provider>)
}

beforeEach(() => vi.clearAllMocks())

describe('AuthGate', () => {
  it('starts Google sign-in from the primary button', async () => {
    api.signInWithGoogle.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(api.signInWithGoogle).toHaveBeenCalled())
  })

  it('does not show email sign-in controls', () => {
    renderWithCtx(<AuthGate />)
    expect(screen.queryByPlaceholderText('you@email.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send sign-in link' })).not.toBeInTheDocument()
  })

  it('shows the error message when Google sign-in fails', async () => {
    api.signInWithGoogle.mockRejectedValue(new Error('provider not enabled'))
    renderWithCtx(<AuthGate />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText('provider not enabled')).toBeInTheDocument()
  })
})

describe('DisplayNamePrompt', () => {
  it('saves the name and refreshes the profile', async () => {
    api.saveDisplayName.mockResolvedValue(undefined)
    renderWithCtx(<DisplayNamePrompt />)
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Nat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(api.saveDisplayName).toHaveBeenCalledWith('Nat'))
    expect(baseCtx.refreshProfile).toHaveBeenCalled()
  })
})
