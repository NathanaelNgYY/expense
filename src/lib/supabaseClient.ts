import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read lazily (not at module top level) so tests can stub env vars.
function env() {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '',
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '',
    expectedProjectRef: (import.meta.env.VITE_EXPECTED_SUPABASE_PROJECT_REF as string | undefined) || '',
  }
}

export function getSupabaseProjectRef(url: string): string | null {
  try {
    const hostname = new URL(url).hostname
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(hostname)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function validateSupabaseEnvironment(
  url: string,
  expectedProjectRef: string,
  log: (message: string) => void = console.info,
  production = false,
): string {
  const actualProjectRef = getSupabaseProjectRef(url)
  if (!actualProjectRef) throw new Error('Invalid Supabase URL')
  if (production && !expectedProjectRef) {
    throw new Error('Expected Supabase project reference is required in production')
  }
  if (expectedProjectRef && actualProjectRef !== expectedProjectRef) {
    throw new Error(`Supabase project mismatch: expected ${expectedProjectRef}, received ${actualProjectRef}`)
  }
  log(`Supabase project: ${actualProjectRef}`)
  return actualProjectRef
}

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = env()
  return Boolean(url && anonKey)
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  if (!client) {
    const { url, anonKey, expectedProjectRef } = env()
    // The expected ref is public environment identity, not a credential. Staging deployments set
    // it so a production URL cannot silently be baked into a staging bundle.
    validateSupabaseEnvironment(url, expectedProjectRef, console.info, import.meta.env.PROD)
    client = createClient(url, anonKey)
  }
  return client
}
