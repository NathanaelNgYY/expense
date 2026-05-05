import { useState } from 'react'
import { endOfWeek, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import {
  entriesForMonth,
  lunchWeeklySpend,
  monthlySpendByCategory,
  weeklyTotal,
  weeksInMonth,
} from '../compute'
import {
  addDays,
  clampDateString,
  fromLocalDateString,
  isFutureDateString,
  toLocalDateString,
} from '../dates'
import { addEntry, getBudgetConfig, getEntries } from '../storage'
import { CATEGORIES, CATEGORY_LABELS } from '../types'
import type { Category, Entry } from '../types'

const MONTHLY_INCOME = 1200

function progressPercent(amount: number, budget: number): number {
  if (budget <= 0) return amount > 0 ? 100 : 0
  return Math.min(100, (amount / budget) * 100)
}

function minDateForMonth(year: number, month: number): string {
  return toLocalDateString(new Date(year, month, 1))
}

function maxDateForMonth(year: number, month: number): string {
  const today = new Date()
  const monthEnd = new Date(year, month + 1, 0)

  return toLocalDateString(monthEnd > today ? today : monthEnd)
}

function defaultBackfillDate(year: number, month: number): string {
  const today = new Date()
  const isViewingCurrentMonth = year === today.getFullYear() && month === today.getMonth()
  const candidate = isViewingCurrentMonth ? addDays(today, -1) : new Date(year, month + 1, 0)

  return clampDateString(
    toLocalDateString(candidate),
    minDateForMonth(year, month),
    maxDateForMonth(year, month),
  )
}

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

export default function History() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultBackfillDate(now.getFullYear(), now.getMonth()),
  )
  const [amountText, setAmountText] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [note, setNote] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [, refreshHistory] = useState(0)

  const entries = getEntries()
  const config = getBudgetConfig()
  const weeks = weeksInMonth(year, month)
  const spend = monthlySpendByCategory(entries, year, month)
  const monthEntries = entriesForMonth(entries, year, month).sort(entrySort)
  const monthTotal = monthEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const weeklyBudget = MONTHLY_INCOME / 4
  const lunchWeeklyAvg = config.lunch / 4
  const dateMin = minDateForMonth(year, month)
  const dateMax = maxDateForMonth(year, month)

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const monthLabel = new Date(year, month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
  const backfillAmount = parseFloat(amountText)
  const canSaveBackfill =
    Number.isFinite(backfillAmount) &&
    backfillAmount > 0 &&
    selectedDate >= dateMin &&
    selectedDate <= dateMax &&
    !isFutureDateString(selectedDate)

  function prevMonth() {
    const nextYear = month === 0 ? year - 1 : year
    const nextMonth = month === 0 ? 11 : month - 1

    setYear(nextYear)
    setMonth(nextMonth)
    setSelectedDate(defaultBackfillDate(nextYear, nextMonth))
    setSavedMessage('')
  }

  function nextMonth() {
    if (isCurrentMonth) return

    const nextYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0 : month + 1

    setYear(nextYear)
    setMonth(nextMonth)
    setSelectedDate(defaultBackfillDate(nextYear, nextMonth))
    setSavedMessage('')
  }

  function handleDateChange(value: string) {
    setSelectedDate(clampDateString(value, dateMin, dateMax))
    setSavedMessage('')
  }

  function handleSaveBackfill() {
    if (!canSaveBackfill) return

    const amount = Math.round(backfillAmount * 100) / 100
    const entryDate = clampDateString(selectedDate, dateMin, dateMax)
    addEntry({
      id: crypto.randomUUID(),
      amount,
      category,
      note: note.trim(),
      date: entryDate,
    })

    setAmountText('')
    setCategory(null)
    setNote('')
    setSavedMessage(`Saved S$${amount.toFixed(2)} for ${format(fromLocalDateString(entryDate), 'MMM d')}`)
    refreshHistory(version => version + 1)
  }

  return (
    <div className="screen history">
      <div className="month-nav">
        <button className="month-nav-btn" type="button" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
        <span className="month-nav-label">{monthLabel}</span>
        <button
          className="month-nav-btn"
          type="button"
          onClick={nextMonth}
          disabled={isCurrentMonth}
          aria-label="Next month"
        >
          <ChevronRight aria-hidden="true" size={22} strokeWidth={2.4} />
        </button>
      </div>

      <section className="card history-backfill" aria-labelledby="backfill-title">
        <div className="card-heading-row">
          <div>
            <h2 id="backfill-title" className="card-title">
              Add missed expense
            </h2>
            <p className="card-subtitle">Backfill a day you forgot to log.</p>
          </div>
        </div>

        <div className="field-grid">
          <label className="form-field" htmlFor="backfill-date">
            <span>Date</span>
            <input
              id="backfill-date"
              type="date"
              className="date-input"
              value={selectedDate}
              min={dateMin}
              max={dateMax}
              onChange={event => handleDateChange(event.target.value)}
            />
          </label>
          <label className="form-field" htmlFor="backfill-amount">
            <span>Amount</span>
            <input
              id="backfill-amount"
              type="number"
              className="amount-input"
              value={amountText}
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              onChange={event => {
                setAmountText(event.target.value)
                setSavedMessage('')
              }}
            />
          </label>
        </div>

        <p className="category-label">
          Category <span className="muted">(optional)</span>
        </p>
        <div className="chips chips--compact">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              className={`chip chip--compact ${category === cat ? 'chip--selected' : ''}`}
              onClick={() => {
                setCategory(currentCategory => (currentCategory === cat ? null : cat))
                setSavedMessage('')
              }}
            >
              <BudgetIcon name={cat} />
              <span>{CATEGORY_LABELS[cat]}</span>
            </button>
          ))}
        </div>

        <input
          type="text"
          className="note-input"
          placeholder="Note (optional)"
          value={note}
          onChange={event => {
            setNote(event.target.value)
            setSavedMessage('')
          }}
        />

        <button
          className="save-btn history-save-btn"
          type="button"
          onClick={handleSaveBackfill}
          disabled={!canSaveBackfill}
        >
          Add to History
        </button>
        {savedMessage && (
          <p className="save-feedback" role="status">
            {savedMessage}
          </p>
        )}
      </section>

      <div className="card history-summary">
        <div>
          <span className="summary-label">Month total</span>
          <strong className="summary-amount">S${monthTotal.toFixed(2)}</strong>
        </div>
        <div>
          <span className="summary-label">Entries</span>
          <strong className="summary-amount">{monthEntries.length}</strong>
        </div>
      </div>

      <h3 className="section-title">Weekly Spending</h3>

      {weeks.map(weekStart => {
        const total = weeklyTotal(entries, weekStart)
        const lunch = lunchWeeklySpend(entries, weekStart)
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        const label = `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`
        const totalPct = progressPercent(total, weeklyBudget)
        const lunchPct = progressPercent(lunch, lunchWeeklyAvg)

        return (
          <div key={weekStart.toISOString()} className="card week-bar">
            <div className="week-bar-header">
              <span className="week-bar-label">{label}</span>
              <span className="week-bar-total">S${total.toFixed(2)}</span>
            </div>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${totalPct}%`,
                  background: total > weeklyBudget ? 'var(--red)' : 'var(--green)',
                }}
              />
            </div>
            <div className="week-bar-lunch">
              <span className="muted">
                Lunch S${lunch.toFixed(2)} / ~S${lunchWeeklyAvg.toFixed(0)}
              </span>
              <div className="progress-bar thin" style={{ marginTop: 4 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${lunchPct}%`,
                    background: lunch > lunchWeeklyAvg ? 'var(--red)' : 'var(--blue)',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}

      <h3 className="section-title">Monthly Breakdown</h3>
      <div className="ios-list">
        {CATEGORIES.map(cat => (
          <div key={cat} className="breakdown-row">
            <span className="icon-label">
              <BudgetIcon name={cat} />
              {CATEGORY_LABELS[cat]}
            </span>
            <div>
              <span style={{ fontWeight: 600 }}>S${spend[cat].toFixed(2)}</span>
              <span className="muted"> / S${config[cat]}</span>
            </div>
          </div>
        ))}
      </div>

      <h3 className="section-title">Entries</h3>
      {monthEntries.length === 0 ? (
        <div className="empty-state">No entries for {monthLabel} yet.</div>
      ) : (
        <div className="entry-list">
          {monthEntries.map(entry => (
            <div key={entry.id} className="entry-row">
              <div className="entry-main">
                <span className="entry-category icon-label">
                  <BudgetIcon name={entry.category ?? 'uncategorized'} />
                  {entry.category ? CATEGORY_LABELS[entry.category] : 'Uncategorized'}
                </span>
                <span className="entry-date">{format(fromLocalDateString(entry.date), 'EEE, MMM d')}</span>
                {entry.note && <span className="entry-note">{entry.note}</span>}
              </div>
              <strong className="entry-amount">S${entry.amount.toFixed(2)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
