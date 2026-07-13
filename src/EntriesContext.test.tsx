import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { EntriesProvider, useEntries } from './EntriesContext'
import { ApiError } from './api'
import type { Entry } from './types'

// The transport (supabase-js) is mocked at the ./api module boundary; ApiError and the
// failure classifiers stay real because the queue-drain logic under test depends on them.
// supabaseSync runs REAL against these mocks, so the migration paths are exercised too.
vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    fetchEntries: vi.fn(),
    createEntryApi: vi.fn(),
    updateEntryApi: vi.fn(),
    deleteEntryApi: vi.fn(),
    ensureUserId: vi.fn(),
    bulkUpsertEntries: vi.fn(),
    fetchEntryIds: vi.fn(),
    bulkUpsertPokerSessions: vi.fn(),
  }
})

import {
  fetchEntries,
  createEntryApi,
  updateEntryApi,
  deleteEntryApi,
  ensureUserId,
  bulkUpsertEntries,
  fetchEntryIds,
} from './api'

const fetchEntriesMock = vi.mocked(fetchEntries)
const createEntryMock = vi.mocked(createEntryApi)
const updateEntryMock = vi.mocked(updateEntryApi)
const deleteEntryMock = vi.mocked(deleteEntryApi)
const ensureUserIdMock = vi.mocked(ensureUserId)
const bulkUpsertEntriesMock = vi.mocked(bulkUpsertEntries)
const fetchEntryIdsMock = vi.mocked(fetchEntryIds)

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

function EditProbe() {
  const { entries, editEntry } = useEntries()
  return (
    <div>
      <span data-testid="amount">{entries.find(e => e.id === 's1')?.amount ?? 0}</span>
      <button onClick={() => void editEntry('s1', { amount: 99 })}>edit</button>
    </div>
  )
}

function SyncProbe() {
  const { sync, refresh } = useEntries()
  return (
    <div>
      <span data-testid="pending">{sync.pendingCount}</span>
      <span data-testid="failed">{String(sync.failed)}</span>
      <span data-testid="reason">{sync.reason ?? ''}</span>
      <span data-testid="migration-missing">{sync.migrationMissingCount ?? ''}</span>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  )
}

// Captures the boolean refresh() resolves with, outside React state, so tests can assert on
// it without adding a hook dependency just for this probe.
let lastRefreshResult: boolean | undefined

function RefreshResultProbe() {
  const { refresh } = useEntries()
  return (
    <button
      onClick={() => {
        void refresh().then(ok => {
          lastRefreshResult = ok
        })
      }}
    >
      refresh
    </button>
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('budget_legacy_storage_owner', 'u1')
  vi.clearAllMocks()
  ensureUserIdMock.mockResolvedValue('u1')
  bulkUpsertEntriesMock.mockResolvedValue(undefined)
  fetchEntryIdsMock.mockResolvedValue(new Set())
  lastRefreshResult = undefined
})

describe('EntriesContext', () => {
  it('renders cached entries immediately, then refreshes from the server', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([{ id: 's1', amount: 1, category: 'lunch', note: '', date: '2026-06-09' }]))
    fetchEntriesMock.mockResolvedValue([
      { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' },
      { id: 's2', amount: 3, category: 'lunch', note: '', date: '2026-06-09' },
    ])
    render(<EntriesProvider><Probe /></EntriesProvider>)
    // cache first
    expect(screen.getByTestId('count').textContent).toBe('1')
    // then server refresh
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'))
  })

  it('refreshes entries when the PWA returns to the foreground', async () => {
    const ingested = { id: 'paynow-1', amount: 5.7, category: 'lunch', note: 'PayNow', date: '2026-06-09' }
    fetchEntriesMock.mockResolvedValueOnce([]).mockResolvedValue([ingested])

    render(<EntriesProvider><Probe /></EntriesProvider>)
    await waitFor(() => expect(fetchEntriesMock).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
    expect(fetchEntriesMock).toHaveBeenCalledTimes(2)
  })

  it('optimistically adds and persists to cache when offline', async () => {
    fetchEntriesMock.mockRejectedValue(new TypeError('Failed to fetch'))
    createEntryMock.mockRejectedValue(new TypeError('Failed to fetch'))
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

  it('keeps a just-added entry visible while the server list is briefly stale', async () => {
    let created: Entry | null = null
    createEntryMock.mockImplementation(async input => {
      created = { ...(input as Entry), source: 'manual' }
      return created
    })
    let staleGetsRemaining = 1 // the fetch fired by the post-create refresh still sees the stale list
    fetchEntriesMock.mockImplementation(async () => {
      if (!created) return []
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return [] // list hasn't propagated the create yet
      }
      return [created]
    })

    render(<EntriesProvider><Probe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))

    await act(async () => {
      screen.getByText('add').click()
    })

    // The optimistic create must not be wiped by the stale (still-empty) refresh list.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
  })

  it('migrates cached entries to Supabase, then shows the migrated entries', async () => {
    const cachedEntry = { id: 'c1', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }
    localStorage.setItem('budget_entries', JSON.stringify([cachedEntry]))
    let uploaded = false
    bulkUpsertEntriesMock.mockImplementation(async () => { uploaded = true })
    fetchEntryIdsMock.mockResolvedValue(new Set(['c1']))
    fetchEntriesMock.mockImplementation(async () => (uploaded ? [cachedEntry] : []))

    render(<EntriesProvider><Probe /></EntriesProvider>)

    // After migration, the entry pushed to the server must be reflected (regression: state was wiped to [])
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
    expect(bulkUpsertEntriesMock).toHaveBeenCalledWith([cachedEntry])
    expect(localStorage.getItem('supabase_migration_done:u1')).toBe('1')
  })

  it('migrates the legacy cache before draining queued offline mutations', async () => {
    const cachedEntry = { id: 'legacy', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }
    localStorage.setItem('budget_entries', JSON.stringify([cachedEntry]))
    localStorage.setItem('sync_queue', JSON.stringify([
      { op: 'create', entry: { id: 'queued', amount: 3, category: 'lunch', note: 'offline', date: '2026-06-02' } },
    ]))
    const order: string[] = []
    fetchEntriesMock.mockResolvedValue([])
    fetchEntryIdsMock.mockResolvedValue(new Set(['legacy']))
    bulkUpsertEntriesMock.mockImplementation(async () => { order.push('migration') })
    createEntryMock.mockImplementation(async input => {
      order.push('queue')
      return input as Entry
    })

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('0'))
    expect(order).toEqual(['migration', 'queue'])
  })

  it('keeps the cache authoritative when the migration cannot verify its upload', async () => {
    const cachedEntry = { id: 'c1', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' }
    localStorage.setItem('budget_entries', JSON.stringify([cachedEntry]))
    fetchEntriesMock.mockResolvedValue([])
    fetchEntryIdsMock.mockResolvedValue(new Set()) // upload "succeeded" but rows never appeared

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('failed').textContent).toBe('true'))
    expect(screen.getByTestId('reason').textContent).toBe('migration')
    expect(screen.getByTestId('migration-missing').textContent).toBe('1')
    // The empty server list must NOT have been committed over the cache.
    expect(JSON.parse(localStorage.getItem('budget_entries') as string)).toHaveLength(1)
    expect(localStorage.getItem('supabase_migration_done:u1')).toBeNull()
  })

  it('reports a genuine network failure during migration as offline', async () => {
    localStorage.setItem('budget_entries', JSON.stringify([
      { id: 'c1', amount: 7, category: 'lunch', note: 'old', date: '2026-06-01' },
    ]))
    fetchEntriesMock.mockResolvedValue([])
    bulkUpsertEntriesMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('failed').textContent).toBe('true'))
    expect(screen.getByTestId('reason').textContent).toBe('offline')
    expect(screen.getByTestId('migration-missing').textContent).toBe('')
  })

  it('keeps a deleted entry gone even when the server list is briefly stale', async () => {
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let deleted = false
    let staleGetsRemaining = 1
    deleteEntryMock.mockImplementation(async () => { deleted = true })
    fetchEntriesMock.mockImplementation(async () => {
      if (!deleted) return [e1]
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return [e1] // list hasn't propagated the delete yet
      }
      return []
    })

    render(<EntriesProvider><DeleteProbe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    await act(async () => {
      screen.getByText('del').click()
    })

    // The optimistic delete must not be undone by the stale refresh list.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))
    expect(JSON.parse(localStorage.getItem('deleted_ids') as string)).toEqual(['s1'])
  })

  it('removes optimistically without blocking on the network DELETE', async () => {
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let rejectNet: (err: Error) => void = () => {}
    const pendingNet = new Promise<void>((_, reject) => { rejectNet = reject })
    pendingNet.catch(() => {}) // avoid an unhandled-rejection warning when we settle it
    fetchEntriesMock.mockResolvedValue([e1])
    deleteEntryMock.mockReturnValue(pendingNet)

    render(<EntriesProvider><DeleteProbe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    await act(async () => {
      screen.getByText('del').click()
    })

    // Optimistic delete + tombstone happen immediately, even though the DELETE never resolved.
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(JSON.parse(localStorage.getItem('deleted_ids') as string)).toEqual(['s1'])

    // Settle the background flush so the in-flight guard resets for the next test.
    await act(async () => { rejectNet(new TypeError('offline')) })
  })

  it('edits optimistically without blocking on the network update', async () => {
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let rejectNet: (err: Error) => void = () => {}
    const pendingNet = new Promise<Entry>((_, reject) => { rejectNet = reject })
    pendingNet.catch(() => {})
    fetchEntriesMock.mockResolvedValue([e1])
    updateEntryMock.mockReturnValue(pendingNet)

    render(<EntriesProvider><EditProbe /></EntriesProvider>)
    await waitFor(() => expect(screen.getByTestId('amount').textContent).toBe('2'))

    await act(async () => {
      screen.getByText('edit').click()
    })

    // The edit shows immediately, despite the update never resolving.
    expect(screen.getByTestId('amount').textContent).toBe('99')

    await act(async () => { rejectNet(new TypeError('offline')) })
  })

  it('prunes a tombstone once the server stops returning the deleted id', async () => {
    const e1 = { id: 's1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }
    let deleted = false
    let staleGetsRemaining = 1
    deleteEntryMock.mockImplementation(async () => { deleted = true })
    fetchEntriesMock.mockImplementation(async () => {
      if (!deleted) return [e1]
      if (staleGetsRemaining > 0) {
        staleGetsRemaining--
        return [e1]
      }
      return []
    })

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

  it('resolves refresh() to true when it reaches the successful commit path', async () => {
    fetchEntriesMock.mockResolvedValue([])

    render(<EntriesProvider><RefreshResultProbe /></EntriesProvider>)

    await act(async () => {
      screen.getByText('refresh').click()
    })
    await waitFor(() => expect(lastRefreshResult).toBe(true))
  })

  it('resolves refresh() to false when it hits the failure path', async () => {
    fetchEntriesMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<EntriesProvider><RefreshResultProbe /></EntriesProvider>)

    await act(async () => {
      screen.getByText('refresh').click()
    })
    await waitFor(() => expect(lastRefreshResult).toBe(false))
  })
})

describe('EntriesContext queue draining', () => {
  it('discards a mutation the server permanently rejects instead of blocking the queue behind it', async () => {
    // A delete for an entry the server never had (404 forever), with real work queued behind it.
    localStorage.setItem('sync_queue', JSON.stringify([
      { op: 'delete', id: 'ghost' },
      { op: 'create', entry: { id: 'real', amount: 5, category: 'lunch', note: 'k', date: '2026-06-09' } },
    ]))
    deleteEntryMock.mockRejectedValue(new ApiError(404, 'not-found'))
    createEntryMock.mockImplementation(async input => input as Entry)
    fetchEntriesMock.mockResolvedValue([])

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    // The doomed delete is dropped, the create behind it goes through, the queue empties.
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('0'))
    expect(screen.getByTestId('failed').textContent).toBe('false')
    expect(createEntryMock).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('sync_queue') as string)).toEqual([])
  })

  it('keeps the queue and reports offline when the failure is transient', async () => {
    localStorage.setItem('sync_queue', JSON.stringify([{ op: 'delete', id: 'x' }]))
    deleteEntryMock.mockRejectedValue(new TypeError('Failed to fetch'))
    fetchEntriesMock.mockRejectedValue(new TypeError('Failed to fetch'))

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('failed').textContent).toBe('true'))
    expect(screen.getByTestId('reason').textContent).toBe('offline')
    expect(screen.getByTestId('pending').textContent).toBe('1')
    expect(JSON.parse(localStorage.getItem('sync_queue') as string)).toHaveLength(1)
  })

  it('keeps the queue and reports an auth failure on 401 rather than discarding the mutation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('sync_queue', JSON.stringify([{ op: 'delete', id: 'x' }]))
    deleteEntryMock.mockRejectedValue(new ApiError(401, 'unauthorized'))
    fetchEntriesMock.mockRejectedValue(new ApiError(401, 'unauthorized'))

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('reason').textContent).toBe('auth'))
    expect(screen.getByTestId('failed').textContent).toBe('true')
    // The mutation is still valid — a corrected session must be able to send it.
    expect(JSON.parse(localStorage.getItem('sync_queue') as string)).toHaveLength(1)
    expect(consoleError).toHaveBeenCalledWith(
      'Supabase sync failed',
      expect.objectContaining({ stage: 'session', reason: 'auth', status: 401 }),
    )
    consoleError.mockRestore()
  })

  it('drains a long queue past several permanently-rejected mutations', async () => {
    localStorage.setItem('sync_queue', JSON.stringify([
      { op: 'delete', id: 'ghost1' },
      { op: 'update', id: 'ghost2', patch: { amount: 1 } },
      { op: 'delete', id: 'ghost3' },
      { op: 'create', entry: { id: 'real', amount: 5, category: 'lunch', note: 'k', date: '2026-06-09' } },
    ]))
    deleteEntryMock.mockRejectedValue(new ApiError(404, 'not-found'))
    updateEntryMock.mockRejectedValue(new ApiError(404, 'not-found'))
    createEntryMock.mockImplementation(async input => input as Entry)
    fetchEntriesMock.mockResolvedValue([])

    render(<EntriesProvider><SyncProbe /></EntriesProvider>)

    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('0'))
    expect(screen.getByTestId('failed').textContent).toBe('false')
  })
})
