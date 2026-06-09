import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEntries, createEntryApi, ApiError } from './api'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('api_token', 'tok')
  vi.restoreAllMocks()
})

describe('api client', () => {
  it('sends the bearer token and parses entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: '1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const entries = await fetchEntries()
    expect(entries.length).toBe(1)
    const [, opts] = fetchMock.mock.calls[0]
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('throws ApiError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    await expect(fetchEntries()).rejects.toBeInstanceOf(ApiError)
  })

  it('posts a new entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'x', amount: 5, category: 'lunch', note: 'k', date: '2026-06-09' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const entry = await createEntryApi({ amount: 5, category: 'lunch', note: 'k', date: '2026-06-09' })
    expect(entry.id).toBe('x')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/entries')
    expect(opts.method).toBe('POST')
  })
})
