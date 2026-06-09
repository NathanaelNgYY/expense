import { describe, it, expect } from 'vitest'
import { normalizeMerchant, buildDedupeKey } from './dedupe'

describe('normalizeMerchant', () => {
  it('lowercases and hyphenates', () => {
    expect(normalizeMerchant('Ya Kun Kaya Toast')).toBe('ya-kun-kaya-toast')
  })
  it('falls back to unknown when empty', () => {
    expect(normalizeMerchant('   ')).toBe('unknown')
  })
})

describe('buildDedupeKey', () => {
  it('builds a deterministic key for ingested transactions', () => {
    expect(buildDedupeKey('apple_pay', '2026-06-09', 4.5, 'Ya Kun')).toBe('apple_pay:2026-06-09:4.50:ya-kun')
  })
  it('builds a manual key from id', () => {
    expect(buildDedupeKey('manual', '2026-06-09', 4.5, '', 'abc-123')).toBe('manual:abc-123')
  })
})
