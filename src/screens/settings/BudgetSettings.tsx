// src/screens/settings/BudgetSettings.tsx
import { useState } from 'react'
import { Pencil, Plus, Save, Trash2, Wallet } from 'lucide-react'
import BudgetIcon from '../../components/BudgetIcon'
import SettingsHeader from './SettingsHeader'
import CategoryEditorForm, { type CategoryEditorResult } from './CategoryEditorForm'
import SharedBudgetSettings from './SharedBudgetSettings'
import { parseOptionalBudget } from './parseOptionalBudget'
import {
  getBudgetConfig,
  saveBudgetConfig,
  getCustomCategories,
  saveCustomCategories,
  getCategoryOverrides,
  saveCategoryOverrides,
  makeCustomCategoryId,
} from '../../storage'
import { categoryIcon, categoryLabel } from '../../categoryDisplay'
import { formatSGD } from '../../format'
import { countEntriesForCategory } from '../../compute'
import { useEntries } from '../../EntriesContext'
import { CATEGORY_LABELS } from '../../types'
import type { BudgetConfig, Category, CategoryOverride, CustomCategory } from '../../types'
import { useSharedBudgets } from '../../sharedBudgets/SharedBudgetsContext'

interface Props {
  onDone: () => void
}

type BudgetFieldKey = Exclude<keyof BudgetConfig, 'monthlyIncome' | 'others'>

const BUDGET_FIELDS: Array<{ key: BudgetFieldKey; label: string }> = [
  { key: 'lunch', label: 'Lunch' },
  { key: 'transport', label: 'Transport' },
  { key: 'savings', label: 'Savings' },
  { key: 'investments', label: 'Investments' },
  { key: 'buffer', label: 'Buffer' },
]

// Basic categories the user can rename / re-icon. Buffer is a computed budget
// concept, not a tag, so it stays fixed.
const EDITABLE_BASICS = new Set<string>(['lunch', 'transport', 'savings', 'investments'])

export default function BudgetSettings({ onDone }: Props) {
  const [scope, setScope] = useState<'personal' | 'shared'>('personal')
  const [config, setConfig] = useState<BudgetConfig>(getBudgetConfig)
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(getCustomCategories)
  const [overrides, setOverrides] = useState(getCategoryOverrides)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const { entries } = useEntries()
  const shared = useSharedBudgets()

  const customTotal = customCategories.reduce((sum, c) => sum + (c.budget ?? 0), 0)
  const total = BUDGET_FIELDS.reduce((sum, field) => sum + config[field.key], 0) + customTotal
  const totalMismatch = Math.abs(total - config.monthlyIncome) > 0.01

  // Budget edits live in local state until Save. Without this the user could edit a field,
  // scroll away to check another, leave the screen, and lose the change with no warning —
  // so track what's actually persisted and let the UI say when they diverge.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ config: getBudgetConfig(), customCategories: getCustomCategories(), overrides: getCategoryOverrides() }),
  )
  const isDirty = JSON.stringify({ config, customCategories, overrides }) !== savedSnapshot

  function persistBudgets() {
    saveBudgetConfig(config)
    saveCustomCategories(customCategories)
    saveCategoryOverrides(overrides)
    setSavedSnapshot(JSON.stringify({ config, customCategories, overrides }))
  }

  // The guard is unconditional: the personal form stays mounted (and dirty) behind the shared
  // tab, so leaving from either scope would discard those edits. `isDirty` is computed from
  // personal state alone, so shared edits never trigger the prompt.
  function handleBack() {
    if (isDirty && !confirm('You have unsaved budget changes. Leave without saving?')) return
    onDone()
  }

  // A remove error belongs to the row it was raised on; don't let it linger (hidden behind the
  // shared tab, or above an unrelated open editor) and resurface as a stale complaint.
  function changeScope(next: 'personal' | 'shared') {
    setScope(next)
    setRemoveError('')
  }

  function handleChange(key: keyof BudgetConfig, value: string) {
    const nextValue = Math.max(0, parseFloat(value) || 0)
    setConfig(currentConfig => ({
      ...currentConfig,
      [key]: nextValue,
      ...(key === 'buffer' ? { others: nextValue } : {}),
    }))
  }

  // Only store an override when the display actually differs from the built-in
  // default, so clearing an edit prunes the entry and keeps storage tidy.
  function saveBasicEdit(key: Category, { label, icon }: CategoryEditorResult) {
    const override: CategoryOverride = {}
    if (label && label !== CATEGORY_LABELS[key]) override.label = label
    if (icon && icon !== key) override.icon = icon
    const next = { ...overrides }
    if (Object.keys(override).length > 0) next[key] = override
    else delete next[key]
    setOverrides(next)
    setEditingId(null)
  }

  function saveCustomEdit(cat: CustomCategory, { label, icon }: CategoryEditorResult) {
    setCustomCategories(prev =>
      prev.map(c => (c.id === cat.id ? { ...c, label, icon: icon || c.icon } : c)),
    )
    setEditingId(null)
  }

  function handleAddCategory({ label, icon, budget }: CategoryEditorResult) {
    setCustomCategories(prev => [
      ...prev,
      { id: makeCustomCategoryId(label), label, budget: parseOptionalBudget(budget), icon },
    ])
    setShowAdd(false)
  }

  function handleCustomBudgetChange(id: string, value: string) {
    const budget = parseOptionalBudget(value)
    setCustomCategories(prev => prev.map(c => (c.id === id ? { ...c, budget } : c)))
  }

  function handleRemoveCategory(cat: CustomCategory) {
    const count = countEntriesForCategory(entries, cat.id)
    if (count > 0) {
      setRemoveError(`${count} entr${count === 1 ? 'y' : 'ies'} use "${cat.label}". Re-tag or delete them first.`)
      return
    }
    setRemoveError('')
    setCustomCategories(prev => prev.filter(c => c.id !== cat.id))
  }

  return (
    <>
      <SettingsHeader title="Budget" backLabel="Settings" onBack={handleBack} />

      {shared.budgets.length > 0 && (
        <div className="scope-switch" role="group" aria-label="Settings scope">
          <button
            type="button"
            className={scope === 'personal' ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
            onClick={() => changeScope('personal')}
          >
            Personal
          </button>
          <button
            type="button"
            className={scope === 'shared' ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'}
            onClick={() => changeScope('shared')}
          >
            Shared
          </button>
        </div>
      )}

      {scope === 'shared' ? (
        <SharedBudgetSettings onSaved={onDone} />
      ) : (
        <>
          <h3 className="section-title">Income</h3>

          <div className="ios-list">
            <div className="settings-row">
              <label className="settings-label icon-label" htmlFor="budget-monthly-income">
                <Wallet className="ui-icon" aria-hidden="true" strokeWidth={2.2} />
                Monthly income
              </label>
              <input
                id="budget-monthly-income"
                type="number"
                className="settings-input"
                value={config.monthlyIncome}
                min="0"
                step="1"
                inputMode="decimal"
                onChange={event => handleChange('monthlyIncome', event.target.value)}
              />
            </div>
          </div>

          <h3 className="section-title">Monthly Budgets (S$)</h3>

          <div className="ios-list">
            {BUDGET_FIELDS.map(({ key, label }) => {
              const editable = EDITABLE_BASICS.has(key)
              const displayLabel = editable ? categoryLabel(key, overrides) : label
              const displayIcon = editable ? categoryIcon(key, overrides) : key
              return (
                <div key={key}>
                  <div className="settings-row">
                    <label className="settings-label icon-label" htmlFor={`budget-${key}`}>
                      <BudgetIcon name={displayIcon} />
                      {displayLabel}
                    </label>
                    <div className="settings-row-trailing">
                      <input
                        id={`budget-${key}`}
                        type="number"
                        className="settings-input"
                        value={config[key]}
                        min="0"
                        step="1"
                        inputMode="decimal"
                        onChange={event => handleChange(key, event.target.value)}
                      />
                      {editable && (
                        <button
                          type="button"
                          className="category-edit-btn"
                          aria-label={`Edit ${displayLabel}`}
                          onClick={() => setEditingId(key)}
                        >
                          <Pencil size={16} strokeWidth={2.3} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {editingId === key && (
                    <CategoryEditorForm
                      idPrefix="edit-cat"
                      initialLabel={categoryLabel(key, overrides)}
                      initialIcon={categoryIcon(key, overrides)}
                      doneLabel="Done"
                      onDone={result => saveBasicEdit(key as Category, result)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {customCategories.length > 0 && (
            <div className="ios-list">
              {customCategories.map(cat => (
                <div key={cat.id}>
                  <div className="settings-row">
                    <label className="settings-label icon-label" htmlFor={`custom-${cat.id}`}>
                      <BudgetIcon name={cat.icon} />
                      {cat.label}
                    </label>
                    <div className="settings-row-trailing">
                      <input
                        id={`custom-${cat.id}`}
                        type="number"
                        className="settings-input"
                        value={cat.budget ?? ''}
                        placeholder="No budget"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        onChange={event => handleCustomBudgetChange(cat.id, event.target.value)}
                      />
                      <button
                        type="button"
                        className="category-edit-btn"
                        aria-label={`Edit ${cat.label}`}
                        onClick={() => setEditingId(cat.id)}
                      >
                        <Pencil size={16} strokeWidth={2.3} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="category-remove-btn"
                        aria-label={`Remove ${cat.label}`}
                        onClick={() => handleRemoveCategory(cat)}
                      >
                        <Trash2 size={16} strokeWidth={2.3} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {editingId === cat.id && (
                    <CategoryEditorForm
                      idPrefix="edit-cat"
                      initialLabel={cat.label}
                      initialIcon={cat.icon}
                      doneLabel="Done"
                      onDone={result => saveCustomEdit(cat, result)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {showAdd ? (
            <CategoryEditorForm
              idPrefix="new-cat"
              withBudget
              doneLabel="Add"
              onDone={handleAddCategory}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button type="button" className="export-btn" onClick={() => setShowAdd(true)}>
              <Plus aria-hidden="true" size={18} strokeWidth={2.3} />
              Add category
            </button>
          )}

          {removeError && (
            <p className="save-feedback save-feedback--error" role="status">{removeError}</p>
          )}

          <div className="settings-total">
            Total: {formatSGD(total)}
            {totalMismatch && (
              <span className="settings-total-warning">&ne; {formatSGD(config.monthlyIncome)}</span>
            )}
          </div>

          {/* Only appears once there is something to save, and stays reachable without scrolling
              back to find it. */}
          {isDirty && (
            <div className="settings-save-bar" role="region" aria-label="Unsaved changes">
              <span className="settings-save-bar__note">Unsaved changes</span>
              <button className="save-btn settings-save-bar__btn" type="button" onClick={persistBudgets}>
                <Save aria-hidden="true" size={18} strokeWidth={2.3} />
                Save changes
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
