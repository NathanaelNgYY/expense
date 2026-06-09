import { beforeEach, describe, expect, it } from 'vitest'
import { getEntries, saveEntries, updateEntry } from './storage'
import type { Entry } from './types'

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    amount: 10,
    category: 'lunch',
    note: '',
    date: '2026-05-19',
    ...overrides,
  }
}

describe('updateEntry', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('replaces the matching entry and preserves other entries', () => {
    saveEntries([
      entry({ id: 'entry-1', amount: 8, note: 'old' }),
      entry({ id: 'entry-2', amount: 4, category: 'transport' }),
    ])

    updateEntry(entry({ id: 'entry-1', amount: 9.5, category: 'others', note: 'edited' }))

    expect(getEntries()).toEqual([
      entry({ id: 'entry-1', amount: 9.5, category: 'others', note: 'edited' }),
      entry({ id: 'entry-2', amount: 4, category: 'transport' }),
    ])
  })

  it('keeps Apple Pay metadata when the updated entry includes it', () => {
    saveEntries([
      entry({
        id: 'apple-pay-entry',
        source: 'apple-pay',
        importKey: 'apple-pay:2026-05-19:12.50:fairprice',
      }),
    ])

    updateEntry(
      entry({
        id: 'apple-pay-entry',
        amount: 12.5,
        category: 'others',
        note: 'FairPrice',
        source: 'apple-pay',
        importKey: 'apple-pay:2026-05-19:12.50:fairprice',
      }),
    )

    expect(getEntries()[0]).toMatchObject({
      source: 'apple-pay',
      importKey: 'apple-pay:2026-05-19:12.50:fairprice',
    })
  })
})
