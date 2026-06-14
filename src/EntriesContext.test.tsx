import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { EntriesProvider, useEntries } from './EntriesContext'
import type { Entry } from './types'

function Probe() {
  const { entries, addEntry } = useEntries()
  return (
    <div>
      <span data-testid="count">{entries.length}</span>
      <button onClick={() => addEntry({ amount: 3, category: 'lunch', note: 'k', date: '2026-06-09' })}>add</button>
    </div>
  )
}

function DeleteProbe() {
  const { entries, removeEntry, refresh } = useEntries()
  return (
    <div>
      <span data-testid="count">{entries.length}</span>
      <button onClick={() => void removeEntry('s1')}>del</button>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('EntriesContext', () => {
  it('renders cached entries immediately, then refreshes from API', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([{ id: 'c1', amount: 1, category: 'lunch', note: '', date: '2026-06-09' }]))
    localStorage.setItem('api_token', 'tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' },
        { id: 's2', amount: 3, category: 'lunch', note: '', date: '2026-06-09' },
      ]), { status: 200 }),
    ))
    render(<EntriesProvider><Probe /></EntriesProvider>)
    // cache first
    expect(screen.getByTestId('count').textContent).toBe('1')
    // then server refresh
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
  })

  it('optimistically adds and persists to cache when offline', async () => {
    localStorage.setItem('api_token', 'tok')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<EntriesProvider><Probe /></EntriesProvider>)
    await act(async () => {
      screen.getByText('add').click()
    })
    expect(screen.getByTestId('count').textContent).toBe('1')
    const cached = JSON.parse(localStorage.getItem('budget_entries') as string)
    expect(cached).toHaveLength(1)
    const queue = JSON.parse(localStorage.getItem('sync_queue') as string)
    expect(queue).toHaveLength(1)
  })

  it('keeps a just-added entry visible while the server list is briefly stale (Blobs eventual consistency)', async () => {
    localStorage.setItem('api_token', 'tok')
    let created: Entry | null = null
    let staleGetsRemaining = 1 // the GET fired by the post-create refresh still sees the stale list
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (method === 'POST') {
        created = JSON.parse(opts!.body as string) as Entry
        return Promise.resolve(jsonResponse(created, 201))
      }
      if (!created) return Promise.resolve(jsonResponse([]))
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return Promise.resolve(jsonResponse([])) // list() hasn't propagated the create yet
      }
      return Promise.resolve(jsonResponse([created])) // server has caught up
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EntriesProvider><Probe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))

    await act(async () => {
      screen.getByText('add').click()
    })

    // The optimistic create must not be wiped by the stale (still-empty) refresh list.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
  })

  it('migrates cached entries to an empty server, then shows the migrated entries', async () => {
    localStorage.setItem('api_token', 'tok')
    localStorage.setItem(
      'budget_entries',
      JSON.stringify([{ id: 'c1', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }]),
    )
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 's-new', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }),
            { status: 201 },
          ),
        )
      }
      // GET: empty until a POST (migration) has happened, then return the migrated entry
      const alreadyPosted = fetchMock.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === 'POST')
      const body = alreadyPosted
        ? [{ id: 's-new', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }]
        : []
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<EntriesProvider><Probe /></EntriesProvider>)
    // After migration, the entry pushed to the server must be reflected (regression: state was wiped to [])
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
    expect(fetchMock.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === 'POST')).toBe(true)
  })

  it('keeps a deleted entry gone even when the server list is briefly stale (Blobs eventual consistency)', async () => {
    localStorage.setItem('api_token', 'tok')
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let deleted = false
    let staleGetsRemaining = 1 // the GET fired by the post-delete refresh still sees the stale list
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (method === 'DELETE') {
        deleted = true
        return Promise.resolve(jsonResponse({ status: 'deleted' }))
      }
      if (!deleted) return Promise.resolve(jsonResponse([e1]))
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return Promise.resolve(jsonResponse([e1])) // list() hasn't propagated the delete yet
      }
      return Promise.resolve(jsonResponse([])) // server has caught up
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EntriesProvider><DeleteProbe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    await act(async () => {
      screen.getByText('del').click()
    })

    // The optimistic delete must not be undone by the stale refresh list.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))
    expect(JSON.parse(localStorage.getItem('deleted_ids') as string)).toEqual(['s1'])
  })

  it('prunes a tombstone once the server stops returning the deleted id', async () => {
    localStorage.setItem('api_token', 'tok')
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let deleted = false
    let staleGetsRemaining = 1
    const fetchMock = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      const method = opts?.method ?? 'GET'
      if (method === 'DELETE') {
        deleted = true
        return Promise.resolve(jsonResponse({ status: 'deleted' }))
      }
      if (!deleted) return Promise.resolve(jsonResponse([e1]))
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return Promise.resolve(jsonResponse([e1]))
      }
      return Promise.resolve(jsonResponse([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EntriesProvider><DeleteProbe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    await act(async () => {
      screen.getByText('del').click()
    })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('deleted_ids') as string)).toEqual(['s1']))

    // A later refresh sees the server caught up (no s1) → tombstone is pruned.
    await act(async () => {
      screen.getByText('refresh').click()
    })
    await waitFor(() => expect(JSON.parse(localStorage.getItem('deleted_ids') as string)).toEqual([]))
    expect(screen.getByTestId('count').textContent).toBe('0')
  })
})
