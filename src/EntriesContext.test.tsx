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
})
