import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../components/ConfirmDialog'
import OwnerTools from './OwnerTools'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { ActiveBudgetData } from './types'

const active: ActiveBudgetData = {
  budget: {
    id: 'b1',
    name: 'Family',
    monthlyLimit: 100,
    currency: 'SGD',
    inviteCode: 'ABC234',
    ownerId: 'u1',
    createdAt: '2026-07-01T00:00:00Z',
  },
  entries: [],
  categories: [],
  members: [
    { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
    { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
  ],
}

const ctx = {
  active,
  session: { user: { id: 'u1' } } as Session,
  regenerateCode: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
  updateActiveBudget: vi.fn().mockResolvedValue(undefined),
  deleteActiveBudget: vi.fn().mockResolvedValue(undefined),
  addCategory: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderTools() {
  return render(
    <ConfirmProvider>
      <SharedBudgetsContext.Provider value={ctx}>
        <OwnerTools />
      </SharedBudgetsContext.Provider>
    </ConfirmProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('OwnerTools', () => {
  it('shows the invite code', () => {
    renderTools()
    expect(screen.getByText('ABC234')).toBeInTheDocument()
  })

  it('regenerates the invite code', async () => {
    renderTools()
    fireEvent.click(screen.getByRole('button', { name: 'New code' }))
    await waitFor(() => expect(ctx.regenerateCode).toHaveBeenCalled())
  })

  it('removes a member (never the owner)', async () => {
    renderTools()
    expect(screen.queryByRole('button', { name: 'Remove Nat' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mum' }))
    await waitFor(() => expect(ctx.removeMember).toHaveBeenCalledWith('u2'))
  })

  it('adds a category', async () => {
    renderTools()
    fireEvent.change(screen.getByPlaceholderText('New category'), { target: { value: 'Food' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() =>
      expect(ctx.addCategory).toHaveBeenCalledWith({
        label: 'Food',
        budgetAmount: null,
        icon: 'others',
      }),
    )
  })

  it('deletes the budget only after confirm', async () => {
    renderTools()

    fireEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(ctx.deleteActiveBudget).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(ctx.deleteActiveBudget).toHaveBeenCalled())
  })

  it('saves name and limit changes', async () => {
    renderTools()
    fireEvent.change(screen.getByDisplayValue('Family'), { target: { value: 'Fam 2.0' } })
    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() =>
      expect(ctx.updateActiveBudget).toHaveBeenCalledWith({ name: 'Fam 2.0', monthlyLimit: 250 }),
    )
  })
})
