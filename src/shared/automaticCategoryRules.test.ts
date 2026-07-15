import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import {
  isAutomaticCategoryRuleList,
  resolveAutomaticCategory,
  type AutomaticCategoryRule,
} from './automaticCategoryRules'

const rules: AutomaticCategoryRule[] = [
  { id: 'lunch-window', categoryId: 'lunch', startMinute: 11 * 60, endMinute: 16 * 60 + 30 },
  { id: 'dinner-window', categoryId: 'cat_dinner', startMinute: 16 * 60 + 30, endMinute: 24 * 60 },
]

function history(category: string, occurredAt: string): Entry {
  return {
    id: `${category}-${occurredAt}`,
    amount: 8,
    category,
    note: 'Apple Pay · Koufu',
    date: occurredAt.slice(0, 10),
    source: 'apple-pay',
    merchant: 'Koufu',
    occurredAt,
  }
}

describe('resolveAutomaticCategory', () => {
  it('uses Singapore time to distinguish lunch from a custom dinner category', () => {
    expect(resolveAutomaticCategory([], rules, 'Koufu', '2026-07-15T04:30:00Z')).toBe('lunch')
    expect(resolveAutomaticCategory([], rules, 'Koufu', '2026-07-15T11:30:00Z')).toBe('cat_dinner')
  })

  it('lets a same-merchant correction within the matching window override the configured category', () => {
    const entries = [
      history('lunch', '2026-07-14T04:30:00Z'),
      history('cat_date_night', '2026-07-14T11:30:00Z'),
    ]
    expect(resolveAutomaticCategory(entries, rules, 'Koufu', '2026-07-15T12:00:00Z')).toBe('cat_date_night')
  })

  it('supports a custom category in a window that crosses midnight', () => {
    const lateNight: AutomaticCategoryRule[] = [
      { id: 'late', categoryId: 'cat_supper', startMinute: 22 * 60, endMinute: 2 * 60 },
    ]
    expect(resolveAutomaticCategory([], lateNight, 'McDonalds', '2026-07-15T16:30:00Z')).toBe('cat_supper')
  })

  it('does not apply food windows to transport or unknown merchants', () => {
    expect(resolveAutomaticCategory([], rules, 'Transit Link', '2026-07-15T11:30:00Z')).toBeNull()
    expect(resolveAutomaticCategory([], rules, 'Cray Ventures Private Limited', '2026-07-15T11:30:00Z')).toBeNull()
  })

  it('keeps exact learned categories for non-food custom merchants', () => {
    const entries = [{ ...history('cat_gym', '2026-07-14T02:00:00Z'), merchant: 'Anytime Fitness' }]
    expect(resolveAutomaticCategory(entries, rules, 'Anytime Fitness', '2026-07-15T13:00:00Z')).toBe('cat_gym')
  })
})

describe('isAutomaticCategoryRuleList', () => {
  it('accepts bounded category rules and rejects malformed server data', () => {
    expect(isAutomaticCategoryRuleList(rules)).toBe(true)
    expect(isAutomaticCategoryRuleList([{ ...rules[0], categoryId: '' }])).toBe(false)
    expect(isAutomaticCategoryRuleList([{ ...rules[0], startMinute: -1 }])).toBe(false)
    expect(isAutomaticCategoryRuleList(new Array(9).fill(rules[0]))).toBe(false)
  })
})
