// src/screens/Settings.tsx
import { useState } from 'react'
import { ChevronLeft, Download, Save, Trash2, Wallet } from 'lucide-react'
import BudgetIcon from '../components/BudgetIcon'
import { getBudgetConfig, getEntries, saveBudgetConfig, saveEntries } from '../storage'
import type { BudgetConfig } from '../types'

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

function isEntryInMonth(date: string, year: number, month: number): boolean {
  const [entryYear, entryMonth] = date.split('-').map(Number)
  return entryYear === year && entryMonth === month + 1
}

function csvCell(value: string | number | null): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export default function Settings({ onBack }: Props) {
  const [config, setConfig] = useState<BudgetConfig>(getBudgetConfig)

  const total = BUDGET_FIELDS.reduce((sum, field) => sum + config[field.key], 0)
  const totalMismatch = Math.abs(total - config.monthlyIncome) > 0.01

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
    onBack()
  }

  function handleReset() {
    if (!confirm("Delete all entries for the current month? This can't be undone.")) return

    const now = new Date()
    const filteredEntries = getEntries().filter(
      entry => !isEntryInMonth(entry.date, now.getFullYear(), now.getMonth()),
    )
    saveEntries(filteredEntries)
  }

  function handleExport() {
    const rows = [
      ['id', 'amount', 'category', 'note', 'date'].map(csvCell).join(','),
      ...getEntries().map(entry =>
        [entry.id, entry.amount, entry.category, entry.note, entry.date].map(csvCell).join(','),
      ),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'budget-entries.csv'
    link.click()
    URL.revokeObjectURL(url)
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
        {BUDGET_FIELDS.map(({ key, label }) => (
          <div key={key} className="settings-row">
            <label className="settings-label icon-label" htmlFor={`budget-${key}`}>
              <BudgetIcon name={key} />
              {label}
            </label>
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
          </div>
        ))}
      </div>

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

      <button className="export-btn" type="button" onClick={handleExport}>
        <Download aria-hidden="true" size={18} strokeWidth={2.3} />
        Export as CSV
      </button>
      <button className="danger-btn" type="button" onClick={handleReset}>
        <Trash2 aria-hidden="true" size={18} strokeWidth={2.3} />
        Reset This Month&apos;s Data
      </button>
    </div>
  )
}
