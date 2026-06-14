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
import { getQueue, setQueue, getTombstones, setTombstones } from './syncQueue'

interface EntriesContextValue {
  entries: Entry[]
  addEntry: (input: NewManualEntry) => Promise<void>
  editEntry: (id: string, patch: Partial<Entry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

const EntriesContext = createContext<EntriesContextValue | null>(null)

const MIGRATION_KEY = 'migration_done'

async function flushQueue(): Promise<boolean> {
  let queue = getQueue()
  while (queue.length > 0) {
    const mutation = queue[0]
    try {
      if (mutation.op === 'create') {
        await createEntryApi({
          id: mutation.entry.id,
          amount: mutation.entry.amount,
          category: mutation.entry.category,
          note: mutation.entry.note,
          date: mutation.entry.date,
        })
      } else if (mutation.op === 'update') {
        await updateEntryApi(mutation.id, mutation.patch)
      } else {
        await deleteEntryApi(mutation.id)
      }
    } catch {
      return false // still offline; keep the queue for next time
    }
    queue = queue.slice(1)
    setQueue(queue)
  }
  return true
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
      // Netlify Blobs list() is eventually consistent: a just-deleted entry can still
      // come back in this list for a short window. Keep hiding tombstoned ids until the
      // server stops returning them, then prune the tombstone (deletion has propagated).
      const tombstones = getTombstones()
      if (tombstones.length > 0) {
        const serverIds = new Set(fresh.map(e => e.id))
        const stillPending = tombstones.filter(id => serverIds.has(id))
        if (stillPending.length !== tombstones.length) setTombstones(stillPending)
        const pending = new Set(stillPending)
        commit(fresh.filter(e => !pending.has(e.id)))
      } else {
        commit(fresh)
      }
    } catch {
      // offline: keep showing cache
    }
  }, [commit])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
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
    setQueue([...getQueue(), { op: 'create', entry: optimistic }])
    await flushQueue()
    void refresh()
  }, [commit, refresh])

  const editEntry = useCallback(async (id: string, patch: Partial<Entry>) => {
    commit(entriesRef.current.map(e => (e.id === id ? { ...e, ...patch } : e)))
    setQueue([...getQueue(), { op: 'update', id, patch }])
    await flushQueue()
    void refresh()
  }, [commit, refresh])

  const removeEntry = useCallback(async (id: string) => {
    commit(entriesRef.current.filter(e => e.id !== id))
    // Tombstone the id so an eventually-consistent server refresh can't resurrect it.
    setTombstones([...new Set([...getTombstones(), id])])
    setQueue([...getQueue(), { op: 'delete', id }])
    await flushQueue()
    void refresh()
  }, [commit, refresh])

  return (
    <EntriesContext.Provider value={{ entries, addEntry, editEntry, removeEntry, refresh }}>
      {children}
    </EntriesContext.Provider>
  )
}

export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext)
  if (!ctx) throw new Error('useEntries must be used within EntriesProvider')
  return ctx
}
