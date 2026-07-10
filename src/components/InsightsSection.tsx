import { Trophy, Utensils, CalendarDays, BarChart2, TrendingUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from './BudgetIcon'
import {
  mostExpensiveCategory,
  averageLunchPerEntry,
  highestSpendingDay,
  topSpendingDayOfWeek,
  monthOverMonthDelta,
  monthComparison,
} from '../compute'
import { CATEGORIES } from '../types'
import { categoryLabel } from '../categoryDisplay'
import { getCategoryOverrides } from '../storage'
import { formatSGD, formatSignedSGD } from '../format'
import { fromLocalDateString } from '../dates'
import type { Entry } from '../types'

interface Props {
  entries: Entry[]
  year: number
  month: number
}

// Below this many entries in the month, "Mostly Wednesdays" and "Most expensive category"
// are describing noise, not a habit. Printing them anyway makes every other number on the
// screen look equally made up.
const MIN_ENTRIES_FOR_INSIGHTS = 15

export default function InsightsSection({ entries, year, month }: Props) {
  const overrides = getCategoryOverrides()
  const topCat = mostExpensiveCategory(entries, year, month)
  const avgLunch = averageLunchPerEntry(entries, year, month)
  const topDay = highestSpendingDay(entries, year, month)
  const topDow = topSpendingDayOfWeek(entries)
  const delta = monthOverMonthDelta(entries, year, month)
  const comparison = monthComparison(entries, year, month)
  const previousMonthLabel = comparison
    ? new Date(comparison.previousYear, comparison.previousMonth, 1).toLocaleString('default', {
        month: 'short',
      })
    : ''
  const monthEntryCount = entries.filter(entry => {
    const [entryYear, entryMonth] = entry.date.split('-').map(Number)
    return entryYear === year && entryMonth - 1 === month
  }).length
  const hasEnoughData = monthEntryCount >= MIN_ENTRIES_FOR_INSIGHTS

  const reviewParts = [
    topCat ? `You spent most on ${categoryLabel(topCat.category, overrides)}.` : null,
    topDay ? `Biggest day: ${format(fromLocalDateString(topDay.date), 'EEE, MMM d')}.` : null,
    delta !== null ? `${delta > 0 ? 'Up' : 'Down'} ${formatSGD(Math.abs(delta))} vs last month.` : null,
  ].filter(Boolean)

  if (!hasEnoughData) {
    return (
      <>
        <h3 className="section-title">Month Review</h3>
        <div className="card month-review-card month-review-card--pending">
          {monthEntryCount === 0
            ? 'No spending logged this month yet.'
            : `${MIN_ENTRIES_FOR_INSIGHTS - monthEntryCount} more ${MIN_ENTRIES_FOR_INSIGHTS - monthEntryCount === 1 ? 'entry' : 'entries'} and your spending patterns show up here.`}
        </div>
      </>
    )
  }

  if (!topCat && avgLunch === null && !topDay && !topDow && delta === null && !comparison) return null

  return (
    <>
      <h3 className="section-title">Month Review</h3>
      {reviewParts.length > 0 && (
        <div className="card month-review-card">
          {reviewParts.join(' ')}
        </div>
      )}
      <div className="ios-list">
        {topCat && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <Trophy size={16} strokeWidth={2} aria-hidden="true" />
              Most expensive
            </span>
            <span className="insight-value">
              {categoryLabel(topCat.category, overrides)} — {formatSGD(topCat.amount)}
            </span>
          </div>
        )}
        {avgLunch !== null && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <Utensils size={16} strokeWidth={2} aria-hidden="true" />
              Avg lunch
            </span>
            <span className="insight-value">{formatSGD(avgLunch)} per entry</span>
          </div>
        )}
        {topDay && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
              Highest day
            </span>
            <span className="insight-value">
              {format(fromLocalDateString(topDay.date), 'EEE MMM d')} — {formatSGD(topDay.amount)}
            </span>
          </div>
        )}
        {topDow && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <BarChart2 size={16} strokeWidth={2} aria-hidden="true" />
              Day pattern
            </span>
            <span className="insight-value">Mostly {topDow}</span>
          </div>
        )}
        {delta !== null && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              {delta > 0 ? (
                <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
              )}
              vs last month
            </span>
            <span className="insight-value" style={{ color: delta > 0 ? 'var(--red)' : 'var(--green)' }}>
              {formatSignedSGD(delta)}
            </span>
          </div>
        )}
      </div>

      {comparison && (
        <>
          <h3 className="section-title">What Changed</h3>
          <div className="card month-change-card">
            <span className="summary-label">Vs {previousMonthLabel}</span>
            <strong
              className="month-change-total"
              style={{ color: comparison.totalDelta > 0 ? 'var(--red)' : 'var(--green)' }}
            >
              {formatSignedSGD(comparison.totalDelta)}
            </strong>
            <p className="card-subtitle">
              {formatSGD(comparison.currentTotal)} this month &middot; {formatSGD(comparison.previousTotal)} last month
            </p>
          </div>
          <div className="ios-list">
            {comparison.biggestIncrease && (
              <div className="breakdown-row insight-row">
                <span className="icon-label">
                  <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
                  Biggest increase
                </span>
                <span className="insight-value" style={{ color: 'var(--red)' }}>
                  {categoryLabel(comparison.biggestIncrease.category, overrides)}{' '}
                  {formatSignedSGD(comparison.biggestIncrease.delta)}
                </span>
              </div>
            )}
            {comparison.biggestDecrease && (
              <div className="breakdown-row insight-row">
                <span className="icon-label">
                  <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
                  Best improvement
                </span>
                <span className="insight-value" style={{ color: 'var(--green)' }}>
                  {categoryLabel(comparison.biggestDecrease.category, overrides)}{' '}
                  {formatSignedSGD(comparison.biggestDecrease.delta)}
                </span>
              </div>
            )}
            {CATEGORIES.map(category => {
              const categoryDelta = comparison.categoryDeltas[category]

              return (
                <div key={category} className="breakdown-row insight-row">
                  <span className="icon-label">
                    <BudgetIcon name={category} />
                    {categoryLabel(category, overrides)}
                  </span>
                  <span
                    className="insight-value"
                    style={{ color: categoryDelta.delta > 0 ? 'var(--red)' : 'var(--green)' }}
                  >
                    {formatSignedSGD(categoryDelta.delta)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
