import { useState } from 'react'
import { Copy, ExternalLink, Mail, ShieldCheck, WalletCards } from 'lucide-react'
import { getConfiguredIngestEndpoint } from '../../automaticCapture'
import IngestStatusCard from './IngestStatusCard'
import SettingsHeader from './SettingsHeader'

interface Props {
  onDone: () => void
  ingestEndpoint?: string
}

type CopyState = 'idle' | 'copied' | 'failed'

const HEADER_TEMPLATE = 'Authorization: Bearer YOUR_INGEST_TOKEN'

export default function AutomaticCaptureSettings({
  onDone,
  ingestEndpoint = getConfiguredIngestEndpoint() ?? '',
}: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  async function copyEndpoint() {
    if (!ingestEndpoint) return
    try {
      await navigator.clipboard.writeText(ingestEndpoint)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="automatic-capture-settings">
      <SettingsHeader title="Automatic tracking" backLabel="Back" onBack={onDone} />

      <p className="automatic-capture__intro">
        Let iPhone Shortcuts send supported transactions to this budget in the background.
        Your bank login is never required.
      </p>

      <ol className="automatic-capture__steps">
        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">1</span>
          <div className="automatic-capture__step-content">
            <h2>Choose what to capture</h2>
            <div className="automatic-capture__options">
              <article>
                <WalletCards aria-hidden="true" size={20} />
                <div>
                  <h3>Apple Pay</h3>
                  <p>A Wallet transaction automation sends the amount and merchant after a card tap.</p>
                </div>
              </article>
              <article>
                <Mail aria-hidden="true" size={20} />
                <div>
                  <h3>DBS transaction alerts</h3>
                  <p>An Email automation forwards supported DBS alert bodies for parsing.</p>
                </div>
              </article>
            </div>
            <p className="automatic-capture__callout">
              <strong>PayNow has no native Shortcuts trigger.</strong> A supported PayNow transaction
              can still be captured when DBS sends an alert email; otherwise log it manually.
            </p>
          </div>
        </li>

        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">2</span>
          <div className="automatic-capture__step-content">
            <h2>Use the secure endpoint</h2>
            <p>Paste this URL into the Shortcut&apos;s <strong>Get Contents of URL</strong> action.</p>
            <code className="automatic-capture__code">
              {ingestEndpoint || 'Endpoint unavailable in this build'}
            </code>
            <button
              type="button"
              className="automatic-capture__copy"
              onClick={() => void copyEndpoint()}
              disabled={!ingestEndpoint}
            >
              <Copy aria-hidden="true" size={17} />
              Copy endpoint
            </button>
            <div className="automatic-capture__copy-feedback" role="status" aria-live="polite">
              {copyState === 'copied' && 'Endpoint copied'}
              {copyState === 'failed' && 'Copy failed. Press and hold the endpoint to copy it.'}
            </div>
            <p>Add this header, replacing the placeholder with the one-time token you were given:</p>
            <code className="automatic-capture__code">{HEADER_TEMPLATE}</code>
            <p className="automatic-capture__security-note">
              <ShieldCheck aria-hidden="true" size={18} />
              The raw token is created outside the app and is never stored or revealed by this browser.
              If you need a token, follow the trusted server setup instructions.
            </p>
            <a
              className="automatic-capture__text-link"
              href="https://github.com/NathanaelNgYY/expense#server-setup-one-time"
              target="_blank"
              rel="noreferrer"
            >
              View token setup instructions
              <ExternalLink aria-hidden="true" size={15} />
            </a>
          </div>
        </li>

        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">3</span>
          <div className="automatic-capture__step-content">
            <h2>Build the automations</h2>
            <details className="automatic-capture__recipe">
              <summary>Apple Pay recipe</summary>
              <ol>
                <li>Choose Automation → Transaction → When I tap, then select your cards.</li>
                <li>Add Get Contents of URL using POST, the endpoint above, and the Authorization header.</li>
                <li>Send JSON fields: sourceKind <code>apple_pay</code>, Amount, Merchant, and currency <code>SGD</code>.</li>
              </ol>
            </details>
            <details className="automatic-capture__recipe">
              <summary>DBS email recipe</summary>
              <ol>
                <li>Choose Automation → Email from <code>ibanking.alert@dbs.com</code>, subject contains Alerts.</li>
                <li>Add Get Contents of URL using the same POST endpoint and Authorization header.</li>
                <li>Send JSON fields: sourceKind <code>dbs_email</code>, rawBody from the email body, and occurredAt as the current ISO 8601 date.</li>
              </ol>
            </details>
            <a className="automatic-capture__open-shortcuts" href="shortcuts://">
              Open Shortcuts
              <ExternalLink aria-hidden="true" size={17} />
            </a>
            <p className="automatic-capture__hint">
              After a real capture, return here and refresh the status below. The receiving account
              and latest source should match this app.
            </p>
          </div>
        </li>
      </ol>

      <IngestStatusCard refreshable />
    </div>
  )
}
