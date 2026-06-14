import type { Entry } from './types'
import type { NewManualEntry } from './api'

export type Mutation =
  | { op: 'create'; entry: Entry }
  | { op: 'update'; id: string; patch: Partial<Entry> }
  | { op: 'delete'; id: string }

const QUEUE_KEY = 'sync_queue'

export function getQueue(): Mutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as Mutation[]) : []
  } catch {
    return []
  }
}

export function enqueue(mutation: Mutation): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify([...getQueue(), mutation]))
}

export function setQueue(queue: Mutation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY)
}

// Tombstones: ids of entries deleted locally. Netlify Blobs `list()` is eventually
// consistent, so a just-deleted entry can still come back in the next `list()` for a
// short window. We hide tombstoned ids from the refreshed server list until the server
// stops returning them, then prune the tombstone (deletion confirmed propagated).
const TOMBSTONES_KEY = 'deleted_ids'

export function getTombstones(): string[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function setTombstones(ids: string[]): void {
  localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(ids))
}

// Re-exported for callers that build create mutations.
export type { NewManualEntry }
