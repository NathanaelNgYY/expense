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
  highestSpendingDay,
  topSpendingDayOfWeek,
  monthOverMonthDelta,
  monthlySpendForecast,
  safeToSpendPerDay,
  monthComparison,
} from './compute'
import { DEFAULT_BUDGET, CATEGORIES } from './types'
import type { Entry, CustomCategory } from './types'
import { allCategoryIds, categoryBudgets, customBudgetTotal, countEntriesForCategory } from './compute'

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
    expect((result as Record<string, number>).others).toBe(0)
  })

  it('excludes uncategorized entries from all category totals', () => {
    const result = monthlySpendByCategory([e({ amount: 50, category: null })], 2026, 4)
    expect(result.lunch).toBe(0)
    expect(result.transport).toBe(0)
  })

  it('tracks others as a category', () => {
    const result = monthlySpendByCategory(
      [e({ amount: 200, category: 'others' as Entry['category'] })],
      2026,
      4,
    )

    expect((result as Record<string, number>).others).toBe(200)
  })
})

describe('categoryDeficits', () => {
  it('returns positive value when under budget', () => {
    const spend = { lunch: 100, transport: 30, savings: 400, investments: 250, others: 0 }
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)
    expect(deficits.lunch).toBe(164)   // 264 - 100
    expect(deficits.transport).toBe(20) // 50 - 30
  })

  it('returns negative value when over budget', () => {
    const spend = { lunch: 280, transport: 30, savings: 400, investments: 250, others: 0 }
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)
    expect(deficits.lunch).toBe(-16) // 264 - 280
  })

  it('gives others the same spending room as the buffer', () => {
    const spend = { lunch: 0, transport: 0, savings: 0, investments: 0, others: 100 }
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)

    expect(DEFAULT_BUDGET.others).toBe(DEFAULT_BUDGET.buffer)
    expect(deficits.others).toBe(136)
  })
})

describe('bufferRemaining', () => {
  it('returns full buffer when all categories are under budget', () => {
    const deficits = { lunch: 50, transport: 10, savings: 0, investments: 4, others: 236 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(236)
  })

  it('subtracts all overages from the buffer', () => {
    const deficits = { lunch: -16, transport: -5, savings: 0, investments: 4, others: 236 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(215) // 236 - 16 - 5
  })

  it('returns negative buffer when overages exceed buffer', () => {
    const deficits = { lunch: -300, transport: 0, savings: 0, investments: 0, others: 236 }
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(-64) // 236 - 300
  })

  it('deducts others spending from the buffer even while others is within budget', () => {
    const spend = monthlySpendByCategory(
      [e({ amount: 200, category: 'others' as Entry['category'] })],
      2026,
      4,
    )
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)

    expect((deficits as Record<string, number>).others).toBe(36)
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(36)
  })

  it('also deducts over-budget amounts from other categories', () => {
    const spend = monthlySpendByCategory(
      [
        e({ amount: 100, category: 'others' as Entry['category'] }),
        e({ amount: 280, category: 'lunch' }),
      ],
      2026,
      4,
    )
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET)

    expect(deficits.others).toBe(136)
    expect(deficits.lunch).toBe(-16)
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(120)
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

  it('ignores savings and investments when finding most expensive spending category', () => {
    const entries = [
      e({ category: 'lunch', amount: 13.5, date: '2026-05-04' }),
      e({ category: 'savings', amount: 400, date: '2026-05-04' }),
      e({ category: 'investments', amount: 250, date: '2026-05-04' }),
    ]

    const result = mostExpensiveCategory(entries, 2026, 4)

    expect(result).toEqual({ category: 'lunch', amount: 13.5 })
  })

  it('can show others as the most expensive spending category', () => {
    const entries = [
      e({ category: 'lunch', amount: 13.5, date: '2026-05-04' }),
      e({ category: 'savings', amount: 400, date: '2026-05-04' }),
      e({ category: 'others' as Entry['category'], amount: 200, date: '2026-05-05' }),
    ]

    const result = mostExpensiveCategory(entries, 2026, 4)

    expect(result).toEqual({ category: 'others', amount: 200 })
  })

  it('includes custom categories when finding the highest spending category', () => {
    const groceries: CustomCategory = {
      id: 'cat_groceries',
      label: 'Groceries',
      budget: 300,
      icon: 'ShoppingBasket',
    }
    const entries = [
      e({ category: 'transport', amount: 50, date: '2026-05-04' }),
      e({ category: groceries.id, amount: 120, date: '2026-05-05' }),
    ]

    expect(mostExpensiveCategory(entries, 2026, 4, [groceries])).toEqual({
      category: groceries.id,
      amount: 120,
    })
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

describe('highestSpendingDay', () => {
  it('returns null when there are no entries', () => {
    expect(highestSpendingDay([], 2026, 4)).toBeNull()
  })

  it('returns null when all entries are on the same day (only 1 distinct day)', () => {
    const entries = [
      e({ amount: 10, date: '2026-05-04' }),
      e({ amount: 20, date: '2026-05-04' }),
    ]
    expect(highestSpendingDay(entries, 2026, 4)).toBeNull()
  })

  it('returns the day with the highest total when 2+ distinct days exist', () => {
    const entries = [
      e({ amount: 10, date: '2026-05-04' }),
      e({ amount: 25, date: '2026-05-05' }),
      e({ amount: 5, date: '2026-05-06' }),
    ]
    expect(highestSpendingDay(entries, 2026, 4)).toEqual({ date: '2026-05-05', amount: 25 })
  })

  it('sums multiple entries on the same day', () => {
    const entries = [
      e({ amount: 10, date: '2026-05-04' }),
      e({ amount: 15, date: '2026-05-04' }),
      e({ amount: 5, date: '2026-05-05' }),
    ]
    expect(highestSpendingDay(entries, 2026, 4)).toEqual({ date: '2026-05-04', amount: 25 })
  })

  it('ignores entries from other months', () => {
    const entries = [
      e({ amount: 999, date: '2026-04-30' }),
      e({ amount: 10, date: '2026-05-04' }),
      e({ amount: 5, date: '2026-05-05' }),
    ]
    expect(highestSpendingDay(entries, 2026, 4)).toEqual({ date: '2026-05-04', amount: 10 })
  })

  it('uses total spend across every category for the highest spending day', () => {
    const entries = [
      e({ category: 'lunch', amount: 12, date: '2026-05-04' }),
      e({ category: 'savings', amount: 400, date: '2026-05-04' }),
      e({ category: 'lunch', amount: 10, date: '2026-05-05' }),
      e({ category: 'investments', amount: 1000, date: '2026-05-05' }),
    ]

    expect(highestSpendingDay(entries, 2026, 4)).toEqual({ date: '2026-05-05', amount: 1010 })
  })
})

describe('topSpendingDayOfWeek', () => {
  it('returns null when fewer than 3 days-of-week have data', () => {
    const entries = [
      e({ amount: 10, date: '2026-05-04' }), // Monday
      e({ amount: 20, date: '2026-05-05' }), // Tuesday
    ]
    expect(topSpendingDayOfWeek(entries, 2026, 4)).toBeNull()
  })

  it('returns the pluralised day name with the highest total spend', () => {
    const entries = [
      e({ amount: 10, date: '2026-05-04' }), // Monday
      e({ amount: 5, date: '2026-05-05' }), // Tuesday
      e({ amount: 3, date: '2026-05-06' }), // Wednesday
      e({ amount: 50, date: '2026-05-08' }), // Friday
    ]
    expect(topSpendingDayOfWeek(entries, 2026, 4)).toBe('Fridays')
  })

  it('uses only entries from the selected month', () => {
    const entries = [
      e({ amount: 100, date: '2026-04-06' }), // Monday in April, must not dominate May
      e({ amount: 30, date: '2026-05-05' }), // Tuesday
      e({ amount: 5, date: '2026-05-06' }), // Wednesday
      e({ amount: 2, date: '2026-05-07' }), // Thursday
    ]
    expect(topSpendingDayOfWeek(entries, 2026, 4)).toBe('Tuesdays')
  })
})

describe('monthOverMonthDelta', () => {
  it('returns null when there are no entries in the previous month', () => {
    const entries = [e({ amount: 50, date: '2026-05-04' })]
    expect(monthOverMonthDelta(entries, 2026, 4)).toBeNull()
  })

  it('returns positive delta when current month spend is higher', () => {
    const entries = [
      e({ amount: 100, date: '2026-04-01' }),
      e({ amount: 150, date: '2026-05-04' }),
    ]
    expect(monthOverMonthDelta(entries, 2026, 4)).toBe(50)
  })

  it('returns negative delta when current month spend is lower', () => {
    const entries = [
      e({ amount: 200, date: '2026-04-01' }),
      e({ amount: 150, date: '2026-05-04' }),
    ]
    expect(monthOverMonthDelta(entries, 2026, 4)).toBe(-50)
  })

  it('handles January correctly (previous month is December of prior year)', () => {
    const entries = [
      e({ amount: 100, date: '2025-12-15' }),
      e({ amount: 80, date: '2026-01-10' }),
    ]
    expect(monthOverMonthDelta(entries, 2026, 0)).toBe(-20)
  })
})

describe('monthlySpendForecast', () => {
  it('projects current month spend from month-to-date average', () => {
    const entries = [
      e({ amount: 30, date: '2026-05-01' }),
      e({ amount: 60, date: '2026-05-03' }),
    ]

    expect(monthlySpendForecast(entries, 2026, 4, new Date('2026-05-06T12:00:00'))).toEqual({
      spentToDate: 90,
      dailyAverage: 15,
      daysElapsed: 6,
      daysInMonth: 31,
      projectedTotal: 465,
    })
  })

  it('uses the full month for past months', () => {
    const entries = [
      e({ amount: 80, date: '2026-04-01' }),
      e({ amount: 20, date: '2026-04-10' }),
    ]

    expect(monthlySpendForecast(entries, 2026, 3, new Date('2026-05-06T12:00:00'))).toEqual({
      spentToDate: 100,
      dailyAverage: 100 / 30,
      daysElapsed: 30,
      daysInMonth: 30,
      projectedTotal: 100,
    })
  })

  it('can exclude commitment categories from spending pace', () => {
    const entries = [
      e({ amount: 55, category: 'lunch', date: '2026-05-03' }),
      e({ amount: 400, category: 'savings', date: '2026-05-04' }),
      e({ amount: 250, category: 'investments', date: '2026-05-05' }),
      e({ amount: 20, category: null, date: '2026-05-06' }),
    ]

    expect(
      monthlySpendForecast(entries, 2026, 4, new Date('2026-05-06T12:00:00'), {
        excludedCategories: ['savings', 'investments'],
      }),
    ).toEqual({
      spentToDate: 75,
      dailyAverage: 12.5,
      daysElapsed: 6,
      daysInMonth: 31,
      projectedTotal: 387.5,
    })
  })
})

describe('safeToSpendPerDay', () => {
  it('spreads remaining budget across today and the rest of the month', () => {
    const entries = [e({ amount: 300, date: '2026-05-05' })]

    expect(safeToSpendPerDay(entries, 2026, 4, 1200, new Date('2026-05-06T12:00:00'))).toEqual({
      remainingBudget: 900,
      daysRemaining: 26,
      amountPerDay: 900 / 26,
    })
  })

  it('returns negative daily room when the month is already over budget', () => {
    const entries = [e({ amount: 1300, date: '2026-05-05' })]

    expect(safeToSpendPerDay(entries, 2026, 4, 1200, new Date('2026-05-06T12:00:00'))).toEqual({
      remainingBudget: -100,
      daysRemaining: 26,
      amountPerDay: -100 / 26,
    })
  })

  it('can exclude commitment categories from the remaining daily spend room', () => {
    const entries = [
      e({ amount: 55, category: 'lunch', date: '2026-05-03' }),
      e({ amount: 400, category: 'savings', date: '2026-05-04' }),
      e({ amount: 250, category: 'investments', date: '2026-05-05' }),
      e({ amount: 20, category: null, date: '2026-05-06' }),
    ]

    expect(
      safeToSpendPerDay(entries, 2026, 4, 550, new Date('2026-05-06T12:00:00'), {
        excludedCategories: ['savings', 'investments'],
      }),
    ).toEqual({
      remainingBudget: 475,
      daysRemaining: 26,
      amountPerDay: 475 / 26,
    })
  })
})

describe('monthComparison', () => {
  it('returns null when the previous month has no entries', () => {
    const entries = [e({ amount: 50, category: 'lunch', date: '2026-05-04' })]

    expect(monthComparison(entries, 2026, 4)).toBeNull()
  })

  it('compares total and category spend with the previous month', () => {
    const entries = [
      e({ amount: 100, category: 'lunch', date: '2026-04-01' }),
      e({ amount: 40, category: 'transport', date: '2026-04-02' }),
      e({ amount: 150, category: 'lunch', date: '2026-05-04' }),
      e({ amount: 10, category: 'transport', date: '2026-05-05' }),
      e({ amount: 20, category: null, date: '2026-05-06' }),
    ]

    expect(monthComparison(entries, 2026, 4)).toEqual({
      previousYear: 2026,
      previousMonth: 3,
      currentTotal: 180,
      previousTotal: 140,
      totalDelta: 40,
      categoryDeltas: {
        lunch: { current: 150, previous: 100, delta: 50 },
        transport: { current: 10, previous: 40, delta: -30 },
        savings: { current: 0, previous: 0, delta: 0 },
        investments: { current: 0, previous: 0, delta: 0 },
        others: { current: 0, previous: 0, delta: 0 },
      },
      biggestIncrease: { category: 'lunch', current: 150, previous: 100, delta: 50 },
      biggestDecrease: { category: 'transport', current: 10, previous: 40, delta: -30 },
    })
  })
})

const groceries: CustomCategory = { id: 'cat_groc', label: 'Groceries', budget: 100, icon: 'ShoppingBag' }
const gym: CustomCategory = { id: 'cat_gym', label: 'Gym', budget: null, icon: 'Dumbbell' }

describe('custom category compute seam', () => {
  it('allCategoryIds appends custom ids after built-ins', () => {
    expect(allCategoryIds([groceries])).toEqual([...CATEGORIES, 'cat_groc'])
    expect(allCategoryIds()).toEqual([...CATEGORIES])
  })

  it('categoryBudgets reads built-ins from config and customs from .budget', () => {
    const budgets = categoryBudgets(DEFAULT_BUDGET, [groceries, gym])
    expect(budgets.lunch).toBe(DEFAULT_BUDGET.lunch)
    expect(budgets.cat_groc).toBe(100)
    expect(budgets.cat_gym).toBe(0) // null budget -> 0
  })

  it('customBudgetTotal sums custom budgets treating null as 0', () => {
    expect(customBudgetTotal([groceries, gym])).toBe(100)
  })

  it('monthlySpendByCategory tallies custom categories', () => {
    const entries = [e({ amount: 30, category: 'cat_groc', date: '2026-05-04' })]
    const spend = monthlySpendByCategory(entries, 2026, 4, [groceries])
    expect(spend.cat_groc).toBe(30)
    expect(spend.lunch).toBe(0)
  })

  it('categoryDeficits and buffer spill cover custom overspend', () => {
    const spend = monthlySpendByCategory(
      [e({ amount: 130, category: 'cat_groc', date: '2026-05-04' })], 2026, 4, [groceries],
    )
    const deficits = categoryDeficits(spend, DEFAULT_BUDGET, [groceries])
    expect(deficits.cat_groc).toBe(-30) // 100 budget - 130 spent
    // 30 over a non-'others' category eats into the buffer
    expect(bufferRemaining(deficits, DEFAULT_BUDGET)).toBe(DEFAULT_BUDGET.buffer - 30)
  })
})

describe('countEntriesForCategory', () => {
  it('counts entries tagged with the given category across all dates', () => {
    const entries = [
      e({ category: 'cat_groc', date: '2026-05-04' }),
      e({ category: 'cat_groc', date: '2024-01-01' }),
      e({ category: 'lunch', date: '2026-05-04' }),
      e({ category: null, date: '2026-05-04' }),
    ]
    expect(countEntriesForCategory(entries, 'cat_groc')).toBe(2)
    expect(countEntriesForCategory(entries, 'cat_unused')).toBe(0)
  })
})
