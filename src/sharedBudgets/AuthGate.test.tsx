import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedBudgetsContextValue } from './SharedBudgetsContext'
import { SharedBudgetsContext } from './SharedBudgetsContext'

const api = vi.hoisted(() => ({
  requestOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
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
  it('requests a code then shows the code step', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(api.requestOtp).toHaveBeenCalledWith('nat@example.com'))
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument()
  })

  it('verifies the entered code', async () => {
    api.requestOtp.mockResolvedValue(undefined)
    api.verifyOtpCode.mockResolvedValue(undefined)
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByPlaceholderText('6-digit code')
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(api.verifyOtpCode).toHaveBeenCalledWith('nat@example.com', '123456'))
  })

  it('shows the error message when sending fails', async () => {
    api.requestOtp.mockRejectedValue(new Error('rate limited'))
    renderWithCtx(<AuthGate />)
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'nat@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
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
