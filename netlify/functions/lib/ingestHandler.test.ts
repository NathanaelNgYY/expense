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
})
