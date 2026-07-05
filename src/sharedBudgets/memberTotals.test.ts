import { describe, expect, it } from 'vitest'
import { computeMemberTotals, currentSgtMonth, entriesForMonth, totalSpent } from './memberTotals'
import type { BudgetMember, SharedEntry } from './types'

function entry(overrides: Partial<SharedEntry>): SharedEntry {
  return {
    id: 'e1',
    budgetId: 'b1',
    userId: 'u1',
    amount: 10,
    categoryId: null,
    note: '',
    date: '2026-07-03',
    createdAt: '2026-07-03T00:00:00Z',
    updatedAt: '2026-07-03T00:00:00Z',
    ...overrides,
  }
}

const members: BudgetMember[] = [
  { userId: 'u1', role: 'owner', displayName: 'Nat', joinedAt: '2026-07-01T00:00:00Z' },
  { userId: 'u2', role: 'member', displayName: 'Mum', joinedAt: '2026-07-01T00:00:00Z' },
]

describe('currentSgtMonth', () => {
  it('returns YYYY-MM', () => {
    expect(currentSgtMonth()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('entriesForMonth', () => {
  it('keeps only entries whose date is in the month', () => {
    const list = [entry({ id: 'a', date: '2026-07-31' }), entry({ id: 'b', date: '2026-06-30' })]
    expect(entriesForMonth(list, '2026-07').map(e => e.id)).toEqual(['a'])
  })
})

describe('totalSpent', () => {
  it('sums amounts', () => {
    expect(totalSpent([entry({ amount: 1.5 }), entry({ id: 'e2', amount: 2 })])).toBeCloseTo(3.5)
  })
})

describe('computeMemberTotals', () => {
  it('includes every member, zero when no entries, sorted by total desc', () => {
    const list = [
      entry({ id: 'a', userId: 'u2', amount: 20 }),
      entry({ id: 'b', userId: 'u2', amount: 5 }),
    ]
    expect(computeMemberTotals(list, members)).toEqual([
      { userId: 'u2', displayName: 'Mum', total: 25 },
      { userId: 'u1', displayName: 'Nat', total: 0 },
    ])
  })

  it('ignores entries from departed members', () => {
    const list = [entry({ userId: 'gone', amount: 99 })]
    const totals = computeMemberTotals(list, members)
    expect(totals.every(t => t.total === 0)).toBe(true)
  })
})
