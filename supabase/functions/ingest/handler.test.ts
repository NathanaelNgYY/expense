import { describe, it, expect } from 'vitest'
import type { Entry } from '../../../src/types'
import type { AutomaticCategoryRule } from '../../../src/shared/automaticCategoryRules'
import { activeTokenUserId, handleIngest, type IngestStore } from './handler'

class InMemoryStore implements IngestStore {
  private map = new Map<string, Entry>()

  constructor(private rules: AutomaticCategoryRule[] = []) {}

  async list(): Promise<Entry[]> {
    return [...this.map.values()]
  }
  async has(dedupeKey: string): Promise<boolean> {
    return this.map.has(dedupeKey)
  }
  async put(entry: Entry): Promise<void> {
    this.map.set(entry.dedupeKey as string, entry)
  }
  async listAutomaticCategoryRules(): Promise<AutomaticCategoryRule[]> {
    return this.rules
  }
}

class CaptureAwareStore extends InMemoryStore {
  captures: Array<'apple_pay' | 'dbs_email'> = []

  async recordCapture(sourceKind: 'apple_pay' | 'dbs_email'): Promise<void> {
    this.captures.push(sourceKind)
  }
}

class BrokenPreferencesStore extends InMemoryStore {
  async listAutomaticCategoryRules(): Promise<AutomaticCategoryRule[]> {
    throw new Error('preferences unavailable')
  }
}

class MerchantPreferenceStore extends InMemoryStore {
  async categoryPreferenceForMerchant(merchant: string): Promise<string | null> {
    return merchant.toLowerCase().includes('cray ventures') ? 'cat_dinner' : null
  }
}

class CurrencyPreferenceStore extends InMemoryStore {
  lookups: string[] = []
  async categoryPreferenceForMerchant(_merchant: string, currency: string): Promise<string | null> {
    this.lookups.push(currency)
    return currency === 'MYR' ? 'cat_mamak' : 'lunch'
  }
}

const makeId = () => 'fixed-id'

describe('edge ingest handler', () => {
  it('looks up learned merchant categories within the captured currency', async () => {
    const store = new CurrencyPreferenceStore()
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 8, merchant: 'Kopitiam', currency: ' myr ', idempotencyKey: 'myr-kopi' },
      store,
      makeId,
    )
    expect(store.lookups).toEqual(['MYR'])
    expect(result.status === 'saved' && result.entry.category).toBe('cat_mamak')
  })
  it('uses a generated id in the default production path', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', idempotencyKey: 'generated-id-event' },
      store,
    )

    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('saves an apple pay transaction with merchant, source and dedupe key', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00Z' },
      store,
      makeId,
    )
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(result.entry.source).toBe('apple-pay')
    expect(result.entry.kind).toBe('expense')
    expect(result.entry.merchant).toBe('Ya Kun')
    expect(result.entry.note).toBe('Apple Pay · Ya Kun')
    expect(result.entry.dedupeKey).toBe('apple_pay:2026-07-11T04:00:00.000Z:4.20:ya-kun')
    expect(await store.has('apple_pay:2026-07-11T04:00:00.000Z:4.20:ya-kun')).toBe(true)
  })

  it('reports a duplicate instead of double-saving the same transaction', async () => {
    const store = new InMemoryStore()
    const body = { sourceKind: 'apple_pay' as const, amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00Z' }
    await handleIngest(body, store, makeId)
    const second = await handleIngest(body, store, makeId)
    expect(second.status).toBe('duplicate')
    expect((await store.list()).length).toBe(1)
  })

  it('records last-captured status for both saved and duplicate requests', async () => {
    const store = new CaptureAwareStore()
    const body = { sourceKind: 'apple_pay' as const, amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00Z' }

    await handleIngest(body, store, makeId)
    await handleIngest(body, store, makeId)

    expect(store.captures).toEqual(['apple_pay', 'apple_pay'])
  })

  it('deduplicates a re-fired Apple Pay event even when occurredAt changes', async () => {
    const store = new InMemoryStore()
    await handleIngest(
      {
        sourceKind: 'apple_pay',
        amount: 4.2,
        merchant: 'Ya Kun',
        occurredAt: '2026-07-11T04:00:00.000Z',
        idempotencyKey: 'wallet-transaction-123',
      },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      {
        sourceKind: 'apple_pay',
        amount: 4.2,
        merchant: 'Ya Kun',
        occurredAt: '2026-07-11T04:00:01.200Z',
        idempotencyKey: 'wallet-transaction-123',
      },
      store,
      () => 'second-id',
    )

    expect(second.status).toBe('duplicate')
    expect(await store.list()).toHaveLength(1)
  })

  it('keeps distinct Apple Pay events with the same merchant and amount in one minute', async () => {
    const store = new InMemoryStore()
    const common = {
      sourceKind: 'apple_pay' as const,
      amount: 4.2,
      merchant: 'Ya Kun',
      occurredAt: '2026-07-11T04:00:00.000Z',
    }

    const first = await handleIngest(
      { ...common, idempotencyKey: 'wallet-transaction-123' },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      { ...common, idempotencyKey: 'wallet-transaction-456' },
      store,
      () => 'second-id',
    )

    expect(first.status).toBe('saved')
    expect(second.status).toBe('saved')
    expect(await store.list()).toHaveLength(2)
  })

  it('uses a minute fallback for legacy Apple Pay shortcuts without an idempotency key', async () => {
    const store = new InMemoryStore()
    await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00.000Z' },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:01.200Z' },
      store,
      () => 'second-id',
    )

    expect(second.status).toBe('duplicate')
    expect(await store.list()).toHaveLength(1)
  })

  it('does not trust a Shortcut Input value that only repeats the merchant name', async () => {
    const store = new InMemoryStore()
    const shortcutBody = {
      sourceKind: 'apple_pay' as const,
      amount: 4.2,
      merchant: 'Ya Kun',
      idempotencyKey: 'Ya Kun',
    }

    const first = await handleIngest(
      { ...shortcutBody, occurredAt: '2026-07-11T04:00:00.000Z' },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      { ...shortcutBody, occurredAt: '2026-07-11T04:02:00.000Z' },
      store,
      () => 'second-id',
    )

    expect(first.status).toBe('saved')
    expect(second.status).toBe('saved')
    expect(await store.list()).toHaveLength(2)
  })

  it('keeps two equal purchases from the same merchant when their timestamps differ', async () => {
    const store = new InMemoryStore()
    const first = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00Z' },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, merchant: 'Ya Kun', occurredAt: '2026-07-11T05:00:00Z' },
      store,
      () => 'second-id',
    )

    expect(first.status).toBe('saved')
    expect(second.status).toBe('saved')
    expect(await store.list()).toHaveLength(2)
  })

  it('rejects a non-positive or non-numeric amount', async () => {
    const store = new InMemoryStore()
    expect((await handleIngest({ sourceKind: 'apple_pay', amount: 0 }, store)).status).toBe('error')
    expect((await handleIngest({ sourceKind: 'apple_pay', amount: NaN }, store)).status).toBe('error')
  })

  it('parses a DBS transaction-alert email body', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      {
        sourceKind: 'dbs_email',
        rawBody: 'You have made a PayNow transfer of SGD 5.70 to AH HUAT KOPI on 11 Jul.',
        occurredAt: '2026-07-11T04:00:00Z',
      },
      store,
      makeId,
    )
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(result.entry.source).toBe('dbs-email')
    expect(result.entry.amount).toBe(5.7)
    expect(result.entry.merchant).toBe('AH HUAT KOPI')
    expect(result.entry.category).toBe('lunch')
  })

  it('uses the DBS transaction time instead of a delayed email receipt time', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      {
        sourceKind: 'dbs_email',
        rawBody: `We refer to your PAYNOW dated 05 Jun.
Date & Time: 05 Jun 18:15 (SGT)
Amount: SGD5.70
To: LFH SEAFOOD (UEN ending 006C)`,
        occurredAt: '2026-06-07T03:00:00Z',
      },
      store,
      makeId,
    )

    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(result.entry.occurredAt).toBe('2026-06-05T10:15:00.000Z')
    expect(result.entry.date).toBe('2026-06-05')
  })

  it('puts a first-time person-to-person PayNow transfer in Others', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      {
        sourceKind: 'dbs_email',
        rawBody: `We refer to your PAYNOW dated 10 Jun.
Date & Time: 10 Jun 13:28 (SGT)
Amount: SGD7.20
To: KHXX JIX SHEXX (MOBILE ending 5998)`,
        occurredAt: '2026-06-12T03:00:00Z',
      },
      store,
      makeId,
    )

    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.category).toBe('others')
  })

  it('prefers a learned friend category over the person-to-person fallback', async () => {
    const store = new InMemoryStore()
    await store.put({
      id: 'friend-history',
      amount: 9,
      category: 'lunch',
      note: 'PayNow Â· KHXX JIX SHEXX',
      date: '2026-06-01',
      source: 'dbs-email',
      merchant: 'KHXX JIX SHEXX',
      dedupeKey: 'friend-history',
    })

    const result = await handleIngest(
      {
        sourceKind: 'dbs_email',
        rawBody: `We refer to your PAYNOW dated 10 Jun.
Date & Time: 10 Jun 13:28 (SGT)
Amount: SGD7.20
To: KHXX JIX SHEXX (MOBILE ending 5998)`,
        occurredAt: '2026-06-12T03:00:00Z',
      },
      store,
      makeId,
    )

    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.category).toBe('lunch')
  })

  it('deduplicates the same DBS email body when the automation re-fires later', async () => {
    const store = new InMemoryStore()
    const rawBody = 'You have made a PayNow transfer of SGD 5.70 to AH HUAT KOPI on 11 Jul.'
    await handleIngest(
      { sourceKind: 'dbs_email', rawBody, occurredAt: '2026-07-11T04:00:00.000Z' },
      store,
      () => 'first-id',
    )
    const second = await handleIngest(
      { sourceKind: 'dbs_email', rawBody, occurredAt: '2026-07-11T04:05:00.000Z' },
      store,
      () => 'second-id',
    )

    expect(second.status).toBe('duplicate')
    expect(await store.list()).toHaveLength(1)
  })

  it('rejects an oversized idempotency key at the request boundary', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.2, idempotencyKey: 'x'.repeat(501) },
      store,
    )

    expect(result).toEqual({ status: 'error', reason: 'invalid-idempotency-key' })
    expect(await store.list()).toHaveLength(0)
  })

  it('rejects a DBS email it cannot find an amount in', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest({ sourceKind: 'dbs_email', rawBody: 'OTP: 123456' }, store)
    expect(result.status).toBe('error')
  })

  it('rejects an unknown body shape', async () => {
    const store = new InMemoryStore()
    const result = await handleIngest({} as never, store)
    expect(result).toEqual({ status: 'error', reason: 'invalid-shape' })
  })

  it('reuses the category the user assigned to the same merchant before', async () => {
    const store = new InMemoryStore()
    await store.put({
      id: 'hist-1',
      amount: 4,
      category: 'lunch',
      note: 'Apple Pay · Ya Kun',
      date: '2026-07-01',
      source: 'apple-pay',
      merchant: 'Ya Kun',
      dedupeKey: 'apple_pay:2026-07-01:4.00:ya-kun',
    })
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 6, merchant: 'Ya Kun', occurredAt: '2026-07-11T04:00:00Z' },
      store,
      makeId,
    )
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(result.entry.category).toBe('lunch')
  })

  it('uses an explicit merchant preference before history and generic merchant guesses', async () => {
    const store = new MerchantPreferenceStore()
    await store.put({
      id: 'old-history',
      amount: 8,
      category: 'lunch',
      note: 'Apple Pay · Cray Ventures',
      date: '2026-07-01',
      source: 'apple-pay',
      merchant: 'Cray Ventures Pte Ltd',
      dedupeKey: 'old-history',
    })

    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 18, merchant: 'CRAY VENTURES PRIVATE LIMITED #02', occurredAt: '2026-07-18T11:30:00Z' },
      store,
      makeId,
    )

    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.category).toBe('cat_dinner')
  })

  it('uses a custom dinner category for a recognized food merchant in the configured SGT window', async () => {
    const store = new InMemoryStore([
      { id: 'dinner', categoryId: 'cat_dinner', startMinute: 16 * 60 + 30, endMinute: 24 * 60 },
    ])
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 8, merchant: 'Koufu', occurredAt: '2026-07-11T11:30:00Z' },
      store,
      makeId,
    )
    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.category).toBe('cat_dinner')
  })

  it('still captures when automatic category preferences cannot be loaded', async () => {
    const result = await handleIngest(
      { sourceKind: 'apple_pay', amount: 8, merchant: 'Koufu', occurredAt: '2026-07-11T11:30:00Z' },
      new BrokenPreferencesStore(),
      makeId,
    )
    expect(result.status).toBe('saved')
    if (result.status === 'saved') expect(result.entry.category).toBe('lunch')
  })
})

describe('activeTokenUserId — expired ingest tokens are rejected', () => {
  const NOW = new Date('2026-07-22T12:00:00Z')

  it('returns null for a missing token row', () => {
    expect(activeTokenUserId(null, NOW)).toBeNull()
  })

  it('returns the user id when expires_at is null (never expires)', () => {
    expect(activeTokenUserId({ user_id: 'u1', expires_at: null }, NOW)).toBe('u1')
  })

  it('returns the user id when expires_at is in the future', () => {
    expect(activeTokenUserId({ user_id: 'u1', expires_at: '2026-07-23T12:00:00Z' }, NOW)).toBe('u1')
  })

  it('returns null when expires_at is in the past', () => {
    expect(activeTokenUserId({ user_id: 'u1', expires_at: '2026-07-22T11:59:59Z' }, NOW)).toBeNull()
  })

  it('treats expires_at exactly at now as expired', () => {
    expect(activeTokenUserId({ user_id: 'u1', expires_at: NOW.toISOString() }, NOW)).toBeNull()
  })
})
