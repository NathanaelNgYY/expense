import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSupabase,
  getSupabaseProjectRef,
  isSupabaseConfigured,
  validateSupabaseEnvironment,
} from './supabaseClient'

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

  it('extracts and logs only the Supabase project reference', () => {
    expect(getSupabaseProjectRef('https://rjwzzsocxykbfellsihr.supabase.co')).toBe('rjwzzsocxykbfellsihr')
    const log = vi.fn()

    validateSupabaseEnvironment(
      'https://rjwzzsocxykbfellsihr.supabase.co',
      'rjwzzsocxykbfellsihr',
      log,
    )

    expect(log).toHaveBeenCalledWith('Supabase project: rjwzzsocxykbfellsihr')
    expect(JSON.stringify(log.mock.calls)).not.toContain('sb_publishable_')
  })

  it('rejects a build whose Supabase URL does not match the expected project', () => {
    expect(() => validateSupabaseEnvironment(
      'https://igsjhpfymspbyzqzpzme.supabase.co',
      'rjwzzsocxykbfellsihr',
      vi.fn(),
    )).toThrow('Supabase project mismatch')
  })

  it('requires an expected project reference for production validation', () => {
    expect(() => validateSupabaseEnvironment(
      'https://rjwzzsocxykbfellsihr.supabase.co',
      '',
      vi.fn(),
      true,
    )).toThrow('Expected Supabase project reference is required in production')
  })
})
