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
import { getQueue, setQueue, type Mutation } from './syncQueue'

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

async function migrateIfNeeded(serverEntries: Entry[]): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return
  const cached = getCachedEntries()
  if (serverEntries.length === 0 && cached.length > 0) {
    for (const entry of cached) {
      try {
        await createEntryApi({ amount: entry.amount, category: entry.category, note: entry.note, date: entry.date })
      } catch {
        return // try again next load
      }
    }
  }
  localStorage.setItem(MIGRATION_KEY, '1')
}

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>(() => getCachedEntries())
  const didInit = useRef(false)

  const refresh = useCallback(async () => {
    try {
      await flushQueue()
      const server = await fetchEntries()
      await migrateIfNeeded(server)
      setEntries(server)
      setCachedEntries(server)
    } catch {
      // offline: keep showing cache
    }
  }, [])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const commit = useCallback((next: Entry[]) => {
    setEntries(next)
    setCachedEntries(next)
  }, [])

  const addEntry = useCallback(async (input: NewManualEntry) => {
    const optimistic: Entry = {
      id: crypto.randomUUID(),
      amount: input.amount,
      category: input.category,
      note: input.note,
      date: input.date,
      source: 'manual',
    }
    commit([...entries, optimistic])
    const queue: Mutation[] = [...getQueue(), { op: 'create', entry: optimistic }]
    setQueue(queue)
    await flushQueue()
    void refresh()
  }, [entries, commit, refresh])

  const editEntry = useCallback(async (id: string, patch: Partial<Entry>) => {
    commit(entries.map(e => (e.id === id ? { ...e, ...patch } : e)))
    setQueue([...getQueue(), { op: 'update', id, patch }])
    await flushQueue()
    void refresh()
  }, [entries, commit, refresh])

  const removeEntry = useCallback(async (id: string) => {
    commit(entries.filter(e => e.id !== id))
    setQueue([...getQueue(), { op: 'delete', id }])
    await flushQueue()
    void refresh()
  }, [entries, commit, refresh])

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
