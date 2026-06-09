import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { EntriesProvider, useEntries } from './EntriesContext'

function Probe() {
  const { entries, addEntry } = useEntries()
  return (
    <div>
      <span data-testid="count">{entries.length}</span>
      <button onClick={() => addEntry({ amount: 3, category: 'lunch', note: 'k', date: '2026-06-09' })}>add</button>
    </div>
  )
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
})
