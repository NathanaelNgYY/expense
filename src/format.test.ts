import { describe, expect, test } from 'vitest'
import {
  formatMoney,
  formatMoneyWhole,
  formatRemaining,
  formatSGD,
  formatSGDWhole,
  formatSignedSGD,
} from './format'

describe('formatMoney', () => {
  test('uses wallet-specific symbols and currency precision', () => {
    expect(formatMoney(1234.5, 'MYR')).toBe('RM1,234.50')
    expect(formatMoney(2000, 'JPY')).toBe('¥2,000')
    expect(formatMoneyWhole(180000, 'JPY')).toBe('¥180,000')
  })

  test('falls back to the normalized code without throwing for unknown currencies', () => {
    expect(formatMoney(12.5, 'XYZ')).toBe('XYZ 12.50')
  })

  test('places a negative sign before the currency symbol', () => {
    expect(formatMoney(-230, 'MYR')).toBe('-RM230.00')
  })
})

describe('formatSGD', () => {
  test('groups thousands', () => {
    expect(formatSGD(1000012.89)).toBe('S$1,000,012.89')
  })

  test('always shows two decimals', () => {
    expect(formatSGD(5)).toBe('S$5.00')
    expect(formatSGD(5.8)).toBe('S$5.80')
  })

  test('places the minus sign before the currency symbol, not after it', () => {
    expect(formatSGD(-999776.89)).toBe('-S$999,776.89')
  })

  test('treats negative zero as zero', () => {
    expect(formatSGD(-0)).toBe('S$0.00')
  })
})

describe('formatSGDWhole', () => {
  test('drops the cents and groups thousands', () => {
    expect(formatSGDWhole(1200)).toBe('S$1,200')
    expect(formatSGDWhole(1000681.4)).toBe('S$1,000,681')
  })
})

describe('formatRemaining', () => {
  test('says "left" while the value is positive', () => {
    expect(formatRemaining(251.7)).toBe('S$251.70 left')
  })

  test('says "over" instead of a negative "left"', () => {
    expect(formatRemaining(-999776.89)).toBe('S$999,776.89 over')
  })

  test('exactly zero is spent, not over', () => {
    expect(formatRemaining(0)).toBe('S$0.00 left')
  })

  test('describes remaining money in the active wallet currency', () => {
    expect(formatRemaining(230, 'MYR')).toBe('RM230.00 left')
  })
})

describe('formatSignedSGD', () => {
  test('prefixes a win with +', () => {
    expect(formatSignedSGD(120.5)).toBe('+S$120.50')
  })

  test('prefixes a loss with -', () => {
    expect(formatSignedSGD(-40)).toBe('-S$40.00')
  })

  test('zero carries no sign — it is neither a win nor a loss', () => {
    expect(formatSignedSGD(0)).toBe('S$0.00')
  })
})
