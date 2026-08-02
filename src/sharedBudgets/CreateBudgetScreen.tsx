// src/sharedBudgets/CreateBudgetScreen.tsx
// Step one of the create flow, pushed over the list the way Settings pushes its
// subscreens. A whole screen buys room for real labels, a hint that explains
// what a blank limit means, and a preview of the card being made, none of which
// fit when the form shared space with the budget list.

import { useState } from 'react'
import SettingsHeader from '../screens/settings/SettingsHeader'
import { parseOptionalBudget } from '../screens/settings/parseOptionalBudget'
import { formatSGD } from '../format'
import { useSharedBudgets } from './SharedBudgetsContext'
import type { SharedBudget } from './types'

interface Props {
  onCancel: () => void
  onCreated: (budget: SharedBudget) => void
}

export default function CreateBudgetScreen({ onCancel, onCreated }: Props) {
  const { createBudget, error } = useSharedBudgets()
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const trimmedName = name.trim()
  const previewLimit = parseOptionalBudget(limit)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // Validate on submit rather than disabling the button, so the reason the
    // form will not go through is always stated instead of merely implied.
    if (trimmedName === '') {
      setNameError('Give the budget a name so people recognise it.')
      return
    }
    setNameError(null)
    setBusy(true)
    try {
      onCreated(await createBudget(trimmedName, previewLimit))
    } catch {
      // The context surfaces the operation error; the fields keep their values.
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="screen shared-subscreen" onSubmit={event => void handleSubmit(event)}>
      <SettingsHeader title="New budget" backLabel="Shared" onBack={onCancel} />

      <div className="shared-field">
        <label className="shared-field-label" htmlFor="new-budget-name">
          Name
        </label>
        <input
          id="new-budget-name"
          type="text"
          className="note-input"
          placeholder="Budget name"
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={nameError !== null}
          aria-describedby={nameError ? 'new-budget-name-error' : undefined}
          value={name}
          onChange={event => {
            setName(event.target.value)
            if (nameError) setNameError(null)
          }}
        />
        {nameError && (
          <p className="shared-field-error" id="new-budget-name-error">
            {nameError}
          </p>
        )}
      </div>

      <div className="shared-field">
        <label className="shared-field-label" htmlFor="new-budget-limit">
          Monthly limit <span className="shared-field-optional">Optional</span>
        </label>
        <div className="amount-field">
          <span className="amount-field-prefix" aria-hidden="true">
            S$
          </span>
          <input
            id="new-budget-limit"
            type="number"
            className="note-input amount-field-input"
            placeholder="Monthly limit (optional)"
            inputMode="decimal"
            min="0"
            step="1"
            enterKeyHint="done"
            aria-describedby="new-budget-limit-hint"
            value={limit}
            onChange={event => setLimit(event.target.value)}
          />
        </div>
        <p className="shared-field-hint" id="new-budget-limit-hint">
          Leave blank to track spending with no cap.
        </p>
      </div>

      <p className="category-label">Preview</p>
      <div className="shared-preview-card">
        <span className="shared-preview-name">{trimmedName || 'Untitled budget'}</span>
        <span className="shared-preview-amount">
          {previewLimit === null ? 'No limit' : formatSGD(previewLimit)}
        </span>
        <span className="shared-preview-sub">
          {previewLimit === null ? 'Tracked without a cap' : 'per month'}. You are the owner.
        </span>
      </div>

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="save-btn shared-pinned-action" disabled={busy}>
        {busy ? 'Creating budget' : 'Create budget'}
      </button>
    </form>
  )
}
