import { describe, it, expect } from 'vitest'
import { buildEntryFromIngest } from './entry'

describe('buildEntryFromIngest', () => {
  it('builds an apple-pay entry with a labelled note, guessed category and dedupeKey', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'apple_pay', amount: 4.5, merchant: 'Ya Kun Kaya Toast', occurredAt: '2026-06-09T08:15:00+08:00' },
      () => 'fixed-id',
    )
    expect(entry).toMatchObject({
      id: 'fixed-id',
      amount: 4.5,
      category: 'lunch',
      note: 'Apple Pay · Ya Kun Kaya Toast',
      date: '2026-06-09',
      source: 'apple-pay',
      merchant: 'Ya Kun Kaya Toast',
      currency: 'SGD',
      dedupeKey: 'apple_pay:2026-06-09:4.50:ya-kun-kaya-toast',
    })
  })

  it('labels a PayNow email note and maps dbs_email to dbs-email source', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'dbs_email', channel: 'paynow', amount: 7.2, merchant: 'AH HUAT TRADING', occurredAt: '2026-06-10T12:00:00+08:00' },
      () => 'id2',
    )
    expect(entry.source).toBe('dbs-email')
    expect(entry.note).toBe('PayNow · AH HUAT TRADING')
    expect(entry.dedupeKey).toBe('dbs_email:2026-06-10:7.20:ah-huat-trading')
  })

  it('labels a card email note', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'dbs_email', channel: 'card', amount: 12, merchant: 'NTUC FairPrice', occurredAt: '2026-06-09T08:15:00+08:00' },
      () => 'id3',
    )
    expect(entry.note).toBe('Card · NTUC FairPrice')
    expect(entry.category).toBe('others') // grocery keyword is a real classification
  })

  it('leaves an unknown payee Uncategorized instead of defaulting to others', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'dbs_email', channel: 'paynow', amount: 7.2, merchant: 'AH HUAT TRADING' },
      () => 'id4',
    )
    expect(entry.category).toBeNull()
  })

  it('prefers a learned category over the keyword guess', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'dbs_email', channel: 'paynow', amount: 7.2, merchant: 'AH HUAT TRADING', learnedCategory: 'lunch' },
      () => 'id5',
    )
    expect(entry.category).toBe('lunch')
  })

  it('uses just the source label as the note when no merchant was parsed', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'apple_pay', amount: 9.9, merchant: '' },
      () => 'id6',
      new Date('2026-06-09T08:15:00+08:00'),
    )
    expect(entry.note).toBe('Apple Pay')
    expect(entry.category).toBeNull()
  })

  it('defaults occurredAt to now when missing', () => {
    const entry = buildEntryFromIngest(
      { sourceKind: 'apple_pay', amount: 1, merchant: 'X' },
      () => 'id7',
      new Date('2026-06-09T08:15:00+08:00'),
    )
    expect(entry.date).toBe('2026-06-09')
    expect(typeof entry.occurredAt).toBe('string')
  })
})
