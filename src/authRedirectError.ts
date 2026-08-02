// src/authRedirectError.ts
// Supabase's implicit flow reports failures the same way it reports success: in the URL
// fragment the browser lands on. `#access_token=…` means it worked; `#error=…&error_code=…`
// means it did not. supabase-js consumes the success case and notifies `onAuthStateChange`,
// but a failure produces no auth event at all — so without reading the fragment ourselves a
// failed sign-in is indistinguishable from the user never having left.
//
// The case that matters in practice is `identity_already_exists`: a returning user on a fresh
// storage jar (reinstalled home-screen PWA, new device, cleared site data) gets a new anonymous
// session, so "Continue with Google" takes the `linkIdentity` branch — and linking an identity
// that already belongs to their real account fails.

export interface AuthRedirectError {
  code: string
  message: string
}

const FRIENDLY: Record<string, string> = {
  identity_already_exists:
    'That Google account is already linked to an existing account. Sign out and sign in with Google again to use it.',
}

/**
 * Parse an auth failure out of a URL fragment. Returns null when the fragment carries no error
 * — including the success case and the ordinary hash-router case (`#/settings/automatic`).
 */
export function readAuthErrorFromHash(hash: string): AuthRedirectError | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  // A hash-router path is not a query string; bail before URLSearchParams reads it as one.
  if (!raw || raw.startsWith('/')) return null

  const params = new URLSearchParams(raw)
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null

  const description = params.get('error_description')?.replace(/\+/g, ' ') ?? ''
  return { code, message: description || 'Sign-in failed. Please try again.' }
}

/** The message to show the user, preferring our own wording over GoTrue's. */
export function friendlyAuthError(error: AuthRedirectError): string {
  return FRIENDLY[error.code] ?? error.message
}

// The fragment is short-lived: `normaliseInitialRoute` replaces any hash that is not a route,
// and supabase-js clears the URL once it has looked at it. Whichever gets there first, the
// error is gone before a component could mount and read it — so capture it once, eagerly, and
// let the UI collect it afterwards.
let captured: AuthRedirectError | null = null
let hasCaptured = false

/** Idempotent: safe under StrictMode's double render and repeat calls. */
export function captureAuthRedirectError(hash: string = window.location.hash): void {
  if (hasCaptured) return
  hasCaptured = true
  captured = readAuthErrorFromHash(hash)
}

/** Read the captured error without clearing it. */
export function peekAuthRedirectError(): AuthRedirectError | null {
  return captured
}

/** Clear the captured error once the user has dismissed or acted on it. */
export function clearAuthRedirectError(): void {
  captured = null
}

/** Test seam — forget both the capture and the fact that one happened. */
export function resetAuthRedirectErrorForTest(): void {
  captured = null
  hasCaptured = false
}
