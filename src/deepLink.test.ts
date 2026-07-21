import { describe, it, expect } from 'vitest'
import { parseAddDeepLink, resolveCategoryId, amountToDigits } from './deepLink'

const OPTIONS = [
  { id: 'lunch', label: 'Lunch' },
  { id: 'transport', label: 'Transport' },
  { id: 'cat_groceries_x7', label: 'Groceries' },
]

describe('parseAddDeepLink', () => {
  it('returns add:false with no params', () => {
    expect(parseAddDeepLink('')).toEqual({ add: false })
  })

  it('detects add=true', () => {
    expect(parseAddDeepLink('?add=true')).toEqual({ add: true })
  })

  it('parses a valid amount and trimmed category', () => {
    expect(parseAddDeepLink('?add=true&category=%20lunch%20&amount=5.80')).toEqual({
      add: true,
      amount: 5.8,
      category: 'lunch',
    })
  })

  it('truncates over-precise amounts to 2 decimals', () => {
    expect(parseAddDeepLink('?add=true&amount=5.809').amount).toBe(5.8)
  })

  it('omits non-positive or non-numeric amounts', () => {
    expect(parseAddDeepLink('?amount=-1').amount).toBeUndefined()
    expect(parseAddDeepLink('?amount=0').amount).toBeUndefined()
    expect(parseAddDeepLink('?amount=abc').amount).toBeUndefined()
  })

  it('omits an empty category', () => {
    expect(parseAddDeepLink('?add=true&category=%20').category).toBeUndefined()
  })

  it('omits amount for sub-cent values that truncate to zero', () => {
    expect(parseAddDeepLink('?amount=0.004').amount).toBeUndefined()
  })

  it('omits category when the param is entirely absent', () => {
    expect(parseAddDeepLink('?add=true').category).toBeUndefined()
  })
})

describe('resolveCategoryId', () => {
  it('matches a built-in id case-insensitively', () => {
    expect(resolveCategoryId('LUNCH', OPTIONS)).toBe('lunch')
  })

  it('matches a custom category by label case-insensitively', () => {
    expect(resolveCategoryId('groceries', OPTIONS)).toBe('cat_groceries_x7')
  })

  it('returns null for an unknown value', () => {
    expect(resolveCategoryId('petrol', OPTIONS)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(resolveCategoryId('   ', OPTIONS)).toBeNull()
  })

  it('prefers an id match over another option whose label collides', () => {
    const ambiguous = [
      { id: 'misc', label: 'Other Stuff' },
      { id: 'cat_other_x9', label: 'Misc' },
    ]
    expect(resolveCategoryId('misc', ambiguous)).toBe('misc')
  })
})

describe('amountToDigits', () => {
  it('formats integers without a decimal', () => {
    expect(amountToDigits(5)).toBe('5')
  })

  it('preserves up to two decimals', () => {
    expect(amountToDigits(5.8)).toBe('5.8')
    expect(amountToDigits(5.05)).toBe('5.05')
  })

  it('truncates extra precision', () => {
    expect(amountToDigits(5.809)).toBe('5.8')
  })

  it('returns "0" for non-positive or invalid input', () => {
    expect(amountToDigits(0)).toBe('0')
    expect(amountToDigits(-3)).toBe('0')
    expect(amountToDigits(NaN)).toBe('0')
  })
})
