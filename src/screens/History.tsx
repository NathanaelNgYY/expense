import { useEffect, useRef, useState } from 'react'
import { endOfWeek, format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus, Search, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import InsightsSection from '../components/InsightsSection'
import { formatSGD, formatSGDWhole } from '../format'
import {
  entriesForMonth,
  lunchWeeklySpend,
  weeklyTotal,
  weeksInMonth,
} from '../compute'
import {
  clampDateString,
  fromLocalDateString,
  isFutureDateString,
  toLocalDateString,
} from '../dates'
import { getBudgetConfig, getCustomCategories, getCategoryOverrides } from '../storage'
import { buildCategoryOptions, categoryIcon, categoryLabel } from '../categoryDisplay'
import { useEntries } from '../EntriesContext'
import type { Entry } from '../types'

interface Props {
  initialEditingEntryId?: string | null
  onEditHandled?: () => void
  onAddForDate?: (date: string) => void
}

interface EditDraft {
  amountText: string
  category: string | null
  note: string
  date: string
}

interface InitialHistoryState {
  year: number
  month: number
  editingEntryId: string | null
  editDraft: EditDraft | null
}

type CategoryFilter = 'all' | 'uncategorized' | string
type SourceFilter = 'all' | 'manual' | 'apple-pay' | 'dbs-email'

function sourceLabel(entry: Entry): string {
  switch (entry.source) {
    case 'apple-pay':
      return 'Apple Pay'
    case 'dbs-email':
      return 'DBS email'
    default:
      return 'Manual'
  }
}

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

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

function editDraftForEntry(entry: Entry): EditDraft {
  return {
    amountText: entry.amount.toFixed(2),
    category: entry.category,
    note: entry.note,
    date: entry.date,
  }
}

function initialHistoryState(
  initialEditingEntryId: string | null,
  referenceDate: Date,
  knownEntries: Entry[],
): InitialHistoryState {
  const entry = initialEditingEntryId
    ? knownEntries.find(candidate => candidate.id === initialEditingEntryId)
    : null

  if (entry) {
    const [entryYear, entryMonth] = entry.date.split('-').map(Number)

    return {
      year: entryYear,
      month: entryMonth - 1,
      editingEntryId: entry.id,
      editDraft: editDraftForEntry(entry),
    }
  }

  return {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth(),
    editingEntryId: null,
    editDraft: null,
  }
}

export default function History({ initialEditingEntryId = null, onEditHandled, onAddForDate }: Props) {
  const now = new Date()
  const { entries, addEntry, restoreEntry, editEntry, removeEntry } = useEntries()
  const [initialState] = useState(() => initialHistoryState(initialEditingEntryId, now, entries))
  const [year, setYear] = useState(initialState.year)
  const [month, setMonth] = useState(initialState.month)
  const [dayFilterDate, setDayFilterDate] = useState<string | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(initialState.editingEntryId)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(initialState.editDraft)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletedEntry, setDeletedEntry] = useState<Entry | null>(null)
  const [ledgerMessage, setLedgerMessage] = useState('')
  const dayFilterRef = useRef<HTMLElement>(null)

  const config = getBudgetConfig()
  const customCategories = getCustomCategories()
  const overrides = getCategoryOverrides()
  const categoryOptions = buildCategoryOptions(overrides, customCategories)
  const labelForCategory = (id: string): string => categoryLabel(id, overrides, customCategories)
  const iconForCategory = (id: string): string => categoryIcon(id, overrides, customCategories)
  const weeks = weeksInMonth(year, month)
  const monthEntries = entriesForMonth(entries, year, month).sort(entrySort)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredEntries = monthEntries.filter(entry => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        entry.note,
        entry.merchant ?? '',
        entry.amount.toFixed(2),
        entry.category ? labelForCategory(entry.category) : 'Uncategorized',
        sourceLabel(entry),
      ].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
    const matchesCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'uncategorized' ? entry.category === null : entry.category === categoryFilter)
    const matchesSource =
      sourceFilter === 'all' || (entry.source ?? 'manual') === sourceFilter
    const matchesFrom = !dateFrom || entry.date >= dateFrom
    const matchesTo = !dateTo || entry.date <= dateTo

    return matchesQuery && matchesCategory && matchesSource && matchesFrom && matchesTo
  })
  const activeFilterCount =
    Number(categoryFilter !== 'all') +
    Number(sourceFilter !== 'all') +
    Number(Boolean(dateFrom)) +
    Number(Boolean(dateTo))
  const monthTotal = monthEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const weeklyBudget = config.monthlyIncome / 4
  const lunchWeeklyAvg = config.lunch / 4
  const dateMin = minDateForMonth(year, month)
  const dateMax = maxDateForMonth(year, month)

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const monthLabel = new Date(year, month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  function prevMonth() {
    const nextYear = month === 0 ? year - 1 : year
    const nextMonth = month === 0 ? 11 : month - 1

    setYear(nextYear)
    setMonth(nextMonth)
    setDayFilterDate(null)
    setDateFrom('')
    setDateTo('')
  }

  function nextMonth() {
    if (isCurrentMonth) return

    const nextYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0 : month + 1

    setYear(nextYear)
    setMonth(nextMonth)
    setDayFilterDate(null)
    setDateFrom('')
    setDateTo('')
  }

  function handleDateChange(value: string) {
    const date = clampDateString(value, dateMin, dateMax)
    setDayFilterDate(date)
    setDateFrom(date)
    setDateTo(date)
  }

  function startEditingEntry(entry: Entry) {
    setEditingEntryId(entry.id)
    setEditDraft(editDraftForEntry(entry))
    setConfirmingDeleteId(null)
    setLedgerMessage('')
  }

  function cancelEditingEntry() {
    setEditingEntryId(null)
    setEditDraft(null)
  }

  function handleEditDraftChange(nextDraft: Partial<EditDraft>) {
    setEditDraft(currentDraft => (currentDraft ? { ...currentDraft, ...nextDraft } : currentDraft))
  }

  async function handleSaveEditedEntry(entry: Entry) {
    if (!editDraft) return

    const amount = Math.round(Number(editDraft.amountText) * 100) / 100
    const entryDate = clampDateString(editDraft.date, dateMin, dateMax)

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      entryDate < dateMin ||
      entryDate > dateMax ||
      isFutureDateString(entryDate)
    ) {
      return
    }

    await editEntry(entry.id, {
      amount,
      category: editDraft.category,
      note: editDraft.note.trim(),
      date: entryDate,
    })

    setLedgerMessage(`Updated ${formatSGD(amount)} for ${format(fromLocalDateString(entryDate), 'MMM d')}`)
    setEditingEntryId(null)
    setEditDraft(null)
  }

  async function handleDuplicateEntry(entry: Entry) {
    await addEntry({
      amount: entry.amount,
      category: entry.category,
      note: entry.note,
      date: entry.date,
    })
    setEditingEntryId(null)
    setEditDraft(null)
    setLedgerMessage(`Duplicated ${formatSGD(entry.amount)} transaction`)
  }

  async function handleDeleteEntry(entry: Entry) {
    await removeEntry(entry.id)
    setDeletedEntry(entry)
    setConfirmingDeleteId(null)
    setEditingEntryId(null)
    setEditDraft(null)
    setLedgerMessage('Transaction deleted')
  }

  async function handleUndoDelete() {
    if (!deletedEntry) return
    await restoreEntry(deletedEntry)
    setDeletedEntry(null)
    setLedgerMessage('Transaction restored')
  }

  function clearFilters() {
    setSearchQuery('')
    setCategoryFilter('all')
    setSourceFilter('all')
    setDateFrom('')
    setDateTo('')
    setDayFilterDate(null)
  }

  function clearDayFilter() {
    setDateFrom('')
    setDateTo('')
    setDayFilterDate(null)
  }

  useEffect(() => {
    if (!initialEditingEntryId) return

    onEditHandled?.()
  }, [initialEditingEntryId, onEditHandled])

  useEffect(() => {
    if (!dayFilterDate) return
    dayFilterRef.current?.scrollIntoView?.({ block: 'start' })
  }, [dayFilterDate])

  // Per-day spend for the calendar heatmap — keyed by day-of-month, derived from
  // the same monthEntries used everywhere else in this screen (single source of truth).
  const spendByDay = new Map<number, number>()
  for (const entry of monthEntries) {
    const day = fromLocalDateString(entry.date).getDate()
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + entry.amount)
  }
  const maxDaySpend = Math.max(1, ...spendByDay.values())
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toLocalDateString(now)
  const dayFilterEntryCount = dayFilterDate
    ? monthEntries.filter(entry => entry.date === dayFilterDate).length
    : 0

  return (
    <div className="screen history theme-screen theme-screen--history">
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

      <div className="card history-summary history__summary">
        <div>
          <span className="summary-label">Month total</span>
          <strong className="summary-amount">{formatSGD(monthTotal)}</strong>
        </div>
        <div>
          <span className="summary-label">Entries</span>
          <strong className="summary-amount">{monthEntries.length}</strong>
        </div>
      </div>

      <h3 className="section-title">Entries</h3>
      {dayFilterDate && (
        <aside ref={dayFilterRef} className="history-day-filter" aria-label="Selected calendar day">
          <span className="history-day-filter__label">
            <CalendarDays size={18} aria-hidden="true" />
            <span>
              <strong>{format(fromLocalDateString(dayFilterDate), 'EEE, MMM d')}</strong>
              <small>{dayFilterEntryCount} {dayFilterEntryCount === 1 ? 'expense' : 'expenses'}</small>
            </span>
          </span>
          <span className="history-day-filter__actions">
            <button type="button" className="history-day-filter__clear" onClick={clearDayFilter} aria-label="Clear day filter">
              <X size={18} aria-hidden="true" />
            </button>
            <button type="button" className="history-day-filter__add" onClick={() => onAddForDate?.(dayFilterDate)}>
              <Plus size={17} aria-hidden="true" />
              Add for {format(fromLocalDateString(dayFilterDate), 'MMM d')}
            </button>
          </span>
        </aside>
      )}
      <section className="history-ledger-tools" aria-label="Transaction search and filters">
        <div className="history-search-row">
          <label className="history-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              aria-label="Search transactions"
              placeholder="Search note or merchant"
              onChange={event => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>
          <button
            type="button"
            className={`history-filter-toggle${showFilters ? ' history-filter-toggle--active' : ''}`}
            onClick={() => setShowFilters(current => !current)}
            aria-label={showFilters ? 'Hide transaction filters' : 'Show transaction filters'}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            {activeFilterCount > 0 && <span className="history-filter-count">{activeFilterCount}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="history-filter-panel">
            <label className="form-field" htmlFor="history-category-filter">
              <span>Category</span>
              <select
                id="history-category-filter"
                className="history-filter-select"
                value={categoryFilter}
                onChange={event => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                <option value="uncategorized">Uncategorized</option>
                {categoryOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field" htmlFor="history-source-filter">
              <span>Source</span>
              <select
                id="history-source-filter"
                className="history-filter-select"
                value={sourceFilter}
                onChange={event => setSourceFilter(event.target.value as SourceFilter)}
              >
                <option value="all">All sources</option>
                <option value="manual">Manual</option>
                <option value="apple-pay">Apple Pay</option>
                <option value="dbs-email">DBS email</option>
              </select>
            </label>
            <div className="history-date-filters">
              <label className="form-field" htmlFor="history-date-from">
                <span>From</span>
                <input
                  id="history-date-from"
                  type="date"
                  className="history-filter-date"
                  value={dateFrom}
                  min={dateMin}
                  max={dateTo || dateMax}
                  onChange={event => {
                    setDateFrom(event.target.value)
                    setDayFilterDate(null)
                  }}
                />
              </label>
              <label className="form-field" htmlFor="history-date-to">
                <span>To</span>
                <input
                  id="history-date-to"
                  type="date"
                  className="history-filter-date"
                  value={dateTo}
                  min={dateFrom || dateMin}
                  max={dateMax}
                  onChange={event => {
                    setDateTo(event.target.value)
                    setDayFilterDate(null)
                  }}
                />
              </label>
            </div>
            <button type="button" className="history-clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}

        <p className="history-result-count" role="status">
          {filteredEntries.length === monthEntries.length
            ? `${monthEntries.length} ${monthEntries.length === 1 ? 'transaction' : 'transactions'}`
            : `${filteredEntries.length} of ${monthEntries.length} transactions`}
        </p>
      </section>

      {ledgerMessage && (
        <div className="entry-ledger-feedback" role="status">
          <span>{ledgerMessage}</span>
          {deletedEntry && (
            <button type="button" onClick={() => void handleUndoDelete()}>
              <Undo2 size={16} aria-hidden="true" />
              Undo
            </button>
          )}
        </div>
      )}

      {monthEntries.length === 0 ? (
        <div className="empty-state">No entries for {monthLabel} yet.</div>
      ) : filteredEntries.length === 0 ? (
        <div className="empty-state">
          No matching transactions. Try clearing a filter or using a different search.
        </div>
      ) : (
        <div className="entry-list">
          {filteredEntries.map(entry => {
            const isEditing = editingEntryId === entry.id && editDraft
            const editAmount = editDraft ? Number(editDraft.amountText) : Number.NaN
            const canSaveEdit =
              Boolean(editDraft) &&
              Number.isFinite(editAmount) &&
              editAmount > 0 &&
              editDraft!.date >= dateMin &&
              editDraft!.date <= dateMax &&
              !isFutureDateString(editDraft!.date)

            return (
              <div key={entry.id} className="entry-edit-shell">
                <button
                  type="button"
                  className="entry-row entry-row-button"
                  onClick={() => startEditingEntry(entry)}
                  aria-expanded={Boolean(isEditing)}
                >
                  <span className="entry-main">
                    <span className="entry-category icon-label">
                      <BudgetIcon name={entry.category ? iconForCategory(entry.category) : 'uncategorized'} />
                      {entry.category ? labelForCategory(entry.category) : 'Uncategorized'}
                    </span>
                    <span className="entry-date">
                      {format(fromLocalDateString(entry.date), 'EEE, MMM d')} &middot; {sourceLabel(entry)}
                    </span>
                    {entry.merchant && <span className="entry-merchant">{entry.merchant}</span>}
                    {entry.note && <span className="entry-note">{entry.note}</span>}
                  </span>
                  <strong className="entry-amount">{formatSGD(entry.amount)}</strong>
                </button>

                {isEditing && (
                  <div className="entry-detail-panel" aria-label="Transaction details">
                    <div className="entry-detail-heading">
                      <div>
                        <h4 className="entry-edit-title">Transaction details</h4>
                        <p className="entry-detail-source">
                          {sourceLabel(entry)}{entry.merchant ? ` · ${entry.merchant}` : ''}
                        </p>
                      </div>
                      <strong className="entry-detail-amount">{formatSGD(entry.amount)}</strong>
                    </div>

                    <div className="entry-edit-panel" aria-label="Edit expense">
                    <div className="field-grid">
                      <label className="form-field" htmlFor="edit-entry-date">
                        <span>Date</span>
                        <span className="date-input-shell">
                          <span className="date-input-value">
                            {format(fromLocalDateString(editDraft.date), 'MMM d, yyyy')}
                          </span>
                          <input
                            id="edit-entry-date"
                            type="date"
                            className="date-input date-input--native"
                            value={editDraft.date}
                            min={dateMin}
                            max={dateMax}
                            onChange={event => handleEditDraftChange({ date: event.target.value })}
                          />
                        </span>
                      </label>
                      <label className="form-field" htmlFor="edit-entry-amount">
                        <span>Amount</span>
                        <input
                          id="edit-entry-amount"
                          type="number"
                          className="amount-input"
                          value={editDraft.amountText}
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          onChange={event => handleEditDraftChange({ amountText: event.target.value })}
                        />
                      </label>
                    </div>

                    <p className="category-label">
                      Category <span className="muted">(optional)</span>
                    </p>
                    <div className="chips chips--compact">
                      {categoryOptions.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`chip chip--compact ${editDraft.category === opt.id ? 'chip--selected' : ''}`}
                          onClick={() =>
                            handleEditDraftChange({
                              category: editDraft.category === opt.id ? null : opt.id,
                            })
                          }
                        >
                          <BudgetIcon name={opt.icon} />
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>

                    <input
                      id="edit-entry-note"
                      type="text"
                      className="note-input"
                      aria-label="Note (optional)"
                      placeholder="Note (optional)"
                      value={editDraft.note}
                      onChange={event => handleEditDraftChange({ note: event.target.value })}
                    />

                    <div className="entry-edit-actions">
                      <button className="export-btn" type="button" onClick={cancelEditingEntry}>
                        Cancel
                      </button>
                      <button
                        className="save-btn history-save-btn"
                        type="button"
                        onClick={() => handleSaveEditedEntry(entry)}
                        disabled={!canSaveEdit}
                      >
                        Save Changes
                      </button>
                    </div>
                    </div>

                    <div className="entry-detail-actions">
                      <button type="button" className="export-btn" onClick={() => void handleDuplicateEntry(entry)}>
                        <Copy size={16} aria-hidden="true" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="entry-delete-btn"
                        onClick={() => setConfirmingDeleteId(entry.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Delete
                      </button>
                    </div>

                    {confirmingDeleteId === entry.id && (
                      <div className="entry-delete-confirm" role="alert">
                        <span>Delete this transaction?</span>
                        <div>
                          <button type="button" onClick={() => setConfirmingDeleteId(null)}>Keep it</button>
                          <button type="button" onClick={() => void handleDeleteEntry(entry)}>Delete transaction</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Analysis sits beneath the ledger: someone opening History wants the transaction
          list first. Calendar taps bring the chosen day back to that ledger. */}
      <details className="history-analysis">
        <summary className="history-analysis__summary">Calendar &amp; insights</summary>
        <div className="history-analysis__body">
        <div className="cal-grid history__calendar" role="grid" aria-label="Daily spending">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dateStr = toLocalDateString(new Date(year, month, day))
            const spend = spendByDay.get(day) ?? 0
            const alpha = spend > 0 ? 0.15 + Math.min(1, spend / maxDaySpend) * 0.65 : 0.06
            const isToday = dateStr === todayStr
            const isSelected = dateStr === dayFilterDate

            return (
              <button
                key={day}
                type="button"
                className={`cal-cell${isToday ? ' cal-cell--today' : ''}${isSelected ? ' cal-cell--selected' : ''}`}
                style={{
                  background: `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, transparent)`,
                }}
                onClick={() => handleDateChange(dateStr)}
                aria-label={`${format(new Date(year, month, day), 'MMM d')}, ${formatSGD(spend)} spent`}
                aria-pressed={isSelected}
              >
                {day}
              </button>
            )
          })}
        </div>
        <p className="cal-caption muted">lighter = heavier spend day &middot; ring = today &middot; tap a day to filter the ledger</p>

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
                <span className="week-bar-total">{formatSGD(total)}</span>
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
                  Lunch {formatSGD(lunch)} / ~{formatSGDWhole(lunchWeeklyAvg)}
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

        <InsightsSection
          entries={entries}
          year={year}
          month={month}
          customCategories={customCategories}
        />

        </div>
      </details>

    </div>
  )
}
