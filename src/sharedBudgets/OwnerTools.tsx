import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import { formatHash } from '../router'
import { parseOptionalBudget } from '../screens/settings/parseOptionalBudget'
import { inviteMessage } from './inviteCode'
import { useSharedBudgets } from './SharedBudgetsContext'

export default function OwnerTools() {
  const { active, regenerateCode, removeMember, updateActiveBudget, deleteActiveBudget } =
    useSharedBudgets()
  const confirm = useConfirm()
  const [name, setName] = useState(active?.budget.name ?? '')
  const [limit, setLimit] = useState(
    active && active.budget.monthlyLimit !== null ? String(active.budget.monthlyLimit) : '',
  )
  const [busy, setBusy] = useState(false)

  if (!active) return null
  const { budget, members } = active
  const categoryCount = active.categories.length

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

  async function handleDelete() {
    if (
      !(await confirm({
        title: `Delete "${budget.name}" for everyone?`,
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return
    void guard(() => deleteActiveBudget())
  }

  function share() {
    const message = inviteMessage(budget, window.location.origin)
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

      {/* Categories are edited in Settings > Shared budgets, which reuses the
          same CategoryEditorForm as the personal budget: icon picker, per
          category budget, rename, and a delete that warns how many entries it
          will uncategorise. This screen used to carry a second, thinner creator
          (one text box, icon hardcoded to 'others', no budget, no edit or
          delete) writing to the same table. Two editors for one thing is one
          too many, so this links to the good one. */}
      <p className="category-label">Categories</p>
      <button
        type="button"
        className="settings-nav-row"
        onClick={() => {
          window.location.hash = formatHash({ tab: 'settings', sub: 'shared' })
        }}
      >
        <SlidersHorizontal className="ui-icon" aria-hidden="true" size={20} />
        <span className="settings-row-text">
          <span>
            {categoryCount === 0
              ? 'Set up categories'
              : `${categoryCount} ${categoryCount === 1 ? 'category' : 'categories'}`}
          </span>
          <span className="settings-row-sub">Add, rename, and set category budgets</span>
        </span>
        <ChevronRight className="settings-nav-chevron" aria-hidden="true" size={18} />
      </button>

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
                // Same clamping rule as the personal and shared budget editors:
                // blank means "no limit", never zero, and negatives cannot slip through.
                monthlyLimit: parseOptionalBudget(limit),
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
        onClick={() => void handleDelete()}
      >
        Delete budget
      </button>
    </div>
  )
}
