// src/screens/AddEntry.tsx
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, Delete } from 'lucide-react'
import { format } from 'date-fns'
import BudgetIcon from '../components/BudgetIcon'
import { addDays, fromLocalDateString, toLocalDateString } from '../dates'
import { useEntries } from '../EntriesContext'
import { getCustomCategories, getCategoryOverrides } from '../storage'
import { buildCategoryOptions } from '../categoryDisplay'
import { useSharedBudgets } from '../sharedBudgets/SharedBudgetsContext'

/** What was just logged, so the shell can confirm it and offer an undo. */
export interface SavedEntrySummary {
  id: string
  amount: number
  categoryLabel: string | null
}

interface Props {
  onSave: (saved?: SavedEntrySummary) => void
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','backspace']

export default function AddEntry({ onSave }: Props) {
  const [digits, setDigits] = useState('0')
  const [animationCue, setAnimationCue] = useState({ key: '', version: 0 })
  const [category, setCategory] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [entryDate, setEntryDate] = useState(() => toLocalDateString())
  const [showDateChoices, setShowDateChoices] = useState(false)
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { addEntry: addPersonalEntry } = useEntries()
  const shared = useSharedBudgets()
  const { openBudget } = shared

  // If the chosen shared budget disappears (e.g. the user left or deleted it), snap back to
  // Personal. Adjusting state during render is React's recommended alternative to a syncing effect.
  if (selectedBudgetId !== null && !shared.budgets.some(b => b.id === selectedBudgetId)) {
    setSelectedBudgetId(null)
    setCategory(null)
  }

  const customCategories = getCustomCategories()
  const selectedSharedBudget = shared.budgets.find(b => b.id === selectedBudgetId) ?? null
  const isSharedDestination = selectedBudgetId !== null
  const activeSharedReady = shared.active?.budget.id === selectedBudgetId
  const personalCategoryOptions = buildCategoryOptions(getCategoryOverrides(), customCategories)
  const sharedCategoryOptions =
    activeSharedReady && shared.active
      ? shared.active.categories.map(c => ({ id: c.id, label: c.label, icon: c.icon }))
      : []
  const categoryOptions = isSharedDestination ? sharedCategoryOptions : personalCategoryOptions

  const amount = parseFloat(digits) || 0
  const amountText = `S$${amount.toFixed(2)}`
  const activeGlyphIndex = getActiveGlyphIndex(digits, amountText, animationCue.key)
  const sharedSaveDisabled =
    isSharedDestination && (!selectedSharedBudget || !activeSharedReady || busy)
  const today = toLocalDateString()
  const yesterday = toLocalDateString(addDays(new Date(), -1))
  const dateLabel = entryDate === today
    ? 'Today'
    : entryDate === yesterday
      ? 'Yesterday'
      : format(fromLocalDateString(entryDate), 'MMM d')
  const saveLabel = entryDate === today ? 'Save' : `Add for ${format(fromLocalDateString(entryDate), 'MMM d')}`

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
      category,
      note,
      date: entryDate,
    })
    onSave({
      id,
      amount,
      categoryLabel: category ? categoryOptions.find(o => o.id === category)?.label ?? null : null,
    })
  }

  return (
    <div className="screen add-entry theme-screen theme-screen--add">
      <p className="screen-title">ADD ENTRY</p>

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
              }}
            >
              {budget.name}
            </button>
          ))}
        </div>
      )}

      <div className="amount-display add-entry__amount" aria-label="Entered amount" aria-live="polite">
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

      <div className="add-entry-date">
        <button
          type="button"
          className="add-entry-date__trigger"
          aria-label={`Choose expense date, ${dateLabel}`}
          aria-expanded={showDateChoices}
          onClick={() => setShowDateChoices(current => !current)}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>{dateLabel}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {showDateChoices && (
          <div className="add-entry-date__choices" role="group" aria-label="Expense date">
            <button
              type="button"
              className={entryDate === today ? 'add-entry-date__choice add-entry-date__choice--active' : 'add-entry-date__choice'}
              onClick={() => {
                setEntryDate(today)
                setShowDateChoices(false)
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={entryDate === yesterday ? 'add-entry-date__choice add-entry-date__choice--active' : 'add-entry-date__choice'}
              onClick={() => {
                setEntryDate(yesterday)
                setShowDateChoices(false)
              }}
            >
              Yesterday
            </button>
            <label className="add-entry-date__choice add-entry-date__picker">
              <CalendarDays size={15} aria-hidden="true" />
              <span>Pick date</span>
              <input
                type="date"
                aria-label="Pick another expense date"
                value={entryDate}
                max={today}
                onChange={event => {
                  if (!event.target.value) return
                  setEntryDate(event.target.value)
                  setShowDateChoices(false)
                }}
              />
            </label>
          </div>
        )}
      </div>

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

      <section className="add-entry__categories" aria-labelledby="expense-category-label">
        <p id="expense-category-label" className="category-label">
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
