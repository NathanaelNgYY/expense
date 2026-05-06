import { Trophy, Utensils, CalendarDays, BarChart2, TrendingUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'
import {
  mostExpensiveCategory,
  averageLunchPerEntry,
  highestSpendingDay,
  topSpendingDayOfWeek,
  monthOverMonthDelta,
} from '../compute'
import { CATEGORY_LABELS } from '../types'
import { fromLocalDateString } from '../dates'
import type { Entry } from '../types'

interface Props {
  entries: Entry[]
  year: number
  month: number
}

export default function InsightsSection({ entries, year, month }: Props) {
  const topCat = mostExpensiveCategory(entries, year, month)
  const avgLunch = averageLunchPerEntry(entries, year, month)
  const topDay = highestSpendingDay(entries, year, month)
  const topDow = topSpendingDayOfWeek(entries)
  const delta = monthOverMonthDelta(entries, year, month)

  if (!topCat && avgLunch === null && !topDay && !topDow && delta === null) return null

  return (
    <>
      <h3 className="section-title">Insights</h3>
      <div className="ios-list">
        {topCat && (
          <div className="breakdown-row">
            <span className="icon-label">
              <Trophy size={16} strokeWidth={2} aria-hidden="true" />
              Most expensive
            </span>
            <span>{CATEGORY_LABELS[topCat.category]} - S${topCat.amount.toFixed(2)}</span>
          </div>
        )}
        {avgLunch !== null && (
          <div className="breakdown-row">
            <span className="icon-label">
              <Utensils size={16} strokeWidth={2} aria-hidden="true" />
              Avg lunch
            </span>
            <span>S${avgLunch.toFixed(2)} per entry</span>
          </div>
        )}
        {topDay && (
          <div className="breakdown-row">
            <span className="icon-label">
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
              Highest day
            </span>
            <span>
              {format(fromLocalDateString(topDay.date), 'EEE MMM d')} - S${topDay.amount.toFixed(2)}
            </span>
          </div>
        )}
        {topDow && (
          <div className="breakdown-row">
            <span className="icon-label">
              <BarChart2 size={16} strokeWidth={2} aria-hidden="true" />
              Day pattern
            </span>
            <span>You spend most on {topDow}</span>
          </div>
        )}
        {delta !== null && (
          <div className="breakdown-row">
            <span className="icon-label">
              {delta > 0 ? (
                <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
              )}
              vs last month
            </span>
            <span style={{ color: delta > 0 ? 'var(--red)' : 'var(--green)' }}>
              {delta > 0 ? '+' : ''}S${delta.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
