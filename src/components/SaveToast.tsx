import { useEffect } from 'react'
import { Undo2 } from 'lucide-react'
import { formatMoney } from '../format'

export interface ToastEntry {
  id: string
  amount: number
  kind: 'expense' | 'refund'
  categoryLabel: string | null
  currency?: string
}

interface Props {
  entry: ToastEntry
  onUndo: () => void
  onDismiss: () => void
  /** Exposed for tests; the UI never needs to override it. */
  durationMs?: number
}

const DEFAULT_DURATION_MS = 5000

/**
 * Saving used to navigate home in silence, leaving the user to infer success. This closes
 * the loop and, since a mis-tapped amount is the likeliest mistake, offers the same Undo
 * affordance the History delete flow already uses.
 */
export default function SaveToast({ entry, onUndo, onDismiss, durationMs = DEFAULT_DURATION_MS }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [durationMs, onDismiss])

  return (
    <div className="save-toast" role="status">
      <span className="save-toast__text">
        {entry.kind === 'refund' ? 'Refunded' : 'Saved'} {formatMoney(entry.amount, entry.currency ?? 'SGD')}
        {entry.categoryLabel && <span className="save-toast__cat"> to {entry.categoryLabel}</span>}
      </span>
      <button type="button" className="save-toast__undo" onClick={onUndo}>
        <Undo2 size={15} aria-hidden="true" />
        Undo
      </button>
    </div>
  )
}
