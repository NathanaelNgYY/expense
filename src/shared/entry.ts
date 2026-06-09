import type { Entry, EntrySource } from '../types'
import { guessCategory } from './category'
import { buildDedupeKey } from './dedupe'
import { sgtDateString } from './sgtDate'

export interface IngestInput {
  sourceKind: 'apple_pay' | 'dbs_email'
  amount: number
  merchant: string
  occurredAt?: string
  currency?: string
}

const SOURCE_MAP: Record<IngestInput['sourceKind'], EntrySource> = {
  apple_pay: 'apple-pay',
  dbs_email: 'dbs-email',
}

export function buildEntryFromIngest(
  input: IngestInput,
  makeId: () => string = () => crypto.randomUUID(),
  now: Date = new Date(),
): Entry {
  const occurredAt = input.occurredAt ?? now.toISOString()
  const date = sgtDateString(occurredAt)
  const merchant = input.merchant.trim()
  const note = merchant || 'Auto import'
  return {
    id: makeId(),
    amount: input.amount,
    category: guessCategory(merchant),
    note,
    date,
    source: SOURCE_MAP[input.sourceKind],
    merchant,
    occurredAt,
    currency: input.currency ?? 'SGD',
    dedupeKey: buildDedupeKey(input.sourceKind, date, input.amount, merchant),
  }
}
