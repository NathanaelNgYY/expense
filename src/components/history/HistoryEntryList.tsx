import { format } from 'date-fns'
import { Copy, Trash2 } from 'lucide-react'
import BudgetIcon from '../BudgetIcon'
import { fromLocalDateString, isFutureDateString } from '../../dates'
import { formatEntryAmount } from '../../format'
import type { Entry, EntryKind } from '../../types'
import { isRefund } from '../../shared/entryAmount'
import { sourceLabel } from './historyEntryModel'

export interface EditDraft {
  amountText: string
  kind: EntryKind
  category: string | null
  note: string
  date: string
  currency: string
}

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  entries: Entry[]
  monthEntryCount: number
  monthLabel: string
  editingEntryId: string | null
  editDraft: EditDraft | null
  dateMin: string
  dateMax: string
  categoryOptions: CategoryOption[]
  labelForCategory: (id: string) => string
  iconForCategory: (id: string) => string
  confirmingDeleteId: string | null
  onStartEditing: (entry: Entry) => void
  onDraftChange: (draft: Partial<EditDraft>) => void
  onCancelEditing: () => void
  onSave: (entry: Entry) => void
  onDuplicate: (entry: Entry) => void
  onRequestDelete: (id: string) => void
  onCancelDelete: () => void
  onDelete: (entry: Entry) => void
  currencies: string[]
}

export default function HistoryEntryList({
  entries,
  monthEntryCount,
  monthLabel,
  editingEntryId,
  editDraft,
  dateMin,
  dateMax,
  categoryOptions,
  labelForCategory,
  iconForCategory,
  confirmingDeleteId,
  onStartEditing,
  onDraftChange,
  onCancelEditing,
  onSave,
  onDuplicate,
  onRequestDelete,
  onCancelDelete,
  onDelete,
  currencies,
}: Props) {
  if (monthEntryCount === 0) {
    return <div className="empty-state">No entries for {monthLabel} yet.</div>
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        No matching transactions. Try clearing a filter or using a different search.
      </div>
    )
  }

  return (
    <div className="entry-list">
      {entries.map(entry => {
        const isEditing = editingEntryId === entry.id && editDraft
        const editAmount = editDraft ? Number(editDraft.amountText) : Number.NaN
        const canSaveEdit =
          Boolean(editDraft) &&
          Number.isFinite(editAmount) &&
          editAmount > 0 &&
          editDraft!.date >= dateMin &&
          editDraft!.date <= dateMax &&
          !isFutureDateString(editDraft!.date)

        return (
          <div key={entry.id} className="entry-edit-shell">
            <button
              type="button"
              className="entry-row entry-row-button"
              onClick={() => onStartEditing(entry)}
              aria-expanded={Boolean(isEditing)}
            >
              <span className="entry-main">
                <span className="entry-category icon-label">
                  <BudgetIcon name={entry.category ? iconForCategory(entry.category) : 'uncategorized'} />
                  {entry.category ? labelForCategory(entry.category) : 'Uncategorized'}
                </span>
                <span className="entry-date">
                  {format(fromLocalDateString(entry.date), 'EEE, MMM d')} &middot; {sourceLabel(entry)}
                </span>
                {entry.merchant && <span className="entry-merchant">{entry.merchant}</span>}
                {entry.note && <span className="entry-note">{entry.note}</span>}
                {isRefund(entry) && <span className="entry-kind-badge">Refund</span>}
              </span>
              <strong className={`entry-amount${isRefund(entry) ? ' entry-amount--refund' : ''}`}>
                {formatEntryAmount(entry)}
              </strong>
            </button>

            {isEditing && (
              <div className="entry-detail-panel" aria-label="Transaction details">
                <div className="entry-detail-heading">
                  <div>
                    <h4 className="entry-edit-title">Transaction details</h4>
                    <p className="entry-detail-source">
                      {sourceLabel(entry)}{entry.merchant ? ` · ${entry.merchant}` : ''}
                    </p>
                  </div>
                  <strong className={`entry-detail-amount${isRefund(entry) ? ' entry-amount--refund' : ''}`}>
                    {formatEntryAmount(entry)}
                  </strong>
                </div>

                <div className="entry-edit-panel" aria-label="Edit transaction">
                  <div className="scope-switch" role="group" aria-label="Entry type">
                    {(['expense', 'refund'] as const).map(kind => (
                      <button
                        key={kind}
                        type="button"
                        className={editDraft.kind === kind ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
                        aria-pressed={editDraft.kind === kind}
                        onClick={() => onDraftChange({ kind })}
                      >
                        {kind === 'expense' ? 'Expense' : 'Refund'}
                      </button>
                    ))}
                  </div>
                  <div className="field-grid">
                    <label className="form-field" htmlFor="edit-entry-date">
                      <span>Date</span>
                      <span className="date-input-shell">
                        <span className="date-input-value">
                          {format(fromLocalDateString(editDraft.date), 'MMM d, yyyy')}
                        </span>
                        <input
                          id="edit-entry-date"
                          type="date"
                          className="date-input date-input--native"
                          value={editDraft.date}
                          min={dateMin}
                          max={dateMax}
                          onChange={event => onDraftChange({ date: event.target.value })}
                        />
                      </span>
                    </label>
                    <label className="form-field" htmlFor="edit-entry-amount">
                      <span>Amount</span>
                      <input
                        id="edit-entry-amount"
                        type="number"
                        className="amount-input"
                        value={editDraft.amountText}
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        onChange={event => onDraftChange({ amountText: event.target.value })}
                      />
                    </label>
                  </div>

                  <p className="category-label">Category <span className="muted">(optional)</span></p>
                  <div className="chips chips--compact">
                    {categoryOptions.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        className={`chip chip--compact ${editDraft.category === option.id ? 'chip--selected' : ''}`}
                        onClick={() => onDraftChange({
                          category: editDraft.category === option.id ? null : option.id,
                        })}
                      >
                        <BudgetIcon name={option.icon} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>

                  <input
                    id="edit-entry-note"
                    type="text"
                    className="note-input"
                    aria-label="Note (optional)"
                    placeholder="Note (optional)"
                    value={editDraft.note}
                    onChange={event => onDraftChange({ note: event.target.value })}
                  />

                  {currencies.length >= 2 && (
                    <label className="form-field" htmlFor={`edit-entry-wallet-${entry.id}`}>
                      <span>Wallet</span>
                      <select
                        id={`edit-entry-wallet-${entry.id}`}
                        className="settings-input"
                        value={editDraft.currency}
                        onChange={event => onDraftChange({ currency: event.target.value, category: null })}
                      >
                        {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </label>
                  )}

                  <div className="entry-edit-actions">
                    <button className="export-btn" type="button" onClick={onCancelEditing}>Cancel</button>
                    <button
                      className="save-btn history-save-btn"
                      type="button"
                      onClick={() => onSave(entry)}
                      disabled={!canSaveEdit}
                    >
                      Save Changes
                    </button>
                  </div>
                </div>

                <div className="entry-detail-actions">
                  <button type="button" className="export-btn" onClick={() => onDuplicate(entry)}>
                    <Copy size={16} aria-hidden="true" />
                    Duplicate
                  </button>
                  <button type="button" className="entry-delete-btn" onClick={() => onRequestDelete(entry.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Delete
                  </button>
                </div>

                {confirmingDeleteId === entry.id && (
                  <div className="entry-delete-confirm" role="alert">
                    <span>Delete this transaction?</span>
                    <div>
                      <button type="button" onClick={onCancelDelete}>Keep it</button>
                      <button type="button" onClick={() => onDelete(entry)}>Delete transaction</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
