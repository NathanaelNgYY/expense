import type { Category, Entry, EntrySource } from '../types'
import type { DbsChannel } from './dbsEmail'
import { guessCategory } from './category'
import { buildDedupeKey } from './dedupe'
import { sgtDateString } from './sgtDate'

export interface IngestInput {
  sourceKind: 'apple_pay' | 'dbs_email'
  amount: number
  merchant: string
  channel?: DbsChannel // payment channel for dbs_email (PayNow vs card)
  learnedCategory?: Category | null // category learned from the user's history
  occurredAt?: string
  currency?: string
}

const SOURCE_MAP: Record<IngestInput['sourceKind'], EntrySource> = {
  apple_pay: 'apple-pay',
  dbs_email: 'dbs-email',
}

// Human-readable channel label for the note, so the user can see at a glance
// how a transaction came in (e.g. "PayNow · AH HUAT" vs "Apple Pay · Ya Kun").
function sourceLabel(input: IngestInput): string {
  if (input.sourceKind === 'apple_pay') return 'Apple Pay'
  return input.channel === 'paynow' ? 'PayNow' : 'Card'
}

export function buildEntryFromIngest(
  input: IngestInput,
  makeId: () => string = () => crypto.randomUUID(),
  now: Date = new Date(),
): Entry {
  const occurredAt = input.occurredAt ?? now.toISOString()
  const date = sgtDateString(occurredAt)
  const merchant = input.merchant.trim()
  const label = sourceLabel(input)
  const note = merchant ? `${label} · ${merchant}` : label
  // Prefer what the user has taught us; fall back to keyword guess; otherwise
  // leave it Uncategorized (null) rather than silently dumping into 'others'.
  const category = input.learnedCategory ?? guessCategory(merchant)
  return {
    id: makeId(),
    amount: input.amount,
    category,
    note,
    date,
    source: SOURCE_MAP[input.sourceKind],
    merchant,
    occurredAt,
    currency: input.currency ?? 'SGD',
    dedupeKey: buildDedupeKey(input.sourceKind, date, input.amount, merchant),
  }
}
