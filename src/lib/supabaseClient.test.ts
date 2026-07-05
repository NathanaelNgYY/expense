import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

describe('supabaseClient', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reports unconfigured and throws when env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(isSupabaseConfigured()).toBe(false)
    expect(() => getSupabase()).toThrow('Supabase is not configured')
  })

  it('reports configured when both env vars are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    expect(isSupabaseConfigured()).toBe(true)
    expect(getSupabase()).toBeTruthy()
  })
})
