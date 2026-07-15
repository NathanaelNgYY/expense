import { describe, expect, it } from 'vitest'
import { ingestEndpointFromSupabaseUrl } from './automaticCapture'

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
