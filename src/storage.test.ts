import { beforeEach, describe, expect, it } from 'vitest'
import { activateUserStorage, getEntries, saveEntries, updateEntry, getCachedEntries, setCachedEntries, getCustomCategories, saveCustomCategories, makeCustomCategoryId, getCategoryOverrides, saveCategoryOverrides, getPokerSessions, savePokerSessions } from './storage'
import { userStorageKey } from './userStorage'
import type { Entry, CustomCategory, PokerSession } from './types'

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

describe('custom categories storage', () => {
  beforeEach(() => localStorage.clear())

  const cat = (o: Partial<CustomCategory> = {}): CustomCategory => ({
    id: 'cat_groceries_x1', label: 'Groceries', budget: 120, icon: 'ShoppingBag', ...o,
  })

  it('returns [] when nothing is stored', () => {
    expect(getCustomCategories()).toEqual([])
  })

  it('round-trips saved categories', () => {
    const cats = [cat(), cat({ id: 'cat_gym_x2', label: 'Gym', budget: null, icon: 'Dumbbell' })]
    saveCustomCategories(cats)
    expect(getCustomCategories()).toEqual(cats)
  })

  it('returns [] when stored JSON is corrupt', () => {
    localStorage.setItem('budget_custom_categories', '{not json')
    expect(getCustomCategories()).toEqual([])
  })

  it('makeCustomCategoryId slugifies the label and is unique', () => {
    const a = makeCustomCategoryId('My Gym!')
    const b = makeCustomCategoryId('My Gym!')
    expect(a).toMatch(/^cat_my_gym_/)
    expect(a).not.toEqual(b)
  })
})

describe('category overrides storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns {} when nothing is stored', () => {
    expect(getCategoryOverrides()).toEqual({})
  })

  it('round-trips saved overrides', () => {
    const overrides = { lunch: { label: 'Food', icon: 'Coffee' }, transport: { label: 'Commute' } }
    saveCategoryOverrides(overrides)
    expect(getCategoryOverrides()).toEqual(overrides)
  })

  it('returns {} when stored JSON is corrupt', () => {
    localStorage.setItem('budget_category_overrides', '{not json')
    expect(getCategoryOverrides()).toEqual({})
  })
})

describe('entries cache', () => {
  it('round-trips cached entries', () => {
    setCachedEntries([{ id: '1', amount: 2, category: 'lunch', note: '', date: '2026-06-09' }])
    expect(getCachedEntries()).toHaveLength(1)
  })
  it('returns [] when cache empty', () => {
    localStorage.clear()
    expect(getCachedEntries()).toEqual([])
  })
})

describe('user-scoped storage', () => {
  beforeEach(() => localStorage.clear())

  it('builds unscoped and active-user storage keys', () => {
    expect(userStorageKey('budget_entries')).toBe('budget_entries')
    activateUserStorage('user-a')
    expect(userStorageKey('budget_entries')).toBe('budget_entries:user-a')
  })

  it('copies the legacy cache only into the user recorded by the migration flag', () => {
    const ownerEntry = entry({ id: 'owner-entry' })
    localStorage.setItem('budget_entries', JSON.stringify([ownerEntry]))
    localStorage.setItem('supabase_migration_done:user-a', '1')

    activateUserStorage('user-b')
    expect(getCachedEntries()).toEqual([])
    expect(localStorage.getItem('budget_entries:user-b')).toBeNull()

    activateUserStorage('user-a')
    expect(getCachedEntries()).toEqual([ownerEntry])
    expect(JSON.parse(localStorage.getItem('budget_entries:user-a')!)).toEqual([ownerEntry])
  })

  it('keeps entries isolated when the active user changes', () => {
    activateUserStorage('user-a')
    setCachedEntries([entry({ id: 'a' })])

    activateUserStorage('user-b')
    expect(getCachedEntries()).toEqual([])
    setCachedEntries([entry({ id: 'b' })])

    activateUserStorage('user-a')
    expect(getCachedEntries().map(item => item.id)).toEqual(['a'])
  })
})

describe('savePokerSessions', () => {
  it('replaces the stored poker session list', () => {
    const a: PokerSession = { id: 'p1', date: '2026-07-01', startTime: '20:00', endTime: '21:00', stakes: '0.1/0.2', buyIn: 20, result: 'win', amount: 5 }
    const b: PokerSession = { ...a, id: 'p2' }
    savePokerSessions([a, b])
    expect(getPokerSessions()).toEqual([a, b])
  })
})
