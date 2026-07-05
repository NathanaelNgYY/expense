import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedBudgetsContextValue } from './SharedBudgetsContext'
import { SharedBudgetsContext } from './SharedBudgetsContext'

const api = vi.hoisted(() => ({
  requestOtp: vi.fn(),
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

  it('requests a sign-in link then shows the sent step', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
    await waitFor(() => expect(api.requestOtp).toHaveBeenCalledWith('nat@example.com'))
    expect(screen.getByText('We sent a sign-in link to nat@example.com.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send another link' })).toBeInTheDocument()
  })

  it('resends the sign-in link', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
    await screen.findByRole('button', { name: 'Send another link' })
    fireEvent.click(screen.getByRole('button', { name: 'Send another link' }))
    await waitFor(() => expect(api.requestOtp).toHaveBeenCalledTimes(2))
  })

  it('shows the error message when sending fails', async () => {
    api.requestOtp.mockRejectedValue(new Error('rate limited'))
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }))
    expect(await screen.findByText('rate limited')).toBeInTheDocument()
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
