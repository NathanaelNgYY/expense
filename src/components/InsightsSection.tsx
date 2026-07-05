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
import { fromLocalDateString } from '../dates'
import type { Entry } from '../types'

interface Props {
  entries: Entry[]
  year: number
  month: number
}

function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}S$${Math.abs(value).toFixed(2)}`
}

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
  const reviewParts = [
    topCat ? `${categoryLabel(topCat.category, overrides)} led the month` : null,
    topDay ? `Peak day ${format(fromLocalDateString(topDay.date), 'MMM d')}` : null,
    delta !== null
      ? `${delta > 0 ? 'Up' : 'Down'} S$${Math.abs(delta).toFixed(2)} vs last month`
      : null,
  ].filter(Boolean)

  if (!topCat && avgLunch === null && !topDay && !topDow && delta === null && !comparison) return null

  return (
    <>
      <h3 className="section-title">Month Review</h3>
      {reviewParts.length > 0 && (
        <div className="card month-review-card">
          {reviewParts.join(' | ')}
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
              {categoryLabel(topCat.category, overrides)} - S${topCat.amount.toFixed(2)}
            </span>
          </div>
        )}
        {avgLunch !== null && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <Utensils size={16} strokeWidth={2} aria-hidden="true" />
              Avg lunch
            </span>
            <span className="insight-value">S${avgLunch.toFixed(2)} per entry</span>
          </div>
        )}
        {topDay && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
              Highest day
            </span>
            <span className="insight-value">
              {format(fromLocalDateString(topDay.date), 'EEE MMM d')} - S${topDay.amount.toFixed(2)}
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
              {delta > 0 ? '+' : ''}S${delta.toFixed(2)}
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
              {formatSignedCurrency(comparison.totalDelta)}
            </strong>
            <p className="card-subtitle">
              S${comparison.currentTotal.toFixed(2)} this month | S${comparison.previousTotal.toFixed(2)} last month
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
                  {formatSignedCurrency(comparison.biggestIncrease.delta)}
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
                  {formatSignedCurrency(comparison.biggestDecrease.delta)}
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
                    {formatSignedCurrency(categoryDelta.delta)}
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
