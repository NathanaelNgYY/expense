import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../components/ConfirmDialog'
import { toLocalDateString } from '../dates'
import BudgetDetail from './BudgetDetail'
import { SharedBudgetsContext, type SharedBudgetsContextValue } from './SharedBudgetsContext'
import type { ActiveBudgetData } from './types'

const today = toLocalDateString()

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
  entries: [
    {
      id: 'e1',
      budgetId: 'b1',
      userId: 'u2',
      amount: 30,
      categoryId: null,
      note: 'groceries',
      date: today,
      createdAt: `${today}T02:00:00Z`,
      updatedAt: `${today}T02:00:00Z`,
    },
  ],
  categories: [{ id: 'c1', budgetId: 'b1', label: 'Food', budgetAmount: null, icon: 'others' }],
  members: [
    { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
    { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
  ],
}

const ctx = {
  active,
  session: { user: { id: 'u2' } } as Session,
  error: null,
  closeBudget: vi.fn(),
  addEntry: vi.fn().mockResolvedValue(undefined),
  removeEntry: vi.fn().mockResolvedValue(undefined),
  leaveActiveBudget: vi.fn().mockResolvedValue(undefined),
} as unknown as SharedBudgetsContextValue

function renderDetail(value: SharedBudgetsContextValue = ctx) {
  return render(
    <ConfirmProvider>
      <SharedBudgetsContext.Provider value={value}>
        <BudgetDetail />
      </SharedBudgetsContext.Provider>
    </ConfirmProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('BudgetDetail', () => {
  it('shows entries with the adder name and amount', () => {
    renderDetail()
    expect(screen.getByText('groceries')).toBeInTheDocument()
    expect(screen.getAllByText(/Mum/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('S$30.00').length).toBeGreaterThan(0)
  })

  it('shows month progress against the limit', () => {
    renderDetail()
    expect(screen.getByText('S$30.00 of S$100.00')).toBeInTheDocument()
  })

  it('shows per-member totals for the month', () => {
    renderDetail()
    const totals = screen.getByTestId('member-totals')
    expect(totals).toHaveTextContent('Mum')
    expect(totals).toHaveTextContent('S$30.00')
    expect(totals).toHaveTextContent('Nat')
    expect(totals).toHaveTextContent('S$0.00')
  })

  it('adds an entry with the selected category', async () => {
    renderDetail()
    fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'kopi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(ctx.addEntry).toHaveBeenCalledWith({
        amount: 12.5,
        categoryId: 'c1',
        note: 'kopi',
        date: today,
      }),
    )
  })

  it('goes back via closeBudget', () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(ctx.closeBudget).toHaveBeenCalled()
  })

  it('non-owner can leave the budget after confirm', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Leave budget' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(ctx.leaveActiveBudget).toHaveBeenCalled())
  })

  it('owner does not see the Leave budget button', () => {
    renderDetail({ ...ctx, session: { user: { id: 'u1' } } as Session })
    expect(screen.queryByRole('button', { name: 'Leave budget' })).toBeNull()
  })
})
