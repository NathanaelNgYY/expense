import { useState } from 'react'
import BudgetIcon from './BudgetIcon'
import {
  MIN_AVERAGE_BASELINE_MONTHS,
  spendingTrend,
  type CategoryTrend,
} from '../spendingTrend'
import { categoryIcon, categoryLabel } from '../categoryDisplay'
import { useBudgetConfig } from '../BudgetConfigContext'
import { formatMoney, formatSignedMoney } from '../format'
import type { CustomCategory, Entry } from '../types'
import './Trends.css'

/**
 * The single per-category comparison list on Insights.
 *
 * Insights used to print two of these a scroll apart: "What Changed" listed
 * every category against last month, and Trends listed every spent category
 * against its six-month average. Near-identical rows differing only in a
 * baseline nobody stated is worse than either list alone — if you cannot tell
 * which one you are reading, both are worth less. So there is now one list, the
 * baseline is named above it, and switching yardstick is a control rather than
 * a scroll.
 */
type Baseline = 'average' | 'previous'

interface Props {
  entries: Entry[]
  year: number
  month: number
  referenceDate: Date
  customCategories: CustomCategory[]
  currency?: string
}

function baselineDelta(item: CategoryTrend, baseline: Baseline): number | null {
  return baseline === 'average' ? item.delta : item.previousDelta
}

function deltaTone(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

function sparkPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return Math.max(3, Math.min(100, (value / max) * 100))
}

export default function CategoryDeltas({
  entries,
  year,
  month,
  referenceDate,
  customCategories,
  currency = 'SGD',
}: Props) {
  const { overrides } = useBudgetConfig()
  // Preference, not state of record: which baselines exist changes as you page
  // through months, so the active one is derived every render and the stored
  // preference is honoured only while it remains available.
  const [preferred, setPreferred] = useState<Baseline>('average')
  const trend = spendingTrend(entries, year, month, referenceDate, customCategories)

  // Below MIN_AVERAGE_BASELINE_MONTHS the average IS last month, so only one of
  // these ever offers a number the other doesn't.
  const available: Baseline[] = []
  if (trend.baselineMonths.length >= MIN_AVERAGE_BASELINE_MONTHS) available.push('average')
  if (trend.previousMonth !== null) available.push('previous')
  if (available.length === 0 || trend.categories.length === 0) return null

  const baseline = available.includes(preferred) ? preferred : available[0]
  const previousLabel = trend.previousMonth
    ? new Date(trend.previousMonth.year, trend.previousMonth.month, 1).toLocaleString('default', {
        month: 'long',
      })
    : ''
  const caption = baseline === 'average'
    ? 'Compared with your six-month average'
    : `Compared with ${previousLabel}`

  return (
    <>
      <h3 className="section-title">By category</h3>

      {available.length > 1 && (
        <div className="scope-switch" role="group" aria-label="Comparison baseline">
          {available.map(option => (
            <button
              key={option}
              type="button"
              className={baseline === option ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
              aria-pressed={baseline === option}
              onClick={() => setPreferred(option)}
            >
              {option === 'average' ? 'vs 6-month avg' : `vs ${previousLabel}`}
            </button>
          ))}
        </div>
      )}

      <p className="card-subtitle category-deltas-caption">{caption}</p>

      <div className="ios-list">
        {trend.categories.map(item => {
          const delta = baselineDelta(item, baseline)
          const max = Math.max(...item.totals, 0)

          return (
            <div className="breakdown-row insight-row trend-category-row" key={item.category}>
              <span className="icon-label">
                <BudgetIcon name={categoryIcon(item.category, overrides, customCategories)} />
                {categoryLabel(item.category, overrides, customCategories)}
              </span>
              <span className="trend-category-figures">
                <span className="trend-spark" aria-hidden="true">
                  {item.totals.map((total, index) => (
                    <span
                      key={index}
                      className={`trend-spark-bar${index === item.totals.length - 1 ? ' trend-spark-bar--current' : ''}`}
                      style={{ height: `${sparkPercent(total, max)}%` }}
                    />
                  ))}
                </span>
                <span
                  className={`insight-value trend-delta trend-delta--${delta === null ? 'flat' : deltaTone(delta)}`}
                >
                  {delta === null ? formatMoney(item.current, currency) : formatSignedMoney(delta, currency)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
