import { CloudOff, Download, RefreshCw } from 'lucide-react'
import type { SyncState } from '../EntriesContext'

interface Props {
  sync: SyncState
  onRetry: () => void
  onBackup?: () => void
}

/**
 * The app writes optimistically and drains a queue in the background, which is why saving
 * feels instant. The cost is that a failed drain used to be invisible. This says so — without
 * alarming the user, because their entries are genuinely durable on-device either way.
 *
 * Silent while the queue is merely in flight: a spinner on every save would be noise.
 */
export default function SyncStatus({ sync, onRetry, onBackup }: Props) {
  if (!sync.failed) return null

  const unsynced = sync.pendingCount > 0
  // Retrying an unauthorized request just fails again. Send the user to the thing that can help.
  const isAuth = sync.reason === 'auth'
  const isMigration = sync.reason === 'migration'
  const missingCount = sync.migrationMissingCount

  return (
    <div className="sync-status" role="status">
      <CloudOff className="sync-status__icon" aria-hidden="true" size={17} />
      <span className="sync-status__text">
        {isMigration ? (
          <>
            <strong>
              {missingCount === undefined
                ? "Some entries couldn't be uploaded"
                : `${missingCount} ${missingCount === 1 ? 'entry' : 'entries'} couldn't be uploaded`}
            </strong>
            <span className="sync-status__detail">
              Saved on this device. Download a backup before trying again.
            </span>
          </>
        ) : isAuth ? (
          <>
            <strong>Can't sign in to sync</strong>
            <span className="sync-status__detail">
              {unsynced ? 'Your changes are saved on this device. ' : ''}
              Sync resumes automatically once sign-in works again.
            </span>
          </>
        ) : unsynced ? (
          <>
            <strong>
              {sync.pendingCount} {sync.pendingCount === 1 ? 'change' : 'changes'} not synced
            </strong>
            <span className="sync-status__detail">Saved on this device. We'll retry when you reopen the app.</span>
          </>
        ) : (
          <>
            <strong>You're offline</strong>
            <span className="sync-status__detail">Showing your last synced data.</span>
          </>
        )}
      </span>
      <span className="sync-status__actions">
        {isMigration && onBackup && (
          <button type="button" className="sync-status__retry" onClick={onBackup}>
            <Download aria-hidden="true" size={14} />
            Download backup
          </button>
        )}
        {!isAuth && (
          <button type="button" className="sync-status__retry" onClick={onRetry}>
            <RefreshCw aria-hidden="true" size={14} />
            Retry
          </button>
        )}
      </span>
    </div>
  )
}
