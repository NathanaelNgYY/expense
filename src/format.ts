// src/format.ts
//
// One place for money on screen. Before this existed, 46 call sites wrote
// `S$${value.toFixed(2)}` by hand, which printed `S$1000012.89` (no grouping) and
// `S$-999776.89 left` (sign on the wrong side of the symbol, and "left" for a value
// that is actually an overage). Route every rendered amount through here.

const GROUPED = new Intl.NumberFormat('en-SG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const GROUPED_WHOLE = new Intl.NumberFormat('en-SG', {
  maximumFractionDigits: 0,
})

/** `S$1,234.50`, with the minus sign ahead of the symbol: `-S$1,234.50`. */
export function formatSGD(value: number): string {
  const safe = Object.is(value, -0) ? 0 : value
  const sign = safe < 0 ? '-' : ''
  return `${sign}S$${GROUPED.format(Math.abs(safe))}`
}

/** `S$1,200` — for headline figures where cents are noise. */
export function formatSGDWhole(value: number): string {
  const safe = Object.is(value, -0) ? 0 : value
  const sign = safe < 0 ? '-' : ''
  return `${sign}S$${GROUPED_WHOLE.format(Math.abs(safe))}`
}

/**
 * Budget headroom stated in words rather than as a signed number, because
 * "-S$40.00 left" is a sentence no one should have to parse.
 */
export function formatRemaining(remaining: number): string {
  return remaining < 0
    ? `${formatSGD(Math.abs(remaining))} over`
    : `${formatSGD(remaining)} left`
}

/** For P&L, where the sign carries the meaning. Zero is unsigned: it is neither. */
export function formatSignedSGD(value: number): string {
  if (value === 0) return formatSGD(0)
  return `${value > 0 ? '+' : '-'}S$${GROUPED.format(Math.abs(value))}`
}

/** Ledger convention: refunds are positive credits while stored amounts stay positive. */
export function formatEntryAmount(entry: Pick<Entry, 'amount' | 'kind'>): string {
  return isRefund(entry) ? `+${formatSGD(entry.amount)}` : formatSGD(entry.amount)
}
import type { Entry } from './types'
import { isRefund } from './shared/entryAmount'
