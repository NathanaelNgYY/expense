import { describe, it, expect } from 'vitest'
import type { Entry } from '../../../src/types'
import { handleIngest, type IngestStore } from './handler'

class InMemoryStore implements IngestStore {
  private map = new Map<string, Entry>()

  async list(): Promise<Entry[]> {
    return [...this.map.values()]
  }
  async has(dedupeKey: string): Promise<boolean> {
    return this.map.has(dedupeKey)
  }
  async put(entry: Entry): Promise<void> {
    this.map.set(entry.dedupeKey as string, entry)
  }
}

const makeId = () => 'fixed-id'

describe('edge ingest handler', () => {
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
})
