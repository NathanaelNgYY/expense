import { useState, type KeyboardEvent } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronUp, Minus, Settings as SettingsIcon, TrendingDown, TrendingUp, X } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import { getBudgetConfig } from '../storage'
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
import type { Category, Entry } from '../types'
import { useEntries } from '../EntriesContext'

interface Props {
  onSettings: () => void
}

const COMMITTED_CATEGORIES: Category[] = ['savings', 'investments']
const COMMITTED_CATEGORY_SET = new Set<Category>(COMMITTED_CATEGORIES)

// Which collapsible spend list is open. 'uncategorized' is the triage bucket for entries
// (often auto-imported) that have no category yet — they have no budget line of their own.
type ExpandKey = Category | 'uncategorized'

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

export default function Dashboard({ onSettings }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<ExpandKey | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const now = new Date()
  const { entries, removeEntry } = useEntries()
  const config = getBudgetConfig()

  const currentMonthEntries = entriesForMonth(entries, now.getFullYear(), now.getMonth())
  // Triage bucket: this month's entries that still have no category (e.g. auto-imported
  // from an unknown payee). Shown in full — unlike category lists, we don't trim to the
  // last 2 weeks, since the whole point is to find and categorize every stray entry.
  const uncategorizedEntries = currentMonthEntries.filter(entry => entry.category == null).sort(entrySort)
  const uncategorizedTotal = uncategorizedEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const uncategorizedExpanded = expandedCategory === 'uncategorized'
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

  function toggleCategory(category: ExpandKey) {
    setConfirmingDeleteId(null)
    setExpandedCategory(current => (current === category ? null : category))
  }

  function handleCategoryKeyDown(event: KeyboardEvent<HTMLDivElement>, category: ExpandKey) {
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    toggleCategory(category)
  }

  // One expense row, shared by the category lists and the Uncategorized list. Shows an
  // inline delete confirm when this row's id is the one pending deletion.
  function renderExpenseRow(entry: Entry) {
    if (confirmingDeleteId === entry.id) {
      return (
        <div key={entry.id} className="category-expense-row category-expense-row--confirm">
          <span className="category-expense-confirm-text">Delete this entry?</span>
          <span className="category-expense-confirm-actions">
            <button
              type="button"
              className="expense-confirm-btn expense-confirm-btn--yes"
              aria-label="Confirm delete"
              onClick={() => {
                setConfirmingDeleteId(null)
                void removeEntry(entry.id)
              }}
            >
              <Check size={15} strokeWidth={3} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="expense-confirm-btn expense-confirm-btn--no"
              aria-label="Cancel delete"
              onClick={() => setConfirmingDeleteId(null)}
            >
              <X size={15} strokeWidth={3} aria-hidden="true" />
            </button>
          </span>
        </div>
      )
    }

    return (
      <div key={entry.id} className="category-expense-row">
        <span className="category-expense-main">
          <span className="category-expense-date">
            {format(fromLocalDateString(entry.date), 'EEE, MMM d')}
          </span>
          {entry.note && <span className="category-expense-note">{entry.note}</span>}
        </span>
        <span className="category-expense-trailing">
          <strong className="category-expense-amount">S${entry.amount.toFixed(2)}</strong>
          <button
            type="button"
            className="expense-delete-btn"
            aria-label="Delete entry"
            onClick={() => setConfirmingDeleteId(entry.id)}
          >
            <Minus size={15} strokeWidth={3} aria-hidden="true" />
          </button>
        </span>
      </div>
    )
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
                  categoryEntries.map(renderExpenseRow)
                )}
              </div>
            )}
          </article>
        )
      })}

      {uncategorizedEntries.length > 0 && (
        <article className="card category-row-card">
          <div
            role="button"
            tabIndex={0}
            className="category-row-toggle"
            onClick={() => toggleCategory('uncategorized')}
            onKeyDown={event => handleCategoryKeyDown(event, 'uncategorized')}
            aria-expanded={uncategorizedExpanded}
            aria-controls="category-expenses-uncategorized"
          >
            <span className="cat-row-top">
              <span className="cat-name icon-label">
                <BudgetIcon name="uncategorized" />
                Uncategorized
              </span>
              <span className="cat-row-right">
                <span className="cat-spent-group">
                  <span className="cat-spent">S${uncategorizedTotal.toFixed(2)}</span>
                  {uncategorizedExpanded ? (
                    <ChevronUp className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                  ) : (
                    <ChevronDown className="cat-chevron" aria-hidden="true" strokeWidth={2.4} />
                  )}
                </span>
              </span>
            </span>
            <span className="cat-row-bottom">
              <span className="muted">
                {uncategorizedEntries.length} entr{uncategorizedEntries.length === 1 ? 'y' : 'ies'} to categorize in History
              </span>
            </span>
          </div>

          {uncategorizedExpanded && (
            <div
              id="category-expenses-uncategorized"
              className="category-expense-list"
              aria-label="Uncategorized expenses"
            >
              <div className="category-expense-header">
                <span>Uncategorized Expenses</span>
                <span>
                  {uncategorizedEntries.length} entr{uncategorizedEntries.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              {uncategorizedEntries.map(renderExpenseRow)}
            </div>
          )}
        </article>
      )}

      <div className="card week-strip">
        <span className="muted">This week</span>
        <span className="week-amount">S${thisWeek.toFixed(2)}</span>
      </div>
    </div>
  )
}
