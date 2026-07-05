import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read lazily (not at module top level) so tests can stub env vars.
function env() {
  return {
    url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '',
    anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '',
  }
}

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = env()
  return Boolean(url && anonKey)
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured')
  if (!client) {
    const { url, anonKey } = env()
    client = createClient(url, anonKey)
  }
  return client
}
