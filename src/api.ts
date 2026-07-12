import type { Entry, PokerSession } from './types'
import { getSupabase, isSupabaseConfigured } from './lib/supabaseClient'
import { buildDedupeKey } from './shared/dedupe'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Retryable-forever errors and dead-on-arrival errors look identical to a bare `catch`. They
// aren't: a queued mutation that the server rejects on its merits (gone, malformed) will be
// rejected identically on every future attempt, and leaving it at the head of the sync queue
// blocks every mutation behind it. 4xx means "this request is wrong" — except for the ones
// that mean "this request is fine, just not now".
const TRANSIENT_CLIENT_STATUSES = new Set([401, 403, 408, 429])

export function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false // network/parse failure: retry
  return error.status >= 400 && error.status < 500 && !TRANSIENT_CLIENT_STATUSES.has(error.status)
}

// A bad session is fixable (sign-in succeeds later, anonymous sign-ins get enabled), so the
// mutation must survive. Distinct from being offline because tapping Retry cannot help — the
// session has to change first.
export function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

// status 0/undefined means the browser never got a response (offline, DNS): a plain error so
// isPermanentFailure treats it as retryable, mirroring how fetch() rejections behaved before.
function throwFrom(error: { message: string }, status: number | undefined): never {
  if (!status) throw new TypeError(error.message)
  throw new ApiError(status, error.message)
}

// ---------- session ----------

// Every user gets a Supabase session silently: an existing (Google/OTP) session is reused,
// otherwise an anonymous user is created. Single-flight so concurrent callers can't race two
// signInAnonymously() calls into two different users.
let sessionInFlight: Promise<string> | null = null

async function resolveUserId(): Promise<string> {
  if (!isSupabaseConfigured()) throw new ApiError(401, 'Supabase is not configured')
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) throwFrom(error, error.status === 429 ? 429 : (error.status ? 401 : 0))
  if (!anon.session) throw new ApiError(401, 'anonymous sign-in returned no session')
  return anon.session.user.id
}

export function ensureUserId(): Promise<string> {
  if (!sessionInFlight) sessionInFlight = resolveUserId().finally(() => { sessionInFlight = null })
  return sessionInFlight
}

// ---------- row mapping ----------

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
  import_key: string | null
  dedupe_key: string
}

function num(value: number | string): number {
  return typeof value === 'number' ? value : parseFloat(value)
}

function rowToEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    amount: num(row.amount),
    category: row.category,
    note: row.note,
    date: row.date,
    ...(row.source ? { source: row.source as Entry['source'] } : {}),
    ...(row.merchant ? { merchant: row.merchant } : {}),
    ...(row.occurred_at ? { occurredAt: row.occurred_at } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.import_key ? { importKey: row.import_key } : {}),
    dedupeKey: row.dedupe_key,
  }
}

function entryToRow(entry: Entry, userId: string): EntryRow {
  return {
    id: entry.id,
    user_id: userId,
    amount: entry.amount,
    category: entry.category,
    note: entry.note,
    date: entry.date,
    source: entry.source ?? null,
    merchant: entry.merchant ?? null,
    occurred_at: entry.occurredAt ?? null,
    currency: entry.currency ?? null,
    import_key: entry.importKey ?? null,
    dedupe_key: entry.dedupeKey ?? buildDedupeKey('manual', entry.date, entry.amount, entry.note, entry.id),
  }
}

// ---------- entries CRUD ----------

export interface NewManualEntry {
  amount: number
  category: string | null
  note: string
  date: string
  id?: string // optional; lets imports/migration preserve a stable id so re-runs are idempotent
}

export async function fetchEntries(): Promise<Entry[]> {
  await ensureUserId()
  const { data, error, status } = await getSupabase()
    .from('entries')
    .select('*')
    .order('date', { ascending: false })
  if (error) throwFrom(error, status)
  return ((data ?? []) as EntryRow[]).map(rowToEntry)
}

export async function createEntryApi(input: NewManualEntry | Entry): Promise<Entry> {
  const userId = await ensureUserId()
  const id = input.id ?? crypto.randomUUID()
  const partial = input as Partial<Entry>
  const entry: Entry = {
    id,
    amount: input.amount,
    category: input.category,
    note: input.note,
    date: input.date,
    source: partial.source ?? 'manual',
    ...(partial.importKey ? { importKey: partial.importKey } : {}),
    ...(partial.merchant ? { merchant: partial.merchant } : {}),
    ...(partial.occurredAt ? { occurredAt: partial.occurredAt } : {}),
    ...(partial.currency ? { currency: partial.currency } : {}),
    dedupeKey: partial.dedupeKey ?? buildDedupeKey('manual', input.date, input.amount, input.note, id),
  }
  // Upsert-do-nothing on id: a queue replay after a network blip (where the first attempt
  // actually landed) is a clean no-op instead of a duplicate-key rejection.
  const { error, status } = await getSupabase()
    .from('entries')
    .upsert(entryToRow(entry, userId), { onConflict: 'id', ignoreDuplicates: true })
  if (error) throwFrom(error, status)
  return entry
}

const ENTRY_PATCH_COLUMNS: ReadonlyArray<[keyof Entry, string]> = [
  ['amount', 'amount'],
  ['category', 'category'],
  ['note', 'note'],
  ['date', 'date'],
  ['source', 'source'],
  ['merchant', 'merchant'],
  ['occurredAt', 'occurred_at'],
  ['currency', 'currency'],
  ['importKey', 'import_key'],
]

export async function updateEntryApi(id: string, patch: Partial<Entry>): Promise<Entry> {
  await ensureUserId()
  // id and dedupe_key are identity, never patched — same rule the old server enforced.
  const row: Record<string, unknown> = {}
  for (const [key, column] of ENTRY_PATCH_COLUMNS) {
    if (key in patch) row[column] = patch[key]
  }
  const { data, error, status } = await getSupabase()
    .from('entries')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throwFrom(error, status)
  if (!data) throw new ApiError(404, 'entry not found')
  return rowToEntry(data as EntryRow)
}

export async function deleteEntryApi(id: string): Promise<void> {
  await ensureUserId()
  const { error, status } = await getSupabase().from('entries').delete().eq('id', id)
  if (error) throwFrom(error, status)
}

// ---------- bulk operations (localStorage -> Supabase migration) ----------

const UPSERT_BATCH_SIZE = 500

export async function bulkUpsertEntries(entries: Entry[]): Promise<void> {
  const userId = await ensureUserId()
  const rows = entries.map(e => entryToRow(e, userId))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const { error, status } = await getSupabase()
      .from('entries')
      .upsert(rows.slice(i, i + UPSERT_BATCH_SIZE), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throwFrom(error, status)
  }
}

export async function fetchEntryIds(): Promise<Set<string>> {
  await ensureUserId()
  const { data, error, status } = await getSupabase().from('entries').select('id')
  if (error) throwFrom(error, status)
  return new Set(((data ?? []) as Array<{ id: string }>).map(r => r.id))
}

// ---------- poker sessions ----------

interface PokerRow {
  id: string
  user_id: string
  date: string
  start_time: string
  end_time: string
  stakes: string
  buy_in: number | string
  result: string
  amount: number | string
}

export async function bulkUpsertPokerSessions(sessions: PokerSession[]): Promise<void> {
  const userId = await ensureUserId()
  const rows: PokerRow[] = sessions.map(s => ({
    id: s.id,
    user_id: userId,
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    stakes: s.stakes,
    buy_in: s.buyIn,
    result: s.result,
    amount: s.amount,
  }))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const { error, status } = await getSupabase()
      .from('poker_sessions')
      .upsert(rows.slice(i, i + UPSERT_BATCH_SIZE), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throwFrom(error, status)
  }
}
