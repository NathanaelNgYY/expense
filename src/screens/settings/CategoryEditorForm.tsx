import { useState } from 'react'
import BudgetIcon from '../../components/BudgetIcon'
import { CUSTOM_ICON_NAMES } from '../../components/budgetIcons'

export interface CategoryEditorResult {
  label: string
  icon: string
  budget: string
}

interface Props {
  idPrefix: string
  initialLabel?: string
  initialIcon?: string
  withBudget?: boolean
  doneLabel: string
  busy?: boolean
  onDone: (result: CategoryEditorResult) => void
  onCancel: () => void
}

export default function CategoryEditorForm({
  idPrefix,
  initialLabel = '',
  initialIcon = CUSTOM_ICON_NAMES[0],
  withBudget = false,
  doneLabel,
  busy = false,
  onDone,
  onCancel,
}: Props) {
  const [label, setLabel] = useState(initialLabel)
  const [icon, setIcon] = useState(initialIcon)
  const [budget, setBudget] = useState('')

  return (
    <div className="ios-list category-add-form">
      <div className="settings-row">
        <label className="settings-label" htmlFor={`${idPrefix}-name`}>Category name</label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          className="settings-input"
          value={label}
          onChange={event => setLabel(event.target.value)}
        />
      </div>
      {withBudget && (
        <div className="settings-row">
          <label className="settings-label" htmlFor={`${idPrefix}-budget`}>Category budget</label>
          <input
            id={`${idPrefix}-budget`}
            type="number"
            className="settings-input"
            value={budget}
            placeholder="Optional"
            min="0"
            step="1"
            inputMode="decimal"
            onChange={event => setBudget(event.target.value)}
          />
        </div>
      )}
      <div className="icon-picker" role="group" aria-label="Choose an icon">
        {CUSTOM_ICON_NAMES.map(name => (
          <button
            key={name}
            type="button"
            className={`icon-picker-btn ${icon === name ? 'icon-picker-btn--selected' : ''}`}
            aria-label={`Icon ${name}`}
            aria-pressed={icon === name}
            onClick={() => setIcon(name)}
          >
            <BudgetIcon name={name} />
          </button>
        ))}
      </div>
      <div className="category-add-actions">
        <button
          type="button"
          className="save-btn"
          disabled={busy || !label.trim()}
          onClick={() => onDone({ label: label.trim(), icon, budget })}
        >
          {doneLabel}
        </button>
        <button type="button" className="export-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
