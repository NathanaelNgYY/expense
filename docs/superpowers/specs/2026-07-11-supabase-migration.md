# Netlify → Supabase backend migration — design spec

**Date:** 2026-07-11
**Status:** approved direction; implementation in progress
**Supersedes:** the backend portions of `docs/APP_STORE.md` (on hold 2026-07-10 — the PWA is the product)

## Why

The personal-data backend (entries CRUD + ingest) runs on Netlify Functions over Netlify Blobs.
Problems this migration removes:

1. **Single-tenant.** One `INGEST_TOKEN`/`API_TOKEN` gates a single shared Blobs store. Real users of
   the deployed PWA have no token, so their data lives **only in their browser's localStorage** —
   uncounted, unbacked-up, lost if Safari evicts site data.
2. **Eventual consistency.** Blobs `list()` lags writes/deletes, forcing the tombstone +
   pending-creates reconciliation in `EntriesContext.refresh()` and `syncQueue.ts`.
3. **Split stack.** Shared budgets (`src/sharedBudgets/`) already runs on Supabase (project
   `igsjhpfymspbyzqzpzme`, "Budget", ap-northeast-1) with Postgres + RLS + auth. Two backends, one app.

After migration: one Supabase backend, per-user data with RLS, strongly consistent reads, and every
user (not just the owner) gets real cloud sync.

## Hard constraints (data safety)

These are non-negotiable; every implementation task inherits them.

- **C1 — The app's origin must not change** until every user has migrated. localStorage is
  origin-scoped; for non-owner users it is the *only* copy of their data. Same Netlify site, same URL.
- **C2 — Never clear or shrink localStorage.** It remains the offline cache after migration, exactly
  as today. The migration *copies* data up; it never moves it.
- **C3 — Idempotent, resumable user migration.** Preserve `id` and `dedupeKey` on upload; use
  upsert semantics so re-runs are no-ops. The completion flag is set **only after a verified
  read-back**. An interrupted migration resumes on next load.
- **C4 — New flag key.** `migration_done` is already consumed by the 2025 localStorage→Netlify
  migration (`src/EntriesContext.tsx`). The Supabase migration uses `supabase_migration_done`.
- **C5 — The UI never gates on auth or network.** If Supabase is unreachable or the anonymous
  sign-in fails, the app runs off the cache with the existing `SyncState` failure surface — identical
  to today's offline behavior.
- **C6 — Owner's Blobs data is exported to JSON before any Netlify function is deleted.**

## Architecture

### Auth: anonymous-first

- On app start, `ensureSession()`: `getSession()`; if none, `supabase.auth.signInAnonymously()`.
  Requires **anonymous sign-ins enabled** in the Supabase project (Auth settings) — both staging and prod.
- An anonymous user is a real `auth.users` row; RLS keys on `auth.uid()`. Existing Google/OTP
  sessions (from shared budgets) are reused as-is — no second sign-in.
- Anonymous accounts can later be **linked** to Google/email (`linkIdentity`) so users can survive
  browser-data loss. Linking UI is a follow-up, not part of this migration.
- Failure to obtain a session ⇒ `SyncFailureReason 'auth'`, app keeps running from cache (C5).

### Schema (new migration files in `supabase/migrations/`)

```sql
create table public.entries (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      numeric not null,
  category    text,
  note        text not null default '',
  date        date not null,              -- SGT-local YYYY-MM-DD (client computes; server stores)
  source      text,                        -- 'manual' | 'apple-pay' | 'dbs-email'
  merchant    text,
  occurred_at timestamptz,
  currency    text,
  import_key  text,                        -- legacy field, carried through
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table public.poker_sessions (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  start_time text not null,
  end_time   text not null,
  stakes     text not null,
  buy_in     numeric not null,
  result     text not null check (result in ('win', 'loss')),
  amount     numeric not null,
  created_at timestamptz not null default now()
);

-- Maps ingest bearer tokens to the user whose entries they write. Replaces the single
-- shared INGEST_TOKEN env var; the owner's existing token is seeded so Shortcuts keep working.
create table public.ingest_tokens (
  token_hash text primary key,             -- sha256 hex of the bearer token; raw token never stored
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text not null default '',
  created_at timestamptz not null default now()
);
```

RLS on all three: enabled; `entries` and `poker_sessions` get per-user
`select/insert/update/delete` policies (`auth.uid() = user_id`, both `using` and `with check`).
`ingest_tokens` gets **no** client policies — only the Edge Function (service role) touches it.
`updated_at` maintained by trigger. Client-side ids stay client-generated UUIDs (existing
`crypto.randomUUID()`), matching current behavior.

Notes:
- `dedupe_key` is `not null`: the client computes `buildDedupeKey('manual', …, id)` for manual
  entries exactly as `entriesHandler.createEntry` does today; cached entries missing it (pre-sync
  offline creates) get it computed at upload time.
- `unique (user_id, dedupe_key)` gives ingest idempotency per user (today it's global — fine, the
  store was single-tenant anyway).
- `date` is a Postgres `date`; supabase-js serializes it to/from `YYYY-MM-DD` strings, matching
  `Entry.date` and all `shared/sgtDate.ts` math unchanged.

### Ingest: Supabase Edge Function `ingest`

Port of `netlify/functions/ingest.ts` + `lib/ingestHandler.ts`, same request/response contract:

- Same `Authorization: Bearer <token>` header. The function hashes the token (sha256), looks it up
  in `ingest_tokens`, and gets the target `user_id`. Unknown/missing token → 401. **The iOS
  Shortcuts change only their URL** (`https://<project>.supabase.co/functions/v1/ingest`), keeping
  the exact same header. Deploy with `--no-verify-jwt` so the custom bearer scheme is honored.
- Body handling identical: `{ sourceKind: 'apple_pay' | 'dbs_email', … }`, reusing
  `src/shared/entry.ts`, `dbsEmail.ts`, `category.ts`, `dedupe.ts` (Deno-compatible pure TS —
  imported into `supabase/functions/ingest/` via relative paths).
- Idempotency: `insert … on conflict (user_id, dedupe_key) do nothing`; conflict ⇒
  `{ status: 'duplicate' }`, insert ⇒ `{ status: 'saved' }`, mirroring today's `store.has()` check.
- `categoryFromHistory` reads that user's recent entries via service-role query scoped to `user_id`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` (auto-injected into Edge Functions); RLS bypass is intentional
  and scoped — the function only ever writes rows for the token's `user_id`.

### Client: swap the transport inside `src/api.ts`, keep the contract

`src/api.ts` keeps its exact exports (`fetchEntries`, `createEntryApi`, `updateEntryApi`,
`deleteEntryApi`, `isAuthFailure`, `isPermanentFailure`, `ApiError`, `NewManualEntry`) so
`EntriesContext.tsx` and `syncQueue.ts` semantics (locally-durable mutations, sequential drain,
auth-failure-preserves-queue) survive untouched. Implementation changes from `fetch('/api/…')` to
supabase-js against `entries`:

- `fetchEntries()` → `select … where user_id = auth.uid()` (implicit via RLS) `order by date desc`.
- `createEntryApi(e)` → `upsert` on `id` conflict (idempotent for migration re-runs and queue
  replays); computes `dedupe_key` when absent.
- `updateEntryApi(id, patch)` → `update … eq('id', id)`; `id`/`dedupe_key` never patched (today's
  server enforces the same).
- `deleteEntryApi(id)` → `delete … eq('id', id)`; deleting an already-deleted id is a success
  (today it's a 404 → treated as permanent failure → dropped; Postgres makes it a clean no-op).
- Error mapping: PostgREST/network errors → `ApiError` with a status; missing session → 401 so
  `isAuthFailure` keeps working. `getApiToken`/`setApiToken` (the old manual token UI) become dead
  code — removed along with the settings field that fed them.

**Kept for now, deleted in cleanup:** tombstone + pending-creates reconciliation in `refresh()`.
Postgres is read-after-write consistent, so after the Netlify backend is retired this code (and
`getTombstones`/`getPendingCreates` in `syncQueue.ts`) is deleted and `refresh()` simplifies to
flush→fetch→commit. Doing it as a separate commit keeps the migration diff reviewable.

### User-side migration (the critical path)

In `EntriesContext.refresh()`, replacing the old `migrateIfNeeded`:

```
supabaseMigrateIfNeeded(serverEntries):
  if localStorage['supabase_migration_done'] → return
  cached = getCachedEntries(); pokerCached = getPokerSessions()
  serverIds = ids present on server for this user
  toUpload = cached entries whose id ∉ serverIds          // resume-safe diff, not "server empty"
  upsert toUpload in batches (on id conflict do nothing), preserving id + dedupeKey
  upload poker sessions the same way
  read back server counts; only if every cached id is now present → set flag
  (any failure → return without flag; next load retries the remaining diff)
```

Differences from the old `migrateIfNeeded` (deliberate hardening):
- Diff-based rather than "only if server is empty" — resumable mid-way (C3).
- Batch upsert (500/batch) instead of one POST per entry — a user with years of entries migrates
  in one round-trip, not hundreds.
- Verified read-back before the flag is set.
- Poker sessions migrate in the same pass (they're localStorage-only today: `poker_sessions` key).

**What stays local (unchanged, deliberately out of scope):** `budget_config`,
`budget_custom_categories`, `budget_category_overrides`, `poker_custom_stakes`, theme. Settings
sync is a possible follow-up; it is not needed for data safety.

### Owner data path

The owner's localStorage cache mirrors the Blobs store, so the owner migrates through the same
client path as every user. The Blobs store is additionally exported (script hitting
`/api/entries` with the owner token, or `netlify blobs:list/get`) to
`docs/superpowers/specs/backup/` **before** any Netlify function is deleted (C6), and used to
verify the owner's migrated row count.

## Environments & rollout

| Stage | App | Supabase | Purpose |
|---|---|---|---|
| 1. Localhost | `npm run dev` (5173) | **staging project** (new, free tier) | Build + unit/integration tests; migration rehearsal with seeded localStorage (`scripts/seed-localstorage.js` pasted in devtools) |
| 2. Draft deploy | `netlify deploy --build` (unique draft URL) | staging project | Real-iPhone PWA test: anonymous auth, migration flow, ingest Edge Function from a real Shortcut. Different origin ⇒ empty localStorage ⇒ cannot touch prod users (by design). Never shared with real users. |
| 3. Prod | `netlify deploy --build --prod` (same URL, C1) | **Budget** project (`igsjhpfymspbyzqzpzme`) | Migrations applied via `supabase db push`; env vars flipped at build time |

Rollout order in prod: apply schema → deploy Edge Function + seed owner's ingest token → deploy
client → owner verifies own data + Shortcuts → users migrate passively as they open the app →
watch `entries` user counts → only then delete `netlify/functions/` + tombstone code (separate
commits; Netlify functions keep running untouched in parallel until this point — instant rollback
is redeploying the previous client build).

Env wiring: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` already exist (shared budgets) and are the
same values entries use — staging vs prod is selected by which values are present at build time.
`.env.local` = staging during dev; prod values set for the prod build.

## Testing gates

- Existing suites (`api.test.ts`, `EntriesContext.test.tsx`, `syncQueue.test.ts`) pass with the
  swapped transport (supabase-js mocked at module boundary, same as `sharedApi.test.ts` does).
- New: `supabaseMigrateIfNeeded` unit tests — fresh user (no cache), cached user happy path,
  interrupted upload resumes, re-run is a no-op, flag never set on partial failure, poker included.
- New: ingest Edge Function tests (handler extracted as a pure function like `ingestHandler.ts`):
  bad token, apple_pay, dbs_email, duplicate.
- Manual gate before prod: full rehearsal on draft URL from the owner's iPhone, including both
  Shortcuts pointed at the staging Edge Function.

## Deletions (end state)

Once all users show migrated (small, personally-known user base):
`netlify/functions/` (entries, ingest, lib), tombstone/pending-creates code in
`syncQueue.ts` + `EntriesContext.tsx`, `getApiToken`/`setApiToken` + token settings UI,
`netlify.toml` function config. The Netlify site itself stays (it hosts the static PWA at the
frozen URL — C1).
