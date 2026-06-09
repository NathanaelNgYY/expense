import { useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronDown, ChevronUp, Settings as SettingsIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import { getBudgetConfig, getEntries } from '../storage'
import {
  bufferRemaining,
  categoryDeficits,
  entriesForMonth,
  monthlySpendForecast,
  monthlySpendByCategory,
  safeToSpendPerDay,
  weeklyTotal,
} from '../compute'
import { addDays, fromLocalDateString, toLocalDateString } from '../dates'
import { CATEGORY_LABELS, CATEGORIES } from '../types'
import type { ApplePayImportStatus } from '../App'
import type { Category, Entry } from '../types'

interface Props {
  onSettings: () => void
  importStatus?: ApplePayImportStatus | null
  onEditImportedEntry?: (entryId: string) => void
}

const COMMITTED_CATEGORIES: Category[] = ['savings', 'investments']
const COMMITTED_CATEGORY_SET = new Set<Category>(COMMITTED_CATEGORIES)

function formatSignedCurrency(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}S$${Math.abs(value).toFixed(2)}`
}

function formatWholeCurrency(value: number): string {
  return `S$${value.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`
}

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

export default function Dashboard({
  onSettings,
  importStatus = null,
  onEditImportedEntry,
}: Props) {
  const [expandedCategory, setExpandedCategory] = useState<Category | null>(null)
  const now = new Date()
  const entries = getEntries()
  const config = getBudgetConfig()

  const currentMonthEntries = entriesForMonth(entries, now.getFullYear(), now.getMonth())
  const todayDate = toLocalDateString(now)
  const recentExpenseStartDate = toLocalDateString(addDays(now, -14))
  const monthTotal = currentMonthEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const spend = monthlySpendByCategory(entries, now.getFullYear(), now.getMonth())
  const deficits = categoryDeficits(spend, config)
  const buffer = bufferRemaining(deficits, config)
  const thisWeek = weeklyTotal(entries, now)
  const monthlyIncome = config.monthlyIncome
  const budgetUsedPct = monthlyIncome > 0 ? Math.min(100, (monthTotal / monthlyIncome) * 100) : monthTotal > 0 ? 100 : 0
  const spendableBudget = config.lunch + config.transport + config.buffer
  const spendFilter = { excludedCategories: COMMITTED_CATEGORIES }
  const forecast = monthlySpendForecast(entries, now.getFullYear(), now.getMonth(), now, spendFilter)
  const safeToSpend = safeToSpendPerDay(
    entries,
    now.getFullYear(),
    now.getMonth(),
    spendableBudget,
    now,
    spendFilter,
  )
  const projectedDelta = forecast.projectedTotal - spendableBudget

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const totalOverage = config.buffer - buffer
  const forecastOver = projectedDelta > 0

  function toggleCategory(category: Category) {
    setExpandedCategory(current => (current === category ? null : category))
  }

  function handleCategoryKeyDown(event: KeyboardEvent<HTMLDivElement>, category: Category) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    toggleCategory(category)
  }

  return (
    <div className="screen dashboard">
      <header className="dashboard-header">
        <div>
          <div className="month-label">{monthLabel}</div>
          <div className="income-label">{formatWholeCurrency(monthlyIncome)} / month</div>
        </div>
        <button className="settings-icon-btn" type="button" onClick={onSettings} aria-label="Settings">
          <SettingsIcon aria-hidden="true" size={19} strokeWidth={2} />
        </button>
      </header>

      {importStatus && (
        <div
          className={`apple-pay-banner apple-pay-banner--${importStatus.kind}`}
          role="status"
        >
          <div className="apple-pay-banner-main">
            <strong>{importStatus.message}</strong>
            {'amount' in importStatus && (
              <span>
                S${importStatus.amount.toFixed(2)}
                {importStatus.merchant ? ` | ${importStatus.merchant}` : ''}
              </span>
            )}
          </div>
          {'entryId' in importStatus && onEditImportedEntry && (
            <button
              className="apple-pay-banner-edit"
              type="button"
              onClick={() => onEditImportedEntry(importStatus.entryId)}
            >
              Edit
            </button>
          )}
        </div>
      )}

      <div className="card summary-card">
        <div className="summary-card-top">
          <div>
            <span className="summary-label">Spent this month</span>
            <strong className="summary-amount summary-amount--large">S${monthTotal.toFixed(2)}</strong>
          </div>
          <div className="summary-pill">{currentMonthEntries.length} entries</div>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <div
            className="progress-fill"
            style={{
              width: `${budgetUsedPct}%`,
              background: monthTotal > monthlyIncome ? 'var(--red)' : 'var(--green)',
            }}
          />
        </div>
        <div className="summary-card-bottom">
          <span className="muted">Monthly income</span>
          <strong>{formatWholeCurrency(monthlyIncome)}</strong>
        </div>
      </div>

      <div className={`card forecast-card ${forecastOver ? 'forecast-card--danger' : ''}`}>
        <div className="forecast-grid">
          <div className="forecast-metric">
            <span className="summary-label icon-label">
              {forecastOver ? (
                <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <TrendingDown size={16} strokeWidth={2} aria-hidden="true" />
              )}
              Spend forecast
            </span>
            <strong className="forecast-value">S${forecast.projectedTotal.toFixed(2)}</strong>
          </div>
          <div className="forecast-metric forecast-metric--right">
            <span className="summary-label icon-label">
              <CalendarDays size={16} strokeWidth={2} aria-hidden="true" />
              Safe today
            </span>
            <strong
              className="forecast-value"
              style={{ color: safeToSpend.amountPerDay < 0 ? 'var(--red)' : 'var(--green)' }}
            >
              {formatSignedCurrency(safeToSpend.amountPerDay)}
            </strong>
          </div>
        </div>
        <p className="forecast-note muted">
          {forecastOver
            ? `${formatSignedCurrency(projectedDelta)} over spend budget at this pace`
            : `${formatSignedCurrency(Math.abs(projectedDelta))} under spend budget at this pace`}
          {' | '}
          {safeToSpend.daysRemaining} day{safeToSpend.daysRemaining === 1 ? '' : 's'} left
        </p>
      </div>

      <div className={`card buffer-card ${buffer <= 0 ? 'buffer-card--danger' : ''}`}>
        <div className="buffer-row">
          <span className="buffer-title icon-label">
            <BudgetIcon name="buffer" />
            Buffer
          </span>
          <span
            className="buffer-amount"
            style={{ color: buffer <= 0 ? 'var(--red)' : 'var(--yellow)' }}
          >
            S${buffer.toFixed(2)} left
          </span>
        </div>
        <div className="progress-bar" style={{ marginTop: 8 }}>
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, (buffer / config.buffer) * 100))}%`,
              background: buffer <= 0 ? 'var(--red)' : 'var(--yellow)',
            }}
          />
        </div>
        {totalOverage > 0 && (
          <p className="buffer-sub muted">
            S${totalOverage.toFixed(2)} used by others and overages
          </p>
        )}
      </div>

      <h3 className="section-title">Categories</h3>
      {CATEGORIES.map(cat => {
        const spent = spend[cat]
        const deficit = deficits[cat]
        const over = deficit < 0
        const committed = COMMITTED_CATEGORY_SET.has(cat)
        const expanded = expandedCategory === cat
        const categoryEntries = currentMonthEntries
          .filter(
            entry =>
              entry.category === cat &&
              entry.date >= recentExpenseStartDate &&
              entry.date <= todayDate,
          )
          .sort(entrySort)
        const categoryLabel = CATEGORY_LABELS[cat]
        const pct = config[cat] > 0 ? Math.min(100, (spent / config[cat]) * 100) : spent > 0 ? 100 : 0
        const statusLabel = committed
          ? spent >= config[cat]
            ? 'Committed'
            : `S$${deficit.toFixed(2)} to commit`
          : over
            ? `S$${Math.abs(deficit).toFixed(2)} over`
            : `S$${deficit.toFixed(2)} left`

        return (
          <article
            key={cat}
            className={`card category-row-card ${committed ? 'category-row--committed' : ''}`}
          >
            <div
              role="button"
              tabIndex={0}
              className="category-row-toggle"
              onClick={() => toggleCategory(cat)}
              onKeyDown={event => handleCategoryKeyDown(event, cat)}
              aria-expanded={expanded}
              aria-controls={`category-expenses-${cat}`}
            >
              <span className="cat-row-top">
                <span className="cat-name icon-label">
                  <BudgetIcon name={cat} />
                  {categoryLabel}
                </span>
                <span className="cat-row-right">
                  <span className="cat-spent-group">
                    <span className="cat-spent">S${spent.toFixed(2)}</span>
                    {expanded ? (
                      <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    ) : (
                      <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                    )}
                  </span>
                  <span
                    className={
                      over
                        ? 'cat-status cat-status--over'
                        : committed
                          ? 'cat-status cat-status--committed'
                          : 'cat-status cat-status--ok'
                    }
                  >
                    {statusLabel}
                  </span>
                </span>
              </span>
              <span className="progress-bar" style={{ marginTop: 8 }}>
                <span
                  className="progress-fill"
                  style={{
                    width: `${pct}%`,
                    background: over ? 'var(--red)' : committed ? 'var(--blue)' : 'var(--green)',
                  }}
                />
              </span>
              <span className="cat-row-bottom">
                <span className="muted">
                  {committed ? 'Monthly commitment' : 'Budget'} S${config[cat]}
                </span>
                {over && <span className="over-note">Taken from buffer</span>}
              </span>
            </div>

            {expanded && (
              <div
                id={`category-expenses-${cat}`}
                className="category-expense-list"
                aria-label={`${categoryLabel} expenses`}
              >
                <div className="category-expense-header">
                  <span>{categoryLabel} Expenses</span>
                  <span>{categoryEntries.length} entr{categoryEntries.length === 1 ? 'y' : 'ies'}</span>
                </div>
                {categoryEntries.length === 0 ? (
                  <p className="category-expense-empty">
                    No {categoryLabel.toLowerCase()} entries in the past 2 weeks.
                  </p>
                ) : (
                  categoryEntries.map(entry => (
                    <div key={entry.id} className="category-expense-row">
                      <span className="category-expense-main">
                        <span className="category-expense-date">
                          {format(fromLocalDateString(entry.date), 'EEE, MMM d')}
                        </span>
                        {entry.note && <span className="category-expense-note">{entry.note}</span>}
                      </span>
                      <strong className="category-expense-amount">S${entry.amount.toFixed(2)}</strong>
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
        )
      })}

      <div className="card week-strip">
        <span className="muted">This week</span>
        <span className="week-amount">S${thisWeek.toFixed(2)}</span>
      </div>
    </div>
  )
}
