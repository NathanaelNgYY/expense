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

// Email OTP sign-in keeps the session inside the installed PWA; tapping a
// magic-link email would open a separate browser context.
export default function AuthGate() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="shared-auth">
      <p className="screen-title">SHARED BUDGETS</p>
      {step === 'email' ? (
        <>
          <p className="muted">Sign in with your email to use shared budgets.</p>
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
                  await sharedApi.requestOtp(email.trim())
                  setStep('code')
                },
                setBusy,
                setError,
              )
            }
          >
            Send code
          </button>
        </>
      ) : (
        <>
          <p className="muted">Enter the 6-digit code sent to {email.trim()}.</p>
          <input
            type="text"
            inputMode="numeric"
            className="note-input"
            placeholder="6-digit code"
            autoComplete="one-time-code"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
          <button
            type="button"
            className="save-btn"
            disabled={busy || code.trim().length < 6}
            onClick={() =>
              void submitWithState(
                () => sharedApi.verifyOtpCode(email.trim(), code),
                setBusy,
                setError,
              )
            }
          >
            Verify
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
