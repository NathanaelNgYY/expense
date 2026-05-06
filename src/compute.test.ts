// src/compute.test.ts
import { describe, it, expect } from 'vitest'
import {
  entriesForMonth,
  monthlySpendByCategory,
  categoryDeficits,
  bufferRemaining,
  weeklyTotal,
  lunchWeeklySpend,
  weeksInMonth,
  mostExpensiveCategory,
  averageLunchPerEntry,
} from './compute'
import { DEFAULT_BUDGET } from './types'
import type { Entry } from './types'

function e(overrides: Partial<Entry> = {}): Entry {
  return { id: '1', amount: 10, category: 'lunch', note: '', date: '2026-05-04', ...overrides }
}

describe('entriesForMonth', () => {
  it('returns only entries in the given month', () => {
    const entries = [e({ date: '2026-05-04' }), e({ date: '2026-04-30' }), e({ date: '2026-05-31' })]
    expect(entriesForMonth(entries, 2026, 4)).toHaveLength(2) // month is 0-indexed
  })

  it('returns empty array when no entries match', () => {
    expect(entriesForMonth([e({ date: '2026-04-01' })], 2026, 4)).toHaveLength(0)
  })
})

describe('monthlySpendByCategory', () => {
  it('sums amounts per category for the month', () => {
    const entries = [
      e({ amount: 14, category: 'lunch', date: '2026-05-04' }),
      e({ amount: 6, category: 'lunch', date: '2026-05-05' }),
      e({ amount: 3, category: 'transport', date: '2026-05-06' }),
    ]
    const result = monthlySpendByCategory(entries, 2026, 4)
    expect(result.lunch).toBe(20)
    expect(result.transport).toBe(3)
    expect(result.savings).toBe(0)
    expect(result.investments).toBe(0)
  })

  it('excludes uncategorized entries from all category totals', () => {
    const result = monthlySpendByCategory([e({ amount: 50, category: null })], 2026, 4)
    expect(result.lunch).toBe(0)
    expect(result.transport).toBe(0)
  })
})

describe('categoryDeficits', () => {
  it('returns positive value when under budget', () => {
    const spend = { lunch: 100, transport: 30, savings: 400, investments: 250 }
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)
    expect(deficits.lunch).toBe(164)   // 264 - 100
    expect(deficits.transport).toBe(20) // 50 - 30
  })

  it('returns negative value when over budget', () => {
    const spend = { lunch: 280, transport: 30, savings: 400, investments: 250 }
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)
    expect(deficits.lunch).toBe(-16) // 264 - 280
  })
})

describe('bufferRemaining', () => {
  it('returns full buffer when all categories are under budget', () => {
    const deficits = { lunch: 50, transport: 10, savings: 0, investments: 4 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(236)
  })

  it('subtracts all overages from the buffer', () => {
    const deficits = { lunch: -16, transport: -5, savings: 0, investments: 4 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(215) // 236 - 16 - 5
  })

  it('returns negative buffer when overages exceed buffer', () => {
    const deficits = { lunch: -300, transport: 0, savings: 0, investments: 0 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(-64) // 236 - 300
  })
})

describe('weeklyTotal', () => {
  it('sums all entries within Mon–Sun of the reference date', () => {
    const entries = [
      e({ amount: 14, date: '2026-05-04' }), // Monday
      e({ amount: 6, date: '2026-05-06' }),  // Wednesday
      e({ amount: 99, date: '2026-04-27' }), // previous week
    ]
    expect(weeklyTotal(entries, new Date('2026-05-04'))).toBe(20)
  })

  it('returns 0 when no entries fall in the week', () => {
    expect(weeklyTotal([e({ date: '2026-04-01' })], new Date('2026-05-04'))).toBe(0)
  })
})

describe('lunchWeeklySpend', () => {
  it('sums only lunch entries for the week', () => {
    const entries = [
      e({ amount: 14, category: 'lunch', date: '2026-05-04' }),
      e({ amount: 3, category: 'transport', date: '2026-05-04' }),
    ]
    expect(lunchWeeklySpend(entries, new Date('2026-05-04'))).toBe(14)
  })
})

describe('weeksInMonth', () => {
  it('returns at least 4 Mondays for May 2026', () => {
    expect(weeksInMonth(2026, 4).length).toBeGreaterThanOrEqual(4)
  })

  it('first entry is a Monday (day index 1)', () => {
    const weeks = weeksInMonth(2026, 4)
    expect(weeks[0].getDay()).toBe(1)
  })
})

describe('mostExpensiveCategory', () => {
  it('returns null when no categorized entries exist', () => {
    expect(mostExpensiveCategory([], 2026, 4)).toBeNull()
  })

  it('returns null when all entries this month are uncategorized', () => {
    const entries = [e({ category: null, date: '2026-05-04' })]
    expect(mostExpensiveCategory(entries, 2026, 4)).toBeNull()
  })

  it('returns the only category that has spend', () => {
    const entries = [e({ category: 'transport', amount: 5, date: '2026-05-04' })]
    const result = mostExpensiveCategory(entries, 2026, 4)
    expect(result).toEqual({ category: 'transport', amount: 5 })
  })

  it('returns the category with highest total spend', () => {
    const entries = [
      e({ category: 'lunch', amount: 30, date: '2026-05-04' }),
      e({ category: 'transport', amount: 50, date: '2026-05-04' }),
    ]
    const result = mostExpensiveCategory(entries, 2026, 4)
    expect(result).toEqual({ category: 'transport', amount: 50 })
  })

  it('ignores entries from other months', () => {
    const entries = [
      e({ category: 'transport', amount: 999, date: '2026-04-01' }),
      e({ category: 'lunch', amount: 10, date: '2026-05-04' }),
    ]
    const result = mostExpensiveCategory(entries, 2026, 4)
    expect(result).toEqual({ category: 'lunch', amount: 10 })
  })
})

describe('averageLunchPerEntry', () => {
  it('returns null when there are no lunch entries', () => {
    expect(averageLunchPerEntry([], 2026, 4)).toBeNull()
  })

  it('returns null when there is only 1 lunch entry', () => {
    const entries = [e({ category: 'lunch', amount: 10, date: '2026-05-04' })]
    expect(averageLunchPerEntry(entries, 2026, 4)).toBeNull()
  })

  it('returns the average when there are 2+ lunch entries', () => {
    const entries = [
      e({ category: 'lunch', amount: 8, date: '2026-05-04' }),
      e({ category: 'lunch', amount: 12, date: '2026-05-05' }),
    ]
    expect(averageLunchPerEntry(entries, 2026, 4)).toBe(10)
  })

  it('ignores non-lunch entries', () => {
    const entries = [
      e({ category: 'lunch', amount: 8, date: '2026-05-04' }),
      e({ category: 'lunch', amount: 12, date: '2026-05-05' }),
      e({ category: 'transport', amount: 999, date: '2026-05-06' }),
    ]
    expect(averageLunchPerEntry(entries, 2026, 4)).toBe(10)
  })
})
