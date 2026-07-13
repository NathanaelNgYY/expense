import type { Entry } from './types'
import type { NewManualEntry } from './api'
import { getUserStorageItem, removeUserStorageItem, setUserStorageItem } from './userStorage'

export type Mutation =
  | { op: 'create'; entry: Entry }
  | { op: 'update'; id: string; patch: Partial<Entry> }
  | { op: 'delete'; id: string }

const QUEUE_KEY = 'sync_queue'

export function getQueue(): Mutation[] {
  try {
    const raw = getUserStorageItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as Mutation[]) : []
  } catch {
    return []
  }
}

export function enqueue(mutation: Mutation): void {
  setUserStorageItem(QUEUE_KEY, JSON.stringify([...getQueue(), mutation]))
}

export function setQueue(queue: Mutation[]): void {
  setUserStorageItem(QUEUE_KEY, JSON.stringify(queue))
}

export function clearQueue(): void {
  removeUserStorageItem(QUEUE_KEY)
}

// Tombstones: ids of entries deleted locally. Netlify Blobs `list()` is eventually
// consistent, so a just-deleted entry can still come back in the next `list()` for a
// short window. We hide tombstoned ids from the refreshed server list until the server
// stops returning them, then prune the tombstone (deletion confirmed propagated).
const TOMBSTONES_KEY = 'deleted_ids'

export function getTombstones(): string[] {
  try {
    const raw = getUserStorageItem(TOMBSTONES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function setTombstones(ids: string[]): void {
  setUserStorageItem(TOMBSTONES_KEY, JSON.stringify(ids))
}

// Pending creates: ids of entries created locally that Blobs `list()` may not return
// yet. The mirror of tombstones — instead of hiding ids the stale list still returns,
// we keep SHOWING these ids (from local state) until the server starts returning them,
// then prune the id (creation confirmed propagated).
const PENDING_CREATES_KEY = 'pending_creates'

export function getPendingCreates(): string[] {
  try {
    const raw = getUserStorageItem(PENDING_CREATES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function setPendingCreates(ids: string[]): void {
  setUserStorageItem(PENDING_CREATES_KEY, JSON.stringify(ids))
}

// Re-exported for callers that build create mutations.
export type { NewManualEntry }
