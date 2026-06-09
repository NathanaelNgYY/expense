import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory stand-in for the Netlify Blobs store, shared across every
// `new BlobEntryStore()` (each calls getStore('entries')). This exercises the
// real ingest.ts / entries.ts wrappers — auth, routing, status codes, JSON —
// without the Netlify runtime. (True Blobs behaviour is verified on deploy.)
const { store } = vi.hoisted(() => {
  const map = new Map<string, unknown>()
  return {
    store: {
      map,
      async get(key: string) {
        return map.has(key) ? map.get(key) : null
      },
      async setJSON(key: string, value: unknown) {
        map.set(key, value)
      },
      async list() {
        return { blobs: [...map.keys()].map(key => ({ key })) }
      },
      async delete(key: string) {
        map.delete(key)
      },
    },
  }
})

vi.mock('@netlify/blobs', () => ({ getStore: () => store }))

import ingest from './ingest'
import entries from './entries'

type AnyContext = { params?: Record<string, string> }

function makeReq(url: string, method: string, body?: unknown, token: string | null = 'tok'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  store.map.clear()
  process.env.INGEST_TOKEN = 'tok'
})

describe('POST /api/ingest', () => {
  const applePay = {
    sourceKind: 'apple_pay',
    amount: 4.5,
    merchant: 'Ya Kun',
    occurredAt: '2026-06-09T08:15:00+08:00',
  }

  it('saves an apple_pay transaction', async () => {
    const res = await ingest(makeReq('http://x/api/ingest', 'POST', applePay), {} as AnyContext as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'saved', entry: { amount: 4.5, merchant: 'Ya Kun' } })
  })

  it('returns duplicate on a repeated transaction', async () => {
    await ingest(makeReq('http://x/api/ingest', 'POST', applePay), {} as AnyContext as never)
    const res = await ingest(makeReq('http://x/api/ingest', 'POST', applePay), {} as AnyContext as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'duplicate' })
    expect(store.map.size).toBe(1)
  })

  it('parses a dbs_email transaction', async () => {
    const res = await ingest(
      makeReq('http://x/api/ingest', 'POST', { sourceKind: 'dbs_email', rawBody: 'Amount: SGD 12.00\nTo: NTUC FAIRPRICE' }),
      {} as AnyContext as never,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'saved', entry: { amount: 12 } })
  })

  it('rejects an invalid amount with 400', async () => {
    const res = await ingest(
      makeReq('http://x/api/ingest', 'POST', { sourceKind: 'apple_pay', amount: 0, merchant: 'X' }),
      {} as AnyContext as never,
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ status: 'error', reason: 'invalid-amount' })
  })

  it('rejects a non-POST method with 405', async () => {
    const res = await ingest(makeReq('http://x/api/ingest', 'GET'), {} as AnyContext as never)
    expect(res.status).toBe(405)
  })

  it('rejects a missing/wrong token with 401', async () => {
    const res = await ingest(makeReq('http://x/api/ingest', 'POST', applePay, null), {} as AnyContext as never)
    expect(res.status).toBe(401)
  })
})

describe('/api/entries CRUD', () => {
  const manual = { amount: 5, category: 'lunch', note: 'kopi', date: '2026-06-09' }

  it('lists, creates, updates and deletes', async () => {
    // empty list
    let res = await entries(makeReq('http://x/api/entries', 'GET'), { params: {} } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])

    // create
    res = await entries(makeReq('http://x/api/entries', 'POST', manual), { params: {} } as never)
    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string; source: string }
    expect(created.source).toBe('manual')

    // list now has it
    res = await entries(makeReq('http://x/api/entries', 'GET'), { params: {} } as never)
    expect((await res.json()) as unknown[]).toHaveLength(1)

    // update
    res = await entries(
      makeReq(`http://x/api/entries/${created.id}`, 'PUT', { amount: 9 }),
      { params: { id: created.id } } as never,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ amount: 9 })

    // delete
    res = await entries(
      makeReq(`http://x/api/entries/${created.id}`, 'DELETE'),
      { params: { id: created.id } } as never,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'deleted' })

    // empty again
    res = await entries(makeReq('http://x/api/entries', 'GET'), { params: {} } as never)
    expect((await res.json()) as unknown[]).toHaveLength(0)
  })

  it('rejects a missing token with 401', async () => {
    const res = await entries(makeReq('http://x/api/entries', 'GET', undefined, null), { params: {} } as never)
    expect(res.status).toBe(401)
  })

  it('returns 404 when updating a missing id', async () => {
    const res = await entries(
      makeReq('http://x/api/entries/nope', 'PUT', { amount: 1 }),
      { params: { id: 'nope' } } as never,
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 on a malformed JSON body instead of crashing', async () => {
    const req = new Request('http://x/api/entries', {
      method: 'POST',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: '{not json',
    })
    const res = await entries(req, { params: {} } as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid-json' })
  })
})
