import { describe, it, expect } from 'vitest'
import { buildEntryFromIngest } from './entry'

describe('buildEntryFromIngest', () => {
  it('builds an apple-pay entry with guessed category and dedupeKey', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'apple_pay', amount: 4.5, merchant: 'Ya Kun Kaya Toast', occurredAt: '2026-06-09T08:15:00+08:00' },
      () => 'fixed-id',
    )
    expect(entry).toMatchObject({
      id: 'fixed-id',
      amount: 4.5,
      category: 'lunch',
      note: 'Ya Kun Kaya Toast',
      date: '2026-06-09',
      source: 'apple-pay',
      merchant: 'Ya Kun Kaya Toast',
      currency: 'SGD',
      dedupeKey: 'apple_pay:2026-06-09:4.50:ya-kun-kaya-toast',
    })
  })

  it('maps dbs_email to dbs-email source', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'dbs_email', amount: 12, merchant: 'NTUC FairPrice', occurredAt: '2026-06-09T08:15:00+08:00' },
      () => 'id2',
    )
    expect(entry.source).toBe('dbs-email')
    expect(entry.category).toBe('others')
    expect(entry.dedupeKey).toBe('dbs_email:2026-06-09:12.00:ntuc-fairprice')
  })

  it('defaults occurredAt to now when missing', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'apple_pay', amount: 1, merchant: 'X' },
      () => 'id3',
      new Date('2026-06-09T08:15:00+08:00'),
    )
    expect(entry.date).toBe('2026-06-09')
    expect(typeof entry.occurredAt).toBe('string')
  })
})
