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
  const [step, setStep] = useState<'email' | 'sent'>('email')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedEmail = email.trim()

  return (
    <div className="shared-auth">
      <p className="screen-title">SHARED BUDGETS</p>
      {step === 'email' ? (
        <>
          <p className="muted">Sign in to create or join shared budgets.</p>
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
          <p className="muted">Or use an email sign-in link.</p>
          <input
            type="email"
            className="note-input"
            placeholder="you@email.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || !email.includes('@')}
            onClick={() =>
              void submitWithState(
                async () => {
                  await sharedApi.requestOtp(trimmedEmail)
                  setStep('sent')
                },
                setBusy,
                setError,
              )
            }
          >
            Send sign-in link
          </button>
        </>
      ) : (
        <>
          <p className="muted">We sent a sign-in link to {trimmedEmail}.</p>
          <p className="muted">Open that email on this device and tap the link to continue.</p>
          <button
            type="button"
            className="save-btn"
            disabled={busy}
            onClick={() =>
              void submitWithState(
                () => sharedApi.requestOtp(trimmedEmail),
                setBusy,
                setError,
              )
            }
          >
            Send another link
          </button>
          <button type="button" className="link-btn" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </>
      )}
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
