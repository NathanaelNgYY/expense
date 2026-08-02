import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetList from './BudgetList'
import { ConfirmProvider } from '../components/ConfirmDialog'
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
  memberCount: 3,
}

const created: SharedBudget = {
  ...budget,
  id: 'b2',
  name: 'Trip',
  monthlyLimit: 300,
  inviteCode: 'XYZ789',
  memberCount: 1,
}

const ctx = {
  budgets: [budget],
  error: null,
  createBudget: vi.fn().mockResolvedValue(created),
  joinBudget: vi.fn().mockResolvedValue(created),
  openBudget: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderList(value: SharedBudgetsContextValue = ctx) {
  return render(
    <ConfirmProvider>
      <SharedBudgetsContext.Provider value={value}>
        <BudgetList />
      </SharedBudgetsContext.Provider>
    </ConfirmProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BudgetList', () => {
  it('lists budgets and opens one on tap', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: /Family/ }))
    expect(ctx.openBudget).toHaveBeenCalledWith('b1')
  })

  it('shows how many people are in each budget', () => {
    renderList()
    expect(screen.getByRole('button', { name: /3 people/ })).toBeInTheDocument()
  })

  it('says "Just you" for a budget with a single member', () => {
    renderList({ ...ctx, budgets: [{ ...budget, memberCount: 1 }] } as SharedBudgetsContextValue)
    expect(screen.getByRole('button', { name: /Just you/ })).toBeInTheDocument()
  })

  it('teaches the feature when there are no budgets yet', () => {
    renderList({ ...ctx, budgets: [] } as unknown as SharedBudgetsContextValue)
    expect(screen.getByRole('heading', { name: 'Split a budget' })).toBeInTheDocument()
  })

  it('creates a budget from the create subscreen, then offers the invite code', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Create a shared budget' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Trip' } })
    fireEvent.change(screen.getByLabelText(/Monthly limit/), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', 300))
    // The flow does not end at the list: the invite step is where it lands.
    expect(await screen.findByText('Trip is live')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Invite code X Y Z 7 8 9/ })).toBeInTheDocument()
  })

  it('creates with null limit when the limit field is empty', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Create a shared budget' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Trip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))
    await waitFor(() => expect(ctx.createBudget).toHaveBeenCalledWith('Trip', null))
  })

  it('explains why an unnamed budget cannot be created instead of disabling the button', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Create a shared budget' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }))

    expect(screen.getByText(/Give the budget a name/)).toBeInTheDocument()
    expect(ctx.createBudget).not.toHaveBeenCalled()
  })

  it('joins with a code', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }))
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'XYZ789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join budget' }))
    await waitFor(() => expect(ctx.joinBudget).toHaveBeenCalledWith('XYZ789'))
    expect(ctx.openBudget).toHaveBeenCalledWith('b2')
  })

  it('normalises a pasted code and refuses a short one', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }))
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: ' xyz-78 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join budget' }))

    expect(screen.getByText(/6 characters/)).toBeInTheDocument()
    expect(ctx.joinBudget).not.toHaveBeenCalled()
  })

  it('returns to the list when the create subscreen is cancelled', () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Create a shared budget' }))
    fireEvent.click(screen.getByRole('button', { name: /Shared/ }))
    expect(screen.getByRole('button', { name: /Family/ })).toBeInTheDocument()
  })

  it('confirms before signing out', async () => {
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Sign out of shared budgets?')).toBeInTheDocument()
    expect(ctx.signOut).not.toHaveBeenCalled()

    // The trigger and the dialog's confirm share a label, so scope to the dialog.
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(ctx.signOut).toHaveBeenCalled())
  })
})
