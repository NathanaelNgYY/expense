import { ChevronLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import BudgetIcon from '../components/BudgetIcon'
import { toLocalDateString } from '../dates'
import { computeMemberTotals, currentSgtMonth, entriesForMonth, totalSpent } from './memberTotals'
import OwnerTools from './OwnerTools'
import { useSharedBudgets } from './SharedBudgetsContext'

export default function BudgetDetail() {
  const { active, session, error, closeBudget, addEntry, removeEntry, leaveActiveBudget } =
    useSharedBudgets()
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!active) return null
  const { budget, entries, categories, members } = active
  const month = currentSgtMonth()
  const monthEntries = entriesForMonth(entries, month)
  const spent = totalSpent(monthEntries)
  const memberTotals = computeMemberTotals(monthEntries, members)
  const nameOf = new Map(members.map(m => [m.userId, m.displayName]))
  const isOwner = session?.user.id === budget.ownerId
  const parsedAmount = parseFloat(amount) || 0

  async function handleAdd() {
    setBusy(true)
    try {
      await addEntry({
        amount: parsedAmount,
        categoryId,
        note,
        date: toLocalDateString(),
      })
      setAmount('')
      setCategoryId(null)
      setNote('')
    } catch {
      // Context exposes the operation error.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen shared-detail">
      <div className="shared-detail-header">
        <button type="button" className="link-btn" aria-label="Back" onClick={closeBudget}>
          <ChevronLeft className="ui-icon" aria-hidden="true" />
        </button>
        <p className="screen-title">{budget.name.toUpperCase()}</p>
      </div>

      <div className="shared-progress">
        {budget.monthlyLimit !== null ? (
          <>
            <p>{`S$${spent.toFixed(2)} of S$${budget.monthlyLimit.toFixed(2)}`}</p>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (spent / budget.monthlyLimit) * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p>{`S$${spent.toFixed(2)} spent this month`}</p>
        )}
      </div>

      <div className="shared-form">
        <input
          type="number"
          className="note-input"
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        {categories.length > 0 && (
          <div className="chips">
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                className={`chip ${categoryId === c.id ? 'chip--selected' : ''}`}
                onClick={() => setCategoryId(prev => (prev === c.id ? null : c.id))}
              >
                <BudgetIcon name={c.icon} />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          className="note-input"
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || parsedAmount <= 0}
          onClick={() => void handleAdd()}
        >
          Add
        </button>
      </div>

      <div className="shared-member-totals" data-testid="member-totals">
        <p className="category-label">This month by member</p>
        {memberTotals.map(t => (
          <div key={t.userId} className="member-total-row">
            <span>{t.displayName}</span>
            <span>{`S$${t.total.toFixed(2)}`}</span>
          </div>
        ))}
      </div>

      <div className="shared-entries">
        <p className="category-label">Entries</p>
        {entries.length === 0 && <p className="muted">No entries yet.</p>}
        {entries.map(e => (
          <div key={e.id} className="shared-entry-row">
            <div className="shared-entry-main">
              <span>{e.note || 'No note'}</span>
              <span className="muted">
                {nameOf.get(e.userId) ?? 'Former member'} - {e.date}
              </span>
            </div>
            <span>{`S$${e.amount.toFixed(2)}`}</span>
            <button
              type="button"
              className="link-btn"
              aria-label={`Delete entry ${e.note || e.id}`}
              onClick={() => void removeEntry(e.id)}
            >
              <Trash2 className="ui-icon" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {isOwner && <OwnerTools />}
      {!isOwner && (
        <button
          type="button"
          className="danger-btn"
          onClick={() => {
            if (window.confirm(`Leave "${budget.name}"? You can rejoin later with an invite code.`)) {
              void leaveActiveBudget()
            }
          }}
        >
          Leave budget
        </button>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
