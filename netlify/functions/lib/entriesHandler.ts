import type { Category, Entry } from '../../../src/types'
import { buildDedupeKey } from '../../../src/shared/dedupe'
import type { EntryStore } from './store'

export interface NewManualEntry {
  amount: number
  category: Category | null
  note: string
  date: string
  id?: string // optional; preserves a caller-supplied id (import/migration) for idempotent writes
  source?: Entry['source']
  importKey?: string
  merchant?: string
  occurredAt?: string
  currency?: string
  dedupeKey?: string
}

export async function listEntries(store: EntryStore): Promise<Entry[]> {
  const entries = await store.list()
  return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export async function createEntry(
  input: NewManualEntry,
  store: EntryStore,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<Entry> {
  const id = input.id ?? makeId()
  const entry: Entry = {
    id,
    amount: input.amount,
    category: input.category,
    note: input.note,
    date: input.date,
    source: input.source ?? 'manual',
    ...(input.importKey ? { importKey: input.importKey } : {}),
    ...(input.merchant ? { merchant: input.merchant } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    dedupeKey: input.dedupeKey ?? buildDedupeKey('manual', input.date, input.amount, input.note, id),
  }
  await store.put(entry)
  return entry
}

export async function updateEntryById(
  id: string,
  patch: Partial<Entry>,
  store: EntryStore,
): Promise<Entry | null> {
  return store.updateById(id, patch)
}

export async function deleteEntryById(id: string, store: EntryStore): Promise<boolean> {
  return store.deleteById(id)
}
