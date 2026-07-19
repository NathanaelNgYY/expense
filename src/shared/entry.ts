// Explicit .ts extensions: this module is bundled by Deno for the ingest Edge Function,
// which cannot resolve extensionless specifiers. Vite/tsc accept them (allowImportingTsExtensions).
import type { Entry, EntrySource } from '../types.ts'
import type { DbsChannel } from './dbsEmail.ts'
import { guessCategory } from './category.ts'
import { buildDedupeKey } from './dedupe.ts'
import { sgtDateString } from './sgtDate.ts'

export interface IngestInput {
  sourceKind: 'apple_pay' | 'dbs_email'
  amount: number
  merchant: string
  channel?: DbsChannel // payment channel for dbs_email (PayNow vs card)
  // Category learned from the user's history. Widened to string because the user
  // may have taught us a custom category, which is not in the Category union.
  learnedCategory?: string | null
  occurredAt?: string
  currency?: string
  eventFingerprint?: string
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
  const canonicalOccurredAt = new Date(occurredAt).toISOString()
  const occurrenceMinute = new Date(canonicalOccurredAt)
  occurrenceMinute.setUTCSeconds(0, 0)
  const date = sgtDateString(canonicalOccurredAt)
  const merchant = input.merchant.trim()
  const label = sourceLabel(input)
  const note = merchant ? `${label} · ${merchant}` : label
  // Prefer what the user has taught us; fall back to keyword guess; otherwise
  // leave it Uncategorized (null) rather than silently dumping into 'others'.
  const category = input.learnedCategory ?? guessCategory(merchant)
  return {
    id: makeId(),
    amount: input.amount,
    kind: 'expense',
    category,
    note,
    date,
    source: SOURCE_MAP[input.sourceKind],
    merchant,
    occurredAt: canonicalOccurredAt,
    currency: input.currency ?? 'SGD',
    dedupeKey: buildDedupeKey(
      input.sourceKind,
      occurrenceMinute.toISOString(),
      input.amount,
      merchant,
      input.eventFingerprint,
    ),
  }
}
