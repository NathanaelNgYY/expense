import { TrendingUp, TrendingDown, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { MIN_TREND_COMPLETE_MONTHS, spendingTrend, type TrendPoint } from '../spendingTrend'
import { formatMoney, formatMoneyWhole, formatSignedMoney } from '../format'
import type { CustomCategory, Entry } from '../types'
import './Trends.css'

interface Props {
  entries: Entry[]
  year: number
  month: number
  referenceDate: Date
  customCategories: CustomCategory[]
  currency?: string
}

// A month that spent almost nothing still has to be visible as a bar, or the
// chart reads as "no data" for what is really "a very cheap month".
const MIN_VISIBLE_BAR_PERCENT = 3

function monthLabel(point: TrendPoint, style: 'short' | 'long' = 'short'): string {
  return new Date(point.year, point.month, 1).toLocaleString('default', { month: style })
}

function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  return Math.max(MIN_VISIBLE_BAR_PERCENT, Math.min(100, (value / max) * 100))
}

function deltaTone(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

export default function Trends({
  entries,
  year,
  month,
  referenceDate,
  customCategories,
  currency = 'SGD',
}: Props) {
  const trend = spendingTrend(entries, year, month, referenceDate, customCategories)
  const monthsShort = MIN_TREND_COMPLETE_MONTHS - trend.completeMonths.length

  if (monthsShort > 0) {
    return (
      <>
        <h3 className="section-title">Trends</h3>
        <div className="card month-review-card month-review-card--pending">
          {monthsShort === 1
            ? 'One more full month and your six-month trend appears here.'
            : 'Two full months of tracking and your six-month trend appears here.'}
        </div>
      </>
    )
  }

  const max = Math.max(...trend.points.map(point => point.total), trend.averageMonth ?? 0)
  const averagePercent = trend.averageMonth === null ? null : barPercent(trend.averageMonth, max)
  const chartLabel = `Six-month spending: ${trend.points
    .map(point => `${monthLabel(point, 'long')} ${formatMoney(point.total, currency)}${point.isPartial ? ' so far' : ''}`)
    .join(', ')}.`

  return (
    <>
      <h3 className="section-title">Trends</h3>

      <div className="card trend-card">
        <div className="trend-chart" role="img" aria-label={chartLabel}>
          <div className="trend-plot">
            {averagePercent !== null && (
              <div className="trend-average-line" style={{ bottom: `${averagePercent}%` }} />
            )}
            {trend.points.map(point => (
              <div className="trend-column" key={`${point.year}-${point.month}`}>
                <div
                  className={`trend-bar${point === trend.current ? ' trend-bar--current' : ''}${point.isPartial ? ' trend-bar--partial' : ''}`}
                  style={{ height: `${barPercent(point.total, max)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="trend-axis">
            {trend.points.map(point => (
              <span className="trend-axis-label" key={`${point.year}-${point.month}`}>
                {monthLabel(point)}
              </span>
            ))}
          </div>
        </div>
        <p className="card-subtitle trend-legend">
          {trend.averageMonth === null
            ? `${monthLabel(trend.current, 'long')} ${formatMoney(trend.current.total, currency)}`
            : `Average month ${formatMoneyWhole(trend.averageMonth, currency)} · ${monthLabel(trend.current, 'long')} ${formatMoney(trend.current.total, currency)}${trend.current.isPartial ? ' so far' : ''}`}
        </p>
      </div>

      <div className="ios-list">
        {trend.currentVsAverage !== null && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              {trend.currentVsAverage > 0 ? (
                <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
              )}
              vs your average
            </span>
            <span className={`insight-value trend-delta trend-delta--${deltaTone(trend.currentVsAverage)}`}>
              {formatSignedMoney(trend.currentVsAverage, currency)}
              {trend.current.isPartial ? ' so far' : ''}
            </span>
          </div>
        )}

        <div className="breakdown-row insight-row">
          <span className="icon-label">
            {trend.dailyAverageDelta === null || trend.dailyAverageDelta === 0 ? (
              <Minus size={16} strokeWidth={2} aria-hidden="true" />
            ) : trend.dailyAverageDelta > 0 ? (
              <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={16} strokeWidth={2} aria-hidden="true" />
            )}
            Daily pace
          </span>
          <span className="insight-value">
            {formatMoney(trend.dailyAverage, currency)}/day
            {trend.dailyAverageDelta !== null && (
              <span className={`trend-delta trend-delta--${deltaTone(trend.dailyAverageDelta)}`}>
                {' '}
                ({formatSignedMoney(trend.dailyAverageDelta, currency)} vs usual)
              </span>
            )}
          </span>
        </div>

        {trend.leanestMonth && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
              Leanest month
            </span>
            <span className="insight-value">
              {monthLabel(trend.leanestMonth, 'long')} — {formatMoney(trend.leanestMonth.total, currency)}
            </span>
          </div>
        )}

        {trend.heaviestMonth && (
          <div className="breakdown-row insight-row">
            <span className="icon-label">
              <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
              Heaviest month
            </span>
            <span className="insight-value">
              {monthLabel(trend.heaviestMonth, 'long')} — {formatMoney(trend.heaviestMonth.total, currency)}
            </span>
          </div>
        )}
      </div>

    </>
  )
}
