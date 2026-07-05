import { describe, expect, it } from 'vitest'
import { applyEntriesChange } from './applyEntriesChange'
import type { SharedEntry } from './types'

function entry(id: string, date: string, createdAt = '2026-07-01T00:00:00Z'): SharedEntry {
  return {
    id,
    budgetId: 'b1',
    userId: 'u1',
    amount: 1,
    categoryId: null,
    note: '',
    date,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('applyEntriesChange', () => {
  it('inserts and sorts by date desc then createdAt desc', () => {
    const a = entry('a', '2026-07-01')
    const b = entry('b', '2026-07-02')
    const c = entry('c', '2026-07-02', '2026-07-02T09:00:00Z')
    let list = applyEntriesChange([], { type: 'INSERT', entry: a })
    list = applyEntriesChange(list, { type: 'INSERT', entry: b })
    list = applyEntriesChange(list, { type: 'INSERT', entry: c })
    expect(list.map(e => e.id)).toEqual(['c', 'b', 'a'])
  })

  it('is idempotent: re-INSERT of same id replaces instead of duplicating', () => {
    const a = entry('a', '2026-07-01')
    const list = applyEntriesChange([a], { type: 'INSERT', entry: { ...a, amount: 9 } })
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe(9)
  })

  it('UPDATE upserts the new row', () => {
    const a = entry('a', '2026-07-01')
    const list = applyEntriesChange([a], { type: 'UPDATE', entry: { ...a, note: 'edited' } })
    expect(list[0].note).toBe('edited')
  })

  it('DELETE removes; deleting a missing id is a no-op', () => {
    const a = entry('a', '2026-07-01')
    expect(applyEntriesChange([a], { type: 'DELETE', id: 'a' })).toEqual([])
    expect(applyEntriesChange([a], { type: 'DELETE', id: 'zzz' })).toEqual([a])
  })
})
