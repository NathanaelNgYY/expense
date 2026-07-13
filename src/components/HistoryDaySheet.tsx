import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import BudgetIcon from './BudgetIcon'
import { fromLocalDateString } from '../dates'
import { formatSGD } from '../format'
import type { Entry } from '../types'

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  date: string
  entries: Entry[]
  categoryOptions: CategoryOption[]
  onAdd: (entry: { amount: number; category: string | null; note: string; date: string }) => Promise<void>
  onClose: () => void
}

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

export default function HistoryDaySheet({ date, entries, categoryOptions, onAdd, onClose }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const dateValue = fromLocalDateString(date)
  const shortDate = format(dateValue, 'MMM d')
  const headingDate = format(dateValue, 'EEE, MMM d')
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const amount = Number(amountText)
  const canAdd = Number.isFinite(amount) && amount > 0 && !busy
  const optionById = new Map(categoryOptions.map(option => [option.id, option]))

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  async function handleAdd() {
    if (!canAdd) return
    setBusy(true)
    setMessage('')
    try {
      await onAdd({
        amount: Math.round(amount * 100) / 100,
        category,
        note: note.trim(),
        date,
      })
      setAmountText('')
      setCategory(null)
      setNote('')
      setShowForm(false)
      setMessage(`Added ${formatSGD(amount)} for ${shortDate}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="day-sheet-layer">
      <button className="day-sheet-scrim" type="button" onClick={onClose} aria-label="Close day sheet" />
      <section
        ref={dialogRef}
        className="day-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Expenses for ${headingDate}`}
      >
        <div className="day-sheet-handle" aria-hidden="true" />
        <header className="day-sheet-header">
          <div>
            <h2>{showForm ? `Add for ${headingDate}` : headingDate}</h2>
            <p>{showForm ? 'Date locked from calendar' : `${entries.length} ${entries.length === 1 ? 'expense' : 'expenses'}`}</p>
          </div>
          <div className="day-sheet-header-actions">
            <strong>{showForm ? shortDate : formatSGD(total)}</strong>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close day sheet">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        {showForm ? (
          <div className="day-sheet-form" aria-label="Add expense for selected date">
            <label className="form-field" htmlFor="day-sheet-amount">
              <span>Amount</span>
              <input
                id="day-sheet-amount"
                className="amount-input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountText}
                onChange={event => setAmountText(event.target.value)}
                autoFocus
              />
            </label>
            <p className="category-label">Category <span className="muted">(optional)</span></p>
            <div className="chips chips--compact">
              {categoryOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={`chip chip--compact ${category === option.id ? 'chip--selected' : ''}`}
                  onClick={() => setCategory(current => current === option.id ? null : option.id)}
                >
                  <BudgetIcon name={option.icon} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <input
              id="day-sheet-note"
              className="note-input"
              type="text"
              aria-label="Note (optional)"
              placeholder="Note (optional)"
              value={note}
              onChange={event => setNote(event.target.value)}
            />
            <button className="save-btn" type="button" disabled={!canAdd} onClick={() => void handleAdd()}>
              {busy ? 'Adding...' : `Add for ${shortDate}`}
            </button>
          </div>
        ) : (
          <>
            {entries.length === 0 ? (
              <div className="day-sheet-empty">No expenses recorded for this day.</div>
            ) : (
              <div className="day-sheet-entries">
                {entries.map(entry => {
                  const option = entry.category ? optionById.get(entry.category) : null
                  return (
                    <div key={entry.id} className="day-sheet-entry">
                      <span className="day-sheet-entry-main">
                        <span className="icon-label">
                          <BudgetIcon name={option?.icon ?? 'uncategorized'} />
                          <strong>{option?.label ?? 'Uncategorized'}</strong>
                        </span>
                        <small>{entry.note || entry.merchant || sourceLabel(entry)}</small>
                      </span>
                      <strong>{formatSGD(entry.amount)}</strong>
                    </div>
                  )
                })}
              </div>
            )}
            {message && <p className="save-feedback" role="status">{message}</p>}
            <button className="save-btn" type="button" onClick={() => setShowForm(true)}>
              Add expense for {shortDate}
            </button>
          </>
        )}
      </section>
    </div>
  )
}
