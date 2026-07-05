import type { SharedEntry } from './types'

export type EntryChange =
  | { type: 'INSERT'; entry: SharedEntry }
  | { type: 'UPDATE'; entry: SharedEntry }
  | { type: 'DELETE'; id: string }

function sortEntries(entries: SharedEntry[]): SharedEntry[] {
  return [...entries].sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt),
  )
}

// Idempotent by id: realtime echoes of our own writes replace rather than duplicate.
export function applyEntriesChange(entries: SharedEntry[], change: EntryChange): SharedEntry[] {
  if (change.type === 'DELETE') return entries.filter(e => e.id !== change.id)
  const rest = entries.filter(e => e.id !== change.entry.id)
  return sortEntries([...rest, change.entry])
}
