// Pure ingest logic for the Supabase Edge Function, kept separate from transport and storage.
// Everything domain-y still comes from src/shared/ (single source of truth).
import type { Entry } from '../../../src/types.ts'
import { buildEntryFromIngest, type IngestInput } from '../../../src/shared/entry.ts'
import { parseDbsEmail } from '../../../src/shared/dbsEmail.ts'
import {
  resolveAutomaticCategory,
  type AutomaticCategoryRule,
} from '../../../src/shared/automaticCategoryRules.ts'
import { fingerprintIngestEvent } from '../../../src/shared/dedupe.ts'

export interface IngestStore {
  list(): Promise<Entry[]>
  listAutomaticCategoryRules?(): Promise<AutomaticCategoryRule[]>
  categoryPreferenceForMerchant?(merchant: string): Promise<string | null>
  has(dedupeKey: string): Promise<boolean>
  put(entry: Entry): Promise<void>
  recordCapture?(sourceKind: IngestBody['sourceKind']): Promise<void>
}

async function automaticCategory(
  store: IngestStore,
  merchant: string,
  occurredAt: string | undefined,
): Promise<string | null> {
  try {
    const preference = await store.categoryPreferenceForMerchant?.(merchant)
    if (preference) return preference
  } catch {
    // A preference lookup failure must not block transaction capture. History
    // and the built-in merchant pack remain available as safe fallbacks.
  }
  const history = await store.list()
  let rules: AutomaticCategoryRule[] = []
  try {
    rules = await store.listAutomaticCategoryRules?.() ?? []
  } catch {
    // Preference visibility must never make capture fail. The merchant pack
    // and correction history still provide a safe degraded path.
  }
  return resolveAutomaticCategory(history, rules, merchant, occurredAt)
}

export type IngestBody =
  | { sourceKind: 'apple_pay'; amount: number; merchant?: string; occurredAt?: string; currency?: string; idempotencyKey?: string }
  | { sourceKind: 'dbs_email'; rawBody: string; occurredAt?: string; currency?: string; idempotencyKey?: string }

export type IngestResult =
  | { status: 'saved' | 'duplicate'; entry: Entry }
  | { status: 'error'; reason: 'invalid-shape' | 'invalid-amount' | 'no-amount' | 'invalid-dbs-amount' | 'invalid-idempotency-key' }

function validIdempotencyKey(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0 && value.length <= 500)
}

function usableApplePayIdempotencyKey(value: string | undefined, merchant: string): string | undefined {
  const key = value?.trim()
  if (!key || key.toLocaleLowerCase() === merchant.trim().toLocaleLowerCase()) return undefined
  return key
}

export async function handleIngest(
  body: IngestBody,
  store: IngestStore,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<IngestResult> {
  let input: IngestInput

  if (!validIdempotencyKey(body?.idempotencyKey)) {
    return { status: 'error', reason: 'invalid-idempotency-key' }
  }

  if (body?.sourceKind === 'apple_pay') {
    if (!Number.isFinite(body.amount) || body.amount <= 0) {
      return { status: 'error', reason: 'invalid-amount' }
    }
    const merchant = body.merchant ?? ''
    const idempotencyKey = usableApplePayIdempotencyKey(body.idempotencyKey, merchant)
    input = {
      sourceKind: 'apple_pay',
      amount: Math.round(body.amount * 100) / 100,
      merchant,
      learnedCategory: await automaticCategory(store, merchant, body.occurredAt),
      occurredAt: body.occurredAt,
      currency: body.currency,
      ...(idempotencyKey
        ? { eventFingerprint: await fingerprintIngestEvent(idempotencyKey) }
        : {}),
    }
  } else if (body?.sourceKind === 'dbs_email') {
    const parsed = parseDbsEmail(body.rawBody ?? '', body.occurredAt)
    if (!parsed.ok) {
      return { status: 'error', reason: parsed.reason === 'invalid-amount' ? 'invalid-dbs-amount' : 'no-amount' }
    }
    const occurredAt = parsed.occurredAt ?? body.occurredAt
    const learnedCategory = await automaticCategory(store, parsed.merchant, occurredAt)
    input = {
      sourceKind: 'dbs_email',
      amount: parsed.amount,
      merchant: parsed.merchant,
      channel: parsed.channel,
      learnedCategory: learnedCategory ?? (parsed.recipientKind === 'person' ? 'others' : null),
      occurredAt,
      currency: body.currency,
      eventFingerprint: await fingerprintIngestEvent(body.idempotencyKey?.trim() ?? body.rawBody),
    }
  } else {
    return { status: 'error', reason: 'invalid-shape' }
  }

  const entry = buildEntryFromIngest(input, makeId)

  if (await store.has(entry.dedupeKey as string)) {
    await store.recordCapture?.(body.sourceKind)
    return { status: 'duplicate', entry }
  }
  await store.put(entry)
  await store.recordCapture?.(body.sourceKind)
  return { status: 'saved', entry }
}
