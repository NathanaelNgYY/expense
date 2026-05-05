import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { toLocalDateString } from '../dates'
import { getCustomStakes, saveCustomStakes, savePokerSession } from '../storage'

const PRESET_STAKES = ['0.1/0.2', '0.2/0.2', '0.5/0.5', '0.5/1', '1/2']

interface Props {
  onSave: () => void
  onBack: () => void
}

export default function LogSession({ onSave, onBack }: Props) {
  const [date, setDate] = useState(toLocalDateString())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [stakes, setStakes] = useState('')
  const [buyIn, setBuyIn] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | ''>('')
  const [amount, setAmount] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customDraft, setCustomDraft] = useState('')
  const [customStakes, setCustomStakes] = useState<string[]>(getCustomStakes)

  const allStakes = [...PRESET_STAKES, ...customStakes]
  const canSave =
    date &&
    startTime &&
    endTime &&
    stakes &&
    buyIn &&
    result &&
    amount &&
    parseFloat(buyIn) > 0 &&
    parseFloat(amount) > 0

  function handleAddCustom() {
    const trimmed = customDraft.trim()
    if (!trimmed || allStakes.includes(trimmed)) {
      setShowCustomInput(false)
      setCustomDraft('')
      if (trimmed && allStakes.includes(trimmed)) setStakes(trimmed)
      return
    }

    const updated = [...customStakes, trimmed]
    setCustomStakes(updated)
    saveCustomStakes(updated)
    setStakes(trimmed)
    setShowCustomInput(false)
    setCustomDraft('')
  }

  function handleSave() {
    if (!canSave) return

    savePokerSession({
      id: crypto.randomUUID(),
      date,
      startTime,
      endTime,
      stakes,
      buyIn: parseFloat(buyIn),
      result: result as 'win' | 'loss',
      amount: parseFloat(amount),
    })
    onSave()
  }

  return (
    <div className="screen log-session">
      <div className="log-session-header">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Back">
          <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
          Poker
        </button>
        <span className="settings-title">Log Session</span>
        <span className="settings-header-spacer" />
      </div>

      <div className="field-grid">
        <label className="form-field">
          Date
          <div className="date-input-shell">
            <span className="date-input-value">
              {new Date(date + 'T00:00').toLocaleDateString('default', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            <input
              type="date"
              className="date-input--native"
              value={date}
              max={toLocalDateString()}
              onChange={e => setDate(e.target.value)}
              aria-label="Session date"
            />
          </div>
        </label>

        <div className="form-field">
          <span>Time</span>
          <div className="time-row">
            <input
              type="time"
              className="amount-input time-input"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              onInput={e => setStartTime(e.currentTarget.value)}
              onBlur={e => setStartTime(e.currentTarget.value)}
              aria-label="Start time"
              placeholder="Start"
            />
            <span className="time-sep muted">to</span>
            <input
              type="time"
              className="amount-input time-input"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              onInput={e => setEndTime(e.currentTarget.value)}
              onBlur={e => setEndTime(e.currentTarget.value)}
              aria-label="End time"
              placeholder="End"
            />
          </div>
        </div>

        <div className="form-field">
          <span>Stakes</span>
          <div className="chips">
            {allStakes.map(s => (
              <button
                key={s}
                type="button"
                className={`chip chip--compact ${stakes === s ? 'chip--selected' : ''}`}
                onClick={() => {
                  setStakes(prev => (prev === s ? '' : s))
                  setShowCustomInput(false)
                }}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              className={`chip chip--compact ${showCustomInput ? 'chip--selected' : ''}`}
              onClick={() => {
                setShowCustomInput(prev => !prev)
                setStakes('')
              }}
            >
              + Custom
            </button>
          </div>
          {showCustomInput && (
            <div className="custom-stakes-row">
              <input
                type="text"
                className="amount-input"
                placeholder="e.g. 5/10"
                value={customDraft}
                onChange={e => setCustomDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
                autoFocus
                aria-label="Custom stakes"
              />
              <button type="button" className="custom-stakes-add" onClick={handleAddCustom}>
                Add
              </button>
            </div>
          )}
        </div>

        <label className="form-field">
          Buy-in (S$)
          <input
            type="number"
            inputMode="decimal"
            className="amount-input"
            placeholder="0"
            min="0"
            value={buyIn}
            onChange={e => setBuyIn(e.target.value)}
            aria-label="Buy-in amount"
          />
        </label>

        <div className="form-field">
          <span>Result</span>
          <div className="result-toggle">
            <button
              type="button"
              className={`result-toggle-btn ${result === 'win' ? 'result-toggle-btn--win' : ''}`}
              onClick={() => setResult(prev => (prev === 'win' ? '' : 'win'))}
            >
              Win
            </button>
            <button
              type="button"
              className={`result-toggle-btn ${result === 'loss' ? 'result-toggle-btn--loss' : ''}`}
              onClick={() => setResult(prev => (prev === 'loss' ? '' : 'loss'))}
            >
              Loss
            </button>
          </div>
          {result && (
            <input
              type="number"
              inputMode="decimal"
              className="amount-input"
              placeholder="Amount (S$)"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              aria-label="Result amount"
            />
          )}
        </div>
      </div>

      <button className="save-btn" type="button" onClick={handleSave} disabled={!canSave}>
        Save Session
      </button>
    </div>
  )
}
