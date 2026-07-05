import { describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../lib/supabaseClient', () => ({
  getSupabase: () => ({ rpc }),
  isSupabaseConfigured: () => true,
}))

import { joinBudget, mapBudget, mapEntry, mapMember } from './sharedApi'

const budgetRow = {
  id: 'b1',
  name: 'Family',
  monthly_limit: 500,
  currency: 'SGD',
  invite_code: 'ABC234',
  owner_id: 'u1',
  created_at: '2026-07-01T00:00:00Z',
}

describe('mappers', () => {
  it('mapBudget converts snake_case row to SharedBudget', () => {
    expect(mapBudget(budgetRow)).toEqual({
      id: 'b1',
      name: 'Family',
      monthlyLimit: 500,
      currency: 'SGD',
      inviteCode: 'ABC234',
      ownerId: 'u1',
      createdAt: '2026-07-01T00:00:00Z',
    })
  })

  it('mapBudget passes through null monthly_limit', () => {
    expect(mapBudget({ ...budgetRow, monthly_limit: null }).monthlyLimit).toBeNull()
  })

  it('mapEntry coerces numeric amount strings to numbers', () => {
    const row = {
      id: 'e1',
      budget_id: 'b1',
      user_id: 'u1',
      amount: '12.50', // Postgres numeric can arrive as string
      category_id: null,
      note: 'lunch',
      date: '2026-07-03',
      created_at: '2026-07-03T04:00:00Z',
      updated_at: '2026-07-03T04:00:00Z',
    }
    expect(mapEntry(row).amount).toBe(12.5)
  })

  it('mapMember flattens the embedded profile display name', () => {
    const row = {
      budget_id: 'b1',
      user_id: 'u2',
      role: 'member' as const,
      joined_at: '2026-07-02T00:00:00Z',
      profiles: { display_name: 'Mum' },
    }
    expect(mapMember(row)).toEqual({
      userId: 'u2',
      role: 'member',
      displayName: 'Mum',
      joinedAt: '2026-07-02T00:00:00Z',
    })
  })
})

describe('joinBudget', () => {
  it('calls the join_budget rpc and maps the returned row', async () => {
    rpc.mockResolvedValue({ data: budgetRow, error: null })
    const budget = await joinBudget('  abc234 ')
    expect(rpc).toHaveBeenCalledWith('join_budget', { p_code: 'abc234' })
    expect(budget.inviteCode).toBe('ABC234')
  })

  it('throws a friendly error on invalid_code', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_code' } })
    await expect(joinBudget('NOPE')).rejects.toThrow('Code not found')
  })
})
