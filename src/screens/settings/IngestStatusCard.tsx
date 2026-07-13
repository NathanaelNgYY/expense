import { useEffect, useState } from 'react'
import { AlertTriangle, Radio } from 'lucide-react'
import { fetchIngestStatus } from '../../api'
import {
  readIngestBinding,
  rememberIngestBinding,
  resolveIngestVisibility,
  type IngestVisibility,
} from '../../ingestVisibility'
import { useSharedBudgets } from '../../sharedBudgets/SharedBudgetsContext'

function accountLabel(userId: string, email: string | undefined, displayName: string | undefined): string {
  return email || displayName || `Account …${userId.slice(-8)}`
}

function formatCapturedAt(value: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore',
  }).format(new Date(value))
}

function sourceLabel(source: IngestVisibility['lastSource']): string | null {
  if (source === 'apple_pay') return 'Apple Pay'
  if (source === 'dbs_email') return 'DBS email'
  return null
}

export default function IngestStatusCard() {
  const { authReady, session, profile } = useSharedBudgets()
  const [visibility, setVisibility] = useState<IngestVisibility | null>(null)
  const [loadError, setLoadError] = useState(false)

  const currentUserId = session?.user.id ?? null
  const currentAccountLabel = currentUserId
    ? accountLabel(currentUserId, session?.user.email, profile?.displayName)
    : 'No account session'

  useEffect(() => {
    if (!authReady || !currentUserId) return
    let cancelled = false
    void fetchIngestStatus()
      .then(status => {
        if (cancelled) return
        let rememberedBinding = readIngestBinding()
        if (status && (!rememberedBinding || rememberedBinding.userId === currentUserId)) {
          rememberIngestBinding(status, currentAccountLabel)
          rememberedBinding = readIngestBinding()
        }
        setVisibility(resolveIngestVisibility({
          currentUserId,
          currentAccountLabel,
          status,
          rememberedBinding,
        }))
        setLoadError(false)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => { cancelled = true }
  }, [authReady, currentAccountLabel, currentUserId])

  const source = sourceLabel(visibility?.lastSource ?? null)

  return (
    <section className={`ingest-status-card${visibility?.state === 'mismatch' ? ' ingest-status-card--warning' : ''}`} aria-labelledby="ingest-status-title">
      <div className="ingest-status-card__heading">
        {visibility?.state === 'mismatch'
          ? <AlertTriangle aria-hidden="true" size={19} />
          : <Radio aria-hidden="true" size={19} />}
        <h3 id="ingest-status-title">Automatic capture</h3>
      </div>

      {!authReady && <p className="ingest-status-card__muted">Checking account…</p>}
      {authReady && !visibility && !loadError && <p className="ingest-status-card__muted">Checking Shortcut link…</p>}
      {loadError && <p className="ingest-status-card__notice" role="status">Capture status is temporarily unavailable.</p>}

      {visibility && (
        <dl className="ingest-status-card__details">
          <div>
            <dt>Receives transactions</dt>
            <dd>{visibility.recipientAccountLabel ?? 'Not linked'}</dd>
          </div>
          <div>
            <dt>App account</dt>
            <dd>{currentAccountLabel}</dd>
          </div>
          <div>
            <dt>Last captured</dt>
            <dd>
              {visibility.lastCapturedAt
                ? <time dateTime={visibility.lastCapturedAt}>{formatCapturedAt(visibility.lastCapturedAt)}</time>
                : 'No capture recorded'}
              {source ? ` · ${source}` : ''}
            </dd>
          </div>
        </dl>
      )}

      {visibility?.state === 'mismatch' && (
        <p className="ingest-status-card__notice" role="alert">
          <strong>Account mismatch.</strong> Your Shortcuts were last linked to {visibility.recipientAccountLabel}, but the app is signed in as {currentAccountLabel}. New purchases may not appear here.
        </p>
      )}
      {visibility?.state === 'unlinked' && (
        <p className="ingest-status-card__notice" role="status">
          No Shortcut token is linked to this account.
        </p>
      )}
      {visibility?.state === 'linked' && (
        <p className="ingest-status-card__linked">Linked via {visibility.tokenLabel || 'iOS Shortcut'}</p>
      )}
    </section>
  )
}
