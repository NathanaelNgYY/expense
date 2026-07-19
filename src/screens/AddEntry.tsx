// src/screens/AddEntry.tsx
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Delete } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import { fromLocalDateString } from '../dates'
import { sgtTodayString } from '../shared/sgtDate'
import { useEntries } from '../EntriesContext'
import { useBudgetConfig } from '../BudgetConfigContext'
import { buildCategoryOptions } from '../categoryDisplay'
import { useSharedBudgets } from '../sharedBudgets/SharedBudgetsContext'
import type { EntryKind } from '../types'
import { formatMoney } from '../format'

/** What was just logged, so the shell can confirm it and offer an undo. */
export interface SavedEntrySummary {
  id: string
  amount: number
  kind: EntryKind
  categoryLabel: string | null
  currency: string
}

interface Props {
  initialDate?: string
  onSave: (saved?: SavedEntrySummary) => void
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','backspace']
const AMOUNT_ANNOUNCE_DELAY_MS = 1000

export default function AddEntry({ initialDate, onSave }: Props) {
  const today = sgtTodayString()
  const [digits, setDigits] = useState('0')
  const [animationCue, setAnimationCue] = useState({ key: '', version: 0 })
  const [category, setCategory] = useState<string | null>(null)
  const [kind, setKind] = useState<EntryKind>('expense')
  const [note, setNote] = useState('')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [entryDate, setEntryDate] = useState(() => initialDate && initialDate <= today ? initialDate : today)
  const [busy, setBusy] = useState(false)
  const { addEntry: addPersonalEntry } = useEntries()
  const shared = useSharedBudgets()
  const { openBudget } = shared

  // If the chosen shared budget disappears (e.g. the user left or deleted it), snap back to
  // Personal. Adjusting state during render is React's recommended alternative to a syncing effect.
  if (selectedBudgetId !== null && !shared.budgets.some(b => b.id === selectedBudgetId)) {
    setSelectedBudgetId(null)
    setCategory(null)
    setKind('expense')
  }

  const { customCategories, overrides, activeCurrency } = useBudgetConfig()
  const selectedSharedBudget = shared.budgets.find(b => b.id === selectedBudgetId) ?? null
  const isSharedDestination = selectedBudgetId !== null
  const activeSharedReady = shared.active?.budget.id === selectedBudgetId
  const personalCategoryOptions = buildCategoryOptions(overrides, customCategories)
  const sharedCategoryOptions =
    activeSharedReady && shared.active
      ? shared.active.categories.map(c => ({ id: c.id, label: c.label, icon: c.icon }))
      : []
  const categoryOptions = isSharedDestination ? sharedCategoryOptions : personalCategoryOptions

  const amount = parseFloat(digits) || 0
  const entryCurrency = isSharedDestination ? selectedSharedBudget?.currency ?? 'SGD' : activeCurrency
  const amountText = formatMoney(amount, entryCurrency)
  const activeGlyphIndex = getActiveGlyphIndex(digits, amountText, animationCue.key)

  // M4: announcing on every keypress spammed screen readers with the full re-read amount.
  // Instead a hidden live region settles to the final value 1s after the user pauses.
  // Initialized to the current text so mounting announces nothing.
  const [announcedAmount, setAnnouncedAmount] = useState(amountText)

  useEffect(() => {
    const id = setTimeout(() => setAnnouncedAmount(amountText), AMOUNT_ANNOUNCE_DELAY_MS)
    return () => clearTimeout(id)
  }, [amountText])

  const sharedSaveDisabled =
    isSharedDestination && (!selectedSharedBudget || !activeSharedReady || busy)
  const saveLabel = kind === 'refund'
    ? entryDate === today
      ? 'Save refund'
      : `Add refund for ${format(fromLocalDateString(entryDate), 'MMM d')}`
    : entryDate === today
      ? 'Save'
      : `Add for ${format(fromLocalDateString(entryDate), 'MMM d')}`

  useEffect(() => {
    if (!isSharedDestination || !selectedBudgetId || activeSharedReady) return
    void openBudget(selectedBudgetId).catch(() => {})
  }, [activeSharedReady, isSharedDestination, selectedBudgetId, openBudget])

  const handleDigit = useCallback((key: string) => {
    setDigits(current => {
      const nextDigits = getNextDigits(current, key)
      if (nextDigits !== current) {
        setAnimationCue(prev => ({ key, version: prev.version + 1 }))
      }
      return nextDigits
    })
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key === 'Backspace' || event.key === 'Delete' ? 'backspace' : event.key
      if (!NUMPAD_KEYS.includes(key)) return
      event.preventDefault()
      handleDigit(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDigit])

  async function handleSave() {
    if (amount <= 0) return
    if (isSharedDestination) {
      if (!activeSharedReady || busy) return
      setBusy(true)
      try {
        await shared.addEntry({
          amount,
          categoryId: category,
          note,
          date: entryDate,
        })
        onSave()
      } catch {
        // The shared context exposes the operation error.
      } finally {
        setBusy(false)
      }
      return
    }

    // addEntry commits the optimistic, locally-durable entry synchronously and queues the
    // network POST; don't await it, so we navigate home instantly instead of blocking the
    // UI on the serverless round-trip. The sync queue flushes the create in the background.
    // Mint the id here so the shell can offer an Undo without waiting for the round-trip.
    const id = crypto.randomUUID()
    void addPersonalEntry({
      id,
      amount,
      kind,
      category,
      note,
      date: entryDate,
      currency: activeCurrency,
    })
    onSave({
      id,
      amount,
      kind,
      categoryLabel: category ? categoryOptions.find(o => o.id === category)?.label ?? null : null,
      currency: activeCurrency,
    })
  }

  return (
    <div className="screen add-entry theme-screen theme-screen--add">
      <h1 className="screen-title">Add entry</h1>

      {shared.budgets.length > 0 && (
        <div className="scope-switch" role="group" aria-label="Expense destination">
          <button
            type="button"
            className={!isSharedDestination ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
            onClick={() => {
              setSelectedBudgetId(null)
              setCategory(null)
            }}
          >
            Personal
          </button>
          {shared.budgets.map(budget => (
            <button
              key={budget.id}
              type="button"
              className={
                selectedBudgetId === budget.id
                  ? 'scope-switch-btn scope-switch-btn--active'
                  : 'scope-switch-btn'
              }
              onClick={() => {
                setSelectedBudgetId(budget.id)
                setCategory(null)
                setKind('expense')
              }}
            >
              {budget.name}
            </button>
          ))}
        </div>
      )}

      {!isSharedDestination && (
        <div className="scope-switch" role="group" aria-label="Entry type">
          {(['expense', 'refund'] as const).map(option => (
            <button
              key={option}
              type="button"
              className={kind === option ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
            >
              {option === 'expense' ? 'Expense' : 'Refund'}
            </button>
          ))}
        </div>
      )}

      <div className="amount-display add-entry__amount" aria-label="Entered amount">
        <span className="amount-glyph-set" aria-hidden="true">
          {Array.from(amountText).map((char, index) => {
            const isActive = index === activeGlyphIndex
            const isMinor = index > amountText.indexOf('.')
            const isPrefix = index < 2
            return (
              <span
                key={`amount-${index}-${char}-${isActive ? animationCue.version : 'stable'}`}
                className={[
                  'amount-glyph',
                  isActive
                    ? animationCue.key === 'backspace'
                      ? 'amount-glyph--delete'
                      : 'amount-glyph--enter'
                    : '',
                  isMinor ? 'amount-glyph--minor' : '',
                  isPrefix ? 'amount-glyph--prefix' : '',
                ].filter(Boolean).join(' ')}
                aria-hidden="true"
              >
                {char}
              </span>
            )
          })}
        </span>
        <span className="amount-screenreader">{amountText}</span>
      </div>
      <span className="amount-screenreader" role="status">{announcedAmount}</span>

      <label className="add-entry-date">
        <span className="add-entry-date__trigger">
          <CalendarDays size={17} aria-hidden="true" />
          <span>{entryDate === today ? 'Today' : format(fromLocalDateString(entryDate), 'EEE, MMM d')}</span>
          <input
            type="date"
            className="add-entry-date__input"
            aria-label="Entry date"
            value={entryDate}
            max={today}
            onChange={event => {
              const nextDate = event.target.value
              setEntryDate(nextDate && nextDate <= today ? nextDate : today)
            }}
          />
        </span>
      </label>

      <div className="numpad add-entry__keypad">
        {NUMPAD_KEYS.map(key => (
          <button
            key={key}
            type="button"
            className="numpad-key"
            onClick={() => handleDigit(key)}
            aria-label={key === 'backspace' ? 'Delete digit' : key}
          >
            {key === 'backspace' ? <Delete className="numpad-icon" aria-hidden="true" /> : key}
          </button>
        ))}
      </div>

      <section className="add-entry__categories" aria-labelledby="entry-category-label">
        <p id="entry-category-label" className="category-label">
          Category <span className="muted">(optional)</span>
        </p>
        {isSharedDestination && !activeSharedReady ? (
          <p className="muted">Loading {selectedSharedBudget?.name ?? 'shared budget'} categories...</p>
        ) : categoryOptions.length === 0 ? (
          <p className="muted">
            {isSharedDestination ? 'No categories yet. Add shared categories in Settings.' : 'No categories yet.'}
          </p>
        ) : (
          <div className="chips">
            {categoryOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`chip ${category === opt.id ? 'chip--selected' : ''}`}
                onClick={() => setCategory(prev => (prev === opt.id ? null : opt.id))}
              >
                <BudgetIcon name={opt.icon} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="add-entry__details">
        <input
          type="text"
          className="note-input"
          aria-label="Note (optional)"
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
        />

        <button
          className="save-btn"
          type="button"
          onClick={() => void handleSave()}
          disabled={amount <= 0 || sharedSaveDisabled}
        >
          {saveLabel}
        </button>
        {isSharedDestination && shared.error && <p className="form-error">{shared.error}</p>}
      </div>
    </div>
  )
}

function getNextDigits(current: string, key: string) {
  if (key === 'backspace') {
    return current.length <= 1 ? '0' : current.slice(0, -1)
  }

  if (key === '.' && current.includes('.')) return current
  if (current === '0' && key !== '.') return key
  if (current.includes('.') && current.split('.')[1].length >= 2) return current

  return current + key
}

function getActiveGlyphIndex(digits: string, amountText: string, key: string) {
  if (!key) return -1

  const decimalIndex = amountText.indexOf('.')
  if (decimalIndex === -1) return -1

  if (key === 'backspace') {
    // Nothing meaningful to punctuate once the amount is back to zero.
    if (digits === '0') return -1
    // A deleted cent digit reverts to a trailing 0; punctuate that position.
    // Otherwise the trailing integer digit is what visually changed.
    const [, cents = ''] = digits.split('.')
    if (!digits.includes('.')) return decimalIndex - 1
    return cents.length >= 1 ? decimalIndex + 2 : decimalIndex + 1
  }

  if (key === '.') return decimalIndex

  const [, cents = ''] = digits.split('.')
  if (digits.includes('.') && cents.length > 0) {
    return Math.min(decimalIndex + cents.length, amountText.length - 1)
  }

  return decimalIndex - 1
}
