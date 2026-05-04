// src/screens/AddEntry.tsx
import { useState } from 'react'
import { addEntry } from '../storage'
import { CATEGORY_LABELS, CATEGORIES } from '../types'
import type { Category } from '../types'

interface Props {
  onSave: () => void
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫']

export default function AddEntry({ onSave }: Props) {
  const [digits, setDigits] = useState('0')
  const [category, setCategory] = useState<Category | null>(null)
  const [note, setNote] = useState('')

  const amount = parseFloat(digits) || 0

  function handleDigit(key: string) {
    if (key === '⌫') {
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

  function handleSave() {
    if (amount <= 0) return
    addEntry({
      id: crypto.randomUUID(),
      amount,
      category,
      note,
      date: new Date().toISOString().split('T')[0],
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
          <button key={key} className="numpad-key" onClick={() => handleDigit(key)}>
            {key}
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
            className={`chip ${category === cat ? 'chip--selected' : ''}`}
            onClick={() => setCategory(prev => (prev === cat ? null : cat))}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <input
        className="note-input"
        placeholder="Note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      <button className="save-btn" onClick={handleSave} disabled={amount <= 0}>
        Save
      </button>
    </div>
  )
}
