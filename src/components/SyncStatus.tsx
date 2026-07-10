import { CloudOff, RefreshCw } from 'lucide-react'
import type { SyncState } from '../EntriesContext'

interface Props {
  sync: SyncState
  onRetry: () => void
}

/**
 * The app writes optimistically and drains a queue in the background, which is why saving
 * feels instant. The cost is that a failed drain used to be invisible. This says so — without
 * alarming the user, because their entries are genuinely durable on-device either way.
 *
 * Silent while the queue is merely in flight: a spinner on every save would be noise.
 */
export default function SyncStatus({ sync, onRetry }: Props) {
  if (!sync.failed) return null

  const unsynced = sync.pendingCount > 0

  return (
    <div className="sync-status" role="status">
      <CloudOff className="sync-status__icon" aria-hidden="true" size={17} />
      <span className="sync-status__text">
        {unsynced ? (
          <>
            <strong>
              {sync.pendingCount} {sync.pendingCount === 1 ? 'entry' : 'entries'} not synced
            </strong>
            <span className="sync-status__detail">Saved on this device. We'll retry automatically.</span>
          </>
        ) : (
          <>
            <strong>You're offline</strong>
            <span className="sync-status__detail">Showing your last synced data.</span>
          </>
        )}
      </span>
      <button type="button" className="sync-status__retry" onClick={onRetry}>
        <RefreshCw aria-hidden="true" size={14} />
        Retry
      </button>
    </div>
  )
}
