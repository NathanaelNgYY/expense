import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Entry } from '../types'
import { formatSGD } from '../format'
import BudgetIcon from './BudgetIcon'

interface CategoryOption {
  id: string
  label: string
  icon: string
}

interface Props {
  entries: Entry[]
  categoryOptions: CategoryOption[]
  onCategorize: (entry: Entry, categoryId: string) => void | Promise<void>
}

function isAutomaticUncategorized(entry: Entry): boolean {
  return entry.category == null && (entry.source === 'apple-pay' || entry.source === 'dbs-email')
}

export default function UncategorizedReviewDialog({ entries, categoryOptions, onCategorize }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reviewEntries = useMemo(
    () => entries.filter(isAutomaticUncategorized).sort((a, b) =>
      (b.occurredAt ?? b.date).localeCompare(a.occurredAt ?? a.date),
    ),
    [entries],
  )
  const current = reviewEntries[0]

  useEffect(() => {
    const dialog = dialogRef.current
    if (!current || dismissed || dialog?.open) return
    dialog?.showModal()
  }, [current, dismissed])

  if (!current || dismissed) return null

  const merchant = current.merchant?.trim() || 'Unknown merchant'

  return (
    <dialog
      ref={dialogRef}
      className="uncategorized-review"
      aria-labelledby="uncategorized-review-title"
      aria-describedby="uncategorized-review-description"
      onCancel={event => {
        event.preventDefault()
        setDismissed(true)
      }}
    >
      <div className="uncategorized-review__eyebrow">
        <Sparkles size={16} aria-hidden="true" />
        Automatic payment
      </div>
      <h2 id="uncategorized-review-title">Payment needs a category</h2>
      <p id="uncategorized-review-description">
        Choose once and future payments from this merchant will use the same category.
      </p>

      <div className="uncategorized-review__payment">
        <div>
          <strong>{merchant}</strong>
          <span>{current.source === 'apple-pay' ? 'Apple Pay' : 'DBS / PayNow'}</span>
        </div>
        <strong>{formatSGD(current.amount)}</strong>
      </div>

      <div className="uncategorized-review__categories" aria-label="Choose a category">
        {categoryOptions.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => void onCategorize(current, option.id)}
          >
            <BudgetIcon name={option.icon} />
            {option.label}
          </button>
        ))}
      </div>

      {reviewEntries.length > 1 && (
        <p className="uncategorized-review__remaining">
          {reviewEntries.length - 1} more payment{reviewEntries.length === 2 ? '' : 's'} to review
        </p>
      )}
      <button
        type="button"
        className="uncategorized-review__later"
        onClick={() => setDismissed(true)}
      >
        Review later
      </button>
    </dialog>
  )
}
