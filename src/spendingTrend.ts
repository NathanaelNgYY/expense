// src/spendingTrend.ts
//
// Six-month longitudinal math for the Insights Trends section (F6).
//
// This lives beside compute.ts rather than inside it for one measured reason:
// compute.ts is on the eager Home path, so anything added there ships in the
// initial payload. Folding these ~120 lines into it moved initial JS from
// 145.4 to 146.0 KiB gzip — flush against the budget — for code only the lazy
// `insights` chunk ever calls. Here, it loads with the screen that uses it.
import type { Entry, CustomCategory } from './types'
import {
  allCategoryIds,
  daysElapsedForForecast,
  entriesForMonth,
  monthOrder,
} from './compute'
import { entryNetAmount } from './shared/entryAmount'

export interface TrendPoint {
  year: number
  month: number
  total: number
  /** Days of the month this total covers: elapsed days while it is still running. */
  daysCounted: number
  dailyAverage: number
  /** True until the month is over. Partial months stay out of every average below. */
  isPartial: boolean
  hasEntries: boolean
}

export interface CategoryTrend {
  category: string
  /** One total per point in `SpendingTrend.points`, same order. */
  totals: number[]
  current: number
  /** Mean over the baseline months; 0 when the category was untouched in them. */
  average: number | null
  delta: number | null
  /** The same category one month back — the other yardstick the UI offers. */
  previous: number | null
  previousDelta: number | null
}

export interface SpendingTrend {
  points: TrendPoint[]
  current: TrendPoint
  /**
   * The month directly before the selected one, and only when it was actually
   * logged — an unlogged month is no baseline, the same rule `monthComparison`
   * applies before it will compare anything.
   */
  previousMonth: TrendPoint | null
  completeMonths: TrendPoint[]
  /** The complete months the averages are actually taken over: everything in
   *  `completeMonths` except the selected one. */
  baselineMonths: TrendPoint[]
  averageMonth: number | null
  currentVsAverage: number | null
  leanestMonth: TrendPoint | null
  heaviestMonth: TrendPoint | null
  dailyAverage: number
  baselineDailyAverage: number | null
  dailyAverageDelta: number | null
  categories: CategoryTrend[]
}

/** Months drawn by the Trends section, selected month included. */
export const TREND_MONTHS = 6

/**
 * Complete months needed before the trend means anything (U6). With one, the
 * average equals that month, the delta is zero, and the leanest month is also
 * the heaviest — a chart that states nothing while looking like it states
 * something.
 */
export const MIN_TREND_COMPLETE_MONTHS = 2

/**
 * Baseline months required before "your average" is a distinct yardstick from
 * "last month". With one baseline month they are arithmetically the same number,
 * and offering both as choices would put the same figure behind two labels — the
 * exact confusion the single consolidated list exists to remove.
 */
export const MIN_AVERAGE_BASELINE_MONTHS = 2

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Six months of totals ending at the selected month (F6).
 *
 * Two rules carry most of the meaning here:
 *
 * - The **selected month is excluded from its own baseline**. `averageMonth` is
 *   "your usual month", the thing the selected month is being measured against,
 *   so it cannot include the month under measurement.
 * - **Partial months never enter an average.** A month nine days old is not a
 *   cheap month; letting it into the mean would drag the reference line down at
 *   every rollover.
 *
 * Leading months with no entries are dropped so a new user sees two bars rather
 * than four blanks. Interior empty months stay: a month with nothing logged is a
 * real zero and hiding it would misdraw the shape.
 *
 * Always returns an object. The caller gates the UI on `completeMonths.length`
 * against MIN_TREND_COMPLETE_MONTHS, and counts down from it in the pending card.
 */
export function spendingTrend(
  entries: Entry[],
  year: number,
  month: number,
  referenceDate: Date = new Date(),
  custom: CustomCategory[] = [],
): SpendingTrend {
  const referenceOrder = monthOrder(referenceDate.getFullYear(), referenceDate.getMonth())
  const selectedOrder = monthOrder(year, month)
  const window: Array<{ year: number; month: number; entries: Entry[] }> = []

  for (let offset = TREND_MONTHS - 1; offset >= 0; offset -= 1) {
    const order = selectedOrder - offset
    const pointYear = Math.floor(order / 12)
    const pointMonth = order % 12
    window.push({
      year: pointYear,
      month: pointMonth,
      entries: entriesForMonth(entries, pointYear, pointMonth),
    })
  }

  const allPoints: TrendPoint[] = window.map(({ year: pointYear, month: pointMonth, entries: monthEntries }) => {
    const total = monthEntries.reduce((sum, entry) => sum + entryNetAmount(entry), 0)
    const daysCounted = daysElapsedForForecast(pointYear, pointMonth, referenceDate)

    return {
      year: pointYear,
      month: pointMonth,
      total,
      daysCounted,
      dailyAverage: total / daysCounted,
      isPartial: monthOrder(pointYear, pointMonth) >= referenceOrder,
      hasEntries: monthEntries.length > 0,
    }
  })

  const firstWithEntries = allPoints.findIndex(point => point.hasEntries)
  const start = firstWithEntries === -1 ? allPoints.length - 1 : firstWithEntries
  const points = allPoints.slice(start)
  const keptWindow = window.slice(start)
  const current = points[points.length - 1]
  const completeMonths = points.filter(point => !point.isPartial)
  const baseline = completeMonths.filter(point => point !== current)

  const averageMonth = baseline.length > 0 ? mean(baseline.map(point => point.total)) : null
  const baselineDailyAverage = baseline.length > 0 ? mean(baseline.map(point => point.dailyAverage)) : null

  const categoryTotals = new Map<string, number[]>(
    allCategoryIds(custom).map(id => [id, keptWindow.map(() => 0)]),
  )
  keptWindow.forEach(({ entries: monthEntries }, index) => {
    for (const entry of monthEntries) {
      const totals = entry.category ? categoryTotals.get(entry.category) : undefined
      if (totals) totals[index] += entryNetAmount(entry)
    }
  })

  const baselineIndexes = points
    .map((point, index) => (baseline.includes(point) ? index : -1))
    .filter(index => index !== -1)

  // The window is contiguous and only ever trimmed from the front, so the point
  // before the current one is always the immediately preceding calendar month.
  const priorPoint = points.length > 1 ? points[points.length - 2] : null
  const previousMonth = priorPoint?.hasEntries ? priorPoint : null

  const categories: CategoryTrend[] = [...categoryTotals.entries()]
    .filter(([, totals]) => totals.some(total => total !== 0))
    .map(([category, totals]) => {
      const average = baselineIndexes.length > 0
        ? mean(baselineIndexes.map(index => totals[index]))
        : null
      const categoryCurrent = totals[totals.length - 1]
      const categoryPrevious = previousMonth === null ? null : totals[totals.length - 2]

      return {
        category,
        totals,
        current: categoryCurrent,
        average,
        delta: average === null ? null : categoryCurrent - average,
        previous: categoryPrevious,
        previousDelta: categoryPrevious === null ? null : categoryCurrent - categoryPrevious,
      }
    })

  return {
    points,
    current,
    previousMonth,
    completeMonths,
    baselineMonths: baseline,
    averageMonth,
    currentVsAverage: averageMonth === null ? null : current.total - averageMonth,
    leanestMonth: completeMonths.length > 0
      ? completeMonths.reduce((lowest, point) => (point.total < lowest.total ? point : lowest))
      : null,
    heaviestMonth: completeMonths.length > 0
      ? completeMonths.reduce((highest, point) => (point.total > highest.total ? point : highest))
      : null,
    dailyAverage: current.dailyAverage,
    baselineDailyAverage,
    dailyAverageDelta: baselineDailyAverage === null ? null : current.dailyAverage - baselineDailyAverage,
    categories,
  }
}

