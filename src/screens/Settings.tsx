// src/screens/Settings.tsx
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ChevronLeft, Download, Pencil, Plus, Save, Trash2, Upload, Wallet } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { CUSTOM_ICON_NAMES } from '../components/budgetIcons'
import { entriesToCsv, parseEntriesCsv } from '../csvEntries'
import {
  getBudgetConfig,
  saveBudgetConfig,
  getCustomCategories,
  saveCustomCategories,
  getCategoryOverrides,
  saveCategoryOverrides,
  makeCustomCategoryId,
} from '../storage'
import { categoryIcon, categoryLabel } from '../categoryDisplay'
import { countEntriesForCategory } from '../compute'
import { getApiToken, setApiToken } from '../api'
import { useEntries } from '../EntriesContext'
import { CATEGORY_LABELS } from '../types'
import type { BudgetConfig, Category, CategoryOverride, CustomCategory } from '../types'
import { useSharedBudgets } from '../sharedBudgets/SharedBudgetsContext'
import ThemePicker from '../theme/ThemePicker'

interface Props {
  onBack: () => void
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

function isEntryInMonth(date: string, year: number, month: number): boolean {
  const [entryYear, entryMonth] = date.split('-').map(Number)
  return entryYear === year && entryMonth === month + 1
}

export default function Settings({ onBack }: Props) {
  const [config, setConfig] = useState<BudgetConfig>(getBudgetConfig)
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(getCustomCategories)
  const [overrides, setOverrides] = useState(getCategoryOverrides)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newIcon, setNewIcon] = useState<string>(CUSTOM_ICON_NAMES[0])
  const [removeError, setRemoveError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState(false)
  const [token, setToken] = useState(getApiToken())
  const [settingsScope, setSettingsScope] = useState<'personal' | 'shared'>('personal')
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null)
  const [sharedLimit, setSharedLimit] = useState('')
  const [sharedCategoryBudgets, setSharedCategoryBudgets] = useState<Record<string, string>>({})
  const [showSharedAdd, setShowSharedAdd] = useState(false)
  const [sharedNewLabel, setSharedNewLabel] = useState('')
  const [sharedNewBudget, setSharedNewBudget] = useState('')
  const [sharedNewIcon, setSharedNewIcon] = useState<string>(CUSTOM_ICON_NAMES[0])
  const [sharedBusy, setSharedBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const { entries, addEntry, removeEntry, refresh } = useEntries()
  const shared = useSharedBudgets()

  const customTotal = customCategories.reduce((sum, c) => sum + (c.budget ?? 0), 0)
  const total = BUDGET_FIELDS.reduce((sum, field) => sum + config[field.key], 0) + customTotal
  const totalMismatch = Math.abs(total - config.monthlyIncome) > 0.01
  const selectedSharedBudgetId =
    selectedBudgetId ?? shared.active?.budget.id ?? shared.budgets[0]?.id ?? null
  const activeSharedReady =
    selectedSharedBudgetId !== null && shared.active?.budget.id === selectedSharedBudgetId
  const isSharedOwner = Boolean(shared.active && shared.session?.user.id === shared.active.budget.ownerId)

  useEffect(() => {
    if (settingsScope !== 'shared' || !selectedSharedBudgetId || activeSharedReady) return
    void shared.openBudget(selectedSharedBudgetId).catch(() => {})
  }, [activeSharedReady, selectedSharedBudgetId, settingsScope, shared.openBudget])

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

  function handleChange(key: keyof BudgetConfig, value: string) {
    const nextValue = Math.max(0, parseFloat(value) || 0)
    setConfig(currentConfig => ({
      ...currentConfig,
      [key]: nextValue,
      ...(key === 'buffer' ? { others: nextValue } : {}),
    }))
  }

  function handleSave() {
    saveBudgetConfig(config)
    saveCustomCategories(customCategories)
    saveCategoryOverrides(overrides)
    onBack()
  }

  function startEditBasic(key: Category) {
    setEditingId(key)
    setEditLabel(categoryLabel(key, overrides))
    setEditIcon(categoryIcon(key, overrides))
  }

  function startEditCustom(cat: CustomCategory) {
    setEditingId(cat.id)
    setEditLabel(cat.label)
    setEditIcon(cat.icon)
  }

  // Only store an override when the display actually differs from the built-in
  // default, so clearing an edit prunes the entry and keeps storage tidy.
  function saveBasicEdit(key: Category) {
    const label = editLabel.trim()
    const override: CategoryOverride = {}
    if (label && label !== CATEGORY_LABELS[key]) override.label = label
    if (editIcon && editIcon !== key) override.icon = editIcon
    const next = { ...overrides }
    if (Object.keys(override).length > 0) next[key] = override
    else delete next[key]
    setOverrides(next)
    setEditingId(null)
  }

  function saveCustomEdit(cat: CustomCategory) {
    const label = editLabel.trim()
    if (!label) return
    setCustomCategories(prev =>
      prev.map(c => (c.id === cat.id ? { ...c, label, icon: editIcon || c.icon } : c)),
    )
    setEditingId(null)
  }

  function handleAddCategory() {
    const label = newLabel.trim()
    if (!label) return
    const trimmed = newBudget.trim()
    const budget = trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
    setCustomCategories(prev => [...prev, { id: makeCustomCategoryId(label), label, budget, icon: newIcon }])
    setNewLabel('')
    setNewBudget('')
    setNewIcon(CUSTOM_ICON_NAMES[0])
    setShowAdd(false)
  }

  function parseOptionalBudget(value: string): number | null {
    const trimmed = value.trim()
    return trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
  }

  async function handleAddSharedCategory() {
    const label = sharedNewLabel.trim()
    if (!label) return
    setSharedBusy(true)
    try {
      await shared.addCategory({
        label,
        budgetAmount: parseOptionalBudget(sharedNewBudget),
        icon: sharedNewIcon,
      })
      setSharedNewLabel('')
      setSharedNewBudget('')
      setSharedNewIcon(CUSTOM_ICON_NAMES[0])
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
      onBack()
    } catch {
      // Shared context exposes the operation error.
    } finally {
      setSharedBusy(false)
    }
  }

  function handleCustomBudgetChange(id: string, value: string) {
    const trimmed = value.trim()
    const budget = trimmed === '' ? null : Math.max(0, parseFloat(trimmed) || 0)
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

  async function handleReset() {
    if (!confirm("Delete all entries for the current month? This can't be undone.")) return

    const now = new Date()
    const toRemove = entries.filter(entry =>
      isEntryInMonth(entry.date, now.getFullYear(), now.getMonth()),
    )
    for (const entry of toRemove) {
      await removeEntry(entry.id)
    }
  }

  function handleExport() {
    const blob = new Blob([entriesToCsv(entries)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'budget-entries.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (!file) return

    try {
      const importedEntries = parseEntriesCsv(await file.text())
      const existingIds = new Set(entries.map(e => e.id))
      const newEntries = importedEntries.filter(e => !existingIds.has(e.id))
      const duplicateCount = importedEntries.length - newEntries.length

      for (const e of newEntries) {
        await addEntry({ id: e.id, amount: e.amount, category: e.category, note: e.note, date: e.date })
      }

      setImportError(false)
      setImportMessage(
        newEntries.length === 0
          ? `No new entries imported. ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`
          : `Imported ${newEntries.length} entr${newEntries.length === 1 ? 'y' : 'ies'}.`,
      )

      if (newEntries.length > 0) {
        onBack()
      }
    } catch (error) {
      setImportError(true)
      setImportMessage(error instanceof Error ? error.message : 'Could not import this CSV file.')
    }
  }

  function renderCategoryEditor(onDone: () => void) {
    return (
      <div className="ios-list category-add-form">
        <div className="settings-row">
          <label className="settings-label" htmlFor="edit-cat-name">Category name</label>
          <input
            id="edit-cat-name"
            type="text"
            className="settings-input"
            value={editLabel}
            onChange={event => setEditLabel(event.target.value)}
          />
        </div>
        <div className="icon-picker" role="group" aria-label="Choose an icon">
          {CUSTOM_ICON_NAMES.map(name => (
            <button
              key={name}
              type="button"
              className={`icon-picker-btn ${editIcon === name ? 'icon-picker-btn--selected' : ''}`}
              aria-label={`Icon ${name}`}
              aria-pressed={editIcon === name}
              onClick={() => setEditIcon(name)}
            >
              <BudgetIcon name={name} />
            </button>
          ))}
        </div>
        <div className="category-add-actions">
          <button type="button" className="save-btn" onClick={onDone} disabled={!editLabel.trim()}>Done</button>
          <button type="button" className="export-btn" onClick={() => setEditingId(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen settings">
      <div className="settings-header">
        <button className="back-btn" type="button" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={21} strokeWidth={2.4} />
          Back
        </button>
        <h2 className="settings-title">Settings</h2>
        <div className="settings-header-spacer" />
      </div>

      <ThemePicker />

      {shared.budgets.length > 0 && (
        <div className="scope-switch" role="group" aria-label="Settings scope">
          <button
            type="button"
            className={
              settingsScope === 'personal' ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'
            }
            onClick={() => setSettingsScope('personal')}
          >
            Personal
          </button>
          <button
            type="button"
            className={
              settingsScope === 'shared' ? 'scope-switch-btn scope-switch-btn--active' : 'scope-switch-btn'
            }
            onClick={() => setSettingsScope('shared')}
          >
            Shared
          </button>
        </div>
      )}

      {settingsScope === 'shared' ? (
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
                <div className="ios-list category-add-form">
                  <div className="settings-row">
                    <label className="settings-label" htmlFor="shared-new-cat-name">Category name</label>
                    <input
                      id="shared-new-cat-name"
                      type="text"
                      className="settings-input"
                      value={sharedNewLabel}
                      onChange={event => setSharedNewLabel(event.target.value)}
                    />
                  </div>
                  <div className="settings-row">
                    <label className="settings-label" htmlFor="shared-new-cat-budget">Category budget</label>
                    <input
                      id="shared-new-cat-budget"
                      type="number"
                      className="settings-input"
                      value={sharedNewBudget}
                      placeholder="Optional"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      onChange={event => setSharedNewBudget(event.target.value)}
                    />
                  </div>
                  <div className="icon-picker" role="group" aria-label="Choose an icon">
                    {CUSTOM_ICON_NAMES.map(name => (
                      <button
                        key={name}
                        type="button"
                        className={`icon-picker-btn ${sharedNewIcon === name ? 'icon-picker-btn--selected' : ''}`}
                        aria-label={`Icon ${name}`}
                        aria-pressed={sharedNewIcon === name}
                        onClick={() => setSharedNewIcon(name)}
                      >
                        <BudgetIcon name={name} />
                      </button>
                    ))}
                  </div>
                  <div className="category-add-actions">
                    <button
                      type="button"
                      className="save-btn"
                      onClick={() => void handleAddSharedCategory()}
                      disabled={sharedBusy || !sharedNewLabel.trim()}
                    >
                      Add
                    </button>
                    <button type="button" className="export-btn" onClick={() => setShowSharedAdd(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
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
                      onClick={() => startEditBasic(key as Category)}
                    >
                      <Pencil size={16} strokeWidth={2.3} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {editingId === key && renderCategoryEditor(() => saveBasicEdit(key as Category))}
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
                    onClick={() => startEditCustom(cat)}
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
              {editingId === cat.id && renderCategoryEditor(() => saveCustomEdit(cat))}
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="ios-list category-add-form">
          <div className="settings-row">
            <label className="settings-label" htmlFor="new-cat-name">Category name</label>
            <input
              id="new-cat-name"
              type="text"
              className="settings-input"
              value={newLabel}
              onChange={event => setNewLabel(event.target.value)}
            />
          </div>
          <div className="settings-row">
            <label className="settings-label" htmlFor="new-cat-budget">Category budget</label>
            <input
              id="new-cat-budget"
              type="number"
              className="settings-input"
              value={newBudget}
              placeholder="Optional"
              min="0"
              step="1"
              inputMode="decimal"
              onChange={event => setNewBudget(event.target.value)}
            />
          </div>
          <div className="icon-picker" role="group" aria-label="Choose an icon">
            {CUSTOM_ICON_NAMES.map(name => (
              <button
                key={name}
                type="button"
                className={`icon-picker-btn ${newIcon === name ? 'icon-picker-btn--selected' : ''}`}
                aria-label={`Icon ${name}`}
                aria-pressed={newIcon === name}
                onClick={() => setNewIcon(name)}
              >
                <BudgetIcon name={name} />
              </button>
            ))}
          </div>
          <div className="category-add-actions">
            <button type="button" className="save-btn" onClick={handleAddCategory} disabled={!newLabel.trim()}>Add</button>
            <button type="button" className="export-btn" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
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
        Total: S${total.toFixed(2)}
        {totalMismatch && (
          <span className="settings-total-warning">!= S${config.monthlyIncome.toFixed(2)}</span>
        )}
      </div>

      <button className="save-btn" type="button" onClick={handleSave}>
        <Save aria-hidden="true" size={18} strokeWidth={2.3} />
        Save Budgets
      </button>

      <div className="settings-divider" />

      <h3 className="section-title">API</h3>

      <label>API token
        <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Bearer token" />
      </label>
      <button type="button" onClick={() => { setApiToken(token); void refresh() }}>Save token</button>

      <div className="settings-divider" />

      <button className="export-btn" type="button" onClick={handleExport}>
        <Download aria-hidden="true" size={18} strokeWidth={2.3} />
        Export as CSV
      </button>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={handleImportFile}
      />
      <button
        className="export-btn"
        type="button"
        onClick={() => importInputRef.current?.click()}
      >
        <Upload aria-hidden="true" size={18} strokeWidth={2.3} />
        Import CSV
      </button>
      {importMessage && (
        <p className={`save-feedback ${importError ? 'save-feedback--error' : ''}`} role="status">
          {importMessage}
        </p>
      )}
      <button className="danger-btn" type="button" onClick={handleReset}>
        <Trash2 aria-hidden="true" size={18} strokeWidth={2.3} />
        Reset This Month&apos;s Data
      </button>
        </>
      )}
    </div>
  )
}
