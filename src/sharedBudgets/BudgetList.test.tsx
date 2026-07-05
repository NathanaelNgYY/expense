import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetList from './BudgetList'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { SharedBudget } from './types'

const budget: SharedBudget = {
  id: 'b1',
  name: 'Family',
  monthlyLimit: 500,
  currency: 'SGD',
  inviteCode: 'ABC234',
  ownerId: 'u1',
  createdAt: '2026-07-01T00:00:00Z',
}

const ctx = {
  budgets: [budget],
  error: null,
  createBudget: vi.fn().mockResolvedValue(undefined),
  joinBudget: vi.fn().mockResolvedValue(undefined),
  openBudget: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderList() {
  return render(
    <SharedBudgetsContext.Provider value={ctx}>
      <BudgetList />
    </SharedBudgetsContext.Provider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BudgetList', () => {
  it('lists budgets and opens one on tap', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: /Family/ }))
    expect(ctx.openBudget).toHaveBeenCalledWith('b1')
  })

  it('creates a budget from the New budget form', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'New budget' }))
    fireEvent.change(screen.getByPlaceholderText('Budget name'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByPlaceholderText('Monthly limit (optional)'), {
      target: { value: '300' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', 300))
  })

  it('creates with null limit when the limit field is empty', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'New budget' }))
    fireEvent.change(screen.getByPlaceholderText('Budget name'), { target: { value: 'Trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', null))
  })

  it('joins with a code', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Join with code' }))
    fireEvent.change(screen.getByPlaceholderText('Invite code'), { target: { value: 'XYZ789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    await waitFor(() => expect(ctx.joinBudget).toHaveBeenCalledWith('XYZ789'))
  })
})
