// src/components/AuthErrorBanner.tsx
// A failed OAuth round trip produces no auth event, so without this the user lands back on a
// screen that looks exactly as it did before they left and has no idea the sign-in failed.
import { useState } from 'react'
import {
  clearAuthRedirectError,
  friendlyAuthError,
  peekAuthRedirectError,
} from '../authRedirectError'
import * as sharedApi from '../sharedBudgets/sharedApi'

export default function AuthErrorBanner() {
  const [error, setError] = useState(peekAuthRedirectError)
  const [retrying, setRetrying] = useState(false)

  if (!error) return null

  function dismiss() {
    clearAuthRedirectError()
    setError(null)
  }

  // `identity_already_exists` means this device holds a throwaway anonymous account while the
  // Google account belongs to a real one. This goes straight to a plain sign-in rather than
  // signing out and re-deciding — see signInWithGoogleAsExistingAccount for why re-deciding
  // loops back onto the same error.
  async function signInAgain() {
    setRetrying(true)
    try {
      await sharedApi.signInWithGoogleAsExistingAccount()
    } catch {
      setRetrying(false)
    }
  }

  const recoverable = error.code === 'identity_already_exists'

  return (
    <div className="auth-error-banner" role="alert">
      <p className="auth-error-banner__message">{friendlyAuthError(error)}</p>
      <div className="auth-error-banner__actions">
        {recoverable && (
          <button type="button" onClick={signInAgain} disabled={retrying}>
            {retrying ? 'Signing in…' : 'Sign out and try again'}
          </button>
        )}
        <button type="button" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
