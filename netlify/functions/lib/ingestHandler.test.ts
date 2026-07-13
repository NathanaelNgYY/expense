import { describe, it, expect } from 'vitest'
import { handleIngest } from './ingestHandler'
import { InMemoryEntryStore } from './store'

const ID = () => 'fixed-id'

describe('handleIngest', () => {
  it('saves an apple_pay transaction', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest(
      { sourceKind: 'apple_pay', amount: 4.5, merchant: 'Ya Kun', occurredAt: '2026-06-09T08:15:00+08:00' },
      store,
      ID,
    )
    expect(res.status).toBe('saved')
    expect((await store.list()).length).toBe(1)
  })

  it('parses a dbs_email transaction from rawBody', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest(
      { sourceKind: 'dbs_email', rawBody: 'Amount: SGD 12.00\nTo: NTUC FAIRPRICE', occurredAt: '2026-06-09T08:15:00+08:00' },
      store,
      ID,
    )
    expect(res.status).toBe('saved')
    if (res.status === 'saved') expect(res.entry.amount).toBe(12)
  })

  it('returns duplicate on repeated dedupeKey', async () => {
    const store = new InMemoryEntryStore()
    const payload = { sourceKind: 'apple_pay' as const, amount: 4.5, merchant: 'Ya Kun', occurredAt: '2026-06-09T08:15:00+08:00' }
    await handleIngest(payload, store, ID)
    const res = await handleIngest(payload, store, ID)
    expect(res.status).toBe('duplicate')
    expect((await store.list()).length).toBe(1)
  })

  it('matches the stable idempotency contract used by the Supabase handler', async () => {
    const store = new InMemoryEntryStore()
    await handleIngest(
      {
        sourceKind: 'apple_pay',
        amount: 4.5,
        merchant: 'Ya Kun',
        occurredAt: '2026-06-09T08:15:00.000Z',
        idempotencyKey: 'wallet-transaction-123',
      },
      store,
      () => 'first-id',
    )
    const res = await handleIngest(
      {
        sourceKind: 'apple_pay',
        amount: 4.5,
        merchant: 'Ya Kun',
        occurredAt: '2026-06-09T08:15:01.200Z',
        idempotencyKey: 'wallet-transaction-123',
      },
      store,
      () => 'second-id',
    )

    expect(res.status).toBe('duplicate')
    expect(await store.list()).toHaveLength(1)
  })

  it('rejects invalid amount', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest({ sourceKind: 'apple_pay', amount: 0, merchant: 'X' }, store, ID)
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.reason).toBe('invalid-amount')
  })

  it('rejects unparseable dbs email', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest({ sourceKind: 'dbs_email', rawBody: 'no money here' }, store, ID)
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.reason).toBe('no-amount')
  })

  it('rounds apple_pay amount to 2 decimal places', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest({ sourceKind: 'apple_pay', amount: 4.567, merchant: 'Ya Kun' }, store, ID)
    expect(res.status).toBe('saved')
    if (res.status === 'saved') expect(res.entry.amount).toBe(4.57)
  })

  it('labels the note with the source when merchant/currency are omitted', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest({ sourceKind: 'apple_pay', amount: 9.9 }, store, ID)
    expect(res.status).toBe('saved')
    if (res.status === 'saved') {
      expect(res.entry.merchant).toBe('')
      expect(res.entry.note).toBe('Apple Pay')
      expect(res.entry.currency).toBe('SGD')
      expect(res.entry.source).toBe('apple-pay')
    }
  })

  it('labels a PayNow email note and leaves an unknown payee Uncategorized', async () => {
    const store = new InMemoryEntryStore()
    const rawBody = [
      'We refer to your PAYNOW dated 10 Jun.',
      'Amount: SGD7.20',
      'From: My Account A/C ending 0450',
      'To: AH HUAT TRADING (UEN ending 123A)',
    ].join('\n')
    const res = await handleIngest({ sourceKind: 'dbs_email', rawBody, occurredAt: '2026-06-10T12:00:00+08:00' }, store, ID)
    expect(res.status).toBe('saved')
    if (res.status === 'saved') {
      expect(res.entry.amount).toBe(7.2)
      expect(res.entry.note).toBe('PayNow · AH HUAT TRADING')
      expect(res.entry.category).toBeNull()
    }
  })

  it('applies a category the user previously gave the same payee', async () => {
    const store = new InMemoryEntryStore()
    await store.put({
      id: 'prior',
      amount: 7.2,
      category: 'lunch',
      note: 'PayNow · AH HUAT TRADING',
      date: '2026-06-10',
      merchant: 'AH HUAT TRADING',
      occurredAt: '2026-06-10T12:00:00+08:00',
      dedupeKey: 'prior',
    })
    const rawBody = ['We refer to your PAYNOW.', 'Amount: SGD7.20', 'To: AH HUAT TRADING (UEN ending 123A)'].join('\n')
    const res = await handleIngest(
      { sourceKind: 'dbs_email', rawBody, occurredAt: '2026-06-12T12:00:00+08:00' },
      store,
      ID,
    )
    expect(res.status).toBe('saved')
    if (res.status === 'saved') expect(res.entry.category).toBe('lunch')
  })

  it('rejects a non-finite apple_pay amount', async () => {
    const store = new InMemoryEntryStore()
    const res = await handleIngest({ sourceKind: 'apple_pay', amount: Number.NaN, merchant: 'X' }, store, ID)
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.reason).toBe('invalid-amount')
  })

  it('rejects an unknown sourceKind with invalid-shape', async () => {
    const store = new InMemoryEntryStore()
    // @ts-expect-error — exercising a malformed payload the Shortcut could send
    const res = await handleIngest({ sourceKind: 'venmo', amount: 5 }, store, ID)
    expect(res.status).toBe('error')
    if (res.status === 'error') expect(res.reason).toBe('invalid-shape')
  })
})
