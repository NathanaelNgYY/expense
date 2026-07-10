import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Entry } from './types'
import { getCachedEntries, setCachedEntries } from './storage'
import {
  fetchEntries,
  createEntryApi,
  updateEntryApi,
  deleteEntryApi,
  type NewManualEntry,
} from './api'
import {
  getQueue,
  setQueue,
  getTombstones,
  setTombstones,
  getPendingCreates,
  setPendingCreates,
} from './syncQueue'

interface EntriesContextValue {
  entries: Entry[]
  addEntry: (input: NewManualEntry) => Promise<void>
  restoreEntry: (entry: Entry) => Promise<void>
  editEntry: (id: string, patch: Partial<Entry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const EntriesContext = createContext<EntriesContextValue | null>(null)

const MIGRATION_KEY = 'migration_done'

// Only one drain runs at a time. Re-reading the queue each iteration (instead of working off
// a snapshot) lets a single in-flight drain pick up mutations that other callers append while
// a network round-trip is pending — so bulk operations (clear-month, CSV import) that fire many
// mutations back-to-back stay correct without each one serialising on the network.
let flushInFlight: Promise<boolean> | null = null

async function drainQueue(): Promise<boolean> {
  for (;;) {
    const queue = getQueue()
    if (queue.length === 0) return true
    const mutation = queue[0]
    try {
      if (mutation.op === 'create') {
        await createEntryApi(mutation.entry)
      } else if (mutation.op === 'update') {
        await updateEntryApi(mutation.id, mutation.patch)
      } else {
        await deleteEntryApi(mutation.id)
      }
    } catch {
      return false // still offline; keep the queue for next time
    }
    setQueue(getQueue().slice(1)) // re-read: drop the head we just sent, keep any newly-queued tail
  }
}

function flushQueue(): Promise<boolean> {
  if (!flushInFlight) flushInFlight = drainQueue().finally(() => { flushInFlight = null })
  return flushInFlight
}

// Returns true if it pushed cached entries up (so the caller should re-fetch).
async function migrateIfNeeded(serverEntries: Entry[]): Promise<boolean> {
  if (localStorage.getItem(MIGRATION_KEY)) return false
  const cached = getCachedEntries()
  let migrated = false
  if (serverEntries.length === 0 && cached.length > 0) {
    for (const entry of cached) {
      try {
        await createEntryApi({ id: entry.id, amount: entry.amount, category: entry.category, note: entry.note, date: entry.date })
        migrated = true
      } catch {
        return migrated // try again next load; don't mark migration done
      }
    }
  }
  localStorage.setItem(MIGRATION_KEY, '1')
  return migrated
}

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>(() => getCachedEntries())
  // Mirrors `entries` synchronously so sequential awaited mutations (clearing a month,
  // importing many rows) compose off the latest value instead of a stale render closure.
  const entriesRef = useRef(entries)
  const didInit = useRef(false)

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next
    setEntries(next)
    setCachedEntries(next)
  }, [])

  const refresh = useCallback(async () => {
    try {
      await flushQueue()
      const server = await fetchEntries()
      const migrated = await migrateIfNeeded(server)
      const fresh = migrated ? await fetchEntries() : server
      // Netlify Blobs list() is eventually consistent, so the refreshed server list can
      // briefly lag a local mutation in BOTH directions. Reconcile both:
      //  - hide just-deleted ids the stale list still returns (tombstones), and
      //  - keep showing just-created ids the stale list doesn't return yet (pending
      //    creates), pulling the entry from local state until the server catches up.
      const serverIds = new Set(fresh.map(e => e.id))

      const tombstones = getTombstones()
      const stillTombstoned = tombstones.filter(id => serverIds.has(id))
      if (stillTombstoned.length !== tombstones.length) setTombstones(stillTombstoned)
      const hidden = new Set(stillTombstoned)

      const localById = new Map(entriesRef.current.map(e => [e.id, e]))
      const pendingCreates = getPendingCreates()
      const stillUnseen = pendingCreates.filter(
        id => !serverIds.has(id) && !hidden.has(id) && localById.has(id),
      )
      if (stillUnseen.length !== pendingCreates.length) setPendingCreates(stillUnseen)
      const extras = stillUnseen.map(id => localById.get(id)!)

      commit([...fresh.filter(e => !hidden.has(e.id)), ...extras])
    } catch {
      // offline: keep showing cache
    }
  }, [commit])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void refresh()
    const onOnline = () => void refresh()
    const onFocus = () => void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const addEntry = useCallback(async (input: NewManualEntry) => {
    const optimistic: Entry = {
      id: input.id ?? crypto.randomUUID(),
      amount: input.amount,
      category: input.category,
      note: input.note,
      date: input.date,
      source: 'manual',
    }
    commit([...entriesRef.current, optimistic])
    // Mark the id pending so the post-create refresh (which may run before Blobs' list()
    // has propagated the write) keeps showing it instead of dropping it.
    setPendingCreates([...new Set([...getPendingCreates(), optimistic.id])])
    setQueue([...getQueue(), { op: 'create', entry: optimistic }])
    // The entry is already locally durable (state + cache + queue); flush and reconcile in the
    // background instead of awaiting the network so the UI never blocks on the serverless round-trip.
    void refresh()
  }, [commit, refresh])

  const editEntry = useCallback(async (id: string, patch: Partial<Entry>) => {
    commit(entriesRef.current.map(e => (e.id === id ? { ...e, ...patch } : e)))
    setQueue([...getQueue(), { op: 'update', id, patch }])
    void refresh() // background flush + reconcile; the edit is already locally durable
  }, [commit, refresh])

  const restoreEntry = useCallback(async (entry: Entry) => {
    commit([...entriesRef.current.filter(candidate => candidate.id !== entry.id), entry])
    setPendingCreates([...new Set([...getPendingCreates(), entry.id])])
    setQueue([...getQueue(), { op: 'create', entry }])
    void refresh()
  }, [commit, refresh])

  const removeEntry = useCallback(async (id: string) => {
    commit(entriesRef.current.filter(e => e.id !== id))
    // Tombstone the id so an eventually-consistent server refresh can't resurrect it.
    setTombstones([...new Set([...getTombstones(), id])])
    setQueue([...getQueue(), { op: 'delete', id }])
    void refresh() // background flush + reconcile; the delete is already locally durable
  }, [commit, refresh])

  return (
    <EntriesContext.Provider value={{ entries, addEntry, restoreEntry, editEntry, removeEntry, refresh }}>
      {children}
    </EntriesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext)
  if (!ctx) throw new Error('useEntries must be used within EntriesProvider')
  return ctx
}
