// src/newUserSetup.test.ts
// Simulates a brand-new user setting up automatic tracking, end to end:
//
//   first load -> anonymous session -> "Continue with Google" -> redirect back -> entries sync
//
// The units are exercised together against one in-memory fake of the Supabase client, because
// every regression this file is guarding against lives in the *seams* between them (which
// identity the entries end up under, what survives a redirect, what happens on the way back),
// not inside any single function.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeUser {
  id: string
  is_anonymous: boolean
}

interface FakeSession {
  user: FakeUser
}

/**
 * A stand-in for the parts of `supabase.auth` this journey touches.
 *
 * `linkIdentity` and `signInWithOAuth` model the real thing faithfully in the one way that
 * matters here: they are *redirect* flows. Neither reports a server-side failure through its
 * return value — the browser leaves, and any error comes back later in the URL fragment.
 */
class FakeAuth {
  session: FakeSession | null = null
  /** Identities already claimed by some other account, keyed by provider. */
  takenIdentities = new Set<string>()
  /** What the fragment would contain when the browser lands back on the app. */
  redirectFragment = ''
  calls: string[] = []
  lastRedirectTo: string | null = null

  async getSession() {
    return { data: { session: this.session }, error: null }
  }

  async signInAnonymously() {
    this.calls.push('signInAnonymously')
    this.session = { user: { id: `anon-${this.calls.length}`, is_anonymous: true } }
    return { data: { session: this.session }, error: null }
  }

  async linkIdentity({ provider, options }: { provider: string; options: { redirectTo: string } }) {
    this.calls.push('linkIdentity')
    this.lastRedirectTo = options.redirectTo
    if (this.takenIdentities.has(provider)) {
      // GoTrue does not reject the call — it redirects, and reports the failure on the way back.
      this.redirectFragment = '#error=server_error&error_code=identity_already_exists' +
        '&error_description=Identity+is+already+linked+to+another+user'
      return { data: null, error: null }
    }
    this.session = { user: { id: this.session!.user.id, is_anonymous: false } }
    this.redirectFragment = '#access_token=fake&token_type=bearer'
    return { data: null, error: null }
  }

  async signInWithOAuth({ options }: { provider: string; options: { redirectTo: string } }) {
    this.calls.push('signInWithOAuth')
    this.lastRedirectTo = options.redirectTo
    this.session = { user: { id: 'google-user', is_anonymous: false } }
    this.redirectFragment = '#access_token=fake&token_type=bearer'
    return { data: null, error: null }
  }

  async signOut() {
    this.calls.push('signOut')
    this.session = null
    // EntriesContext.refresh() is bound to focus/pageshow/visibilitychange/online and calls
    // ensureUserId(), which mints a new anonymous user the moment one is missing. Modelling
    // that here is the point: signing out does not reliably leave the app signed out.
    if (this.anonymousSessionReturnsAfterSignOut) {
      this.session = { user: { id: 'anon-respawned', is_anonymous: true } }
    }
    return { error: null }
  }

  /** Set to reproduce the race that made the recovery button loop forever. */
  anonymousSessionReturnsAfterSignOut = false

  onAuthStateChange() {
    return { data: { subscription: { unsubscribe: () => {} } } }
  }
}

let auth: FakeAuth

vi.mock('./lib/supabaseClient', () => ({
  getSupabase: () => ({ auth }),
  isSupabaseConfigured: () => true,
}))

import { ensureUserId } from './api'
import { signInWithGoogle, signInWithGoogleAsExistingAccount } from './sharedBudgets/sharedApi'

const APP_ORIGIN = 'https://budget-tracker-sooty-ten.vercel.app'

beforeEach(() => {
  auth = new FakeAuth()
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('window', { location: { origin: APP_ORIGIN } })
})

describe('new user: first load', () => {
  it('silently creates an anonymous session so entries can be captured before sign-in', async () => {
    const userId = await ensureUserId()

    expect(auth.calls).toEqual(['signInAnonymously'])
    expect(userId).toBe('anon-1')
    expect(auth.session?.user.is_anonymous).toBe(true)
  })

  it('reuses an existing session instead of stacking a second anonymous user', async () => {
    auth.session = { user: { id: 'existing', is_anonymous: false } }

    await expect(ensureUserId()).resolves.toBe('existing')
    expect(auth.calls).not.toContain('signInAnonymously')
  })

  it('never creates two anonymous users when concurrent callers race', async () => {
    const [a, b, c] = await Promise.all([ensureUserId(), ensureUserId(), ensureUserId()])

    expect(auth.calls).toEqual(['signInAnonymously'])
    expect([a, b, c]).toEqual(['anon-1', 'anon-1', 'anon-1'])
  })
})

describe('new user: continue with Google', () => {
  it('links Google onto the anonymous account so entries keep their owner', async () => {
    const anonId = await ensureUserId()

    await signInWithGoogle()

    expect(auth.calls).toContain('linkIdentity')
    expect(auth.calls).not.toContain('signInWithOAuth')
    // The uid surviving the upgrade is the whole point: entries are keyed by user_id.
    expect(auth.session?.user.id).toBe(anonId)
    expect(auth.session?.user.is_anonymous).toBe(false)
  })

  it('sends the browser back to the app own origin, never a foreign host', async () => {
    await ensureUserId()

    await signInWithGoogle()

    // Regression guard for the 2026-08-02 incident: Supabase silently falls back to its
    // configured site_url when redirectTo is not allow-listed, which sent users to the retired
    // Netlify deployment. The client must always ask for its own origin.
    expect(auth.lastRedirectTo).toBe(APP_ORIGIN)
    expect(new URL(auth.lastRedirectTo!).origin).toBe(APP_ORIGIN)
  })

  it('signs in normally when there is no anonymous session to preserve', async () => {
    auth.session = null
    // A user who has never touched the app in this storage jar and goes straight to sign-in.

    await signInWithGoogle()

    expect(auth.calls).toEqual(['signInWithOAuth'])
  })
})

describe('new user: returning from Google', () => {
  it('reports a successful round trip as a token fragment', async () => {
    await ensureUserId()

    await signInWithGoogle()

    expect(auth.redirectFragment).toContain('access_token')
    expect(auth.session?.user.is_anonymous).toBe(false)
  })

  // ---------------------------------------------------------------------------------------
  // The reinstall / second-device case.
  //
  // The user already has a real account (they signed in before). On a fresh storage jar --
  // a reinstalled home-screen PWA, a new device, cleared site data -- the app has no session,
  // so it mints a NEW anonymous user first. "Continue with Google" therefore takes the
  // linkIdentity branch, and linking an identity that already belongs to another account
  // fails. The failure arrives in the URL fragment, which nothing in the app reads.
  // ---------------------------------------------------------------------------------------
  it('surfaces the failure when the Google account is already registered', async () => {
    auth.takenIdentities.add('google')
    await ensureUserId()

    await signInWithGoogle()

    expect(auth.redirectFragment).toContain('identity_already_exists')
    // The user is still anonymous, and their real account's entries are nowhere to be seen.
    expect(auth.session?.user.is_anonymous).toBe(true)

    // Nothing in the app inspects the fragment for `error_code`, so this dead end is invisible:
    // the user lands back on the settings screen looking exactly as they did before they left.
    const { readAuthErrorFromHash } = await import('./authRedirectError')
    expect(readAuthErrorFromHash(auth.redirectFragment)).toEqual({
      code: 'identity_already_exists',
      message: 'Identity is already linked to another user',
    })
  })

  // ---------------------------------------------------------------------------------------
  // Recovering from that dead end. The obvious implementation -- sign out, then run the normal
  // sign-in which re-checks the session -- loops: an anonymous session reappears between the
  // two steps, so the re-check picks linkIdentity again and hits the identical error. The
  // recovery has to commit to a plain sign-in without consulting the session at all.
  // ---------------------------------------------------------------------------------------
  it('recovers with a plain sign-in even when an anonymous session respawns mid-recovery', async () => {
    auth.takenIdentities.add('google')
    auth.anonymousSessionReturnsAfterSignOut = true
    await ensureUserId()
    await signInWithGoogle()
    expect(auth.redirectFragment).toContain('identity_already_exists')

    auth.calls = []
    await signInWithGoogleAsExistingAccount()

    expect(auth.calls).toEqual(['signOut', 'signInWithOAuth'])
    // The regression: a second linkIdentity here is what produced the same error forever.
    expect(auth.calls).not.toContain('linkIdentity')
    expect(auth.redirectFragment).toContain('access_token')
    expect(auth.session?.user.is_anonymous).toBe(false)
  })

  it('recovery still works when signing out does leave the app signed out', async () => {
    auth.anonymousSessionReturnsAfterSignOut = false
    await ensureUserId()

    await signInWithGoogleAsExistingAccount()

    expect(auth.calls).toEqual(['signInAnonymously', 'signOut', 'signInWithOAuth'])
    expect(auth.session?.user.is_anonymous).toBe(false)
  })

  it('ignores an ordinary hash-router path', async () => {
    const { readAuthErrorFromHash } = await import('./authRedirectError')

    expect(readAuthErrorFromHash('#/settings/automatic')).toBeNull()
    expect(readAuthErrorFromHash('#access_token=fake&token_type=bearer')).toBeNull()
    expect(readAuthErrorFromHash('')).toBeNull()
  })
})

// A parser nothing calls protects nobody. supabase-js raises no auth event for a failed
// redirect, so unless app code reads the fragment the failure stays invisible at runtime.
describe('new user: the failure is actually surfaced', () => {
  const srcRoot = dirname(fileURLToPath(import.meta.url))

  function appSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return appSources(path)
      if (!['.ts', '.tsx'].includes(extname(entry.name))) return []
      if (entry.name.includes('.test.')) return []
      if (entry.name === 'authRedirectError.ts') return []
      return [path]
    })
  }

  const relative = (path: string) =>
    path.slice(resolve(srcRoot, '..').length + 1).replaceAll('\\', '/')

  function importersOf(symbol: string): string[] {
    return appSources(srcRoot)
      .filter(path => {
        const source = readFileSync(path, 'utf8')
        return source.includes("from '../authRedirectError'") || source.includes("from './authRedirectError'")
          ? source.includes(symbol)
          : false
      })
      .map(relative)
  }

  it('captures the fragment before the router replaces it', () => {
    // Ordering is the whole trick: `normaliseInitialRoute` overwrites any hash that is not a
    // route, and `#error=…` is not a route.
    const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
    // Scoped to the component body: the `normaliseInitialRoute(): void` declaration higher up
    // the file would otherwise match before either call site.
    const appBody = app.slice(app.indexOf('export default function App()'))

    expect(importersOf('captureAuthRedirectError')).toContain('src/App.tsx')
    expect(appBody).toContain('captureAuthRedirectError()')
    expect(appBody.indexOf('captureAuthRedirectError()')).toBeLessThan(
      appBody.indexOf('normaliseInitialRoute()'),
    )
  })

  it('renders the captured error somewhere the user will see it', () => {
    expect(importersOf('peekAuthRedirectError')).not.toEqual([])

    const app = readFileSync(join(srcRoot, 'App.tsx'), 'utf8')
    expect(app).toContain('<AuthErrorBanner />')
  })
})
