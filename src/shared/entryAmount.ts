import type { Entry, EntryKind } from '../types.ts'

export function entryKind(entry: Pick<Entry, 'kind'>): EntryKind {
  return entry.kind === 'refund' ? 'refund' : 'expense'
}

export function isRefund(entry: Pick<Entry, 'kind'>): boolean {
  return entryKind(entry) === 'refund'
}

export function entryNetAmount(entry: Pick<Entry, 'amount' | 'kind'>): number {
  return isRefund(entry) ? -entry.amount : entry.amount
}
