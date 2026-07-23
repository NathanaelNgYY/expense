// src/spendingTrend.test.ts
import { describe, it, expect } from 'vitest'
import { spendingTrend } from './spendingTrend'
import type { Entry, CustomCategory } from './types'

function e(overrides: Partial<Entry> = {}): Entry {
  return { id: '1', amount: 10, category: 'lunch', note: '', date: '2026-05-04', ...overrides }
}

describe('spendingTrend', () => {
  const ref = new Date(2026, 6, 23) // 23 July 2026, mid-month

  function month(monthIndex: number, amounts: Array<Partial<Entry>>): Entry[] {
    const mm = String(monthIndex + 1).padStart(2, '0')
    return amounts.map((entry, i) => e({ id: `${mm}-${i}`, date: `2026-${mm}-05`, ...entry }))
  }

  const sixMonths = [
    ...month(1, [{ amount: 100 }]), // Feb
    ...month(2, [{ amount: 200 }]), // Mar
    ...month(3, [{ amount: 300 }]), // Apr
    ...month(4, [{ amount: 400 }]), // May
    ...month(5, [{ amount: 500 }]), // Jun
    ...month(6, [{ amount: 60 }]),  // Jul (partial, current)
  ]

  it('returns one point per month in the window, oldest first', () => {
    const trend = spendingTrend(sixMonths, 2026, 6, ref)
    expect(trend.points).toHaveLength(6)
    expect(trend.points[0]).toMatchObject({ year: 2026, month: 1, total: 100 })
    expect(trend.points[5]).toMatchObject({ year: 2026, month: 6, total: 60 })
  })

  it('marks only the current calendar month as partial', () => {
    const trend = spendingTrend(sixMonths, 2026, 6, ref)
    expect(trend.points.filter(p => p.isPartial)).toHaveLength(1)
    expect(trend.points[5].isPartial).toBe(true)
    expect(trend.completeMonths).toHaveLength(5)
  })

  it('drops leading months with no entries but keeps interior zeros', () => {
    const entries = [...month(4, [{ amount: 400 }]), ...month(6, [{ amount: 60 }])]
    const trend = spendingTrend(entries, 2026, 6, ref)
    expect(trend.points.map(p => p.month)).toEqual([4, 5, 6])
    expect(trend.points[1]).toMatchObject({ month: 5, total: 0, hasEntries: false })
  })

  it('averages complete months excluding the selected one', () => {
    const trend = spendingTrend(sixMonths, 2026, 6, ref)
    expect(trend.averageMonth).toBe((100 + 200 + 300 + 400 + 500) / 5)
    expect(trend.currentVsAverage).toBe(60 - 300)
  })

  it('excludes a complete selected month from its own baseline', () => {
    const trend = spendingTrend(sixMonths, 2026, 5, ref) // June, complete
    expect(trend.averageMonth).toBe((100 + 200 + 300 + 400) / 4)
    expect(trend.currentVsAverage).toBe(500 - 250)
  })

  it('reports leanest and heaviest over complete months, selected included', () => {
    const trend = spendingTrend(sixMonths, 2026, 5, ref)
    expect(trend.leanestMonth).toMatchObject({ month: 1, total: 100 })
    expect(trend.heaviestMonth).toMatchObject({ month: 5, total: 500 })
  })

  it('never lets the partial month win leanest', () => {
    const trend = spendingTrend(sixMonths, 2026, 6, ref)
    expect(trend.leanestMonth).toMatchObject({ month: 1, total: 100 })
  })

  it('counts elapsed days for the partial month and full length otherwise', () => {
    const trend = spendingTrend(sixMonths, 2026, 6, ref)
    expect(trend.points[5].daysCounted).toBe(23)
    expect(trend.points[5].dailyAverage).toBeCloseTo(60 / 23, 6)
    expect(trend.points[4].daysCounted).toBe(30) // June
    expect(trend.points[0].daysCounted).toBe(28) // February 2026
  })

  it('compares daily averages so unequal month lengths do not decide it', () => {
    // 280 over 28 days (Feb) and 310 over 31 days (Mar) are the same daily rate.
    const entries = [
      ...month(1, [{ amount: 280 }]),
      ...month(2, [{ amount: 310 }]),
      ...month(3, [{ amount: 300 }]), // Apr, 30 days -> exactly 10/day
    ]
    const trend = spendingTrend(entries, 2026, 3, ref)
    expect(trend.dailyAverage).toBeCloseTo(10, 6)
    expect(trend.baselineDailyAverage).toBeCloseTo(10, 6)
    expect(trend.dailyAverageDelta).toBeCloseTo(0, 6)
  })

  it('subtracts refunds from the month they land in', () => {
    const entries = [
      ...month(4, [{ amount: 400 }]),
      ...month(5, [{ amount: 500 }, { amount: 100, kind: 'refund' as const }]),
    ]
    const trend = spendingTrend(entries, 2026, 5, ref)
    expect(trend.points.at(-1)?.total).toBe(400)
  })

  it('has no baseline when the selected month is the only complete one', () => {
    const trend = spendingTrend([...month(5, [{ amount: 500 }])], 2026, 5, ref)
    expect(trend.completeMonths).toHaveLength(1)
    expect(trend.averageMonth).toBeNull()
    expect(trend.currentVsAverage).toBeNull()
    expect(trend.baselineDailyAverage).toBeNull()
    expect(trend.dailyAverageDelta).toBeNull()
  })

  it('crosses the year boundary backwards', () => {
    const entries = [
      e({ id: 'dec', amount: 90, date: '2025-12-10' }),
      e({ id: 'jan', amount: 110, date: '2026-01-10' }),
    ]
    const trend = spendingTrend(entries, 2026, 0, ref)
    expect(trend.points.map(p => [p.year, p.month])).toEqual([[2025, 11], [2026, 0]])
    expect(trend.averageMonth).toBe(90)
  })

  it('lists only categories with spend in the window, custom ones included', () => {
    const groceries: CustomCategory = { id: 'cat_groc', label: 'Groceries', icon: 'others', budget: 100 }
    const entries = [
      ...month(4, [{ amount: 400, category: 'lunch' }]),
      ...month(5, [{ amount: 200, category: 'lunch' }, { amount: 50, category: 'cat_groc' }]),
    ]
    const trend = spendingTrend(entries, 2026, 5, ref, [groceries])
    expect(trend.categories.map(c => c.category)).toEqual(['lunch', 'cat_groc'])
    expect(trend.categories[0].totals).toEqual([400, 200])
    expect(trend.categories[0].average).toBe(400)
    expect(trend.categories[0].delta).toBe(-200)
    expect(trend.categories[1].average).toBe(0)
  })

  it('ignores entries with no category in the category breakdown but not in totals', () => {
    const entries = [
      ...month(4, [{ amount: 400, category: null }]),
      ...month(5, [{ amount: 200, category: 'lunch' }]),
    ]
    const trend = spendingTrend(entries, 2026, 5, ref)
    expect(trend.points[0].total).toBe(400)
    expect(trend.categories.map(c => c.category)).toEqual(['lunch'])
  })

  it('returns an empty window when nothing has ever been logged', () => {
    const trend = spendingTrend([], 2026, 6, ref)
    expect(trend.points).toHaveLength(1) // the selected month always draws
    expect(trend.completeMonths).toHaveLength(0)
    expect(trend.categories).toHaveLength(0)
  })
})
