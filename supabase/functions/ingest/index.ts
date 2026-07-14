// Supabase Edge Function: POST /functions/v1/ingest
// iOS Shortcuts authenticate with `Authorization: Bearer <token>`. The bearer token is
// hashed (sha256) and looked up in ingest_tokens to find whose entries it writes;
// supabase/config.toml disables JWT verification for this custom authentication scheme.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { handleIngest, type IngestBody, type IngestStore } from './handler.ts'
import type { Entry } from '../../../src/types.ts'
import {
  API_RATE_LIMIT,
  AUTH_FAILURE_RATE_LIMIT,
  checkRateLimit,
  rateLimitedResponse,
} from '../_shared/rateLimit.ts'

interface EntryRow {
  id: string
  user_id: string
  amount: number | string
  category: string | null
  note: string
  date: string
  source: string | null
  merchant: string | null
  occurred_at: string | null
  currency: string | null
  dedupe_key: string
}

// Service-role client, but every query is scoped to the token's user_id — the RLS bypass
// never reaches beyond the account the ingest token belongs to.
class SupabaseEntryStore implements IngestStore {
  constructor(
    private client: SupabaseClient,
    private userId: string,
    private tokenLabel: string,
  ) {}

  async list(): Promise<Entry[]> {
    // categoryFromHistory only needs recent history, not the full ledger.
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', this.userId)
      .order('date', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return ((data ?? []) as EntryRow[]).map(row => ({
      id: row.id,
      amount: typeof row.amount === 'number' ? row.amount : parseFloat(row.amount),
      category: row.category,
      note: row.note,
      date: row.date,
      ...(row.source ? { source: row.source as Entry['source'] } : {}),
      ...(row.merchant ? { merchant: row.merchant } : {}),
      ...(row.occurred_at ? { occurredAt: row.occurred_at } : {}),
      ...(row.currency ? { currency: row.currency } : {}),
      dedupeKey: row.dedupe_key,
    }))
  }

  async has(dedupeKey: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('entries')
      .select('id')
      .eq('user_id', this.userId)
      .eq('dedupe_key', dedupeKey)
      .limit(1)
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  }

  async put(entry: Entry): Promise<void> {
    // ignoreDuplicates on the dedupe constraint: a race between has() and put() (double-fired
    // Shortcut) collapses to a no-op instead of a 500.
    const { error } = await this.client.from('entries').upsert(
      {
        id: entry.id,
        user_id: this.userId,
        amount: entry.amount,
        category: entry.category,
        note: entry.note,
        date: entry.date,
        source: entry.source ?? null,
        merchant: entry.merchant ?? null,
        occurred_at: entry.occurredAt ?? null,
        currency: entry.currency ?? null,
        dedupe_key: entry.dedupeKey as string,
      },
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    )
    if (error) throw new Error(error.message)
  }

  async recordCapture(sourceKind: IngestBody['sourceKind']): Promise<void> {
    const capturedAt = new Date().toISOString()
    const { error } = await this.client.from('ingest_status').upsert(
      {
        user_id: this.userId,
        token_label: this.tokenLabel,
        last_captured_at: capturedAt,
        last_source: sourceKind,
        updated_at: capturedAt,
      },
      { onConflict: 'user_id' },
    )
    // Visibility must never make transaction capture fail. A later request retries this
    // best-effort status write while the entry itself remains durable.
    if (error) console.error('Failed to update ingest status:', error.message)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(.+)$/.exec((header ?? '').trim())
  return match ? match[1] : null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const token = bearerToken(req.headers.get('authorization'))
  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let userId: string | null = null
  let tokenLabel = ''
  if (token) {
    const { data } = await client
      .from('ingest_tokens')
      .select('user_id,label')
      .eq('token_hash', await sha256Hex(token))
      .maybeSingle()
    userId = data?.user_id ?? null
    tokenLabel = data?.label ?? ''
  }
  if (!userId) {
    const limit = checkRateLimit(req, AUTH_FAILURE_RATE_LIMIT)
    if (limit.limited) return rateLimitedResponse(limit)
    return json({ error: 'unauthorized' }, 401)
  }

  const limit = checkRateLimit(req, API_RATE_LIMIT)
  if (limit.limited) return rateLimitedResponse(limit)

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return json({ error: 'invalid-json' }, 400)
  }

  const result = await handleIngest(body, new SupabaseEntryStore(client, userId, tokenLabel))
  if (result.status === 'error') {
    return json(result, 400)
  }
  return json(result, 200)
})
