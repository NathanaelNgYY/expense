// src/sharedBudgets/InviteScreen.tsx
// Step two of the create flow. A shared budget with one member is not doing
// anything, so creating one hands straight to the invite rather than dropping
// the user back on the list with a code buried three taps away under Owner
// tools. The share message matches the one OwnerTools already sends.

import { Check } from 'lucide-react'
import { useState } from 'react'
import SettingsHeader from '../screens/settings/SettingsHeader'
import { CODE_LENGTH, inviteMessage } from './inviteCode'
import type { SharedBudget } from './types'

interface Props {
  budget: SharedBudget
  onDone: () => void
  onOpen: () => void
}

export default function InviteScreen({ budget, onDone, onOpen }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(budget.inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied; the code stays visible to type by hand.
    }
  }

  function share() {
    const message = inviteMessage(budget, window.location.origin)
    if (navigator.share) {
      void navigator.share({ text: message }).catch(() => {})
      return
    }
    void copyCode()
  }

  return (
    <div className="screen shared-subscreen">
      <SettingsHeader
        title="Invite"
        trailing={
          <button type="button" className="back-btn shared-header-done" onClick={onDone}>
            Done
          </button>
        }
      />

      <div className="shared-success">
        <span className="shared-success-tick" aria-hidden="true">
          <Check size={20} strokeWidth={3} />
        </span>
        <h2 className="shared-success-title">{budget.name} is live</h2>
        <p className="shared-success-sub">
          Anyone with this code can add entries and see the totals.
        </p>
      </div>

      <button
        type="button"
        className="shared-code-copy"
        onClick={() => void copyCode()}
        aria-label={`Invite code ${budget.inviteCode.split('').join(' ')}. Tap to copy.`}
      >
        <span className="code-input__boxes" aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span key={i} className="code-box">
              {budget.inviteCode[i] ?? ''}
            </span>
          ))}
        </span>
      </button>
      <p className="shared-field-hint shared-code-hint" aria-live="polite">
        {copied ? 'Code copied.' : 'Tap the code to copy it.'}
      </p>

      <div className="shared-pinned-action shared-action-stack">
        <button type="button" className="save-btn" onClick={share}>
          Share invite
        </button>
        <button type="button" className="export-btn" onClick={onOpen}>
          Open {budget.name}
        </button>
      </div>
    </div>
  )
}
