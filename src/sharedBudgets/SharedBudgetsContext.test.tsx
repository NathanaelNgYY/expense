import { act, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveBudgetData, SharedBudget } from './types'

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => {
    throw new Error('context must go through sharedApi')
  },
}))

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthChange: vi.fn(),
  getMyProfile: vi.fn(),
  listMyBudgets: vi.fn(),
  fetchBudgetData: vi.fn(),
  fetchMembers: vi.fn(),
  subscribeToBudget: vi.fn(),
  createBudget: vi.fn(),
  joinBudget: vi.fn(),
  createSharedEntry: vi.fn(),
  updateSharedEntry: vi.fn(),
  deleteSharedEntry: vi.fn(),
  createCategory: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  regenerateInviteCode: vi.fn(),
  removeMember: vi.fn(),
  saveDisplayName: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtpCode: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('./sharedApi', () => api)

import { SharedBudgetsProvider, useSharedBudgets } from './SharedBudgetsContext'
import type { BudgetRealtimeHandlers } from './sharedApi'

const session = { user: { id: 'u1', email: 'nat@example.com' } } as Session

const budget: SharedBudget = {
  id: 'b1',
  name: 'Family',
  monthlyLimit: 500,
  currency: 'SGD',
  inviteCode: 'ABC234',
  ownerId: 'u1',
  createdAt: '2026-07-01T00:00:00Z',
}

const activeData: ActiveBudgetData = {
  budget,
  entries: [],
  categories: [],
  members: [{ userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' }],
}

let ctx: ReturnType<typeof useSharedBudgets>
function Probe() {
  const value = useSharedBudgets()
  useEffect(() => {
    ctx = value
  }, [value])
  return <div data-testid="budget-count">{value.budgets.length}</div>
}

let realtimeHandlers: BudgetRealtimeHandlers | null = null
const unsubscribe = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  realtimeHandlers = null
  api.getSession.mockResolvedValue(session)
  api.onAuthChange.mockReturnValue(() => {})
  api.getMyProfile.mockResolvedValue({ id: 'u1', displayName: 'Nat' })
  api.listMyBudgets.mockResolvedValue([budget])
  api.fetchBudgetData.mockResolvedValue(activeData)
  api.subscribeToBudget.mockImplementation((_id: string, handlers: BudgetRealtimeHandlers) => {
    realtimeHandlers = handlers
    return unsubscribe
  })
})

describe('SharedBudgetsProvider', () => {
  it('loads profile and budgets once a session exists', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('budget-count')).toHaveTextContent('1'))
    await waitFor(() => expect(ctx.profile?.displayName).toBe('Nat'))
    expect(ctx.authReady).toBe(true)
  })

  it('openBudget fetches data and subscribes; realtime entry INSERT lands in state', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    expect(api.subscribeToBudget).toHaveBeenCalledWith('b1', expect.any(Object))
    act(() =>
      realtimeHandlers!.onEntryChange({
        type: 'INSERT',
        entry: {
          id: 'e1',
          budgetId: 'b1',
          userId: 'u2',
          amount: 7,
          categoryId: null,
          note: 'kopi',
          date: '2026-07-05',
          createdAt: '2026-07-05T01:00:00Z',
          updatedAt: '2026-07-05T01:00:00Z',
        },
      }),
    )
    expect(ctx.active?.entries.map(e => e.id)).toEqual(['e1'])
  })

  it('closeBudget unsubscribes and clears active state', async () => {
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    act(() => ctx.closeBudget())
    expect(unsubscribe).toHaveBeenCalled()
    expect(ctx.active).toBeNull()
  })

  it('leaveActiveBudget removes own membership, closes, and drops the budget from the list', async () => {
    api.removeMember.mockResolvedValue(undefined)
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    await act(() => ctx.leaveActiveBudget())
    expect(api.removeMember).toHaveBeenCalledWith('b1', 'u1')
    expect(ctx.active).toBeNull()
    expect(ctx.budgets).toEqual([])
  })

  it('addEntry applies the created entry to active state', async () => {
    api.createSharedEntry.mockResolvedValue({
      id: 'e9',
      budgetId: 'b1',
      userId: 'u1',
      amount: 12,
      categoryId: null,
      note: '',
      date: '2026-07-05',
      createdAt: '2026-07-05T02:00:00Z',
      updatedAt: '2026-07-05T02:00:00Z',
    })
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(() => ctx.openBudget('b1'))
    await act(() => ctx.addEntry({ amount: 12, categoryId: null, note: '', date: '2026-07-05' }))
    expect(api.createSharedEntry).toHaveBeenCalledWith('b1', {
      amount: 12,
      categoryId: null,
      note: '',
      date: '2026-07-05',
    })
    expect(ctx.active?.entries.map(e => e.id)).toEqual(['e9'])
  })

  it('surfaces operation failures via error', async () => {
    api.joinBudget.mockRejectedValue(new Error('Code not found'))
    render(
      <SharedBudgetsProvider>
        <Probe />
      </SharedBudgetsProvider>,
    )
    await waitFor(() => expect(ctx.authReady).toBe(true))
    await act(async () => {
      await ctx.joinBudget('NOPE').catch(() => {})
    })
    expect(ctx.error).toBe('Code not found')
  })
})
