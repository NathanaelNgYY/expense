import { describe, expect, it } from 'vitest'
import {
  alreadyImported,
  buildApplePayEntry,
  guessApplePayCategory,
  parseApplePayImport,
} from './applePayImport'
import type { Entry } from './types'

function params(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

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

describe('parseApplePayImport', () => {
  it('parses amount, merchant, name, date, category, and import key', () => {
    const result = parseApplePayImport(
      params('auto=applepay&amount=S%2412.50&merchant=FairPrice%20Finest&name=Wallet'),
      new Date('2026-05-19T10:00:00'),
    )

    expect(result).toEqual({
      ok: true,
      payload: {
        amount: 12.5,
        merchant: 'FairPrice Finest',
        name: 'Wallet',
        note: 'FairPrice Finest',
        date: '2026-05-19',
        category: 'others',
        importKey: 'apple-pay:2026-05-19:12.50:fairprice-finest',
      },
    })
  })

  it('uses the provided date when it is valid', () => {
    const result = parseApplePayImport(
      params('auto=applepay&amount=3.20&merchant=SimplyGo&date=2026-05-18'),
      new Date('2026-05-19T10:00:00'),
    )

    expect(result.ok && result.payload.date).toBe('2026-05-18')
  })

  it('rejects missing amounts', () => {
    expect(parseApplePayImport(params('auto=applepay'), new Date('2026-05-19'))).toEqual({
      ok: false,
      reason: 'missing-amount',
    })
  })

  it('rejects zero and invalid amounts', () => {
    expect(parseApplePayImport(params('auto=applepay&amount=0'), new Date('2026-05-19'))).toEqual({
      ok: false,
      reason: 'invalid-amount',
    })
    expect(parseApplePayImport(params('auto=applepay&amount=nope'), new Date('2026-05-19'))).toEqual({
      ok: false,
      reason: 'invalid-amount',
    })
  })

  it('rejects invalid provided dates', () => {
    expect(
      parseApplePayImport(
        params('auto=applepay&amount=12&merchant=FairPrice&date=2026-02-31'),
        new Date('2026-05-19'),
      ),
    ).toEqual({
      ok: false,
      reason: 'invalid-date',
    })
  })

  it('falls back to Apple Pay note and others category when merchant is missing', () => {
    const result = parseApplePayImport(
      params('auto=applepay&amount=7.30'),
      new Date('2026-05-19T10:00:00'),
    )

    expect(result.ok && result.payload).toMatchObject({
      note: 'Apple Pay',
      category: 'others',
      importKey: 'apple-pay:2026-05-19:7.30:apple-pay',
    })
  })
})

describe('guessApplePayCategory', () => {
  it.each([
    ['MRT SimplyGo', 'transport'],
    ['Grab ride', 'transport'],
    ['Coffee Bean', 'lunch'],
    ['Kopitiam Food Court', 'lunch'],
    ['NTUC FairPrice', 'others'],
    ['Unknown Shop', 'others'],
  ] as const)('guesses %s as %s', (merchant, category) => {
    expect(guessApplePayCategory(merchant)).toBe(category)
  })
})

describe('alreadyImported', () => {
  it('detects entries with the same import key', () => {
    expect(
      alreadyImported(
        [entry({ importKey: 'apple-pay:2026-05-19:12.50:fairprice' })],
        'apple-pay:2026-05-19:12.50:fairprice',
      ),
    ).toBe(true)
  })

  it('returns false when no entry has the import key', () => {
    expect(alreadyImported([entry()], 'apple-pay:2026-05-19:12.50:fairprice')).toBe(false)
  })
})

describe('buildApplePayEntry', () => {
  it('builds a normal entry with Apple Pay metadata', () => {
    const parsed = parseApplePayImport(
      params('auto=applepay&amount=12.50&merchant=FairPrice'),
      new Date('2026-05-19T10:00:00'),
    )

    if (!parsed.ok) throw new Error('Expected parser success')

    expect(buildApplePayEntry(parsed.payload, 'entry-apple-pay')).toEqual({
      id: 'entry-apple-pay',
      amount: 12.5,
      category: 'others',
      note: 'FairPrice',
      date: '2026-05-19',
      source: 'apple-pay',
      importKey: 'apple-pay:2026-05-19:12.50:fairprice',
    })
  })
})
