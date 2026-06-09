// src/screens/AddEntry.tsx
import { useState } from 'react'
import { Delete } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { toLocalDateString } from '../dates'
import { useEntries } from '../EntriesContext'
import { CATEGORY_LABELS, CATEGORIES } from '../types'
import type { Category } from '../types'

interface Props {
  onSave: () => void
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','backspace']

export default function AddEntry({ onSave }: Props) {
  const [digits, setDigits] = useState('0')
  const [category, setCategory] = useState<Category | null>(null)
  const [note, setNote] = useState('')
  const { addEntry } = useEntries()

  const amount = parseFloat(digits) || 0

  function handleDigit(key: string) {
    if (key === 'backspace') {
      setDigits(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
      return
    }
    setDigits(prev => {
      if (key === '.' && prev.includes('.')) return prev
      if (prev === '0' && key !== '.') return key
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev
      return prev + key
    })
  }

  async function handleSave() {
    if (amount <= 0) return
    await addEntry({
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

      <div className="amount-display">
        S${amount.toFixed(2)}
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
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            className={`chip ${category === cat ? 'chip--selected' : ''}`}
            onClick={() => setCategory(prev => (prev === cat ? null : cat))}
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
        onChange={e => setNote(e.target.value)}
      />

      <button className="save-btn" type="button" onClick={handleSave} disabled={amount <= 0}>
        Save
      </button>
    </div>
  )
}
