// src/format.ts
//
// One place for money on screen. Before this existed, 46 call sites wrote
// `S$${value.toFixed(2)}` by hand, which printed `S$1000012.89` (no grouping) and
// `S$-999776.89 left` (sign on the wrong side of the symbol, and "left" for a value
// that is actually an overage). Route every rendered amount through here.

import type { CurrencyCode, Entry } from './types'
import { isRefund } from './shared/entryAmount'
import { entryCurrency, normalizeCurrencyCode } from './shared/currency'

const SYMBOLS: Record<string, string> = {
  SGD: 'S$', MYR: 'RM', JPY: '¥', THB: '฿', IDR: 'Rp', USD: 'US$', EUR: '€',
  GBP: '£', AUD: 'A$', CAD: 'C$', PHP: '₱', KRW: '₩', CNY: 'CN¥', HKD: 'HK$',
  TWD: 'NT$', VND: '₫',
}

const GROUPED_WHOLE = new Intl.NumberFormat('en-SG', {
  maximumFractionDigits: 0,
})

/** `S$1,234.50`, with the minus sign ahead of the symbol: `-S$1,234.50`. */
export function formatSGD(value: number): string {
  return formatMoney(value, 'SGD')
}

/** `S$1,200` — for headline figures where cents are noise. */
export function formatSGDWhole(value: number): string {
  return formatMoneyWhole(value, 'SGD')
}

function currencyFractionDigits(currency: CurrencyCode): number {
  try {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency })
      .resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

export function formatMoney(value: number, currency: CurrencyCode): string {
  const code = normalizeCurrencyCode(currency) ?? (currency.trim().toUpperCase() || 'SGD')
  const safe = Object.is(value, -0) ? 0 : value
  const sign = safe < 0 ? '-' : ''
  const digits = currencyFractionDigits(code)
  const grouped = new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(safe))
  const symbol = SYMBOLS[code]
  return symbol ? `${sign}${symbol}${grouped}` : `${sign}${code} ${grouped}`
}

export function formatMoneyWhole(value: number, currency: CurrencyCode): string {
  const code = normalizeCurrencyCode(currency) ?? (currency.trim().toUpperCase() || 'SGD')
  const safe = Object.is(value, -0) ? 0 : value
  const sign = safe < 0 ? '-' : ''
  const grouped = GROUPED_WHOLE.format(Math.abs(safe))
  const symbol = SYMBOLS[code]
  return symbol ? `${sign}${symbol}${grouped}` : `${sign}${code} ${grouped}`
}

/**
 * Budget headroom stated in words rather than as a signed number, because
 * "-S$40.00 left" is a sentence no one should have to parse.
 */
export function formatRemaining(remaining: number, currency: CurrencyCode = 'SGD'): string {
  return remaining < 0
    ? `${formatMoney(Math.abs(remaining), currency)} over`
    : `${formatMoney(remaining, currency)} left`
}

/** For P&L, where the sign carries the meaning. Zero is unsigned: it is neither. */
export function formatSignedSGD(value: number): string {
  return formatSignedMoney(value, 'SGD')
}

export function formatSignedMoney(value: number, currency: CurrencyCode): string {
  if (value === 0) return formatMoney(0, currency)
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`
}

/** Ledger convention: refunds are positive credits while stored amounts stay positive. */
export function formatEntryAmount(entry: Pick<Entry, 'amount' | 'kind' | 'currency'>): string {
  const currency = entryCurrency(entry)
  return isRefund(entry) ? `+${formatMoney(entry.amount, currency)}` : formatMoney(entry.amount, currency)
}
