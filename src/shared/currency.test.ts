import { describe, expect, it } from 'vitest'
import {
  entriesForCurrency,
  entryCurrency,
  normalizeCurrencyCode,
  unconfiguredCurrencyCounts,
} from './currency'
import type { Entry } from '../types'

function entry(currency?: string): Entry {
  return {
    id: currency ?? 'legacy',
    amount: 10,
    category: 'lunch',
    note: '',
    date: '2026-07-19',
    ...(currency === undefined ? {} : { currency }),
  }
}

describe('currency normalization', () => {
  it.each([
    ['sgd', 'SGD'],
    [' SGD ', 'SGD'],
    ['Sgd', 'SGD'],
    ['myr', 'MYR'],
  ])('normalizes %j to %s', (input, expected) => {
    expect(normalizeCurrencyCode(input)).toBe(expected)
  })

  it('treats a missing legacy entry currency as SGD', () => {
    expect(entryCurrency(entry())).toBe('SGD')
  })

  it('keeps unknown three-letter codes stable while rejecting malformed codes', () => {
    expect(normalizeCurrencyCode('xyz')).toBe('XYZ')
    expect(normalizeCurrencyCode('S DG')).toBeNull()
    expect(normalizeCurrencyCode('')).toBeNull()
  })
})

describe('wallet partition selectors', () => {
  const entries = [entry(), entry('sgd'), entry('MYR'), entry(' thb ')]

  it('partitions legacy and explicit SGD entries together', () => {
    expect(entriesForCurrency(entries, 'SGD')).toHaveLength(2)
    expect(entriesForCurrency(entries, 'myr')).toEqual([entries[2]])
  })

  it('counts currencies that have captured entries but no configured wallet', () => {
    expect(unconfiguredCurrencyCounts(entries, ['SGD', 'MYR'])).toEqual({ THB: 1 })
  })
})
