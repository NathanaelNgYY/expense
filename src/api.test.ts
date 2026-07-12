import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lib/supabaseClient', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabase: vi.fn(),
}))

import { getSupabase, isSupabaseConfigured } from './lib/supabaseClient'
import {
  fetchEntries,
  createEntryApi,
  updateEntryApi,
  deleteEntryApi,
  ApiError,
  isPermanentFailure,
  isAuthFailure,
} from './api'

interface FakeResult {
  data: unknown
  error: { message: string; status?: number } | null
  status: number
}

// supabase-js query builders are chainable thenables; this fake mirrors that shape.
interface FakeBuilder {
  select: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  then: (resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
}

function makeBuilder(result: FakeResult): FakeBuilder {
  const builder = {} as FakeBuilder
  for (const method of ['select', 'order', 'upsert', 'update', 'eq', 'delete'] as const) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return builder
}

function stubSupabase(result: FakeResult, session: { user: { id: string } } | null = { user: { id: 'u1' } }) {
  const builder = makeBuilder(result)
  const signInAnonymously = vi.fn().mockResolvedValue({
    data: { session: { user: { id: 'anon-1' } } },
    error: null,
  })
  const fake = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      signInAnonymously,
    },
    from: vi.fn(() => builder),
  }
  vi.mocked(getSupabase).mockReturnValue(fake as unknown as ReturnType<typeof getSupabase>)
  return { fake, builder, signInAnonymously }
}

const serverRow = {
  id: 'e1',
  user_id: 'u1',
  amount: 4.2,
  category: 'lunch',
  note: 'kopi',
  date: '2026-07-11',
  source: 'apple-pay',
  merchant: 'Kopitiam',
  occurred_at: '2026-07-11T04:00:00Z',
  currency: 'SGD',
  import_key: null,
  dedupe_key: 'apple_pay:2026-07-11:4.20:kopitiam',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(isSupabaseConfigured).mockReturnValue(true)
})

describe('api client', () => {
  it('fetches entries and maps snake_case rows to the Entry shape', async () => {
    stubSupabase({ data: [serverRow], error: null, status: 200 })
    const entries = await fetchEntries()
    expect(entries).toEqual([
      {
        id: 'e1',
        amount: 4.2,
        category: 'lunch',
        note: 'kopi',
        date: '2026-07-11',
        source: 'apple-pay',
        merchant: 'Kopitiam',
        occurredAt: '2026-07-11T04:00:00Z',
        currency: 'SGD',
        dedupeKey: 'apple_pay:2026-07-11:4.20:kopitiam',
      },
    ])
  })

  it('creates a manual entry with a manual dedupe key and an idempotent upsert', async () => {
    const { builder } = stubSupabase({ data: null, error: null, status: 201 })
    const entry = await createEntryApi({ amount: 5, category: 'lunch', note: 'k', date: '2026-06-09', id: 'fixed-id' })
    expect(entry.id).toBe('fixed-id')
    expect(entry.source).toBe('manual')
    expect(entry.dedupeKey).toBe('manual:fixed-id')
    const [row, options] = builder.upsert.mock.calls[0]
    expect(row).toMatchObject({ id: 'fixed-id', user_id: 'u1', dedupe_key: 'manual:fixed-id' })
    expect(options).toEqual({ onConflict: 'id', ignoreDuplicates: true })
  })

  it('signs in anonymously when there is no session, once for concurrent calls', async () => {
    const { signInAnonymously } = stubSupabase({ data: [], error: null, status: 200 }, null)
    await Promise.all([fetchEntries(), fetchEntries()])
    expect(signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('surfaces an auth failure when anonymous sign-in is rejected', async () => {
    const { fake } = stubSupabase({ data: [], error: null, status: 200 }, null)
    fake.auth.signInAnonymously.mockResolvedValue({
      data: { session: null },
      error: { message: 'Anonymous sign-ins are disabled', status: 422 },
    })
    const failure = await fetchEntries().catch((e: unknown) => e)
    expect(isAuthFailure(failure)).toBe(true)
  })

  it('throws ApiError on a PostgREST error with a status', async () => {
    stubSupabase({ data: null, error: { message: 'JWT expired' }, status: 401 })
    const failure = await fetchEntries().catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(isAuthFailure(failure)).toBe(true)
  })

  it('throws a retryable plain error when the request never got a response', async () => {
    stubSupabase({ data: null, error: { message: 'Failed to fetch' }, status: 0 })
    const failure = await fetchEntries().catch((e: unknown) => e)
    expect(failure).not.toBeInstanceOf(ApiError)
    expect(isPermanentFailure(failure)).toBe(false)
  })

  it('reports 404 when updating an entry the server does not have', async () => {
    stubSupabase({ data: null, error: null, status: 200 })
    const failure = await updateEntryApi('ghost', { amount: 1 }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(404)
  })

  it('treats deleting an already-deleted entry as success', async () => {
    stubSupabase({ data: null, error: null, status: 204 })
    await expect(deleteEntryApi('gone')).resolves.toBeUndefined()
  })

  it('fails as an auth error when Supabase is not configured', async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false)
    const failure = await fetchEntries().catch((e: unknown) => e)
    expect(isAuthFailure(failure)).toBe(true)
  })
})

describe('isPermanentFailure', () => {
  it('treats a 404 as permanent so a stale delete cannot block the queue forever', () => {
    expect(isPermanentFailure(new ApiError(404, 'not-found'))).toBe(true)
  })

  it('treats a 400 as permanent because a malformed body never becomes valid', () => {
    expect(isPermanentFailure(new ApiError(400, 'invalid-json'))).toBe(true)
  })

  it('does not treat a 429 as permanent — rate limits lift on their own', () => {
    expect(isPermanentFailure(new ApiError(429, 'rate-limited'))).toBe(false)
  })

  it('does not treat a 5xx as permanent', () => {
    expect(isPermanentFailure(new ApiError(503, 'unavailable'))).toBe(false)
  })

  it('does not treat an auth failure as permanent — a fixed session makes it succeed', () => {
    expect(isPermanentFailure(new ApiError(401, 'unauthorized'))).toBe(false)
  })

  it('does not treat a network error as permanent', () => {
    expect(isPermanentFailure(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('isAuthFailure', () => {
  it('recognises 401 and 403', () => {
    expect(isAuthFailure(new ApiError(401, 'unauthorized'))).toBe(true)
    expect(isAuthFailure(new ApiError(403, 'forbidden'))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isAuthFailure(new ApiError(404, 'not-found'))).toBe(false)
    expect(isAuthFailure(new TypeError('Failed to fetch'))).toBe(false)
  })
})
