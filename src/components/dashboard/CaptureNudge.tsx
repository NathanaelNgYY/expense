import { Sparkles, X } from 'lucide-react'

interface Props {
  onSetUp: () => void
  onDismiss: () => void
}

/**
 * U5. Offered once to someone who has only ever typed entries in — automatic capture
 * is the product's differentiator and was otherwise discoverable only in Settings.
 *
 * Lazy-loaded by Dashboard despite sitting on the eager Home path: it renders at most
 * once in a user's life and never at all for anyone whose captures already work, so
 * it has no business in the initial chunk.
 *
 * No `role="status"`: this is an offer, not an alert, and must not interrupt a screen
 * reader mid-task the way the capture-health warning legitimately does.
 */
export default function CaptureNudge({ onSetUp, onDismiss }: Props) {
  return (
    <section className="capture-nudge" aria-labelledby="capture-nudge-title">
      <Sparkles className="capture-nudge__icon" aria-hidden="true" size={20} />
      <div className="capture-nudge__copy">
        <h2 id="capture-nudge-title">Stop typing these in</h2>
        <p>
          Your phone can log Apple Pay and DBS alerts by itself. Takes about 3 minutes to
          set up, once.
        </p>
        <div className="capture-nudge__actions">
          <button type="button" className="capture-nudge__cta" onClick={onSetUp}>
            Set it up
          </button>
          <button type="button" className="capture-nudge__later" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        className="capture-nudge__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss automatic capture suggestion"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </section>
  )
}
