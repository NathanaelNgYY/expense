// src/screens/AddEntry.tsx
import { useState } from 'react'
import { Delete } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { toLocalDateString } from '../dates'
import { useEntries } from '../EntriesContext'
import { getCustomCategories } from '../storage'
import { CATEGORY_LABELS, CATEGORIES } from '../types'

interface Props {
  onSave: () => void
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','backspace']

export default function AddEntry({ onSave }: Props) {
  const [digits, setDigits] = useState('0')
  const [animationCue, setAnimationCue] = useState({ key: '', version: 0 })
  const [category, setCategory] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const { addEntry } = useEntries()

  const customCategories = getCustomCategories()
  const categoryOptions: { id: string; label: string; icon: string }[] = [
    ...CATEGORIES.map(c => ({ id: c as string, label: CATEGORY_LABELS[c], icon: c as string })),
    ...customCategories.map(c => ({ id: c.id, label: c.label, icon: c.icon })),
  ]

  const amount = parseFloat(digits) || 0
  const amountText = `S$${amount.toFixed(2)}`
  const activeGlyphIndex = getActiveGlyphIndex(digits, amountText, animationCue.key)

  function handleDigit(key: string) {
    const nextDigits = getNextDigits(digits, key)
    if (nextDigits === digits) return

    setDigits(nextDigits)
    setAnimationCue(prev => ({
      key,
      version: prev.version + 1,
    }))
  }

  function handleSave() {
    if (amount <= 0) return
    // addEntry commits the optimistic, locally-durable entry synchronously and queues the
    // network POST; don't await it, so we navigate home instantly instead of blocking the
    // UI on the serverless round-trip. The sync queue flushes the create in the background.
    void addEntry({
      amount,
      category,
      note,
      date: toLocalDateString(),
    })
    onSave()
  }

  return (
    <div className="screen add-entry">
      <p className="screen-title">ADD ENTRY</p>

      <div className="amount-display" aria-label="Entered amount" aria-live="polite">
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
                  isActive ? 'amount-glyph--enter' : '',
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

      <div className="numpad">
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

      <p className="category-label">
        Category <span className="muted">(optional)</span>
      </p>
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

      <input
        type="text"
        className="note-input"
        placeholder="Note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      <button className="save-btn" type="button" onClick={handleSave} disabled={amount <= 0}>
        Save
      </button>
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
  if (!key || key === 'backspace') return -1

  const decimalIndex = amountText.indexOf('.')

  if (key === '.') return decimalIndex
  if (decimalIndex === -1) return -1

  const [, cents = ''] = digits.split('.')
  if (digits.includes('.') && cents.length > 0) {
    return Math.min(decimalIndex + cents.length, amountText.length - 1)
  }

  return decimalIndex - 1
}
