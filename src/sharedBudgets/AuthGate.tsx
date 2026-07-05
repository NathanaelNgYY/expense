import { useState } from 'react'
import { useSharedBudgets } from './SharedBudgetsContext'
import * as sharedApi from './sharedApi'

async function submitWithState(
  action: () => Promise<void>,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
) {
  setBusy(true)
  setError(null)
  try {
    await action()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Something went wrong')
  } finally {
    setBusy(false)
  }
}

export default function AuthGate() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="shared-auth">
      <p className="screen-title">SHARED BUDGETS</p>
      <p className="muted">Sign in with Google to create or join shared budgets.</p>
      <button
        type="button"
        className="save-btn"
        disabled={busy}
        onClick={() =>
          void submitWithState(
            () => sharedApi.signInWithGoogle(),
            setBusy,
            setError,
          )
        }
      >
        Continue with Google
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export function DisplayNamePrompt() {
  const { refreshProfile } = useSharedBudgets()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="shared-auth">
      <p className="screen-title">WHAT'S YOUR NAME?</p>
      <p className="muted">Shown next to entries you add in shared budgets.</p>
      <input
        type="text"
        className="note-input"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <button
        type="button"
        className="save-btn"
        disabled={busy || name.trim().length === 0}
        onClick={() =>
          void submitWithState(
            async () => {
              await sharedApi.saveDisplayName(name.trim())
              await refreshProfile()
            },
            setBusy,
            setError,
          )
        }
      >
        Save name
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
