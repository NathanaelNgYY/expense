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

// Re-exported for callers that build create mutations.
export type { NewManualEntry }
