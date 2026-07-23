import { useState } from 'react'
import { Copy, ExternalLink, Mail, ShieldCheck, WalletCards } from 'lucide-react'
import {
  getConfiguredApplePayShortcutUrl,
  getConfiguredIngestEndpoint,
} from '../../automaticCapture'
import IngestStatusCard from './IngestStatusCard'
import SettingsHeader from './SettingsHeader'
import MealTimeRulesSettings from './MealTimeRulesSettings'
import { buildCategoryOptions } from '../../categoryDisplay'
import { useBudgetConfig } from '../../BudgetConfigContext'

interface Props {
  onDone: () => void
  ingestEndpoint?: string
  shortcutInstallUrl?: string | null
}

type CopyState = 'idle' | 'copied' | 'failed'

const HEADER_TEMPLATE = 'Authorization: use the setup value generated above'

export default function AutomaticCaptureSettings({
  onDone,
  ingestEndpoint = getConfiguredIngestEndpoint() ?? '',
  shortcutInstallUrl = getConfiguredApplePayShortcutUrl(),
}: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const { overrides, customCategories } = useBudgetConfig()
  const categoryOptions = buildCategoryOptions(overrides, customCategories)

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
        Install the ready-made Shortcut, then choose which Wallet cards should log purchases.
        Your bank login is never required.
      </p>

      <ol className="automatic-capture__steps">
        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">1</span>
          <div className="automatic-capture__step-content">
            <div className="automatic-capture__step-heading">
              <WalletCards aria-hidden="true" size={20} />
              <h2>Set up Apple Pay</h2>
            </div>
            <p>
              Create the private setup value below. Then one tap copies it and opens the
              ready-made Shortcut with its URL, request body, and field mappings already filled in.
            </p>
            {!shortcutInstallUrl && (
              <p className="automatic-capture__installer-warning" role="status">
                <strong>Prebuilt Shortcut installer unavailable.</strong> You can still use the
                manual recipe below until the Apple-hosted installer link is configured.
              </p>
            )}
            <IngestStatusCard
              refreshable
              shortcutInstallUrl={shortcutInstallUrl}
            />
          </div>
        </li>

        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">2</span>
          <div className="automatic-capture__step-content">
            <h2>Finish in Shortcuts</h2>
            <ol className="automatic-capture__finish-list">
              <li>Open <strong>Automation</strong>, tap <strong>+</strong>, then choose <strong>Transaction</strong>.</li>
              <li>Choose <strong>When I Tap</strong>, select your cards, and choose <strong>Run Immediately</strong>.</li>
              <li>Add <strong>Run Shortcut</strong>, select <strong>Budget Tracker Capture</strong>, and pass the Transaction input.</li>
            </ol>
            <a className="automatic-capture__open-shortcuts" href="shortcuts://">
              Open Shortcuts
              <ExternalLink aria-hidden="true" size={17} />
            </a>
          </div>
        </li>

        <li className="automatic-capture__step">
          <span className="automatic-capture__step-number" aria-hidden="true">3</span>
          <div className="automatic-capture__step-content">
            <h2>Verify the first capture</h2>
            <p className="automatic-capture__hint">
              After your next Apple Pay purchase, return here and tap <strong>Refresh status</strong>.
              The receiving account and latest source should match this app.
            </p>
          </div>
        </li>
      </ol>

      <section className="automatic-capture__advanced" aria-labelledby="other-capture-title">
        <div className="automatic-capture__step-heading">
          <Mail aria-hidden="true" size={20} />
          <h2 id="other-capture-title">DBS transaction alerts</h2>
        </div>
        <p className="automatic-capture__callout">
          <strong>PayNow has no native Shortcuts trigger.</strong> Supported PayNow transactions
          can still be captured from a DBS alert email.
        </p>
        <details className="automatic-capture__recipe">
          <summary>DBS email and manual setup</summary>
          <div className="automatic-capture__manual-fields">
            <p>Use this URL in a <strong>Get Contents of URL</strong> action:</p>
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
            <code className="automatic-capture__code">{HEADER_TEMPLATE}</code>
            <p className="automatic-capture__security-note">
              <ShieldCheck aria-hidden="true" size={18} />
              Reuse the private setup value from this account. Never put it in a public shared Shortcut.
            </p>
            <ol>
              <li>Choose Automation → Email from <code>ibanking.alert@dbs.com</code>, subject contains Alerts.</li>
              <li>POST to the endpoint above using the generated Authorization setup value.</li>
              <li>Send <code>sourceKind: dbs_email</code>, <code>rawBody</code> from the email body, and the current ISO 8601 date as <code>occurredAt</code>.</li>
            </ol>
          </div>
        </details>
      </section>

      <MealTimeRulesSettings categoryOptions={categoryOptions} />
    </div>
  )
}
