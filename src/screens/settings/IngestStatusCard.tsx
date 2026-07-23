import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Radio } from 'lucide-react'
import { fetchIngestStatus, rotateIngestToken } from '../../api'
import { useConfirm } from '../../components/ConfirmDialog'
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

interface Props {
  refreshable?: boolean
  shortcutInstallUrl?: string | null
}

export default function IngestStatusCard({
  refreshable = false,
  shortcutInstallUrl,
}: Props) {
  const { authReady, session, profile } = useSharedBudgets()
  const confirm = useConfirm()
  const [visibility, setVisibility] = useState<IngestVisibility | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [rotating, setRotating] = useState(false)
  const [rotateError, setRotateError] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)

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
      .finally(() => {
        if (!cancelled) setRefreshing(false)
      })
    return () => { cancelled = true }
  }, [authReady, currentAccountLabel, currentUserId, refreshVersion])

  function refreshStatus() {
    setRefreshing(true)
    setLoadError(false)
    setRefreshVersion(version => version + 1)
  }

  const isGenerate = visibility?.state === 'unlinked'

  async function handleRotate() {
    const isInstallerSetup = Boolean(shortcutInstallUrl)
    const confirmed = await confirm({
      title: isInstallerSetup
        ? isGenerate ? 'Set up Apple Pay?' : 'Reconnect Apple Pay?'
        : isGenerate ? 'Generate an ingest token?' : 'Generate a new token?',
      message: isGenerate
        ? isInstallerSetup
          ? 'This creates a private setup value for the ready-made Shortcut. It is shown once and never added to the public installer link.'
          : "This creates a token for your iOS Shortcut. You'll paste it into the Shortcut's Authorization header."
        : 'Your current token keeps working for 24 hours so you can update your iOS Shortcut before it stops.',
      confirmLabel: isInstallerSetup
        ? isGenerate ? 'Continue' : 'Reconnect'
        : isGenerate ? 'Generate' : 'Rotate',
    })
    if (!confirmed) return
    setRotating(true)
    setRotateError(false)
    try {
      const { token } = await rotateIngestToken()
      setNewToken(token)
      setCopied(false)
      setCopyError(false)
      refreshStatus()
    } catch {
      setRotateError(true)
    } finally {
      setRotating(false)
    }
  }

  async function copyToken() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(`Bearer ${newToken}`)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopied(false)
      setCopyError(true)
    }
  }

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
          {shortcutInstallUrl
            ? 'Apple Pay is not connected to this account yet.'
            : 'No Shortcut token is linked to this account.'}
        </p>
      )}
      {visibility?.state === 'linked' && (
        <p className="ingest-status-card__linked">Linked via {visibility.tokenLabel || 'iOS Shortcut'}</p>
      )}
      {visibility && currentUserId && (
        <div className="ingest-status-card__rotate">
          {newToken ? (
            <div className="ingest-token-reveal" role="status">
              <p className="ingest-token-reveal__label">Shortcut setup value — shown once</p>
              <input
                className="ingest-token-reveal__value"
                readOnly
                value={`Bearer ${newToken}`}
                aria-label="Shortcut setup value"
                onFocus={event => event.target.select()}
              />
              <div className="ingest-token-reveal__actions">
                {shortcutInstallUrl ? (
                  <a
                    className="ingest-token-reveal__install"
                    href={shortcutInstallUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void copyToken()}
                  >
                    <span>{copied ? 'Setup value copied' : 'Copy & add Shortcut'}</span>
                    <ExternalLink aria-hidden="true" size={16} />
                  </a>
                ) : (
                  <button type="button" className="ingest-token-reveal__copy" onClick={copyToken}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
                <button type="button" className="ingest-token-reveal__done" onClick={() => setNewToken(null)}>
                  Done
                </button>
              </div>
              {copied && shortcutInstallUrl && (
                <p className="ingest-token-reveal__feedback" role="status">
                  Setup value copied. Paste it when Apple asks during Shortcut setup.
                </p>
              )}
              {copyError && (
                <p className="ingest-token-reveal__feedback ingest-token-reveal__feedback--error" role="alert">
                  Copy failed. Return here and press and hold the setup value to copy it.
                </p>
              )}
              <p className="ingest-token-reveal__hint">
                The public Shortcut installer never contains this private value.
                {isGenerate ? ' It will not be shown again.' : ' Your old value stops working in 24 hours.'}
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="ingest-status-card__rotate-btn"
                onClick={handleRotate}
                disabled={rotating}
              >
                {rotating
                  ? 'Generating…'
                  : shortcutInstallUrl
                    ? isGenerate ? 'Set up Apple Pay' : 'Reconnect Apple Pay'
                    : isGenerate ? 'Generate token' : 'Rotate token'}
              </button>
              {rotateError && (
                <p className="ingest-status-card__notice" role="alert">
                  Could not generate a new token. Please try again.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {refreshable && (!shortcutInstallUrl || visibility?.state !== 'unlinked') && (
        <button
          type="button"
          className="ingest-status-card__refresh"
          onClick={refreshStatus}
          disabled={!authReady || !currentUserId || refreshing}
        >
          {refreshing ? 'Checking…' : 'Refresh status'}
        </button>
      )}
    </section>
  )
}
