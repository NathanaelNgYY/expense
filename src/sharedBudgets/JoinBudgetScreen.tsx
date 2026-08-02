// src/sharedBudgets/JoinBudgetScreen.tsx
// The other half of the create flow, shaped the same way so the two paths feel
// like one feature. The code arrives by message, so it is usually pasted:
// CodeInput normalises case, spaces, and dashes rather than letting a stray
// character come back as a server error.

import { useState } from 'react'
import SettingsHeader from '../screens/settings/SettingsHeader'
import CodeInput from './CodeInput'
import { CODE_LENGTH } from './inviteCode'
import { useSharedBudgets } from './SharedBudgetsContext'
import type { SharedBudget } from './types'

interface Props {
  onCancel: () => void
  onJoined: (budget: SharedBudget) => void
}

export default function JoinBudgetScreen({ onCancel, onJoined }: Props) {
  const { joinBudget, error } = useSharedBudgets()
  const [code, setCode] = useState('')
  const [shortError, setShortError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (code.length < CODE_LENGTH) {
      setShortError(`Invite codes are ${CODE_LENGTH} characters. Enter all of them.`)
      return
    }
    setShortError(null)
    setBusy(true)
    try {
      onJoined(await joinBudget(code))
    } catch {
      // The context maps the failure through friendlyError; the code stays put
      // so a single wrong character can be corrected instead of retyped.
    } finally {
      setBusy(false)
    }
  }

  const message = shortError ?? error

  return (
    <form className="screen shared-subscreen" onSubmit={event => void handleSubmit(event)}>
      <SettingsHeader title="Join a budget" backLabel="Shared" onBack={onCancel} />

      <p className="shared-field-hint" id="join-code-hint">
        Enter the {CODE_LENGTH} character code from whoever set the budget up.
      </p>

      <CodeInput
        label="Invite code"
        value={code}
        onChange={value => {
          setCode(value)
          if (shortError) setShortError(null)
        }}
        invalid={message !== null}
        disabled={busy}
        describedBy="join-code-hint"
        autoFocus
      />

      {message ? (
        <p className="form-error shared-code-hint">{message}</p>
      ) : (
        <p className="shared-field-hint shared-code-hint">
          Letters and numbers. Case does not matter.
        </p>
      )}

      <button type="submit" className="save-btn shared-pinned-action" disabled={busy}>
        {busy ? 'Joining budget' : 'Join budget'}
      </button>
    </form>
  )
}
