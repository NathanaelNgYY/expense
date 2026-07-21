import { useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import type { Entry } from '../types'
import BudgetIcon from './BudgetIcon'

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  entry: Entry
  rankedIds: string[]
  categoryOptions: CategoryOption[]
  onCategorize: (entry: Entry, categoryId: string) => void | Promise<void>
}

export default function UncategorizedTriageChips({ entry, rankedIds, categoryOptions, onCategorize }: Props) {
  const [expanded, setExpanded] = useState(false)
  const merchant = entry.merchant?.trim() || 'entry'
  const optionsById = new Map(categoryOptions.map(option => [option.id, option]))
  const rankedOptions = rankedIds
    .map(id => optionsById.get(id))
    .filter((option): option is CategoryOption => option != null)

  const renderChip = (option: CategoryOption, isTop: boolean) => (
    <button
      key={option.id}
      type="button"
      className={`triage-chip${isTop ? ' triage-chip--top' : ''}`}
      aria-label={`Categorize ${merchant} as ${option.label}`}
      onClick={() => void onCategorize(entry, option.id)}
    >
      <BudgetIcon name={option.icon} />
      {option.label}
    </button>
  )

  if (expanded) {
    const labelId = `triage-label-${entry.id}`
    return (
      <div className="triage-chips triage-chips--expanded">
        <span className="triage-chips__label" id={labelId}>Choose a category</span>
        <div className="triage-chips__row" role="group" aria-labelledby={labelId}>
          {categoryOptions.map(option => renderChip(option, false))}
          <button
            type="button"
            className="triage-chip triage-chip--collapse"
            aria-label="Collapse category list"
            onClick={() => setExpanded(false)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="triage-chips" role="group" aria-label={`Suggested categories for ${merchant}`}>
      {rankedOptions.map((option, index) => renderChip(option, index === 0))}
      <button
        type="button"
        className="triage-chip triage-chip--more"
        aria-label="Show all categories"
        onClick={() => setExpanded(true)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
