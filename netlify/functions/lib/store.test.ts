import { describe, it, expect } from 'vitest'
import { InMemoryEntryStore } from './store'
import type { Entry } from '../../../src/types'

function makeEntry(over: Partial<Entry> = {}): Entry {
  return { id: 'a', amount: 1, category: 'lunch', note: 'x', date: '2026-06-09', dedupeKey: 'k1', ...over }
}

describe('InMemoryEntryStore', () => {
  it('put + has + get by dedupeKey', async () => {
    const store = new InMemoryEntryStore()
    expect(await store.has('k1')).toBe(false)
    await store.put(makeEntry())
    expect(await store.has('k1')).toBe(true)
    expect((await store.list()).length).toBe(1)
  })

  it('updateById patches fields, keeps key', async () => {
    const store = new InMemoryEntryStore()
    await store.put(makeEntry())
    const updated = await store.updateById('a', { amount: 9 })
    expect(updated?.amount).toBe(9)
    expect((await store.list())[0].amount).toBe(9)
  })

  it('deleteById removes the entry', async () => {
    const store = new InMemoryEntryStore()
    await store.put(makeEntry())
    expect(await store.deleteById('a')).toBe(true)
    expect((await store.list()).length).toBe(0)
  })
})
