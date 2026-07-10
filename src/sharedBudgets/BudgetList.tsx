import { Users } from 'lucide-react'
import { useState } from 'react'
import { useSharedBudgets } from './SharedBudgetsContext'
import { formatSGD } from '../format'

export default function BudgetList() {
  const { budgets, error, createBudget, joinBudget, openBudget, signOut } = useSharedBudgets()
  const [form, setForm] = useState<'none' | 'create' | 'join'>('none')
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      setForm('none')
      setName('')
      setLimit('')
      setCode('')
    } catch {
      // Context exposes the operation error; keep the form open for correction.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen shared-list">
      <p className="screen-title">SHARED BUDGETS</p>

      {budgets.length === 0 && form === 'none' && (
        <p className="muted">No shared budgets yet. Create one or join with a code.</p>
      )}

      <div className="shared-budget-cards">
        {budgets.map(b => (
          <button
            key={b.id}
            type="button"
            className="shared-budget-card"
            onClick={() => void openBudget(b.id)}
          >
            <Users className="ui-icon" aria-hidden="true" />
            <span className="shared-budget-name">{b.name}</span>
            <span className="muted">
              {b.monthlyLimit !== null ? `${formatSGD(b.monthlyLimit)}/mo` : 'No limit'}
            </span>
          </button>
        ))}
      </div>

      {form === 'create' && (
        <div className="shared-form">
          <input
            type="text"
            className="note-input"
            placeholder="Budget name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            type="number"
            className="note-input"
            placeholder="Monthly limit (optional)"
            inputMode="decimal"
            value={limit}
            onChange={e => setLimit(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || name.trim().length === 0}
            onClick={() =>
              void submit(() =>
                createBudget(name.trim(), limit.trim() === '' ? null : parseFloat(limit)),
              )
            }
          >
            Create
          </button>
        </div>
      )}

      {form === 'join' && (
        <div className="shared-form">
          <input
            type="text"
            className="note-input"
            placeholder="Invite code"
            autoCapitalize="characters"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || code.trim().length === 0}
            onClick={() => void submit(() => joinBudget(code.trim()))}
          >
            Join
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {form === 'none' ? (
        <div className="shared-actions">
          <button type="button" className="save-btn" onClick={() => setForm('create')}>
            New budget
          </button>
          <button type="button" className="save-btn" onClick={() => setForm('join')}>
            Join with code
          </button>
        </div>
      ) : (
        <button type="button" className="link-btn" onClick={() => setForm('none')}>
          Cancel
        </button>
      )}

      <button type="button" className="link-btn shared-signout" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
