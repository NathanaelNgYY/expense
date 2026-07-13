// src/screens/settings/SharedBudgetSettings.tsx
import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, Wallet } from 'lucide-react'
import BudgetIcon from '../../components/BudgetIcon'
import CategoryEditorForm, { type CategoryEditorResult } from './CategoryEditorForm'
import { parseOptionalBudget } from './parseOptionalBudget'
import { useSharedBudgets } from '../../sharedBudgets/SharedBudgetsContext'

interface Props {
  onSaved: () => void
}

export default function SharedBudgetSettings({ onSaved }: Props) {
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [sharedLimit, setSharedLimit] = useState('')
  const [sharedCategoryBudgets, setSharedCategoryBudgets] = useState<Record<string, string>>({})
  const [showSharedAdd, setShowSharedAdd] = useState(false)
  const [sharedBusy, setSharedBusy] = useState(false)
  const shared = useSharedBudgets()
  const { openBudget } = shared

  const selectedSharedBudgetId =
    selectedBudgetId ?? shared.active?.budget.id ?? shared.budgets[0]?.id ?? null
  const activeSharedReady =
    selectedSharedBudgetId !== null && shared.active?.budget.id === selectedSharedBudgetId
  const isSharedOwner = Boolean(shared.active && shared.session?.user.id === shared.active.budget.ownerId)

  useEffect(() => {
    if (!selectedSharedBudgetId || activeSharedReady) return
    void openBudget(selectedSharedBudgetId).catch(() => {})
  }, [activeSharedReady, selectedSharedBudgetId, openBudget])

  // Re-seed the editable limit/category-budget fields whenever a different budget snapshot
  // loads. Adjusting state during render (guarded on the previous snapshot) is React's
  // recommended alternative to a syncing effect and avoids a flash of stale field values.
  const [syncedActive, setSyncedActive] = useState<typeof shared.active>(null)
  if (shared.active && shared.active !== syncedActive) {
    setSyncedActive(shared.active)
    setSharedLimit(
      shared.active.budget.monthlyLimit === null ? '' : String(shared.active.budget.monthlyLimit),
    )
    setSharedCategoryBudgets(
      Object.fromEntries(
        shared.active.categories.map(category => [
          category.id,
          category.budgetAmount === null ? '' : String(category.budgetAmount),
        ]),
      ),
    )
  }

  async function handleAddSharedCategory({ label, icon, budget }: CategoryEditorResult) {
    setSharedBusy(true)
    try {
      await shared.addCategory({ label, budgetAmount: parseOptionalBudget(budget), icon })
      setShowSharedAdd(false)
    } catch {
      // Shared context exposes the operation error.
    } finally {
      setSharedBusy(false)
    }
  }

  async function handleSaveShared() {
    if (!shared.active || !isSharedOwner) return
    setSharedBusy(true)
    try {
      await shared.updateActiveBudget({ monthlyLimit: parseOptionalBudget(sharedLimit) })
      for (const category of shared.active.categories) {
        const nextBudget = parseOptionalBudget(sharedCategoryBudgets[category.id] ?? '')
        if (nextBudget !== category.budgetAmount) {
          await shared.updateCategory(category.id, { budgetAmount: nextBudget })
        }
      }
      onSaved()
    } catch {
      // Shared context exposes the operation error.
    } finally {
      setSharedBusy(false)
    }
  }

  return (
    <>
      {shared.budgets.length > 1 && (
        <div className="scope-switch scope-switch--compact" role="group" aria-label="Shared budget">
          {shared.budgets.map(budget => (
            <button
              key={budget.id}
              type="button"
              className={
                selectedSharedBudgetId === budget.id
                  ? 'scope-switch-btn scope-switch-btn--active'
                  : 'scope-switch-btn'
              }
              onClick={() => setSelectedBudgetId(budget.id)}
            >
              {budget.name}
            </button>
          ))}
        </div>
      )}

      {!activeSharedReady || !shared.active ? (
        <p className="muted">Loading shared budget settings...</p>
      ) : !isSharedOwner ? (
        <p className="muted">Only the budget owner can change shared budget settings.</p>
      ) : (
        <>
          <h3 className="section-title">{shared.active.budget.name}</h3>
          <div className="ios-list">
            <div className="settings-row">
              <label className="settings-label icon-label" htmlFor="shared-monthly-limit">
                <Wallet className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
                Monthly limit
              </label>
              <input
                id="shared-monthly-limit"
                type="number"
                className="settings-input"
                value={sharedLimit}
                placeholder="No limit"
                min="0"
                step="1"
                inputMode="decimal"
                onChange={event => setSharedLimit(event.target.value)}
              />
            </div>
          </div>

          <h3 className="section-title">Shared Categories (S$)</h3>
          {shared.active.categories.length > 0 && (
            <div className="ios-list">
              {shared.active.categories.map(category => (
                <div key={category.id} className="settings-row">
                  <label className="settings-label icon-label" htmlFor={`shared-cat-${category.id}`}>
                    <BudgetIcon name={category.icon} />
                    {category.label}
                  </label>
                  <div className="settings-row-trailing">
                    <input
                      id={`shared-cat-${category.id}`}
                      type="number"
                      className="settings-input"
                      value={sharedCategoryBudgets[category.id] ?? ''}
                      placeholder="No budget"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      onChange={event =>
                        setSharedCategoryBudgets(prev => ({
                          ...prev,
                          [category.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="category-remove-btn"
                      aria-label={`Remove ${category.label}`}
                      disabled={sharedBusy}
                      onClick={() => void shared.removeCategory(category.id)}
                    >
                      <Trash2 size={16} strokeWidth={2.3} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showSharedAdd ? (
            <CategoryEditorForm
              idPrefix="shared-new-cat"
              withBudget
              doneLabel="Add"
              busy={sharedBusy}
              onDone={result => void handleAddSharedCategory(result)}
              onCancel={() => setShowSharedAdd(false)}
            />
          ) : (
            <button type="button" className="export-btn" onClick={() => setShowSharedAdd(true)}>
              <Plus aria-hidden="true" size={18} strokeWidth={2.3} />
              Add category
            </button>
          )}

          <div className="settings-total">
            Total: S$
            {shared.active.categories
              .reduce(
                (sum, category) => sum + (parseOptionalBudget(sharedCategoryBudgets[category.id] ?? '') ?? 0),
                0,
              )
              .toFixed(2)}
          </div>

          <button
            className="save-btn"
            type="button"
            disabled={sharedBusy}
            onClick={() => void handleSaveShared()}
          >
            <Save aria-hidden="true" size={18} strokeWidth={2.3} />
            Save Shared Budget
          </button>
        </>
      )}
      {shared.error && <p className="form-error">{shared.error}</p>}
    </>
  )
}
