import type { Entry } from './types'
import { activateUserStorage, getCachedEntries, getPokerSessions } from './storage'
import { bulkUpsertEntries, bulkUpsertPokerSessions, ensureUserId, fetchEntryIds } from './api'

// One-time localStorage -> Supabase upload. Constraints (see
// docs/superpowers/specs/2026-07-11-supabase-migration.md):
//  - localStorage is never cleared; it stays the offline cache. This only copies data UP.
//  - Idempotent and resumable: uploads the diff (cached ids missing on the server), preserving
//    id + dedupeKey, so an interrupted run finishes on the next load.
//  - The done-flag is set only after a verified read-back.
//  - Flags are scoped PER USER ID: signing into a different Supabase account (Google for shared
//    budgets, or a fresh anonymous user after a sign-out) re-seeds that account from the cache,
//    so entries can never silently vanish behind an account switch.
//  - 'migration_done' (unscoped) belongs to the old localStorage->Netlify migration; never reuse it.

const MIGRATION_KEY_PREFIX = 'supabase_migration_done:'
const POKER_SYNCED_PREFIX = 'poker_synced_count:'

export type MigrationOutcome =
  | 'done' // nothing to do (already migrated, or no cached data)
  | 'migrated' // uploaded entries; caller should re-fetch
  | 'incomplete' // some cached entries are still not on the server; caller MUST NOT commit the server list

export async function migrateEntriesIfNeeded(serverEntries: Entry[]): Promise<MigrationOutcome> {
  const userId = await ensureUserId()
  activateUserStorage(userId)
  const flagKey = MIGRATION_KEY_PREFIX + userId
  if (localStorage.getItem(flagKey)) return 'done'

  const cached = getCachedEntries()
  if (cached.length === 0) {
    localStorage.setItem(flagKey, '1')
    return 'done'
  }

  const serverIds = new Set(serverEntries.map(e => e.id))
  const missing = cached.filter(e => !serverIds.has(e.id))
  if (missing.length > 0) await bulkUpsertEntries(missing) // throws -> caller reports offline/auth, cache untouched

  // Verify before setting the flag: every cached id must exist server-side. An upsert that
  // skipped rows (e.g. a dedupe-key collision) must not be declared done.
  const verifiedIds = missing.length > 0 ? await fetchEntryIds() : serverIds
  if (!cached.every(e => verifiedIds.has(e.id))) return 'incomplete'

  localStorage.setItem(flagKey, '1')
  return missing.length > 0 ? 'migrated' : 'done'
}

// Poker sessions are append-only (LogSession only ever adds), so "how many have we pushed"
// is enough to know whether the server is behind. Runs after every successful refresh;
// failures are retried on the next one.
export async function syncPokerSessionsIfNeeded(): Promise<void> {
  const currentSessions = getPokerSessions()
  if (currentSessions.length === 0) return
  const userId = await ensureUserId()
  activateUserStorage(userId)
  const sessions = getPokerSessions()
  if (sessions.length === 0) return // most users never touch poker; don't hit the network for them
  const countKey = POKER_SYNCED_PREFIX + userId
  const synced = Number(localStorage.getItem(countKey) ?? '0')
  if (sessions.length === synced) return
  await bulkUpsertPokerSessions(sessions)
  localStorage.setItem(countKey, String(sessions.length))
}
