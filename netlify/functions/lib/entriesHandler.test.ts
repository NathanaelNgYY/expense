import { describe, it, expect } from 'vitest'
import { listEntries, createEntry, updateEntryById, deleteEntryById } from './entriesHandler'
import { InMemoryEntryStore } from './store'

const ID = () => 'made-id'

describe('entriesHandler', () => {
  it('creates a manual entry with a manual dedupeKey', async () => {
    const store = new InMemoryEntryStore()
    const entry = await createEntry(
      { amount: 5, category: 'lunch', note: 'kopi', date: '2026-06-09' },
      store,
      ID,
    )
    expect(entry.id).toBe('made-id')
    expect(entry.source).toBe('manual')
    expect(entry.dedupeKey).toBe('manual:made-id')
    expect((await listEntries(store)).length).toBe(1)
  })

  it('updates an entry by id', async () => {
    const store = new InMemoryEntryStore()
    await createEntry({ amount: 5, category: 'lunch', note: 'x', date: '2026-06-09' }, store, ID)
    const updated = await updateEntryById('made-id', { amount: 8 }, store)
    expect(updated?.amount).toBe(8)
  })

  it('deletes an entry by id', async () => {
    const store = new InMemoryEntryStore()
    await createEntry({ amount: 5, category: 'lunch', note: 'x', date: '2026-06-09' }, store, ID)
    expect(await deleteEntryById('made-id', store)).toBe(true)
    expect((await listEntries(store)).length).toBe(0)
  })
})
