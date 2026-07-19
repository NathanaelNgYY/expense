import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Undo2, X } from 'lucide-react'
import HistoryEntryList, { type EditDraft } from '../components/history/HistoryEntryList'
import { sourceLabel } from '../components/history/historyEntryModel'
import HistoryLedgerFilters, {
  type CategoryFilter,
  type SourceFilter,
} from '../components/history/HistoryLedgerFilters'
import SpendingCalendar from '../components/history/SpendingCalendar'
import { formatMoney } from '../format'
import { entriesForMonth } from '../compute'
import {
  clampDateString,
  fromLocalDateString,
  isFutureDateString,
  toLocalDateString,
} from '../dates'
import { sgtToday } from '../shared/sgtDate'
import { useBudgetConfig } from '../BudgetConfigContext'
import { buildCategoryOptions, categoryIcon, categoryLabel } from '../categoryDisplay'
import { useEntries } from '../EntriesContext'
import type { Entry } from '../types'
import { entryKind, entryNetAmount } from '../shared/entryAmount'
import { entriesForCurrency, entryCurrency } from '../shared/currency'

interface Props {
  initialEditingEntryId?: string | null
  onEditHandled?: () => void
  onAddForDate?: (date: string) => void
}

interface InitialHistoryState {
  year: number
  month: number
  editingEntryId: string | null
  editDraft: EditDraft | null
}

function minDateForMonth(year: number, month: number): string {
  return toLocalDateString(new Date(year, month, 1))
}

function maxDateForMonth(year: number, month: number): string {
  const today = sgtToday()
  const monthEnd = new Date(year, month + 1, 0)

  return toLocalDateString(monthEnd > today ? today : monthEnd)
}

function entrySort(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
}

function editDraftForEntry(entry: Entry): EditDraft {
  return {
    amountText: entry.amount.toFixed(2),
    kind: entryKind(entry),
    category: entry.category,
    note: entry.note,
    date: entry.date,
    currency: entryCurrency(entry),
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
  const now = sgtToday()
  const { entries: allEntries, addEntry, restoreEntry, editEntry, removeEntry } = useEntries()
  const { customCategories, overrides, activeCurrency, currencies } = useBudgetConfig()
  const entries = entriesForCurrency(allEntries, activeCurrency)
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

  const categoryOptions = buildCategoryOptions(overrides, customCategories)
  const labelForCategory = (id: string): string => categoryLabel(id, overrides, customCategories)
  const iconForCategory = (id: string): string => categoryIcon(id, overrides, customCategories)
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
        entryKind(entry) === 'refund' ? 'Refund' : 'Expense',
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
  const monthTotal = monthEntries.reduce((sum, entry) => sum + entryNetAmount(entry), 0)
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
      kind: editDraft.kind,
      category: editDraft.category,
      note: editDraft.note.trim(),
      date: entryDate,
      currency: editDraft.currency,
    })

    setLedgerMessage(`Updated ${formatMoney(amount, editDraft.currency)} for ${format(fromLocalDateString(entryDate), 'MMM d')}`)
    setEditingEntryId(null)
    setEditDraft(null)
  }

  async function handleDuplicateEntry(entry: Entry) {
    await addEntry({
      amount: entry.amount,
      kind: entryKind(entry),
      category: entry.category,
      note: entry.note,
      date: entry.date,
      currency: entryCurrency(entry),
    })
    setEditingEntryId(null)
    setEditDraft(null)
    setLedgerMessage(`Duplicated ${formatMoney(entry.amount, activeCurrency)} transaction`)
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
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + entryNetAmount(entry))
  }
  const maxDaySpend = Math.max(1, ...spendByDay.values())
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
        <h1 className="month-nav-label"><span className="sr-only">History: </span>{monthLabel}</h1>
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
          <strong className="summary-amount">{formatMoney(monthTotal, activeCurrency)}</strong>
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
              <small>{dayFilterEntryCount} {dayFilterEntryCount === 1 ? 'transaction' : 'transactions'}</small>
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
      <HistoryLedgerFilters
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        showFilters={showFilters}
        onShowFiltersChange={setShowFilters}
        activeFilterCount={activeFilterCount}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        dateFrom={dateFrom}
        onDateFromChange={value => {
          setDateFrom(value)
          setDayFilterDate(null)
        }}
        dateTo={dateTo}
        onDateToChange={value => {
          setDateTo(value)
          setDayFilterDate(null)
        }}
        dateMin={dateMin}
        dateMax={dateMax}
        categoryOptions={categoryOptions}
        filteredCount={filteredEntries.length}
        totalCount={monthEntries.length}
        onClearFilters={clearFilters}
      />

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

      <HistoryEntryList
        entries={filteredEntries}
        monthEntryCount={monthEntries.length}
        monthLabel={monthLabel}
        editingEntryId={editingEntryId}
        editDraft={editDraft}
        dateMin={dateMin}
        dateMax={dateMax}
        categoryOptions={categoryOptions}
        labelForCategory={labelForCategory}
        iconForCategory={iconForCategory}
        confirmingDeleteId={confirmingDeleteId}
        onStartEditing={startEditingEntry}
        onDraftChange={handleEditDraftChange}
        onCancelEditing={cancelEditingEntry}
        onSave={entry => void handleSaveEditedEntry(entry)}
        onDuplicate={entry => void handleDuplicateEntry(entry)}
        onRequestDelete={setConfirmingDeleteId}
        onCancelDelete={() => setConfirmingDeleteId(null)}
        onDelete={entry => void handleDeleteEntry(entry)}
        currencies={currencies}
      />
      <SpendingCalendar
        year={year}
        month={month}
        spendByDay={spendByDay}
        maxDaySpend={maxDaySpend}
        today={todayStr}
        selectedDate={dayFilterDate}
        onSelectDate={handleDateChange}
        currency={activeCurrency}
      />

    </div>
  )
}
