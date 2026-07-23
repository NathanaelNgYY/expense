import { describe, expect, it } from 'vitest'
import {
  ingestEndpointFromSupabaseUrl,
  normalizeApplePayShortcutUrl,
} from './automaticCapture'

describe('ingestEndpointFromSupabaseUrl', () => {
  it('derives the public Edge Function endpoint without exposing credentials', () => {
    expect(ingestEndpointFromSupabaseUrl('https://project-ref.supabase.co')).toBe(
      'https://project-ref.supabase.co/functions/v1/ingest',
    )
  })

  it.each(['', 'not a URL', 'ftp://project-ref.supabase.co']) (
    'rejects an unusable Supabase URL: %s',
    value => {
      expect(ingestEndpointFromSupabaseUrl(value)).toBeNull()
    },
  )
})

describe('normalizeApplePayShortcutUrl', () => {
  it('accepts an Apple-hosted shared Shortcut link and strips tracking data', () => {
    expect(normalizeApplePayShortcutUrl(
      'https://www.icloud.com/shortcuts/abc123?utm_source=setup#preview',
    )).toBe('https://www.icloud.com/shortcuts/abc123')
  })

  it.each([
    '',
    'not a URL',
    'http://www.icloud.com/shortcuts/abc123',
    'https://icloud.com/shortcuts/abc123',
    'https://example.com/shortcuts/abc123',
    'https://www.icloud.com/photos/abc123',
    'https://www.icloud.com/shortcuts/',
    'https://www.icloud.com/shortcuts/abc123/extra',
  ])('rejects an untrusted Shortcut installer URL: %s', value => {
    expect(normalizeApplePayShortcutUrl(value)).toBeNull()
  })
})
