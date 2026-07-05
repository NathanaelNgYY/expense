import { useState } from 'react'
import { useSharedBudgets } from './SharedBudgetsContext'

export default function OwnerTools() {
  const {
    active,
    regenerateCode,
    removeMember,
    updateActiveBudget,
    deleteActiveBudget,
    addCategory,
  } = useSharedBudgets()
  const [name, setName] = useState(active?.budget.name ?? '')
  const [limit, setLimit] = useState(
    active && active.budget.monthlyLimit !== null ? String(active.budget.monthlyLimit) : '',
  )
  const [newCategory, setNewCategory] = useState('')
  const [busy, setBusy] = useState(false)

  if (!active) return null
  const { budget, members } = active

  async function guard(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch {
      // Context exposes the operation error.
    } finally {
      setBusy(false)
    }
  }

  function share() {
    const message = `Join my "${budget.name}" budget on ${window.location.origin} with code ${budget.inviteCode}`
    if (navigator.share) {
      void navigator.share({ text: message }).catch(() => {})
      return
    }
    if (navigator.clipboard) void navigator.clipboard.writeText(message)
  }

  return (
    <div className="owner-tools">
      <p className="category-label">Invite</p>
      <div className="invite-row">
        <span className="invite-code">{budget.inviteCode}</span>
        <button type="button" className="save-btn" onClick={share}>
          Share
        </button>
        <button
          type="button"
          className="save-btn"
          disabled={busy}
          onClick={() => void guard(() => regenerateCode())}
        >
          New code
        </button>
      </div>

      <p className="category-label">Members</p>
      {members.map(m => (
        <div key={m.userId} className="member-row">
          <span>
            {m.displayName} {m.role === 'owner' && <span className="muted">(owner)</span>}
          </span>
          {m.role !== 'owner' && (
            <button
              type="button"
              className="link-btn"
              disabled={busy}
              onClick={() => void guard(() => removeMember(m.userId))}
            >
              Remove {m.displayName}
            </button>
          )}
        </div>
      ))}

      <p className="category-label">Categories</p>
      <div className="shared-form">
        <input
          type="text"
          className="note-input"
          placeholder="New category"
          value={newCategory}
          onChange={e => setNewCategory(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || newCategory.trim().length === 0}
          onClick={() =>
            void guard(async () => {
              await addCategory({ label: newCategory.trim(), budgetAmount: null, icon: 'others' })
              setNewCategory('')
            })
          }
        >
          Add category
        </button>
      </div>

      <p className="category-label">Settings</p>
      <div className="shared-form">
        <input
          type="text"
          className="note-input"
          aria-label="Budget name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="number"
          className="note-input"
          aria-label="Monthly limit"
          inputMode="decimal"
          placeholder="Monthly limit (optional)"
          value={limit}
          onChange={e => setLimit(e.target.value)}
        />
        <button
          type="button"
          className="save-btn"
          disabled={busy || name.trim().length === 0}
          onClick={() =>
            void guard(() =>
              updateActiveBudget({
                name: name.trim(),
                monthlyLimit: limit.trim() === '' ? null : parseFloat(limit),
              }),
            )
          }
        >
          Save settings
        </button>
      </div>

      <button
        type="button"
        className="danger-btn"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete "${budget.name}" for everyone? This cannot be undone.`)) {
            void guard(() => deleteActiveBudget())
          }
        }}
      >
        Delete budget
      </button>
    </div>
  )
}
