import type { Entry } from '../../../src/types'
import { buildEntryFromIngest, type IngestInput } from '../../../src/shared/entry'
import { parseDbsEmail } from '../../../src/shared/dbsEmail'
import type { EntryStore } from './store'

export type IngestBody =
  | { sourceKind: 'apple_pay'; amount: number; merchant?: string; occurredAt?: string; currency?: string }
  | { sourceKind: 'dbs_email'; rawBody: string; occurredAt?: string; currency?: string }

export type IngestResult =
  | { status: 'saved' | 'duplicate'; entry: Entry }
  | { status: 'error'; reason: 'invalid-shape' | 'invalid-amount' | 'no-amount' | 'invalid-dbs-amount' }

export async function handleIngest(
  body: IngestBody,
  store: EntryStore,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<IngestResult> {
  let input: IngestInput

  if (body?.sourceKind === 'apple_pay') {
    if (!Number.isFinite(body.amount) || body.amount <= 0) {
      return { status: 'error', reason: 'invalid-amount' }
    }
    input = {
      sourceKind: 'apple_pay',
      amount: Math.round(body.amount * 100) / 100,
      merchant: body.merchant ?? '',
      occurredAt: body.occurredAt,
      currency: body.currency,
    }
  } else if (body?.sourceKind === 'dbs_email') {
    const parsed = parseDbsEmail(body.rawBody ?? '')
    if (!parsed.ok) {
      return { status: 'error', reason: parsed.reason === 'invalid-amount' ? 'invalid-dbs-amount' : 'no-amount' }
    }
    input = {
      sourceKind: 'dbs_email',
      amount: parsed.amount,
      merchant: parsed.merchant,
      occurredAt: body.occurredAt,
      currency: body.currency,
    }
  } else {
    return { status: 'error', reason: 'invalid-shape' }
  }

  const entry = buildEntryFromIngest(input, makeId)

  if (await store.has(entry.dedupeKey as string)) {
    return { status: 'duplicate', entry }
  }
  await store.put(entry)
  return { status: 'saved', entry }
}
