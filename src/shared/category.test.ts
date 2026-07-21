import { describe, it, expect } from 'vitest'
import { guessCategory, categoryFromHistory, normalizeCategoryMerchant, rankCategoriesForMerchant } from './category'
import type { Entry } from '../types'

describe('guessCategory', () => {
  it('classifies transport merchants', () => {
    expect(guessCategory('SimplyGo MRT')).toBe('transport')
    expect(guessCategory('Grab Ride')).toBe('transport')
    expect(guessCategory('Transit Link')).toBe('transport')
  })
  it('classifies lunch merchants', () => {
    expect(guessCategory('Ya Kun Kaya Toast')).toBe('lunch')
    expect(guessCategory('McDonald\'s')).toBe('lunch')
  })
  it('classifies Koufu merchant variants as lunch', () => {
    expect(guessCategory('Koufu Pte Ltd')).toBe('lunch')
    expect(guessCategory('KOUFU #234')).toBe('lunch')
    expect(guessCategory('Koufu Foodcourt')).toBe('lunch')
  })
  it('classifies common Singapore food merchants from Wallet labels', () => {
    expect(guessCategory('YoChi Asia Pte Ltd')).toBe('lunch')
    expect(guessCategory('Guzman y Gomez SG 266105')).toBe('lunch')
    expect(guessCategory('Tangled Fresh Pasta To Go')).toBe('lunch')
    expect(guessCategory('Kopitiam Investment Pte L')).toBe('lunch')
  })
  it('classifies a broad set of Singapore F&B brands and outlet labels', () => {
    const merchants = [
      'A&W Singapore #02-209',
      'Bengawan Solo Pte Ltd',
      'CHAGEE SG',
      'Crystal Jade La Mian Xiao Long Bao',
      'Jollibean #01-12',
      'Luckin Coffee Singapore',
      'McCafe Compass One',
      'Mr Coconut Pte Ltd',
      'PlayMade by Wanpo',
      'The Soup Spoon',
      'Tori-Q Pte Ltd',
      'Twelve Cupcakes',
    ]

    for (const merchant of merchants) expect(guessCategory(merchant), merchant).toBe('lunch')
  })
  it('distinguishes GrabFood from Grab transport captures', () => {
    expect(guessCategory('GrabFood')).toBe('lunch')
    expect(guessCategory('Grab Ride')).toBe('transport')
  })
  it('classifies grocery as others', () => {
    expect(guessCategory('FairPrice Finest')).toBe('others')
    expect(guessCategory('FairPrice')).toBe('others')
  })
  it('returns null for unknown merchants (no silent "others")', () => {
    expect(guessCategory('Some Random Shop')).toBeNull()
    expect(guessCategory('Cray Ventures Private Limited')).toBeNull()
    expect(guessCategory('')).toBeNull()
  })
})

describe('normalizeCategoryMerchant', () => {
  it('collapses common DBS PayNow merchant variations', () => {
    expect(normalizeCategoryMerchant('LFH SEAFOOD PTE. LTD.')).toBe('lfh seafood')
    expect(normalizeCategoryMerchant('LFH SEAFOOD (UEN ending 006C)')).toBe('lfh seafood')
    expect(normalizeCategoryMerchant('LFH SEAFOOD #234')).toBe('lfh seafood')
  })
})

function entry(partial: Partial<Entry>): Entry {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    amount: partial.amount ?? 1,
    category: partial.category ?? null,
    note: partial.note ?? '',
    date: partial.date ?? '2026-06-01',
    merchant: partial.merchant,
    occurredAt: partial.occurredAt,
  }
}

describe('categoryFromHistory', () => {
  it('returns the category the user gave a matching merchant before', () => {
    const history = [
      entry({ merchant: 'AH HUAT TRADING', category: 'lunch', date: '2026-06-10' }),
    ]
    expect(categoryFromHistory(history, 'AH HUAT TRADING')).toBe('lunch')
  })

  it('matches merchants case- and whitespace-insensitively', () => {
    const history = [entry({ merchant: 'Ah Huat   Trading', category: 'lunch' })]
    expect(categoryFromHistory(history, '  ah huat trading ')).toBe('lunch')
  })

  it('reuses a correction across legal suffix and outlet variations', () => {
    const history = [entry({ merchant: 'LFH SEAFOOD PTE. LTD.', category: 'lunch' })]
    expect(categoryFromHistory(history, 'LFH SEAFOOD #234')).toBe('lunch')
  })

  it('ignores entries with no category and unrelated merchants', () => {
    const history = [
      entry({ merchant: 'AH HUAT TRADING', category: null }),
      entry({ merchant: 'SOMEWHERE ELSE', category: 'transport' }),
    ]
    expect(categoryFromHistory(history, 'AH HUAT TRADING')).toBeNull()
  })

  it('returns the most frequent category, breaking ties by most recent', () => {
    const history = [
      entry({ merchant: 'AH HUAT', category: 'others', date: '2026-06-01' }),
      entry({ merchant: 'AH HUAT', category: 'lunch', date: '2026-06-02' }),
      entry({ merchant: 'AH HUAT', category: 'lunch', date: '2026-06-03' }),
    ]
    expect(categoryFromHistory(history, 'AH HUAT')).toBe('lunch')
  })

  it('returns null for an empty merchant', () => {
    const history = [entry({ merchant: 'AH HUAT', category: 'lunch' })]
    expect(categoryFromHistory(history, '')).toBeNull()
  })
})

describe('rankCategoriesForMerchant', () => {
  const ids = ['lunch', 'transport', 'others', 'savings', 'investments']
  const e = (over: Partial<Entry>): Entry => ({
    id: `id-${Math.random()}`, amount: 5, category: null, note: '', date: '2026-07-01', ...over,
  })

  it('ranks this merchant\'s own history first, most-frequent then most-recent', () => {
    const entries = [
      e({ merchant: 'Toast Box', category: 'lunch', date: '2026-07-01' }),
      e({ merchant: 'Toast Box', category: 'lunch', date: '2026-07-02' }),
      e({ merchant: 'Toast Box', category: 'others', date: '2026-07-03' }),
    ]
    expect(rankCategoriesForMerchant(entries, 'Toast Box', ids)[0]).toBe('lunch')
  })

  it('falls back to the keyword guess when there is no history', () => {
    expect(rankCategoriesForMerchant([], 'SimplyGo MRT', ids)[0]).toBe('transport')
  })

  it('fills remaining slots with globally most-used categories', () => {
    const entries = [
      e({ merchant: 'A', category: 'savings' }),
      e({ merchant: 'B', category: 'savings' }),
      e({ merchant: 'C', category: 'transport' }),
    ]
    // Unknown merchant, no keyword match -> global popularity: savings (2) then transport (1)
    const ranked = rankCategoriesForMerchant(entries, 'Unknown Shop', ids)
    expect(ranked).toContain('savings')
    expect(ranked.length).toBe(3)
  })

  it('always returns `limit` real chips even at true zero-state', () => {
    const ranked = rankCategoriesForMerchant([], null, ids)
    expect(ranked).toEqual(['lunch', 'transport', 'others'])
  })

  it('never repeats an id and never returns an id outside candidateIds', () => {
    const entries = [e({ merchant: 'Toast Box', category: 'lunch' })]
    const ranked = rankCategoriesForMerchant(entries, 'Toast Box', ['lunch', 'transport'])
    expect(ranked).toEqual(['lunch', 'transport'])
    expect(new Set(ranked).size).toBe(ranked.length)
  })

  it('excludes a retired category id that is no longer a candidate', () => {
    const entries = [e({ merchant: 'Toast Box', category: 'old-custom' })]
    const ranked = rankCategoriesForMerchant(entries, 'Toast Box', ids)
    expect(ranked).not.toContain('old-custom')
  })
})

describe('categoryFromHistory still returns the single best after refactor', () => {
  it('returns the most-frequent category for the merchant', () => {
    const entries: Entry[] = [
      { id: '1', amount: 5, category: 'lunch', note: '', date: '2026-07-01', merchant: 'Toast Box' },
      { id: '2', amount: 5, category: 'lunch', note: '', date: '2026-07-02', merchant: 'Toast Box' },
      { id: '3', amount: 5, category: 'others', note: '', date: '2026-07-03', merchant: 'Toast Box' },
    ]
    expect(categoryFromHistory(entries, 'Toast Box')).toBe('lunch')
  })
})
