import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Entry } from './types'
import { activateUserStorage, getCachedEntries, setCachedEntries } from './storage'
import {
  fetchEntries,
  ensureUserId,
  createEntryApi,
  updateEntryApi,
  deleteEntryApi,
  bulkUpsertEntries,
  isAuthFailure,
  isPermanentFailure,
  type NewManualEntry,
} from './api'
import { getQueue, setQueue } from './syncQueue'
import { migrateEntriesIfNeeded, syncPokerSessionsIfNeeded } from './supabaseSync'

/**
 * What the user is owed after they tap Save. Mutations are locally durable the instant
 * they're committed (state + cache + queue), so nothing is ever lost — but until the queue
 * drains, the server doesn't have them. `pendingCount > 0` with `failed` is the state the
 * app used to hide behind a bare `catch {}`.
 */
export interface SyncState {
  pendingCount: number
  failed: boolean
  /** Why the last drain stopped. `auth` is not fixable by retrying — the token must change. */
  reason?: SyncFailureReason
  /** Count verified as still local-only after a migration attempt. */
  migrationMissingCount?: number
}

export type SyncFailureReason = 'offline' | 'auth' | 'migration'

interface EntriesContextValue {
  entries: Entry[]
  addEntry: (input: NewManualEntry) => Promise<void>
  /** Persists a pre-validated, deduplicated import in one batch, then refreshes local state once. */
  importEntries: (entries: Entry[]) => Promise<boolean>
  restoreEntry: (entry: Entry) => Promise<void>
  editEntry: (id: string, patch: Partial<Entry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  /** Resolves `true` once it reaches the successful commit path, `false` on any failure path. */
  refresh: () => Promise<boolean>
  sync: SyncState
}

const EntriesContext = createContext<EntriesContextValue | null>(null)

// Only one drain runs at a time. Re-reading the queue each iteration (instead of working off
// a snapshot) lets a single in-flight drain pick up mutations that other callers append while
// a network round-trip is pending — so bulk operations (clear-month, CSV import) that fire many
// mutations back-to-back stay correct without each one serialising on the network.
let flushInFlight: Promise<DrainResult> | null = null

type DrainResult = { ok: true } | { ok: false; reason: SyncFailureReason; error: unknown }

function errorStatus(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined
}

function logSyncFailure(stage: 'session' | 'migration' | 'queue' | 'poker', reason: SyncFailureReason, error: unknown) {
  console.error('Supabase sync failed', {
    stage,
    reason,
    status: errorStatus(error),
    message: error instanceof Error ? error.message : 'Unknown error',
  })
}

async function drainQueue(): Promise<DrainResult> {
  for (;;) {
    const queue = getQueue()
    if (queue.length === 0) return { ok: true }
    const mutation = queue[0]
    try {
      if (mutation.op === 'create') {
        await createEntryApi(mutation.entry)
      } else if (mutation.op === 'update') {
        await updateEntryApi(mutation.id, mutation.patch)
      } else {
        await deleteEntryApi(mutation.id)
      }
    } catch (error) {
      // A bad token keeps the mutation: fix the token and it sends.
      if (isAuthFailure(error)) return { ok: false, reason: 'auth', error }
      // Offline or a server fault: keep the queue for next time.
      if (!isPermanentFailure(error)) return { ok: false, reason: 'offline', error }
      // The server rejects this mutation on its merits and always will (a delete or update for
      // an id it never had, a body it can't parse). Retrying it forever is what wedged the queue
      // and stranded everything behind it, so drop it and keep draining. Nothing is lost that the
      // server still holds: the entry is already absent there, and it survives in local state.
    }
    setQueue(getQueue().slice(1)) // re-read: drop the head we just handled, keep any newly-queued tail
  }
}

function flushQueue(): Promise<DrainResult> {
  if (!flushInFlight) flushInFlight = drainQueue().finally(() => { flushInFlight = null })
  return flushInFlight
}

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>(() => getCachedEntries())
  const [sync, setSync] = useState<SyncState>(() => ({ pendingCount: getQueue().length, failed: false }))
  // Mirrors `entries` synchronously so sequential awaited mutations (clearing a month,
  // importing many rows) compose off the latest value instead of a stale render closure.
  const entriesRef = useRef(entries)
  const didInit = useRef(false)

  const commit = useCallback((next: Entry[]) => {
    entriesRef.current = next
    setEntries(next)
    setCachedEntries(next)
  }, [])

  // Reflects the queue into `sync` so the UI can say what the network is doing. Called after
  // every mutation and every refresh, including the failing paths.
  const reportSync = useCallback((reason?: SyncFailureReason, migrationMissingCount?: number) => {
    setSync({ pendingCount: getQueue().length, failed: reason !== undefined, reason, migrationMissingCount })
  }, [])

  // A just-queued mutation should show as pending immediately, without waiting for the
  // background refresh to come back and tell us what we already know.
  const bumpPending = useCallback(() => {
    setSync(current => ({ ...current, pendingCount: getQueue().length }))
  }, [])

  const refresh = useCallback(async (): Promise<boolean> => {
    let stage: 'session' | 'migration' | 'queue' = 'session'
    try {
      // Resolve identity and migrate the durable legacy cache before replaying later offline
      // mutations. This preserves the historical snapshot before applying queued changes.
      const userId = await ensureUserId()
      if (activateUserStorage(userId)) {
        // Swap the visible cache before any migration or queue work. A newly active account must
        // never inherit the previous account's optimistic state while its server data loads.
        const userEntries = getCachedEntries()
        entriesRef.current = userEntries
        setEntries(userEntries)
        setSync({ pendingCount: getQueue().length, failed: false })
      }
      const server = await fetchEntries()
      stage = 'migration'
      const outcome = await migrateEntriesIfNeeded(server)
      if (typeof outcome === 'object' && outcome.status === 'incomplete') {
        // Some cached entries never reached the server; committing the server list now would
        // overwrite the only copy of them. Keep the cache authoritative and surface the failure.
        logSyncFailure('migration', 'migration', new Error('Server verification did not find every cached entry'))
        reportSync('migration', outcome.missingCount)
        return false
      }
      stage = 'queue'
      const hadQueuedMutations = getQueue().length > 0
      const flushed = await flushQueue()
      if (!flushed.ok) {
        logSyncFailure(flushed.reason === 'auth' ? 'session' : 'queue', flushed.reason, flushed.error)
        reportSync(flushed.reason)
        return false
      }
      const fresh = outcome === 'migrated' || hadQueuedMutations ? await fetchEntries() : server
      commit(fresh)
      reportSync()
      // Poker backup rides along with every successful refresh; a failure here doesn't
      // affect entries and is retried on the next refresh, so it never surfaces as a sync error.
      void syncPokerSessionsIfNeeded().catch(error => {
        logSyncFailure('poker', isAuthFailure(error) ? 'auth' : 'offline', error)
      })
      return true
    } catch (error) {
      // Offline or unauthorized: the cache is still correct and the queue is still durable. Surface it.
      const reason = isAuthFailure(error)
        ? 'auth'
        : stage === 'migration' && isPermanentFailure(error)
          ? 'migration'
          : 'offline'
      logSyncFailure(reason === 'auth' ? 'session' : stage, reason, error)
      reportSync(reason)
      return false
    }
  }, [commit, reportSync])

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
      kind: input.kind ?? 'expense',
      category: input.category,
      note: input.note,
      date: input.date,
      source: 'manual',
    }
    commit([...entriesRef.current, optimistic])
    setQueue([...getQueue(), { op: 'create', entry: optimistic }])
    bumpPending()
    // The entry is already locally durable (state + cache + queue); flush and reconcile in the
    // background instead of awaiting the network so the UI never blocks on the serverless round-trip.
    void refresh()
  }, [bumpPending, commit, refresh])

  const importEntries = useCallback(async (importedEntries: Entry[]): Promise<boolean> => {
    if (importedEntries.length === 0) return true
    await bulkUpsertEntries(importedEntries)
    return refresh()
  }, [refresh])

  const editEntry = useCallback(async (id: string, patch: Partial<Entry>) => {
    commit(entriesRef.current.map(e => (e.id === id ? { ...e, ...patch } : e)))
    setQueue([...getQueue(), { op: 'update', id, patch }])
    bumpPending()
    void refresh() // background flush + reconcile; the edit is already locally durable
  }, [bumpPending, commit, refresh])

  const restoreEntry = useCallback(async (entry: Entry) => {
    commit([...entriesRef.current.filter(candidate => candidate.id !== entry.id), entry])
    setQueue([...getQueue(), { op: 'create', entry }])
    bumpPending()
    void refresh()
  }, [bumpPending, commit, refresh])

  const removeEntry = useCallback(async (id: string) => {
    commit(entriesRef.current.filter(e => e.id !== id))
    setQueue([...getQueue(), { op: 'delete', id }])
    bumpPending()
    void refresh() // background flush + reconcile; the delete is already locally durable
  }, [bumpPending, commit, refresh])

  return (
    <EntriesContext.Provider value={{ entries, addEntry, importEntries, restoreEntry, editEntry, removeEntry, refresh, sync }}>
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
